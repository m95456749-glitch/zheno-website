// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۹ — صدای فارسی ابری + رفع قطعی‌صدا روی موبایل)
//
// چه کاری انجام می‌دهد؟
//   متن پاسخ دستیار را بلند می‌خواند — با این ترتیب جایگزین قطعی:
//
//     ۱) صدای ابری فارسی (Azure fa-IR-DilaraNeural) از Edge Function
//        «zhino-voice» — فقط اگر Supabase پیکربندی شده باشد. با این
//        صدا، کاربر به نصب صدای فارسی روی گوشی نیاز ندارد. فایل
//        صوتی هر پاسخ فقط در حافظهٔ موقت مرورگر کش می‌شود، پس پخش
//        مجدد همان پاسخ هیچ درخواست تازه‌ای نمی‌زند. «مکث/ادامه» در
//        این مسیر واقعی است (عنصر <audio> درست پشتیبانی می‌کند).
//     ۲) صدای خودِ مرورگر (Web Speech API) — مسیر کاملاً محلیِ
//        قبلی، با همهٔ راه‌حل‌های باگ‌های Chrome Android.
//     ۳) اگر هیچ‌کدام نشد: پیام کوتاه و واضح فارسی.
//
// امنیت/حریم خصوصی:
//   هیچ کلید API اینجا نیست؛ کلید Azure فقط در Secrets سوپابیس
//   می‌ماند. فقط «متن پاسخ دستیار» برای ساخت صدا فرستاده می‌شود —
//   هرگز سؤال کاربر، نام، نشانی یا سبد خرید.
//
// چرا بازنویسی صدای مرورگر؟ (علل واقعیِ خرابی روی Chrome Android)

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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isCloudVoiceConfigured, loadCloudAudio } from '../../services/assistant/voice';
import { useVoiceSettings, VOICE_RATE_MAX, VOICE_RATE_MIN } from '../../services/voiceSettings';

const VOICE_PREF_KEY = 'zhino_assistant_voice_v1';

export type AssistantVoiceStatus =
  | 'unavailable'
  | 'loading'
  | 'none'
  | 'persian'
  /** صدای ابری پیکربندی شده؛ به صدای نصب‌شده روی دستگاه نیازی نیست */
  | 'cloud';

/** چرا خواندن ممکن نبود — فقط برای نمایش پیام کوتاه به مشتری */
export type AssistantVoiceProblem =
  | 'no-persian-voice'
  | 'not-allowed'
  | 'cloud-not-deployed'
  | 'cloud-failed'
  | 'engine-stalled'
  | 'playback-failed'
  | null;

export interface AssistantSpeech {
  available: boolean;
  status: AssistantVoiceStatus;
  enabled: boolean;
  /** در حال دریافت فایل صدای ابری (کش نبود؛ درخواست شبکه روی خط است) */
  loading: boolean;
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

/**
 * کلیپ WAV کاملاً بی‌صدای ~۱۰ میلی‌ثانیه‌ای.
 * سیاست autoplay موبایل (به‌ویژه Safari iOS) فقط به عنصری اجازهٔ
 * پخشِ بدون‌لمس می‌دهد که داخل یک لمس کاربر play() شده باشد؛ چون بین
 * لمس و پخشِ صدای واقعی یک fetch قرار می‌گیرد، همین کلیِپ در همان لمس
 * پخش می‌شود تا عنصر برای پخش بعدی «باز» بماند. هر خطاش بی‌صدا نادیده
 * گرفته می‌شود — در مرورگرهایی که نیازی ندارند، بی‌اثر است.
 */
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

type AudioEngine = 'cloud' | 'browser';

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
  const lang = (voice.lang ?? '').toLowerCase().replace(/_/g, '-');
  const name = (voice.name ?? '').toLowerCase();
  return (
    lang === 'fa' ||
    lang.startsWith('fa-') ||
    lang === 'pes' ||
    lang.startsWith('pes-') ||
    lang === 'fas' ||
    lang.startsWith('fas-') ||
    name.includes('persian') ||
    name.includes('farsi') ||
    name.includes('فارسی') ||
    name.includes('dilara') ||
    name.includes('farid')
  );
}

function findPersianVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  // اولویت ۱: fa-IR یا fa_IR دقیق
  const exact = voices.find((v) => {
    const l = (v.lang ?? '').toLowerCase().replace(/_/g, '-');
    return l === 'fa-ir';
  });
  if (exact) return exact;
  // اولویت ۲: هر fa-* یا pes-*
  const fa = voices.find((v) => {
    const l = (v.lang ?? '').toLowerCase().replace(/_/g, '-');
    return l.startsWith('fa-') || l === 'fa' || l.startsWith('pes-') || l === 'pes';
  });
  if (fa) return fa;
  // اولویت ۳: هر صدایی که نشانهٔ زبان فارسی در نام دارد
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
  /** زیرساخت صدای ابری (از پیکربندی ساخته می‌شود — ثابت در طول نشست) */
  const cloudConfigured = useMemo(isCloudVoiceConfigured, []);
  /** «تنظیمات صدای دستیار» مدیر — غیرمحرمانه؛ با ذخیره فوراً تازه می‌شود */
  const voiceSiteCfg = useVoiceSettings();
  /** کلید اصلی مدیر: ابری واقعی فقط وقتی هم زیرساخت هست و هم مدیر نگفته خاموش */
  const cloudActive = cloudConfigured && voiceSiteCfg.cloudVoice;
  /** کلید کلی صدای ربات: خاموش یعنی هیچ صدایی (نه ابری، نه مرورگر) */
  const voiceMasterOn = voiceSiteCfg.voiceEnabled;
  const [browserCapable, setBrowserCapable] = useState<boolean>(() => canSynthesize());
  const available = voiceMasterOn && (browserCapable || cloudActive);
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
    canSynthesize() || isCloudVoiceConfigured() ? readPref() : false,
  );
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  /** در حال دریافت صدای ابری از سرور (کش نبود) */
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [voiceProblem, setVoiceProblem] = useState<AssistantVoiceProblem>(
    null,
  );

  const chunksRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const pausePosRef = useRef(0);
  const stateRef = useRef<PlayState>('idle');
  /** موتورِ فعالِ فعلی: ابری (عنصر <audio>) یا مرورگر (speechSynthesis) */
  const engineRef = useRef<AudioEngine | null>(null);
  /** عنصر پایدار پخش صدای ابری (برای حفظ «بازشدگیِ» autoplay موبایل) */
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  /** object URL فعلی — با پایان/توقف پخش آزاد می‌شود */
  const audioUrlRef = useRef<string | null>(null);
  /** متنی که برایش درخواست ابری در راه است — برای جایگزینی مرورگر بعد از خطا */
  const cloudTextRef = useRef('');
  /** لغوی درخواست شبکهٔ درراه، هنگام توقف یا خواندنِ پاسخ دیگر */
  const cloudAbortRef = useRef<AbortController | null>(null);
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
      setBrowserCapable(false);
      return;
    }
    setBrowserCapable(canSynthesize());

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

  /** سرعت خواندنِ تنظیم‌شده توسط مدیر (کلید غیرمحرمانه) — بازهٔ امن ۰٫۷–۱٫۴ */
  const rateRef = useRef(1);
  rateRef.current = Math.min(VOICE_RATE_MAX, Math.max(VOICE_RATE_MIN, voiceSiteCfg.rate));

  const status: AssistantVoiceStatus = (() => {
    if (!available) return 'unavailable';
    // صدای ابری فعال → فارسیِ مطمئن، بی‌نیاز از صدای نصب‌شده روی دستگاه
    if (cloudActive) return 'cloud';
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
        utterance.rate = rateRef.current;
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
          setPlayState('idle');
          if (err === 'not-allowed') {
            setVoiceProblem('not-allowed');
          } else if (err === 'language-unavailable' || err === 'voice-unavailable') {
            setVoiceProblem('no-persian-voice');
          } else if (idx === 0 && !started) {
            setVoiceProblem('no-persian-voice');
          } else {
            setVoiceProblem('engine-stalled');
          }
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
            setVoiceProblem('no-persian-voice');
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

  /* ── موتور ابری: یک عنصر <audio> پایدار + کش فقط‌حافظه ────── */

  /** ساخت (یا گرفتن) عنصر پایدار پخش؛ در داخل لمس کاربر صدا خورده */
  const ensureAudio = useCallback((): HTMLAudioElement | null => {
    if (audioElRef.current) return audioElRef.current;
    try {
      const el = new Audio();
      el.preload = 'auto';
      audioElRef.current = el;
      return el;
    } catch {
      return null;
    }
  }, []);

  /** بازکردن قفل پخش موبایل داخل همان لمس کاربر (قبل از fetch شبکه) */
  const unlockAudio = useCallback((el: HTMLAudioElement) => {
    try {
      el.src = SILENT_WAV_DATA_URI;
      const attempt = el.play();
      // رد شدنش (مثلاً iOS قدیمی) فقط یعنی پخش بعدی نیاز به لمس دارد
      void attempt?.catch?.(() => undefined);
    } catch {
      /* بی‌اهمیت */
    }
  }, []);

  /** توقف کامل صدای ابری: لغو شبکهٔ درراه + سکوت عنصر + آزادسازی URL */
  const stopCloudAudio = useCallback(() => {
    if (cloudAbortRef.current) {
      try {
        cloudAbortRef.current.abort();
      } catch {
        /* بی‌اهمیت */
      }
      cloudAbortRef.current = null;
    }
    const el = audioElRef.current;
    if (el) {
      try {
        el.onended = null;
        el.onerror = null;
        el.pause();
      } catch {
        /* برخی محیط‌ها هنگام pause خطا می‌دهند */
      }
    }
    if (audioUrlRef.current) {
      try {
        URL.revokeObjectURL(audioUrlRef.current);
      } catch {
        /* بی‌اهمیت */
      }
      audioUrlRef.current = null;
    }
  }, []);

  const speakBrowser = useCallback(
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
      stopCloudAudio();
      engineRef.current = 'browser';

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
    [hardCancel, setPlayState, settleGeneration, speakIndex, stopCloudAudio, voices],
  );

  /** ترتیب جایگزین بعد از شکست صدای ابری: صدای مرورگر، وگرنه پیام کوتاه */
  const fallbackToBrowser = useCallback(
    (text: string, cloudErrorKind?: string) => {
      if (!canSynthesize()) {
        setVoiceProblem(cloudErrorKind === 'not-deployed' ? 'cloud-not-deployed' : 'cloud-failed');
        setPlayState('idle');
        return;
      }
      const synth = getSynth();
      let list: SpeechSynthesisVoice[] = [];
      if (synth) {
        try {
          list = synth.getVoices() ?? [];
          if (list.length > 0) setVoices(list);
        } catch {
          list = [];
        }
      }
      // فهرست پر است ولی فارسی ندارد → مرورگر هم نمی‌تواند؛ پیام کوتاه.
      // (فهرست خالی یعنی «هنوز نامشخص» — مثل Chrome Android — پس مسیر
      // مرورگر امتحان می‌شود و «آزمون شروع» صادقانه نتیجه را می‌گوید.)
      if (list.length > 0 && !hasPersianVoice(list)) {
        setVoiceProblem(cloudErrorKind === 'not-deployed' ? 'cloud-not-deployed' : 'cloud-failed');
        setPlayState('idle');
        return;
      }
      speakBrowser(text);
    },
    [speakBrowser, setPlayState],
  );

  const speakCloud = useCallback(
    (text: string) => {
      const gen = settleGeneration();
      hardCancel();
      stopCloudAudio();
      setVoiceProblem(null);
      engineRef.current = 'cloud';
      cloudTextRef.current = text;

      const el = ensureAudio();
      if (!el) {
        engineRef.current = null;
        fallbackToBrowser(text);
        return;
      }
      // بازکردن قفل autoplay موبایل همین‌جا، داخل لمس کاربر و پیش از
      // هر await؛ پخشِ بی‌صدای کوتاه است و هر خطاش نادیده گرفته می‌شود
      unlockAudio(el);

      const controller = new AbortController();
      cloudAbortRef.current = controller;
      setLoadingAudio(true);

      loadCloudAudio(text, controller.signal)
        .then((blob) => {
          if (gen !== generationRef.current) return; // کاربر رد شده است
          cloudAbortRef.current = null;

          let url: string | null = null;
          try {
            url = URL.createObjectURL(blob);
          } catch {
            url = null;
          }
          if (!url) {
            setLoadingAudio(false);
            engineRef.current = null;
            fallbackToBrowser(text);
            return;
          }
          audioUrlRef.current = url;

          const freeUrl = () => {
            if (audioUrlRef.current) {
              try {
                URL.revokeObjectURL(audioUrlRef.current);
              } catch {
                /* بی‌اهمیت */
              }
              audioUrlRef.current = null;
            }
          };

          el.src = url;
          el.onended = () => {
            if (gen !== generationRef.current || engineRef.current !== 'cloud') return;
            freeUrl();
            engineRef.current = null;
            setPlayState('idle');
          };
          el.onerror = () => {
            if (gen !== generationRef.current || engineRef.current !== 'cloud') return;
            // فایل سالم است ولی مرورگر پخشش نمی‌کند (فرمت/رمزگشایی) → جایگزین مرورگر
            freeUrl();
            engineRef.current = null;
            fallbackToBrowser(text);
          };

          setLoadingAudio(false);
          const attempt = (() => {
            try {
              return el.play();
            } catch {
              return null;
            }
          })();
          if (!attempt || typeof attempt.then !== 'function') {
            // محیط بسیار قدیمی بدون promise — فرض شروع پخش
            setPlayState('playing');
            return;
          }
          attempt
            .then(() => {
              if (gen !== generationRef.current || engineRef.current !== 'cloud') {
                try {
                  el.pause();
                } catch {
                  /* بی‌اهمیت */
                }
                return;
              }
              setPlayState('playing');
            })
            .catch(() => {
              if (gen !== generationRef.current || engineRef.current !== 'cloud') return;
              // پخش توسط سیاست مرورگر مسدود شد → جایگزین مرورگر
              freeUrl();
              engineRef.current = null;
              fallbackToBrowser(text);
            });
        })
        .catch((err: unknown) => {
          if (gen !== generationRef.current) return;
          cloudAbortRef.current = null;
          setLoadingAudio(false);
          engineRef.current = null;
          const kind = (err as { kind?: string })?.kind;
          fallbackToBrowser(text, kind);
        });
    },
    [
      ensureAudio,
      fallbackToBrowser,
      hardCancel,
      setPlayState,
      settleGeneration,
      stopCloudAudio,
      unlockAudio,
    ],
  );

  /** نقطهٔ ورود: صدای ابری ← صدای مرورگر (ابری فقط وقتی زیرساخت هست و
      مدیر هم آن را خاموش نکرده باشد؛ کل خاموش = سکوت کامل) */
  const speak = useCallback(
    (text: string) => {
      if (!voiceMasterOn) return;
      if (cloudActive) {
        speakCloud(text);
        return;
      }
      speakBrowser(text);
    },
    [voiceMasterOn, cloudActive, speakBrowser, speakCloud],
  );

  const stop = useCallback(() => {
    const gen = settleGeneration();
    hardCancel();
    stopCloudAudio();
    setLoadingAudio(false);
    engineRef.current = null;
    chunksRef.current = [];
    indexRef.current = 0;
    setPlayState('idle');
    setVoiceProblem(null);
    void gen;
  }, [hardCancel, setPlayState, settleGeneration, stopCloudAudio]);

  /** مکث: در مسیر ابری مکث واقعی <audio> (پشتیبانی درست)؛ در مسیر
      مرورگر همان مکث سطحِ اپِ قبلی، چون synth.pause() در Chrome
      اندروید خراب است. */
  const pause = useCallback(() => {
    if (stateRef.current !== 'playing') return;
    if (engineRef.current === 'cloud') {
      const el = audioElRef.current;
      try {
        el?.pause();
      } catch {
        /* بی‌اهمیت */
      }
      setPlayState('paused');
      setVoiceProblem(null);
      return;
    }
    settleGeneration();
    pausePosRef.current = indexRef.current;
    hardCancel();
    setPlayState('paused');
    setVoiceProblem(null);
  }, [hardCancel, setPlayState, settleGeneration]);

  /** ادامه: در مسیر ابری همان play() روی همان فایلِ حافظه‌ای (بدون
      هیچ درخواست تازه‌ای)؛ در مسیر مرورگر از تکهٔ نگه‌داشت‌شده. */
  const resume = useCallback(() => {
    if (stateRef.current !== 'paused') return;
    if (engineRef.current === 'cloud') {
      const el = audioElRef.current;
      if (!el || !audioUrlRef.current) {
        setPlayState('idle');
        return;
      }
      setVoiceProblem(null);
      const attempt = (() => {
        try {
          return el.play();
        } catch {
          return null;
        }
      })();
      if (!attempt || typeof attempt.then !== 'function') {
        setPlayState('playing');
        return;
      }
      attempt
        .then(() => {
          if (engineRef.current === 'cloud') setPlayState('playing');
        })
        .catch(() => {
          if (engineRef.current !== 'cloud') return;
          setPlayState('idle');
          setVoiceProblem('engine-stalled');
        });
      return;
    }
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

  // خاموش‌شدن کلید کلی صدا از پنل مدیریت = سکوت فوری هر پخشی
  useEffect(() => {
    if (!voiceMasterOn) stop();
  }, [voiceMasterOn, stop]);

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
    loading: loadingAudio,
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
