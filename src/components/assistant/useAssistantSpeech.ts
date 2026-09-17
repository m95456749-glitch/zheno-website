// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۹ — رفع قطعی‌صدا روی موبایل)
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
// چرا این بازنویسی؟ (علل واقعیِ خرابی روی Chrome Android)
//   ۱) در Chrome اندروید فهرست صداها ناهمگام و دیرهنگام می‌رسد
//      (اولین getVoices() خالی است و voiceschanged قابل‌اعتماد
//      نیست). اگر فهرست پر است اما صدای فارسی نیست، دستگاه اصلاً
//      توانایی خواندن فارسی ندارد — در این حالت به‌جای سکوت یا
//      پخش با صدای اشتباه، پیام کوتاه و واضح نشان داده می‌شود.
//   ۲) باگ شناخته‌شدهٔ pause در Chrome اندروید: صف TTS گاهی «قفل»
//      می‌شود و حتی synth.paused گزارش کاذب (false) می‌دهد؛ همهٔ
//      speakهای بعدی در صف می‌مانند و هیچ‌وقت پخش نمی‌شوند.
//      راه‌حل: قبل از هر عمل، resume() بی‌‌خطر زده می‌شود تا صف
//      قفل‌شده باز شود (وقتی قفل نباشد، بی‌اثر است).
//   ۳) speak() بلافاصله بعد از cancel() در اندروید گاهی بی‌صدا
//      دور ریخته می‌شود؛ بعد از هر لغوی که چیزی واقعاً در صف
//      بوده، تکهٔ اول با تأخیر کوتاه (۱۵۰ میلی‌ثانیه — داخل پنجرهٔ
//      user activation) شروع می‌شود.
//   ۴) «آزمون شروع» (onstart): اگر موتور صدا را در ۳ ثانیه شروع
//      نکند (نشانِ نبودن دادهٔ صدای فارسی روی دستگاه)، یک‌بار
//      دوباره تلاش می‌کند و اگر باز هم نشد، خواندن را رها می‌کند
//      و پیام واضح نشان می‌دهد — رابط هرگز روی «در حال خواندن…»
//      نمی‌ماند.
//   ۵) «مکث» و «ادامه» در سطح خودِ اپ انجام می‌شود (لغو + پخش از
//      همان تکهٔ نگه‌داشت‌شده)، چون synth.pause() در Chrome
//      اندروید خراب است.
//   ۶) نگهبان‌های زمان: بازکنندهٔ قفل ۱۴ ثانیه‌ای Chrome با
//      resume() هر ۸ ثانیه و پایش هر تکه تا ۲۰ ثانیه (تلاش
//      مجدد و سپس رها کردن با پیام) تا خواندن هرگز گیر نکند.
//   ۷) اجرای اولین تکه در همان لمس کاربر (بدون تأخیر) تا سیاست
//      autoplay موبایل آن را مسدود نکند.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

const VOICE_PREF_KEY = 'zhino_assistant_voice_v1';

export type AssistantVoiceStatus =
  | 'unavailable'
  | 'loading'
  | 'none'
  | 'persian';

/** چرا خواندن ممکن نبود — فقط برای نمایش پیام کوتاه به مشتری */
export type AssistantVoiceProblem = 'no-persian-voice' | 'engine-stalled' | null;

export interface AssistantSpeech {
  available: boolean;
  status: AssistantVoiceStatus;
  enabled: boolean;
  speaking: boolean;
  paused: boolean;
  voiceProblem: AssistantVoiceProblem;
  setEnabled: (next: boolean) => void;
  speak: (text: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

/* ── ثوابت زمان‌بندی (همه با رفتار واقعی Chrome Android وزن‌بندی شده‌اند) ── */
/** طول بیشینهٔ هر تکه: زیر آستانهٔ قفل ~۱۴ ثانیه‌ای Chrome */
const MAX_CHUNK = 140;
/** اگر onstart اینقدر آسمی‌نرسد، موتور صدا را شروع نکرده است */
const START_TIMEOUT_MS = 3000;
/** سقف پخش هر تکه؛ بیشتر از این یعنی تکه قفل شده (stall) */
const CHUNK_TIMEOUT_MS = 20000;
/** آرام‌شدن صف بعد از cancel() در اندروید */
const CANCEL_SETTLE_MS = 150;
/** بازکنندهٔ قفل ۱۴ ثانیه‌ای: resume() منظم در حین پخش */
const KEEPALIVE_MS = 8000;
/** بارگذاری مجدد فهرست صداها: ۳۰ ثانیهٔ اول صفحه (فقط وقتی صفحهٔ فعال است) */
const VOICE_POLL_MS = 500;
const VOICE_MAX_POLLS = 60;

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
    name.includes('persian') ||
    name.includes('farsi') ||
    name.includes('فارسی')
  );
}

function findPersianVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  // اولویت ۱: fa-IR دقیق — اولویت ۲: هر fa-* — اولویت ۳: نام فارسی
  const exact = voices.find((v) => (v.lang ?? '').toLowerCase() === 'fa-ir');
  if (exact) return exact;
  const fa = voices.find((v) => (v.lang ?? '').toLowerCase().startsWith('fa'));
  if (fa) return fa;
  return voices.find((v) => isPersian(v)) ?? null;
}

function hasPersianVoice(voices: SpeechSynthesisVoice[]): boolean {
  return voices.some(isPersian);
}

function splitForSpeech(text: string, maxChunk = MAX_CHUNK): string[] {
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

type PlayState = 'idle' | 'playing' | 'paused';

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
  const [voiceProblem, setVoiceProblem] = useState<AssistantVoiceProblem>(
    null,
  );

  const chunksRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const pausePosRef = useRef(0);
  const stateRef = useRef<PlayState>('idle');
  /** هر speak/stop/pause/resume یک «نسل» تازه می‌سازد تا زمان‌بندی‌های
      خواندنیِ قدیمی روی خواندنِ جدید اثر نگذارند */
  const generationRef = useRef(0);
  const startTimerRef = useRef<number | null>(null);
  const chunkTimerRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const keepaliveRef = useRef<number | null>(null);

  /* ── ابزارهای پایه ─────────────────────────────────────────── */

  const clearTimers = useCallback(() => {
    for (const ref of [startTimerRef, chunkTimerRef, settleTimerRef]) {
      if (ref.current !== null) {
        window.clearTimeout(ref.current);
        ref.current = null;
      }
    }
  }, []);

  const stopKeepalive = useCallback(() => {
    if (keepaliveRef.current !== null) {
      window.clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    }
  }, []);

  /** بازکنندهٔ صف قفل‌شدهٔ TTS اندروید: resume() وقتی صف قفل نیست
      بی‌اثر است، و وقتی قفل است، تنها کارآمدی که شناخته شده. */
  const unfreeze = useCallback((synth: SpeechSynthesis) => {
    try {
      synth.resume();
    } catch {
      /* بی‌اهمیت */
    }
  }, []);

  const refreshVoices = useCallback((): SpeechSynthesisVoice[] => {
    const synth = getSynth();
    if (!synth) return [];
    try {
      const list = synth.getVoices() ?? [];
      if (list.length > 0) setVoices(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  const setPlayState = useCallback((next: PlayState) => {
    stateRef.current = next;
    setSpeaking(next === 'playing');
    setPaused(next === 'paused');
  }, []);

  /** لغوی کامل صف (با بازکردن قفل پیش از آن) + پاک‌کردن زمان‌بندی‌ها */
  const hardCancel = useCallback(() => {
    const synth = getSynth();
    if (synth) {
      try {
        unfreeze(synth);
        synth.cancel();
      } catch {
        /* برخی مرورگرها هنگام cancel خطا می‌دهند */
      }
    }
    clearTimers();
    stopKeepalive();
  }, [clearTimers, stopKeepalive, unfreeze]);

  const settleGeneration = useCallback(() => {
    generationRef.current += 1;
    return generationRef.current;
  }, []);

  /* ── بارگذاری صداها: polling طولانی + voiceschanged ───────── */
  useEffect(() => {
    const synth = getSynth();
    if (!synth) {
      setAvailable(false);
      return;
    }
    setAvailable(canSynthesize());

    // تلاش اول
    refreshVoices();

    // فهرست در Chrome Android دیرهنگام می‌رسد؛ تا ۳۰ ثانیه (فقط در
    // صفحهٔ فعال) دوباره می‌پرسیم و به‌محض رسیدن، می‌ایستیم.
    let pollCount = 0;
    const poll = window.setInterval(() => {
      pollCount += 1;
      const visible =
        typeof document === 'undefined' ||
        document.visibilityState === 'visible';
      const list = visible ? refreshVoices() : [];
      if (list.length > 0 || pollCount >= VOICE_MAX_POLLS) {
        window.clearInterval(poll);
      }
    }, VOICE_POLL_MS);

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
    if (hasPersianVoice(voices)) return 'persian';
    if (voices.length > 0) return 'none';
    return 'loading';
  })();

  /* ── هستهٔ خواندن ──────────────────────────────────────────── */

  const finalize = useCallback(
    (gen: number) => {
      if (gen !== generationRef.current) return;
      clearTimers();
      stopKeepalive();
      chunksRef.current = [];
      indexRef.current = 0;
      setPlayState('idle');
    },
    [clearTimers, setPlayState, stopKeepalive],
  );

  /** نگهبان ۸ ثانیه‌ای: با یک resume() بی‌خطر، قفل ~۱۴ ثانیه‌ای
      Chrome (سکوت در میانهٔ پخش) را باز می‌کند. */
  const startKeepalive = useCallback((gen: number) => {
    stopKeepalive();
    keepaliveRef.current = window.setInterval(() => {
      if (gen !== generationRef.current) {
        stopKeepalive();
        return;
      }
      const synth = getSynth();
      if (synth) unfreeze(synth);
    }, KEEPALIVE_MS);
  }, [stopKeepalive, unfreeze]);

  const speakIndex = useCallback(
    (gen: number, idx: number, attempts: number) => {
      if (gen !== generationRef.current) return;
      const synth = getSynth();
      if (!synth) {
        finalize(gen);
        return;
      }
      if (idx >= chunksRef.current.length) {
        // همهٔ تکه‌ها خوانده شد
        finalize(gen);
        return;
      }

      // فهرست صدا را همین حالا دوباره بخوان (در اندروید ممکن است
      // بین شروع و ادامهٔ خواندن پر شده باشد)
      let currentVoices = voices;
      try {
        const fresh = synth.getVoices() ?? [];
        if (fresh.length > 0) {
          currentVoices = fresh;
          setVoices(fresh);
        }
      } catch {
        /* بی‌اهمیت */
      }

      // فهرست پر است ولی فارسی نیست → اصلاً شروع نمی‌کنیم
      if (currentVoices.length > 0 && !hasPersianVoice(currentVoices)) {
        hardCancel();
        setVoiceProblem('no-persian-voice');
        finalize(gen);
        return;
      }

      indexRef.current = idx;
      const chunk = chunksRef.current[idx];
      const voice = findPersianVoice(currentVoices);

      let started = false;
      let ended = false;

      try {
        const utterance = new SpeechSynthesisUtterance(chunk);
        if (voice) {
          utterance.voice = voice;
        }
        utterance.lang = voice?.lang || 'fa-IR';
        utterance.rate = 0.95;
        utterance.pitch = 1;
        utterance.volume = 1;

        utterance.onstart = () => {
          if (gen !== generationRef.current) return;
          started = true;
          if (startTimerRef.current !== null) {
            window.clearTimeout(startTimerRef.current);
            startTimerRef.current = null;
          }
          if (chunkTimerRef.current !== null) {
            window.clearTimeout(chunkTimerRef.current);
            chunkTimerRef.current = null;
          }
          setVoiceProblem(null);
          // پایش تازهٔ طول پخش از لحظهٔ شروع واقعی
          chunkTimerRef.current = window.setTimeout(() => {
            if (gen !== generationRef.current || !started || ended) return;
            chunkTimerRef.current = null;
            // تکهٔ در حال پخش قفل شده (باگ ۱۴ ثانیه‌ای)
            if (attempts < 2) {
              unfreeze(synth);
              try {
                synth.cancel();
              } catch {
                /* بی‌اهمیت */
              }
              if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
              settleTimerRef.current = window.setTimeout(() => {
                settleTimerRef.current = null;
                if (gen === generationRef.current && stateRef.current === 'playing') {
                  speakIndex(gen, idx, attempts + 1);
                }
              }, CANCEL_SETTLE_MS);
            } else {
              hardCancel();
              setVoiceProblem('engine-stalled');
              finalize(gen);
            }
          }, CHUNK_TIMEOUT_MS);
        };

        utterance.onend = () => {
          if (gen !== generationRef.current || ended) return;
          ended = true;
          clearTimers();
          // زنجیره: تکهٔ بعدی بدون cancel — فقط speak
          speakIndex(gen, idx + 1, 0);
        };

        utterance.onerror = (ev: SpeechSynthesisErrorEvent) => {
          if (gen !== generationRef.current || ended) return;
          const err = (ev as unknown as { error?: string })?.error ?? '';
          // canceled / interrupted وقتی خودمان stop/pause زده‌ایم طبیعی است
          if (err === 'canceled' || err === 'interrupted') return;
          ended = true;
          clearTimers();
          stopKeepalive();
          hardCancel();
          setVoiceProblem('engine-stalled');
          setPlayState('idle');
        };

        // آزمون شروع: اگر onstart نیامد، موتور صدا را اصلاً شروع
        // نکرده (رایج‌ترین علت: نبود دادهٔ صدای فارسی روی دستگاه)
        startTimerRef.current = window.setTimeout(() => {
          if (gen !== generationRef.current || started || ended) return;
          startTimerRef.current = null;
          if (attempts < 1) {
            unfreeze(synth);
            try {
              synth.cancel();
            } catch {
              /* بی‌اهمیت */
            }
            if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
            settleTimerRef.current = window.setTimeout(() => {
              settleTimerRef.current = null;
              if (gen === generationRef.current && stateRef.current === 'playing' && !started && !ended) {
                speakIndex(gen, idx, attempts + 1);
              }
            }, CANCEL_SETTLE_MS);
          } else {
            hardCancel();
            setVoiceProblem(idx === 0 ? 'no-persian-voice' : 'engine-stalled');
            finalize(gen);
          }
        }, START_TIMEOUT_MS);

        unfreeze(synth);
        synth.speak(utterance);
      } catch {
        clearTimers();
        stopKeepalive();
        setVoiceProblem('engine-stalled');
        finalize(gen);
        return;
      }

      startKeepalive(gen);
    },
    [voices, clearTimers, finalize, hardCancel, setPlayState, startKeepalive, stopKeepalive, unfreeze],
  );

  const speak = useCallback(
    (text: string) => {
      const synth = getSynth();
      if (!synth) return;
      if (typeof window === 'undefined' || !('SpeechSynthesisUtterance' in window))
        return;

      // روی هر تلاش، فهرست صدا را تازه بخوان (اندروید گاهی فقط بعد از
      // اولین لمس پر می‌کند)
      let currentVoices = voices;
      try {
        const fresh = synth.getVoices() ?? [];
        if (fresh.length > 0) {
          currentVoices = fresh;
          setVoices(fresh);
        }
      } catch {
        /* بی‌اهمیت */
      }

      // فهرست پر است ولی صدای فارسی نیست → پخش بی‌صدا معنایی ندارد؛
      // پیام کوتاه و واضح، بدون هیچ تلاشی در موتور.
      if (currentVoices.length > 0 && !hasPersianVoice(currentVoices)) {
        hardCancel();
        setVoiceProblem('no-persian-voice');
        setPlayState('idle');
        return;
      }

      const chunks = splitForSpeech(text);
      if (chunks.length === 0) return;

      const gen = settleGeneration();
      hardCancel();

      chunksRef.current = chunks;
      indexRef.current = 0;
      pausePosRef.current = 0;
      setVoiceProblem(null);
      setPlayState('playing');

      // اگر چیزی واقعاً در صف بوده، بعد از cancel اندروید کمی زمان
      // نیاز دارد؛ وگرنه (صفِ کاملاً تازه) همان لحظهٔ لمس کاربر شروع
      // می‌شود تا user activation حفظ بماند.
      const wasActive =
        synth.speaking === true || synth.paused === true;
      if (wasActive) {
        settleTimerRef.current = window.setTimeout(() => {
          settleTimerRef.current = null;
          if (gen === generationRef.current) speakIndex(gen, 0, 0);
        }, CANCEL_SETTLE_MS);
      } else {
        speakIndex(gen, 0, 0);
      }
    },
    [hardCancel, setPlayState, settleGeneration, speakIndex, voices],
  );

  const stop = useCallback(() => {
    const gen = settleGeneration();
    hardCancel();
    chunksRef.current = [];
    indexRef.current = 0;
    setPlayState('idle');
    setVoiceProblem(null);
    void gen;
  }, [hardCancel, setPlayState, settleGeneration]);

  /** مکث در سطح اپ: synth.pause() در Chrome اندروید خراب است؛
      صف را لغو می‌کنیم و جای‌مان را نگه می‌داریم. */
  const pause = useCallback(() => {
    if (stateRef.current !== 'playing') return;
    settleGeneration();
    pausePosRef.current = indexRef.current;
    hardCancel();
    setPlayState('paused');
    setVoiceProblem(null);
  }, [hardCancel, setPlayState, settleGeneration]);

  /** ادامه: از همان تکهٔ نگه‌داشت‌شده (آغازِ همان جمله) دوباره پخش */
  const resume = useCallback(() => {
    if (stateRef.current !== 'paused') return;
    if (chunksRef.current.length === 0) {
      setPlayState('idle');
      return;
    }
    const gen = settleGeneration();
    setVoiceProblem(null);
    setPlayState('playing');
    // صف درست قبلش لغو شده؛ برای دور‌زدن رقابت cancel→speak اندروید
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      if (gen === generationRef.current) {
        speakIndex(gen, pausePosRef.current, 0);
      }
    }, CANCEL_SETTLE_MS);
  }, [setPlayState, settleGeneration, speakIndex]);

  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledState(next);
      writePref(next);
      if (!next) {
        stop();
      } else {
        // روشن‌کردن صدا خودش فهرست را تازه می‌کند (مفید برای موبایل)
        refreshVoices();
      }
    },
    [refreshVoices, stop],
  );

  // ترک صفحه یا رفتن به تب دیگر = سکوت
  useEffect(() => {
    const onHide = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        stop();
      }
    };
    const onPageHide = () => stop();

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
      stop();
    };
  }, [stop]);

  return {
    available,
    status,
    enabled,
    speaking,
    paused,
    voiceProblem,
    setEnabled,
    speak,
    stop,
    pause,
    resume,
  };
}
