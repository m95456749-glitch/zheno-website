// ============================================================
// ZHINO — «صدای فارسی ابری» (فاز ۹) — پخش صدای واقعی فارسی
//
// مشکلی که این لایه حل می‌کند:
//   موتور صدای خودِ گوشی (Web Speech API) روی بیشتر دستگاه‌های
//   اندروید صدای فارسی ندارد؛ Chrome Android یا سکوت می‌کند یا
//   کاربر را به «نصب صدای فارسی در تنظیمات» می‌فرستد. اینجا
//   به‌جای موتور دستگاه، متن پاسخ به Edge Function خودمان می‌رود
//   و یک فایل صوتی فارسی برمی‌گردد که مثل هر صوت دیگری در صفحه
//   پخش می‌شود — بدون هیچ نیازی به نصب صدا روی گوشی.
//
// چند نکتهٔ واقعی موبایل که در این فایل رعایت شده‌اند:
//   ۱) سیاست Autoplay: مرورگر موبایل فقط به عنصر صوتی‌ای اجازهٔ
//      پخش می‌دهد که یک‌بار «در لحظهٔ لمس کاربر» پخش شده باشد.
//      ساخت صدا شبکه‌ای و کُند است، پس همان لحظهٔ لمس، عنصر صوتی
//      با یک صوت بسیار کوتاه و بی‌صدا «باز» می‌شود و بعد، وقتی
//      فایل واقعی رسید، روی همان عنصر پخش می‌شود.
//   ۲) یک عنصر صوتی ثابت برای کل گفتگو؛ ساختن عنصر تازه برای هر
//      پاسخ، قفل Autoplay را دوباره فعال می‌کند.
//   ۳) مکث و ادامه واقعی است (خودِ فایل صوتی مکث می‌کند)، نه
//      شبیه‌سازی — برخلاف موتور دستگاه که pause آن روی اندروید خراب است.
//   ۴) کَش در حافظه: «پخش مجدد» همان پاسخ، درخواست تازه‌ای به
//      سرویس نمی‌فرستد (نه در دیتابیس ذخیره می‌شود، نه روی دیسک؛
//      با ترک صفحه پاک می‌شود).
//   ۵) پاسخ بلند تکه‌تکه خوانده می‌شود: پاسخ دستیار تا ۴۰۰۰ نویسه
//      می‌تواند باشد ولی هر درخواست به سرویس سقف دارد. متن روی مرز
//      جمله تکه می‌شود و تکه‌ها پشت‌سرهم و بدون مکث پخش می‌شوند، پس
//      **هیچ بخشی از پاسخ ناخوانده نمی‌ماند**. ضمناً تکهٔ بعدی همزمان
//      با پخش تکهٔ فعلی ساخته می‌شود تا صدا پیوسته بماند.
//
// حریم خصوصی: فقط «متن پاسخ دستیار» فرستاده می‌شود — هرگز سؤال
// کاربر، نام، نشانی یا سبد خرید.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isVoiceRemoteConfigured,
  probeVoiceRemote,
  synthesizePersianSpeech,
  VoiceRemoteError,
} from '../../services/assistant/voice';
import { CLOUD_MAX_CHUNK, splitForSpeech } from './speechText';

/** وضعیت سرویس صدای ابری */
export type CloudVoiceProbe = 'unconfigured' | 'checking' | 'ready' | 'unavailable';

export interface AssistantCloudVoice {
  /** سرویس ابری در پیکربندی هست (بدون توجه به سلامت لحظه‌ای) */
  configured: boolean;
  /** نتیجهٔ بررسی آماده‌بودن سرویس */
  probe: CloudVoiceProbe;
  /** در حال ساخت صدا (هنوز پخش شروع نشده) */
  preparing: boolean;
  /** در حال پخش */
  playing: boolean;
  /** مکث‌شده */
  paused: boolean;
  /** «بازکردن» عنصر صوتی در لحظهٔ لمس کاربر — پیش از هر پخشی صدا زده شود */
  unlock: () => void;
  /** خواندن یک متن؛ true یعنی ساخت صدا شروع شد */
  speak: (text: string) => Promise<boolean>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

/** صوت بسیار کوتاه و کاملاً بی‌صدا — فقط برای بازکردن قفل Autoplay */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

/** حداکثر تعداد پاسخی که صدایش در حافظه نگه داشته می‌شود */
const CACHE_MAX = 12;

function canPlayAudio(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.Audio === 'function' &&
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function'
    );
  } catch {
    return false;
  }
}

