// ============================================================
// ZHINO — تصویر تمام‌قد ربات در خوش‌آمدگویی صفحهٔ دستیار
//
// حالت نهایی: فقط پلک‌زدن طبیعی و بسیار ظریف.
//   • هیچ حرکت دست/بازو، wave، greeting gesture یا حرکت ماکرو
//     (سر/بدن/شانه) وجود ندارد.
//   • تنها انیمیشن، پلک‌زدن نامنظم چشم‌ها (opacity) است.
//   • تصویر اصلی دست‌نخورده؛ اندازه و crop با CSS تعیین می‌شود.
//   • prefers-reduced-motion → حتی پلک هم خاموش است.
//
// نکات فنی:
//   • بدون re-render — فقط ref + class.
//   • فقط opacity؛ بدون transform روی هیچ لایه‌ای.
//   • interval تصادفی تا حس loop نباشد.
// ============================================================

import { useEffect, useRef } from 'react';
import { cn } from '../../utils/cn';
import { ASSISTANT_BOT_IMAGE, ASSISTANT_NAME } from './assistantData';

interface Props {
  className?: string;
}

export default function ZhinoWelcomeAnimation({ className }: Props) {
  const eyesRef = useRef<HTMLSpanElement>(null);
  const timersRef = useRef<number[]>([]);

  /* ── فقط پلک‌زدن طبیعی — بدون هیچ حرکت دیگری ── */
  useEffect(() => {
    let reduced = false;
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduced = false;
    }
    if (reduced) return;

    const pushTimer = (id: number) => {
      timersRef.current.push(id);
      return id;
    };

    const scheduleLoop = (fn: () => void, min: number, max: number) => {
      const next = min + Math.random() * (max - min);
      const id = window.setTimeout(() => {
        fn();
        scheduleLoop(fn, min, max);
      }, next) as unknown as number;
      pushTimer(id);
    };

    // پلک‌زدن طبیعی — بدون jump، فقط opacity
    const doBlink = () => {
      const el = eyesRef.current;
      if (!el) return;
      el.classList.add('is-blinking');
      const closeDur = 95 + Math.random() * 65;
      pushTimer(
        window.setTimeout(() => {
          el.classList.remove('is-blinking');
        }, closeDur) as unknown as number,
      );
      if (Math.random() < 0.18) {
        pushTimer(
          window.setTimeout(() => {
            el.classList.add('is-blinking');
            pushTimer(
              window.setTimeout(() => {
                el.classList.remove('is-blinking');
              }, 85) as unknown as number,
            );
          }, 220) as unknown as number,
        );
      }
    };

    pushTimer(
      window.setTimeout(() => {
        doBlink();
        scheduleLoop(doBlink, 2800, 6200);
      }, 1100) as unknown as number,
    );

    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  return (
    <div className={cn('zhino-welcome-photo-wrap', className)}>
      {/* تصویر اصلی ربات — تک‌لایه، ایستا، بدون هیچ transform */}
      <img
        className="zhino-welcome-photo"
        src={ASSISTANT_BOT_IMAGE}
        alt={`تصویر واقعی ${ASSISTANT_NAME}`}
        draggable={false}
      />
      {/* پلک طبیعی — تنها انیمیشن ربات (opacity) */}
      <span ref={eyesRef} className="zhino-welcome-eyes" aria-hidden="true">
        <span className="zhino-welcome-eye is-left" />
        <span className="zhino-welcome-eye is-right" />
      </span>
      {/* fade لبهٔ پایینی — ایستا: لبهٔ مستطیلی عکس را با صفحه یکی می‌کند */}
      <div className="zw-layer zw-fade" aria-hidden="true" />
    </div>
  );
}
