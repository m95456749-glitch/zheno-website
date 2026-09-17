// ============================================================
// ZHINO — «دستیار ژینو» (فاز ۸) — خواندن پاسخ‌ها با صدای مرورگر
//
// چه کاری انجام می‌دهد؟
//   متن پاسخ دستیار را با قابلیت Text-to-Speech خودِ مرورگر
//   (Web Speech API) می‌خواند. همه‌چیز داخل مرورگر می‌ماند:
//   هیچ درخواست شبکه‌ای زده نمی‌شود، هیچ سرویس صوتی خارجی صدا
//   نمی‌شود و هیچ کلیدی لازم نیست.
//
// حریم خصوصی:
//   فقط «متن پاسخ دستیار» خوانده می‌شود — هرگز سؤال کاربر، نام،
//   نشانی یا اطلاعات سبد خرید. پاسخ دستیار هم چیزی جز همان متنی
//   نیست که روی صفحه نوشته شده است.
//
// مدیریت خطا (موبایل و مرورگرهای مختلف):
//   • speechSynthesis وجود ندارد   → `status = 'unavailable'` و چت مثل
//     قبل کار می‌کند؛ فقط متن نمایش داده می‌شود.
//   • هنوز فهرست صدا نرسیده        → `status = 'loading'` (در Chrome و
//     موبایل فهرست صدا کمی بعد می‌رسد؛ پس عجله می‌کنیم نه رد).
//   • صدای فارسی نصب نیست           → `status = 'none'`؛ خواندن شروع
//     نمی‌شود و یک راهنمای کوتاه به کاربر گفته می‌شود.
//   • صدای فارسی نیست ولی عربی هست  → `status = 'arabic'`
//     (خط فارسی را تا حد خوبی می‌خواند) — با همان راهنمای کوتاه.
//   • هر خطای دیگر (Safari/iOS محدودیت ژست کاربر، Firefox بدون voice،
//     AbortError هنگام cancel و …) → فقط خواندن خاموش می‌شود؛
//     هیچ‌وقت گفتگو، ارسال پیام یا Fallback را نمی‌شکند.
//
// آزارنده نیست:
//   به‌صورت پیش‌فرض خاموش است (تا کاربر ناخواسته صدایی نشنود) و
//   انتخابش در همین مرورگر ذخیره می‌شود. با شروع گفتگوی تازه یا
//   ترک صفحه، خواندن بلافاصله متوقف می‌شود.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

/** کلید روشن/خاموش بودن خواندن صدا در همین مرورگر */
const VOICE_PREF_KEY = 'zhino_assistant_voice_v1';

/** وضعیت صدای قابل استفاده در این مرورگر/دستگاه */
export type AssistantVoiceStatus =
  /** Web Speech API وجود ندارد (مرورگرهای قدیمی، Node/jsdom، …) */
  | 'unavailable'
  /** هنوز فهرست صداها نرسیده (در Chrome کمی طول می‌کشد) — منتظر می‌مانیم */
  | 'loading'
  /** speechSynthesis هست ولی هیچ صدای سازگاری نصب نیست */
  | 'none'
  /** صدای عربی — خط فارسی را تا حد خوبی می‌خواند */
  | 'arabic'
  /** صدای فارسی پیدا شد */
  | 'persian';

export interface AssistantSpeech {
  /** آیا اصلاً می‌توان چیزی خواند؟ */
  available: boolean;
  status: AssistantVoiceStatus;
  /** خواندن خودکار پاسخ‌ها روشن است؟ */
  enabled: boolean;
  /** همین حالا در حال خواندن است؟ */
  speaking: boolean;
  setEnabled: (next: boolean) => void;
  /** خواندن یک متن (دکمهٔ «خواندن» هر پاسخ) */
  speak: (text: string) => void;
  /** توقف فوری */
  stop: () => void;
}

/** دسترسی امن به speechSynthesis — بدون خطا در مرورگرهای بدون پشتیبانی */
function getSynth(): SpeechSynthesis | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.speechSynthesis ?? null;
  } catch {
    return null;
  }
}

/** آیا این مرورگر می‌تواند اصلاً حرف بزند؟ */
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
    // بدون دسترسی به حافظه (حالت خصوصی): پیش‌فرض خاموش
    return false;
  }
}

function writePref(on: boolean): void {
  try {
    window.localStorage.setItem(VOICE_PREF_KEY, on ? '1' : '0');
  } catch {
    /* بی‌اهمیت — فقط ترجیح ذخیره نمی‌شود */
  }
}

function isPersian(voice: SpeechSynthesisVoice): boolean {
  return /^fa/i.test(voice.lang ?? '') || /persian|فارسی/i.test(voice.name ?? '');
}

function isArabic(voice: SpeechSynthesisVoice): boolean {
  return /^ar/i.test(voice.lang ?? '');
}

/**
 * متن گفتگو را برای خواندن آماده می‌کند:
 *   • نشانه‌های فهرست (•) به ویرگول و خط‌جدید به نقطه تبدیل می‌شوند،
 *   • متن بلند به تکه‌های کوتاه تقسیم می‌شود (Safari و Chrome با جملهٔ
 *     طولانی، خواندن را وسط کار قطع می‌کنند).
 * هیچ Lookbehinds در Regular Expressionها استفاده نشده: باندل سایت برای
 * مرورگرهای ~۲۰۱۹ (target es2019) ساخته می‌شود.
 */