export function useAssistantCloudVoice(): AssistantCloudVoice {
  const [configured] = useState<boolean>(() => {
    try {
      return isVoiceRemoteConfigured() && canPlayAudio();
    } catch {
      return false;
    }
  });
  const [probe, setProbe] = useState<CloudVoiceProbe>(() =>
    configured ? 'checking' : 'unconfigured',
  );
  const [preparing, setPreparing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);
  const objectUrlRef = useRef<string | null>(null);
  /** هر speak/stop یک «نسل» تازه می‌سازد تا پاسخ‌های کُندِ قدیمی
      روی پخش تازه اثر نگذارند */
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /** کَش حافظه‌ای: متن پاسخ → فایل صوتی (با ترک صفحه پاک می‌شود) */
  const cacheRef = useRef<Map<string, Blob>>(new Map());
  const mountedRef = useRef(true);
  /** بستنِ انتظارِ تکهٔ در حال پخش وقتی کاربر «توقف» می‌زند.
      بدون این، رویداد ended هرگز نمی‌آید و حلقهٔ پخش معلق می‌ماند. */
  const settlePlaybackRef = useRef<(() => void) | null>(null);

  /* ── عنصر صوتی مشترک ───────────────────────────────────────── */

  const getAudio = useCallback((): HTMLAudioElement | null => {
    if (!canPlayAudio()) return null;
    if (audioRef.current) return audioRef.current;
    try {
      const element = new window.Audio();
      element.preload = 'auto';
      // عنصر در DOM نیست: نه ظاهر صفحه عوض می‌شود، نه چیدمان.
      audioRef.current = element;
      return element;
    } catch {
      return null;
    }
  }, []);

  const releaseUrl = useCallback(() => {
    if (objectUrlRef.current) {
      try {
        URL.revokeObjectURL(objectUrlRef.current);
      } catch {
        /* بی‌اهمیت */
      }
      objectUrlRef.current = null;
    }
  }, []);

  /**
   * «بازکردن» عنصر صوتی — باید در همان لحظهٔ لمس کاربر صدا زده شود.
   * یک صوت بی‌صدای ۰ ثانیه‌ای پخش می‌شود تا مرورگر موبایل بعداً
   * اجازهٔ پخش برنامه‌ای روی همین عنصر را بدهد.
   */
  const unlock = useCallback(() => {
    if (unlockedRef.current) return;
    const audio = getAudio();
    if (!audio) return;
    try {
      audio.src = SILENT_WAV;
      audio.muted = true;
      const promise = audio.play() as Promise<void> | undefined;
      const finish = () => {
        unlockedRef.current = true;
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        } catch {
          /* بی‌اهمیت */
        }
      };
      if (promise && typeof promise.then === 'function') {
        promise.then(finish).catch(() => {
          // نشد؛ مهم نیست — پخش واقعی باز هم امتحان می‌شود
          try {
            audio.muted = false;
          } catch {
            /* بی‌اهمیت */
          }
        });
      } else {
        finish();
      }
    } catch {
      /* بی‌اهمیت */
    }
  }, [getAudio]);

  /* ── بررسی آماده‌بودن سرویس (یک‌بار، بی‌صدا) ──────────────── */

  useEffect(() => {
    mountedRef.current = true;
    if (!configured) {
      setProbe('unconfigured');
      return () => {
        mountedRef.current = false;
      };
    }
    const controller = new AbortController();
    void probeVoiceRemote(controller.signal).then((result) => {
      if (!mountedRef.current) return;
      setProbe(result.ready ? 'ready' : 'unavailable');
    });
    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [configured]);

  /* ── رویدادهای پخش ─────────────────────────────────────────────
     پایان/خطای هر تکه داخل playBlob مدیریت می‌شود (نه با یک شنوندهٔ
     سراسری)، چون یک پاسخ بلند از چند تکه ساخته می‌شود و «پایان تکه»
     با «پایان خواندن پاسخ» یکی نیست: بین تکه‌ها باید نوار پخش
     همچنان روشن بماند.                                            */

  /* ── عملیات ────────────────────────────────────────────────── */

  const stop = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    // حلقهٔ پخش تکه‌ها را آزاد کن (pause رویداد ended نمی‌دهد)
    settlePlaybackRef.current?.();
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* بی‌اهمیت */
      }
    }
    setPreparing(false);
    setPlaying(false);
    setPaused(false);
  }, []);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.pause();
    } catch {
      /* بی‌اهمیت */
    }
    setPlaying(false);
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      const promise = audio.play() as Promise<void> | undefined;
      if (promise && typeof promise.catch === 'function') {
        promise.catch(() => {
          setPlaying(false);
          setPaused(true);
        });
      }
    } catch {
      setPaused(true);
      return;
    }
    setPlaying(true);
    setPaused(false);
  }, []);

  const rememberAudio = useCallback((key: string, blob: Blob) => {
    const cache = cacheRef.current;
    cache.set(key, blob);
    while (cache.size > CACHE_MAX) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
    }
  }, []);

  /** ساخت صدای یک تکه (با کَش حافظه‌ای) */
  const synthesizeChunk = useCallback(
    async (chunk: string, signal: AbortSignal): Promise<Blob> => {
      const hit = cacheRef.current.get(chunk);
      if (hit) return hit;
      const blob = await synthesizePersianSpeech(chunk, signal);
      rememberAudio(chunk, blob);
      return blob;
    },
    [rememberAudio],
  );

  /**
   * پخش یک تکه روی عنصر صوتی مشترک و صبر تا پایانش.
   * `onStarted` دقیقاً وقتی صدا زده می‌شود که پخش واقعاً شروع شده —
   * نه بعد از پایان تکه — تا نوار پخش بلافاصله ظاهر شود.
   */
  const playBlob = useCallback(
    (
      audio: HTMLAudioElement,
      blob: Blob,
      gen: number,
      onStarted: () => void,
    ): Promise<'ended' | 'stopped' | 'blocked'> =>
      new Promise((resolve) => {
        let url: string;
        try {
          url = URL.createObjectURL(blob);
        } catch {
          resolve('blocked');
          return;
        }
        releaseUrl();
        objectUrlRef.current = url;

        let settled = false;
        const finish = (outcome: 'ended' | 'stopped' | 'blocked') => {
          if (settled) return;
          settled = true;
          if (settlePlaybackRef.current === onStopped) settlePlaybackRef.current = null;
          try {
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onError);
          } catch {
            /* بی‌اهمیت */
          }
          resolve(outcome);
        };
        // «توقف» کاربر: pause رویداد ended تولید نمی‌کند، پس حلقه را
        // از همین‌جا آزاد می‌کنیم تا معلق نماند.
        function onStopped() {
          finish('stopped');
        }
        function onEnded() {
          finish(gen === generationRef.current ? 'ended' : 'stopped');
        }
        function onError() {
          finish('blocked');
        }

        try {
          settlePlaybackRef.current = onStopped;
          audio.addEventListener('ended', onEnded);
          audio.addEventListener('error', onError);
          audio.src = url;
          audio.muted = false;
          const promise = audio.play() as Promise<void> | undefined;
          if (promise && typeof promise.then === 'function') {
            promise.then(
              () => {
                if (!settled) onStarted();
              },
              () => finish('blocked'),
            );
          } else {
            onStarted();
          }
        } catch {
          finish('blocked');
        }
      }),
    [releaseUrl],
  );

  /**
   * خواندن یک متن با صدای فارسی ابری.
   *
   * پاسخ بلند روی مرز جمله تکه می‌شود و تکه‌ها **پشت‌سرهم** پخش
   * می‌شوند؛ هیچ بخشی از پاسخ حذف یا نصفه رها نمی‌شود. تکهٔ بعدی
   * همزمان با پخش تکهٔ فعلی ساخته می‌شود تا بین تکه‌ها سکوت نیفتد.
   *
   * خروجی: false یعنی نشد (سرویس نبود/خطا داد) تا فراخوان بتواند
   * بی‌صدا به موتور صدای خود دستگاه برگردد.
   */
  const speak = useCallback(
    async (text: string): Promise<boolean> => {
      if (!configured) return false;
      const audio = getAudio();
      if (!audio) return false;

      const key = text.trim();
      if (key.length === 0) return false;

      const chunks = splitForSpeech(key, CLOUD_MAX_CHUNK);
      if (chunks.length === 0) return false;

      // پخش قبلی را ببند و یک نسل تازه بساز
      generationRef.current += 1;
      const gen = generationRef.current;
      abortRef.current?.abort();
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* بی‌اهمیت */
      }
      setPaused(false);
      setPlaying(false);
      setPreparing(true);

      const controller = new AbortController();
      abortRef.current = controller;

      /** ساخت تکه با مدیریت خطا؛ null یعنی شکست */
      const build = async (chunk: string): Promise<Blob | null> => {
        try {
          return await synthesizeChunk(chunk, controller.signal);
        } catch (error) {
          if (gen !== generationRef.current) return null;
          if (mountedRef.current && error instanceof VoiceRemoteError) {
            if (error.kind === 'unconfigured') setProbe('unavailable');
          }
          return null;
        }
      };

      // تکهٔ اول باید حتماً ساخته شود؛ اگر نشد، اصلاً وارد مسیر ابری
      // نمی‌شویم و فراخوان به موتور دستگاه برمی‌گردد.
      let currentBlob = await build(chunks[0]);
      if (gen !== generationRef.current) return true;
      if (!currentBlob) {
        if (abortRef.current === controller) abortRef.current = null;
        if (mountedRef.current) setPreparing(false);
        return false;
      }

      let started = false;
      for (let index = 0; index < chunks.length; index += 1) {
        if (gen !== generationRef.current) return true;

        // تکهٔ بعدی را همزمان با پخش تکهٔ فعلی بساز (صدا پیوسته بماند)
        const nextPromise =
          index + 1 < chunks.length ? build(chunks[index + 1]) : Promise.resolve(null);

        const markStarted = () => {
          if (started || gen !== generationRef.current || !mountedRef.current) return;
          started = true;
          unlockedRef.current = true;
          setPreparing(false);
          setPlaying(true);
          setPaused(false);
          setProbe('ready');
        };

        const outcome = await playBlob(audio, currentBlob, gen, markStarted);

        if (outcome === 'blocked') {
          // مرورگر اجازهٔ پخش نداد (قفل Autoplay).
          void nextPromise;
          if (abortRef.current === controller) abortRef.current = null;
          if (gen === generationRef.current && mountedRef.current) {
            setPreparing(false);
            setPlaying(false);
          }
          // اگر بخشی از پاسخ خوانده شده، عقب‌گرد به موتور دستگاه یعنی
          // تکرار از اول؛ پس فقط وقتی false می‌دهیم که هیچ صدایی نرفته.
          return started;
        }
        if (outcome === 'stopped') {
          void nextPromise;
          return true;
        }

        markStarted();

        const next = await nextPromise;
        if (gen !== generationRef.current) return true;
        if (!next) break; // تکهٔ بعدی ساخته نشد → با همان‌چه خوانده شد تمام می‌کنیم
        currentBlob = next;
      }

      if (abortRef.current === controller) abortRef.current = null;
      if (gen === generationRef.current && mountedRef.current) {
        setPreparing(false);
        setPlaying(false);
        setPaused(false);
      }
      return true;
    },
    [configured, getAudio, playBlob, synthesizeChunk],
  );

  /* ── ترک صفحه = سکوت و آزادسازی ───────────────────────────── */

  useEffect(() => {
    const silence = () => {
      const audio = audioRef.current;
      if (!audio) return;
      try {
        audio.pause();
      } catch {
        /* بی‌اهمیت */
      }
    };
    const onHide = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') silence();
    };
    try {
      document.addEventListener?.('visibilitychange', onHide);
      window.addEventListener?.('pagehide', silence);
    } catch {
      /* بی‌اهمیت */
    }
    return () => {
      try {
        document.removeEventListener?.('visibilitychange', onHide);
        window.removeEventListener?.('pagehide', silence);
      } catch {
        /* بی‌اهمیت */
      }
      mountedRef.current = false;
      generationRef.current += 1;
      abortRef.current?.abort();
      settlePlaybackRef.current?.();
      silence();
      releaseUrl();
      cacheRef.current.clear();
    };
  }, [releaseUrl]);

  return {
    configured,
    probe,
    preparing,
    playing,
    paused,
    unlock,
    speak,
    stop,
    pause,
    resume,
  };
}
