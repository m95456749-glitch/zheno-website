// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۸ — بازنویسی موبایل) — خواندن پاسخ‌ها
//
// چه کاری انجام می‌دهد؟
//   متن پاسخ دستیار را با Text-to-Speech خودِ مرورگر می‌خواند.
//   همه‌چیز داخل مرورگر می‌ماند: بدون درخواست شبکه، بدون سرویس
//   خارجی، بدون کلید.
//
// حریم خصوصی:
//   فقط «متن پاسخ دستیار» خوانده می‌شود — هرگز سؤال کاربر، نام،
//   نشانی یا سبد خرید.
//
// سازگاری موبایل (Chrome Android / Desktop):
//   • فهرست صداها در Chrome ناهمگام می‌رسد؛ با voiceschanged و
//     polling کوتاه، صداها به‌محض آماده‌شدن برداشته می‌شوند.
//   • اجرای صدا فقط با لمس مستقیم کاربر انجام می‌شود؛ اولین تکه
//     همگام در همان کلیک خوانده می‌شود تا سیاست autoplay موبایل
//     آن را مسدود نکند.
//   • پس از cancel، resume صدا می‌شود و صف تکه‌ها زنجیروار از
//     طریق onend پیش می‌رود (حل مشکل قطع‌شدن در Safari/Chrome
//     هنگام خواندن چند utterance پشت‌سرهم).
//   • اگر صدای فارسی نصب نبود، پیام کوتاه و واضح نمایش داده
//     می‌شود و گفتگو هرگز نمی‌شکند.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

const VOICE_PREF_KEY = 'zhino_assistant_voice_v1';

export type AssistantVoiceStatus =
  | 'unavailable'
  | 'loading'
  | 'none'
  | 'arabic'
  | 'persian';

export interface AssistantSpeech {
  available: boolean;
  status: AssistantVoiceStatus;
  enabled: boolean;
  speaking: boolean;
  paused: boolean;
  setEnabled: (next: boolean) => void;
  speak: (text: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

function getSynth(): SpeechSynthesis | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.speechSynthesis ?? null;
  } catch {
    return null;
  }
}

function canSynthesize(): boolean {
  return (
    getSynth() !== null &&
    typeof window !== 'undefined' &&
    'SpeechSynthesisUtterance' in window
  );
}

