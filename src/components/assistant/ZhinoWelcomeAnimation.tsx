// ============================================================
// ZHINO — تصویر تمام‌قد ربات در خوش‌آمدگویی صفحهٔ دستیار
// فاز ۱۴ نهایی — طبیعی‌ترین و روان‌ترین حالت ممکن
//
// فایل تصویر اصلی (ASSISTANT_BOT_IMAGE) دست‌نخورده است.
// همهٔ حرکات فقط transform و opacity، بدون re-render غیرضروری:
//   • پلک نامنظم ۲٫۸-۶٫۲s، بسته ۹۵-۱۶۰ms، گاهی دوبل ۱۸٪
//   • head sway ±۰٫۸px / ±۰٫۵px / ±۰٫۴deg — ۳٫۲-۷s
//   • تنفس بدن ±۰٫۵px + scale ۰٫۹۹۷۵-۱٫۰۰۲۵ — ۴-۷٫۲s
//   • شانه/دست micro ±۰٫۳۵px / ±۰٫۲۵deg — ۳٫۸-۷٫۶s
//   • gaze ±۰٫۶px + saccade گاه‌به‌گاه — ۲-۵s
// هر لایه timing متفاوت و با تاخیر اولیه متفاوت شروع می‌شود تا
// هیچ همزمانی رباتیک قابل تشخیص نماند. transitionها نرم و
// بدون jump بین حالت‌ها. با prefers-reduced-motion خاموش.
// ============================================================

import { useEffect, useRef } from 'react';
import { cn } from '../../utils/cn';
import { ASSISTANT_BOT_IMAGE, ASSISTANT_NAME } from './assistantData';

interface Props {
  className?: string;
}

export default function ZhinoWelcomeAnimation({ className }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const shoulderRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const eyesRef = useRef<HTMLSpanElement>(null);
  const timersRef = useRef<number[]>([]);

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

    // head sway بسیار ظریف — بدون جدا شدن از محیط
    const moveHead = () => {
      const el = headRef.current;
      if (!el) return;
      const x = (Math.random() - 0.5) * 1.6; // ±0.8px
      const y = (Math.random() - 0.5) * 1.0; // ±0.5px
      const r = (Math.random() - 0.5) * 0.8; // ±0.4deg
      el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${r.toFixed(2)}deg)`;
    };

    // تنفس بدن — بسیار کم دامنه
    const breathe = () => {
      const el = bodyRef.current;
      if (!el) return;
      const y = (Math.random() - 0.5) * 1.0; // ±0.5px
      const scale = 1 + (Math.random() - 0.5) * 0.005; // 0.9975-1.0025
      el.style.transform = `translateY(${y.toFixed(2)}px) scaleY(${scale.toFixed(4)})`;
    };

    // شانه و دست micro-movement — بدون حرکت بزرگ
    const microShoulder = () => {
      const el = shoulderRef.current;
      if (!el) return;
      const x = (Math.random() - 0.5) * 0.7; // ±0.35px
      const y = (Math.random() - 0.5) * 0.5; // ±0.25px
      const r = (Math.random() - 0.5) * 0.5; // ±0.25deg
      el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${r.toFixed(2)}deg)`;
    };

    // gaze جزئی — تغییر بسیار کم جهت نگاه
    const gaze = () => {
      const el = eyesRef.current;
      if (!el) return;
      const x = (Math.random() - 0.5) * 1.2; // ±0.6px
      const y = (Math.random() - 0.5) * 0.8; // ±0.4px
      el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      if (Math.random() < 0.22) {
        pushTimer(
          window.setTimeout(() => {
            const e = eyesRef.current;
            if (!e) return;
            const nx = x + (Math.random() - 0.5) * 0.8;
            const ny = y + (Math.random() - 0.5) * 0.5;
            e.style.transform = `translate(${nx.toFixed(2)}px, ${ny.toFixed(2)}px)`;
          }, 160 + Math.random() * 180) as unknown as number,
        );
      }
    };

    // شروع با تاخیرهای متفاوت تا همزمانی از بین برود — بدون jump اولیه
    pushTimer(
      window.setTimeout(() => {
        gaze();
        scheduleLoop(gaze, 2000, 5000);
      }, 600) as unknown as number,
    );
    pushTimer(
      window.setTimeout(() => {
        doBlink();
        scheduleLoop(doBlink, 2800, 6200);
      }, 1100) as unknown as number,
    );
    pushTimer(
      window.setTimeout(() => {
        moveHead();
        scheduleLoop(moveHead, 3200, 7000);
      }, 900) as unknown as number,
    );
    pushTimer(
      window.setTimeout(() => {
        breathe();
        scheduleLoop(breathe, 4000, 7200);
      }, 1300) as unknown as number,
    );
    pushTimer(
      window.setTimeout(() => {
        microShoulder();
        scheduleLoop(microShoulder, 3800, 7600);
      }, 1700) as unknown as number,
    );

    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  return (
    <div className={cn('zhino-welcome-photo-wrap', className)}>
      <div ref={bodyRef} className="zhino-welcome-photo-body">
        <div ref={shoulderRef} className="zhino-welcome-photo-shoulder">
          <div ref={headRef} className="zhino-welcome-photo-stage">
            <img
              className="zhino-welcome-photo"
              src={ASSISTANT_BOT_IMAGE}
              alt={`تصویر واقعی ${ASSISTANT_NAME}`}
              draggable={false}
            />
            <span ref={eyesRef} className="zhino-welcome-eyes" aria-hidden="true">
              <span className="zhino-welcome-eye is-left" />
              <span className="zhino-welcome-eye is-right" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