function splitForSpeech(text: string, maxChunk = 180): string[] {
  const flat = text
    .replace(/[•▪◦]+/g, '، ')
    .replace(/([^\n.!?؟؛:])\s*\n+\s*/g, '$1. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (flat.length === 0) return [];

  // ۱) جمله‌بندی با نقطه/علامت پایان (بدون lookbehind)
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

  // ۲) جمله‌های بلندتر از سقف، اول با ویرگول و بعد با فاصله می‌شکنند
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

/** شکستن یک جملهٔ خیلی بلند: اول روی ویرگول، بعد روی فاصله */
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
  const [available, setAvailable] = useState(canSynthesize);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [enabled, setEnabledState] = useState<boolean>(() => (canSynthesize() ? readPref() : false));
  const [speaking, setSpeaking] = useState(false);
  /** شمارندهٔ صف: تا آخرین تکه تمام نشده، «در حال خواندن» می‌ماند */
  const queue = useRef(0);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  // فهرست صداها در بسیاری از مرورگرها ناهمگام پر می‌شود
  useEffect(() => {
    const synth = getSynth();
    if (!synth) {
      setAvailable(false);
      return;
    }
    const read = () => {
      try {
        setVoices(synth.getVoices() ?? []);
      } catch {
        setVoices([]);
      }
    };
    read();
    const changed = () => read();
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', changed);
      return () => {
        try {
          synth.removeEventListener('voiceschanged', changed);
        } catch {
          /* بی‌اهمیت */
        }
      };
    }
    // مرورگرهای قدیمی‌تر: فقط یک رویداد onvoiceschanged
    const previous = synth.onvoiceschanged;
    synth.onvoiceschanged = (event) => {
      changed();
      previous?.call(synth, event);
    };
    return () => {
      synth.onvoiceschanged = previous;
    };
  }, []);

  const status: AssistantVoiceStatus = (() => {
    if (!available) return 'unavailable';
    if (voices.some(isPersian)) return 'persian';
    if (voices.some(isArabic)) return 'arabic';
    // صدایی فهرست نشده: در iOS/Android/Chrome فهرست صداها معمولاً کمی بعد
    // می‌رسد، پس «در حال بارگذاری» حساب می‌شود — نه «صدا نداریم». اگر بعداً
    // هم چیزی نیامد، همان loading می‌ماند و خواندن فقط بی‌صدا رد می‌شود.
    if (voices.length === 0) return 'loading';
    return 'none';
  })();

  const voiceFor = useCallback((): SpeechSynthesisVoice | null => {
    if (voices.some(isPersian)) return voices.find(isPersian) ?? null;
    if (voices.some(isArabic)) return voices.find(isArabic) ?? null;
    return null;
  }, [voices]);

  const cancel = useCallback(() => {
    const synth = getSynth();
    if (!synth) return;
    try {
      synth.cancel();
    } catch {
      /* برخی مرورگرها هنگام cancel بی‌دلیل throw می‌کنند */
    }
    queue.current = 0;
    setSpeaking(false);
  }, []);

  const stop = useCallback(() => cancel(), [cancel]);

  const speak = useCallback(
    (text: string) => {
      const synth = getSynth();
      if (!synth || typeof window === 'undefined' || !('SpeechSynthesisUtterance' in window)) return;
      // صدای سازگار نصب نیست: متن روی صفحه می‌ماند و گفتگو سالم است
      if (status === 'none') return;

      const chunks = splitForSpeech(text);
      if (chunks.length === 0) return;

      // هر خواندن قبلی لغو می‌شود تا صداها روی نیفتند
      try {
        synth.cancel();
      } catch {
        /* بی‌اهمیت */
      }

      const voice = voiceFor();
      queue.current = chunks.length;
      setSpeaking(true);

      for (const chunk of chunks) {
        try {
          const utterance = new SpeechSynthesisUtterance(chunk);
          if (voice) utterance.voice = voice;
          // همیشه فارسی: اگر صدای فارسی نبود، خودِ مرورگر تصمیم می‌گیرد
          utterance.lang = voice?.lang || 'fa-IR';
          utterance.rate = 0.98;
          utterance.pitch = 1;
          utterance.onend = () => {
            queue.current = Math.max(0, queue.current - 1);
            if (queue.current === 0) setSpeaking(false);
          };
          utterance.onerror = () => {
            // هر خطا (شامل interrupt هنگام cancel) فقط یعنی «بس کن»
            queue.current = 0;
            setSpeaking(false);
          };
          utterRef.current = utterance;
          synth.speak(utterance);
        } catch {
          queue.current = 0;
          setSpeaking(false);
          return;
        }
      }
    },
    [status, voiceFor],
  );

  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledState(next);
      writePref(next);
      if (!next) cancel();
    },
    [cancel],
  );

  // ترک صفحه یا رفتن به تب دیگر = سکوت
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') cancel();
    };
    document.addEventListener?.('visibilitychange', onHide);
    return () => {
      document.removeEventListener?.('visibilitychange', onHide);
      cancel();
    };
  }, [cancel]);

  return { available, status, enabled, speaking, setEnabled, speak, stop };
}