function readPref(): boolean {
  try {
    return window.localStorage.getItem(VOICE_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

function writePref(on: boolean): void {
  try {
    window.localStorage.setItem(VOICE_PREF_KEY, on ? '1' : '0');
  } catch {
    /* ذخیره نشد — مهم نیست */
  }
}

function isPersian(voice: SpeechSynthesisVoice): boolean {
  const lang = (voice.lang ?? '').toLowerCase();
  const name = (voice.name ?? '').toLowerCase();
  return (
    lang.startsWith('fa') ||
    lang === 'fa-ir' ||
    name.includes('persian') ||
    name.includes('farsi') ||
    name.includes('فارسی')
  );
}

function isArabic(voice: SpeechSynthesisVoice): boolean {
  const lang = (voice.lang ?? '').toLowerCase();
  return lang.startsWith('ar');
}

function findBestVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  // اولویت ۱: fa-IR دقیق
  const exact = voices.find(
    (v) => (v.lang ?? '').toLowerCase() === 'fa-ir',
  );
  if (exact) return exact;
  // اولویت ۲: هر fa-*
  const fa = voices.find((v) =>
    (v.lang ?? '').toLowerCase().startsWith('fa'),
  );
  if (fa) return fa;
  // اولویت ۳: نام فارسی
  const byName = voices.find((v) => isPersian(v));
  if (byName) return byName;
  // اولویت ۴: عربی (خط فارسی را تا حدی می‌خواند)
  const ar = voices.find((v) => isArabic(v));
  if (ar) return ar;
  return null;
}

function splitForSpeech(text: string, maxChunk = 180): string[] {
  const flat = text
    .replace(/[•▪◦]+/g, '، ')
    .replace(/([^\n.!?؟؛:])\s*\n+\s*/g, '$1. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (flat.length === 0) return [];

  const sentences: string[] = [];
  let buffer = '';
  for (const char of flat) {
    buffer += char;
    if ('.!?؟'.includes(char)) {
      const done = buffer.trim();
      if (done.length > 0) sentences.push(done);
      buffer = '';
    }
  }
  if (buffer.trim().length > 0) sentences.push(buffer.trim());

  const chunks: string[] = [];
  let current = '';
  for (const piece of sentences.flatMap((sentence) =>
    sentence.length > maxChunk ? breakLong(sentence, maxChunk) : [sentence],
  )) {
    if (piece.length === 0) continue;
    if (current.length > 0 && current.length + piece.length + 1 > maxChunk) {
      chunks.push(current);
      current = piece;
    } else {
      current = current.length > 0 ? `${current} ${piece}` : piece;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function breakLong(sentence: string, maxChunk: number): string[] {
  const parts = sentence
    .split(/[،,]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const part of parts) {
    if (part.length > maxChunk) {
      if (line.length > 0) {
        out.push(line);
        line = '';
      }
      out.push(...cutOnSpaces(part, maxChunk));
      continue;
    }
    line = line.length > 0 ? `${line}، ${part}` : part;
    if (line.length >= maxChunk) {
      out.push(line);
      line = '';
    }
  }
  if (line.length > 0) out.push(line);
  return out;
}

function cutOnSpaces(part: string, maxChunk: number): string[] {
  const out: string[] = [];
  let rest = part;
  while (rest.length > maxChunk) {
    const at = rest.lastIndexOf(' ', maxChunk);
    const cut = at > 40 ? at : maxChunk;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) out.push(rest);
  return out;
}

export function useAssistantSpeech(): AssistantSpeech {
  const [available, setAvailable] = useState<boolean>(() => canSynthesize());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => {
    const synth = getSynth();
    if (!synth) return [];
    try {
      return synth.getVoices() ?? [];
    } catch {
      return [];
    }
  });
  const [enabled, setEnabledState] = useState<boolean>(() =>
    canSynthesize() ? readPref() : false,
  );
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);

  const chunksRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const refreshVoices = useCallback(() => {
    const synth = getSynth();
    if (!synth) {
      setAvailable(false);
      return [];
    }
    try {
      const list = synth.getVoices() ?? [];
      if (list.length > 0) {
        setVoices(list);
      }
      return list;
    } catch {
      return [];
    }
  }, []);

  // بارگذاری صداها: voiceschanged + polling برای Chrome Android
  useEffect(() => {
    const synth = getSynth();
    if (!synth) {
      setAvailable(false);
      return;
    }
    setAvailable(canSynthesize());

    // تلاش اول
    refreshVoices();

    let pollCount = 0;
    const maxPolls = 20;
    const poll = window.setInterval(() => {
      pollCount += 1;
      const list = refreshVoices();
      if (list.length > 0 || pollCount >= maxPolls) {
        window.clearInterval(poll);
      }
    }, 300);

    const onVoicesChanged = () => {
      refreshVoices();
    };

    try {
      if (typeof synth.addEventListener === 'function') {
        synth.addEventListener('voiceschanged', onVoicesChanged);
      }
    } catch {
      /* قدیمی */
    }

    const prev = synth.onvoiceschanged;
    try {
      synth.onvoiceschanged = (ev) => {
        onVoicesChanged();
        try {
          prev?.call(synth, ev);
        } catch {
          /* بی‌اهمیت */
        }
      };
    } catch {
      /* بی‌اهمیت */
    }

    return () => {
      window.clearInterval(poll);
      try {
        if (typeof synth.removeEventListener === 'function') {
          synth.removeEventListener('voiceschanged', onVoicesChanged);
        }
      } catch {
        /* بی‌اهمیت */
      }
      try {
        if (synth.onvoiceschanged === onVoicesChanged) {
          synth.onvoiceschanged = prev;
        } else if (prev) {
          synth.onvoiceschanged = prev;
        }
      } catch {
        /* بی‌اهمیت */
      }
    };
  }, [refreshVoices]);

  const status: AssistantVoiceStatus = (() => {
    if (!available) return 'unavailable';
    if (voices.some(isPersian)) return 'persian';
    if (voices.some(isArabic)) return 'arabic';
    if (voices.length === 0) return 'loading';
    return 'none';
  })();

  const cancelInternal = useCallback(() => {
    const synth = getSynth();
    if (!synth) {
      chunksRef.current = [];
      indexRef.current = 0;
      setSpeaking(false);
      setPaused(false);
      return;
    }
    try {
      // اگر در حال مکث بود، اول resume تا cancel عمل کند
      if (synth.paused) {
        try {
          synth.resume();
        } catch {
          /* بی‌اهمیت */
        }
      }
      synth.cancel();
    } catch {
      /* برخی مرورگرها هنگام cancel خطا می‌دهند */
    }
    chunksRef.current = [];
    indexRef.current = 0;
    utteranceRef.current = null;
    setSpeaking(false);
    setPaused(false);
  }, []);

  const stop = useCallback(() => {
    cancelInternal();
  }, [cancelInternal]);

  const pause = useCallback(() => {
    const synth = getSynth();
    if (!synth) return;
    try {
      if (synth.speaking && !synth.paused) {
        synth.pause();
        setPaused(true);
      }
    } catch {
      /* بی‌اهمیت */
    }
  }, []);

  const resume = useCallback(() => {
    const synth = getSynth();
    if (!synth) return;
    try {
      if (synth.paused) {
        synth.resume();
        setPaused(false);
        setSpeaking(true);
      }
    } catch {
      /* بی‌اهمیت */
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      const synth = getSynth();
      if (!synth) return;
      if (
        typeof window === 'undefined' ||
        !('SpeechSynthesisUtterance' in window)
      )
        return;
      if (status === 'none') return;
      if (status === 'unavailable') return;

      // روی لمس کاربر، دوباره فهرست صدا را بخوان (Chrome Android
      // فهرست را فقط بعد از اولین تعامل پر می‌کند)
      let currentVoices = voices;
      try {
        const fresh = synth.getVoices() ?? [];
        if (fresh.length > 0) {
          currentVoices = fresh;
          if (fresh.length !== voices.length) {
            setVoices(fresh);
          }
        }
      } catch {
        /* بی‌اهمیت */
      }

      const chunks = splitForSpeech(text);
      if (chunks.length === 0) return;

      // لغو قبلی — همگام، تا صف تمیز شود
      try {
        if (synth.paused) {
          synth.resume();
        }
        synth.cancel();
      } catch {
        /* بی‌اهمیت */
      }

      chunksRef.current = chunks;
      indexRef.current = 0;
      setSpeaking(true);
      setPaused(false);

      const voice = findBestVoice(currentVoices);

      const speakIndex = (idx: number) => {
        const synthNow = getSynth();
        if (!synthNow) {
          setSpeaking(false);
          setPaused(false);
          return;
        }
        if (idx >= chunksRef.current.length) {
          setSpeaking(false);
          setPaused(false);
          indexRef.current = 0;
          chunksRef.current = [];
          utteranceRef.current = null;
          return;
        }
        indexRef.current = idx;
        const chunk = chunksRef.current[idx];
        try {
          const utterance = new SpeechSynthesisUtterance(chunk);
          if (voice) {
            utterance.voice = voice;
          }
          utterance.lang = voice?.lang || 'fa-IR';
          utterance.rate = 0.95;
          utterance.pitch = 1;
          utterance.volume = 1;

          utterance.onend = () => {
            // تکه بعدی زنجیروار
            speakIndex(idx + 1);
          };
          utterance.onerror = (ev: SpeechSynthesisErrorEvent) => {
            const err = (ev as unknown as { error?: string })?.error ?? '';
            // canceled / interrupted هنگام stop طبیعی است
            if (err === 'canceled' || err === 'interrupted') {
              return;
            }
            // هر خطای دیگر → توقف کامل، بدون شکستن چت
            chunksRef.current = [];
            indexRef.current = 0;
            utteranceRef.current = null;
            setSpeaking(false);
            setPaused(false);
          };

          utteranceRef.current = utterance;

          // Chrome Android گاهی paused می‌ماند
          try {
            if (synthNow.paused) {
              synthNow.resume();
            }
          } catch {
            /* بی‌اهمیت */
          }

          synthNow.speak(utterance);

          // اطمینان: اگر بعد از speak هنوز paused بود، resume
          try {
            if (synthNow.paused) {
              synthNow.resume();
            }
          } catch {
            /* بی‌اهمیت */
          }
        } catch {
          chunksRef.current = [];
          indexRef.current = 0;
          utteranceRef.current = null;
          setSpeaking(false);
          setPaused(false);
        }
      };

      // شروع همگام برای حفظ user activation در موبایل
      speakIndex(0);
    },
    [status, voices],
  );

  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledState(next);
      writePref(next);
      if (!next) {
        cancelInternal();
      } else {
        // روشن‌کردن صدا خودش فهرست را تازه می‌کند (مفید برای موبایل)
        refreshVoices();
      }
    },
    [cancelInternal, refreshVoices],
  );

  // ترک صفحه یا رفتن به تب دیگر = سکوت
  useEffect(() => {
    const onHide = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        cancelInternal();
      }
    };
    const onPageHide = () => cancelInternal();

    try {
      document.addEventListener?.('visibilitychange', onHide);
      window.addEventListener?.('pagehide', onPageHide);
    } catch {
      /* بی‌اهمیت */
    }

    return () => {
      try {
        document.removeEventListener?.('visibilitychange', onHide);
        window.removeEventListener?.('pagehide', onPageHide);
      } catch {
        /* بی‌اهمیت */
      }
      cancelInternal();
    };
  }, [cancelInternal]);

  return {
    available,
    status,
    enabled,
    speaking,
    paused,
    setEnabled,
    speak,
    stop,
    pause,
    resume,
  };
}
