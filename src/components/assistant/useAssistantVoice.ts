// ============================================================
// ZHINO — «صدای دستیار ژینو» (فاز ۹) — هماهنگ‌کنندهٔ دو مسیر صدا
//
// چرا این لایه؟
//   پاسخ دستیار باید با صدای فارسی خوانده شود، حتی روی گوشی‌ای که
//   هیچ صدای فارسی نصب‌شده ندارد. دو مسیر داریم و این هوک بینشان
//   تصمیم می‌گیرد — بدون اینکه رابط کاربری چیزی از این ماجرا بفهمد:
//
//     ۱) صدای ابری (اولویت اول): متن به Edge Function خودمان
//        می‌رود و فایل صوتی فارسی برمی‌گردد. هیچ وابستگی‌ای به
//        صدای نصب‌شده روی گوشی ندارد. کلید سرویس فقط در Secrets
//        سوپابیس است.
//     ۲) صدای خود دستگاه (پشتیبان): همان رفتار قبلی سایت با
//        Web Speech API — برای وقتی که سرویس ابری تنظیم نشده،
//        در دسترس نیست یا سهمیه‌اش تمام شده.
//
//   اگر هیچ‌کدام نشد، همان پیام کوتاه و انسانی قبلی نشان داده
//   می‌شود. هیچ قابلیتی از دست نمی‌رود و هیچ‌چیز نمی‌شکند.
//
// رابط این هوک عمداً همان رابط useAssistantSpeech است (به‌علاوهٔ
// چند مورد کوچک)، تا محیط گفتگو تقریباً دست‌نخورده بماند.
// ============================================================

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  useAssistantSpeech,
  type AssistantVoiceProblem,
  type AssistantVoiceStatus,
} from './useAssistantSpeech';
import { useAssistantCloudVoice } from './useAssistantCloudVoice';

export type { AssistantVoiceProblem, AssistantVoiceStatus };

export interface AssistantVoice {
  /** خواندن پاسخ به هر شکلی ممکن است (ابری یا خود دستگاه) */
  available: boolean;
  /** وضعیت صدا برای پیام‌های رابط کاربری */
  status: AssistantVoiceStatus;
  /** خواندن خودکار پاسخ‌ها روشن است */
  enabled: boolean;
  /** در حال پخش */
  speaking: boolean;
  /** مکث‌شده */
  paused: boolean;
  /** صدا در حال آماده‌سازی است (فقط مسیر ابری؛ کسری از ثانیه تا چند ثانیه) */
  preparing: boolean;
  /** چرا خواندن ممکن نشد — برای پیام کوتاه به مشتری */
  voiceProblem: AssistantVoiceProblem;
  setEnabled: (next: boolean) => void;
  /** باید در همان لحظهٔ لمس کاربر صدا زده شود (سیاست Autoplay موبایل) */
  unlock: () => void;
  speak: (text: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

/** کدام مسیر الان در حال پخش است */
type Lane = 'none' | 'cloud' | 'device';

export function useAssistantVoice(): AssistantVoice {
  const device = useAssistantSpeech();
  const cloud = useAssistantCloudVoice();
  const [lane, setLane] = useState<Lane>('none');
  const laneRef = useRef<Lane>('none');

  const switchLane = useCallback((next: Lane) => {
    laneRef.current = next;
    setLane(next);
  }, []);

  /** صدای ابری واقعاً قابل استفاده است؟ (هنوز خراب اعلام نشده) */
  const cloudUsable = cloud.configured && cloud.probe !== 'unavailable';

  const available = cloudUsable || device.available;

  const status: AssistantVoiceStatus = useMemo(() => {
    // وقتی صدای ابری هست، دستگاه اصلاً مهم نیست: صدای فارسی داریم.
    if (cloudUsable) return 'persian';
    return device.status;
  }, [cloudUsable, device.status]);

  const stop = useCallback(() => {
    cloud.stop();
    device.stop();
    switchLane('none');
  }, [cloud, device, switchLane]);

  /**
   * خواندن یک متن: اول ابری، و اگر نشد بی‌صدا با موتور خود دستگاه.
   * فراخوان همگام است تا در همان لحظهٔ لمس کاربر اجرا شود.
   */
  const speak = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;

      // هر خواندن تازه، خواندن قبلی را (در هر دو مسیر) می‌بندد
      device.stop();

      if (cloudUsable) {
        switchLane('cloud');
        void cloud.speak(trimmed).then((played) => {
          if (played) return;
          // ابری نشد → بی‌صدا به موتور خود دستگاه برمی‌گردیم.
          // اگر آن هم نتواند، پیام کوتاه همیشگی نشان داده می‌شود.
          if (laneRef.current !== 'cloud') return;
          if (device.available) {
            switchLane('device');
            device.speak(trimmed);
          } else {
            switchLane('none');
          }
        });
        return;
      }

      if (device.available) {
        switchLane('device');
        device.speak(trimmed);
        return;
      }

      switchLane('none');
    },
    [cloud, cloudUsable, device, switchLane],
  );

  const pause = useCallback(() => {
    if (laneRef.current === 'cloud') {
      cloud.pause();
      return;
    }
    device.pause();
  }, [cloud, device]);

  const resume = useCallback(() => {
    if (laneRef.current === 'cloud') {
      cloud.resume();
      return;
    }
    device.resume();
  }, [cloud, device]);

  const setEnabled = useCallback(
    (next: boolean) => {
      device.setEnabled(next);
      if (!next) {
        cloud.stop();
        switchLane('none');
      }
    },
    [cloud, device, switchLane],
  );

  const speaking = lane === 'cloud' ? cloud.playing : device.speaking;
  const paused = lane === 'cloud' ? cloud.paused : device.paused;
  const preparing = lane === 'cloud' ? cloud.preparing : false;

  // خطای مسیر ابری هرگز به کاربر گفته نمی‌شود: آن حالت بی‌صدا به
  // مسیر دستگاه می‌رسد و اگر آنجا هم نشد، همان پیام قبلی می‌آید.
  const voiceProblem = lane === 'cloud' ? null : device.voiceProblem;

  return {
    available,
    status,
    enabled: device.enabled,
    speaking,
    paused,
    preparing,
    voiceProblem,
    setEnabled,
    unlock: cloud.unlock,
    speak,
    stop,
    pause,
    resume,
  };
}
