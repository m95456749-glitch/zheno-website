// ============================================================
// ZHINO — تصویر تمام‌قد ربات در خوش‌آمدگویی صفحهٔ دستیار
// فاز ۱۵ — «حرکات درشت و واکنش‌های قابل مشاهده»
//
// روی همان سیستم ظریف فاز ۱۴ سوار می‌شود و آن را حذف نمی‌کند:
//   • لایه‌های micro (تنفس/شانه/سر/چشم) دقیقاً مثل قبل روی
//     عنصرهای خودشان می‌مانند.
//   • یک «عروسک ۲بعدی» اضافه می‌شود: کپی‌های هم‌تراز همان تصویر با
//     ماسک نرم برای سر، بازوی چپ و بازوی راست + یک لایهٔ macro برای
//     بالاتنه. چون کپی‌ها در حالت سکون دقیقاً روی هم منطبق‌اند، تصویر
//     در حالت عادی هیچ تغییری نمی‌کند و فقط هنگام gesture جدا می‌شوند.
//
// حالت‌های رفتاری (data-behavior روی wrap هم برای مشاهده/کنترل ست می‌شود):
//   idle      → حرکات ظریف + هر چند ثانیه یک macro-gesture تصادفی
//   greeting  → بالا آوردن یک دست + wave کوتاه و نرم (یک‌بار اول ورود)
//   thinking  → چرخش کم سر + مکث + جابجایی بسیار جزئی بدن
//   curious   → کج‌کردن/چرخش سر به یک طرف همراه نگاه و بدن
//   return    → همهٔ gestureها با transition بلند به هویت برمی‌گردند
//
// نکات فنی:
//   • هیچ re-renderای رخ نمی‌دهد — همه‌چیز ref + style.transform.
//   • فقط transform/opacity؛ easing با transitionهای CSS.
//   • هیچ دو دستی هم‌زمان حرکت نمی‌کند؛ بدن فقط همراه gesture می‌چرخد.
//   • intervalها تصادفی و متنوع‌اند (۵–۱۳ ثانیه) تا حس loop نباشد.
//   • prefers-reduced-motion → کل macro خاموش (micro هم مثل قبل خاموش).
// فایل تصویر اصلی دست‌نخورده است.
// ============================================================

import { useEffect, useRef } from 'react';
import { cn } from '../../utils/cn';
import { ASSISTANT_BOT_IMAGE, ASSISTANT_NAME } from './assistantData';

interface Props {
  className?: string;
}

type Behavior = 'idle' | 'greeting' | 'thinking' | 'curious';

export default function ZhinoWelcomeAnimation({ className }: Props) {
  // ── لایه‌های micro (فاز ۱۴ — بدون تغییر) ──
  const bodyRef = useRef<HTMLDivElement>(null);
  const shoulderRef = useRef<HTMLDivElement>(null);
  const headStageRef = useRef<HTMLDivElement>(null);
  const eyesRef = useRef<HTMLSpanElement>(null);
  const timersRef = useRef<number[]>([]);

  // ── لایه‌های macro (فاز ۱۵) ──
  const wrapRef = useRef<HTMLDivElement>(null);
  const macroBodyRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const armLeftRef = useRef<HTMLDivElement>(null);
  const armRightRef = useRef<HTMLDivElement>(null);
  const macroTimersRef = useRef<number[]>([]);

  /* ══════════════ سیستم micro — دقیقاً مثل فاز ۱۴ ══════════════ */
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
      const el = headStageRef.current;
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

  /* ══════════════ موتور رفتار macro — فاز ۱۵ ══════════════ */
  useEffect(() => {
    let reduced = false;
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduced = false;
    }
    if (reduced) return;

    const wrap = wrapRef.current;
    const body = macroBodyRef.current;
    const head = headRef.current;
    const armL = armLeftRef.current;
    const armR = armRightRef.current;
    if (!wrap || !body || !head || !armL || !armR) return;

    let alive = true;
    const timers: number[] = [];
    macroTimersRef.current = timers;
    const at = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(() => { if (alive) fn(); }, ms) as unknown as number);
    };

    // نوشتن transform با duration اختصاصی هر گام — easing از CSS
    const move = (el: HTMLDivElement, tf: string, dur: number) => {
      el.style.transitionDuration = `${dur}ms`;
      el.style.transform = tf;
    };
    const setHead = (r: number, x: number, y: number, dur: number) =>
      move(head, `translate(${x}px, ${y}px) rotate(${r}deg)`, dur);
    const setArmL = (r: number, y: number, dur: number) =>
      move(armL, `translateY(${y}px) rotate(${r}deg)`, dur);
    const setArmR = (r: number, y: number, dur: number) =>
      move(armR, `translateY(${y}px) rotate(${r}deg)`, dur);
    const setBody = (r: number, y: number, dur: number) =>
      move(body, `translateY(${y}px) rotate(${r}deg)`, dur);
    /** بازگشت نرم به حالت عادی — transition بلندتر برای settle */
    const rest = (dur: number) => {
      setHead(0, 0, 0, dur);
      setArmL(0, 0, dur);
      setArmR(0, 0, dur);
      setBody(0, 0, dur + 160);
    };
    const setState = (s: Behavior) => {
      wrap.dataset.behavior = s;
    };

    /* ── gestureها: هر کدام طول خودشان را برمی‌گردانند ── */

    // Greeting: بالا آوردن یک دست + wave کوتاه و نرم + کج شدن ملایم سر
    const greeting = (): number => {
      setState('greeting');
      at(0, () => { setArmR(-9, -6, 520); setHead(3.5, 1.5, -1, 560); setBody(1.1, 0, 640); });
      at(620, () => setArmR(-3.5, -6, 260));
      at(930, () => setArmR(-10, -7, 260));
      at(1240, () => setArmR(-4, -6, 260));
      at(1550, () => setArmR(-10, -7, 280));
      at(1950, () => rest(880));
      at(2900, () => setState('idle'));
      return 3100;
    };

    // نگاه به یک طرف: چرخش محسوس سر + همراهی بدن
    const look = (dir: 1 | -1): number => {
      setState('curious');
      at(0, () => { setHead(dir * 6, dir * 2.5, 0.4, 760); });
      at(140, () => setBody(dir * 1.6, 0, 860));
      at(1000, () => setHead(dir * 4.6, dir * 2, 0.9, 460)); // settle کوچک حین نگاه
      at(2050, () => rest(950));
      at(3000, () => setState('idle'));
      return 3100;
    };

    // Thinking: چرخش کم سر + مکث + جابجایی بسیار جزئی بدن
    const thinking = (): number => {
      setState('thinking');
      at(0, () => { setHead(-4, -1.5, -1.6, 800); setBody(0.9, 0.4, 900); });
      at(1150, () => setHead(-2.6, -1, -2.1, 560)); // یک جابجایی ریز بعد از مکث
      at(2350, () => rest(1000));
      at(3350, () => setState('idle'));
      return 3450;
    };

    // Curious: کج‌کردن سر + چرخش خفیف بدن در جهت مخالف
    const curious = (): number => {
      setState('curious');
      at(0, () => { setHead(5.5, 2, 1.6, 700); setBody(-1.3, 0, 820); });
      at(950, () => setHead(6.6, 2.4, 2.2, 430));
      at(2050, () => rest(950));
      at(3000, () => setState('idle'));
      return 3100;
    };

    // بالا آوردن جزئی دستِ دیگر — هیچ‌وقت هر دو دست با هم نه
    const armLift = (): number => {
      setState('idle');
      at(0, () => { setArmL(7, -5, 620); setHead(-2, -0.8, 0, 640); setBody(-0.8, 0, 720); });
      at(1450, () => rest(900));
      return 2500;
    };

    // یک تکانِ سرِ کوچک (nod) — تنوع
    const nod = (): number => {
      setState('idle');
      at(0, () => setHead(0.6, 0, 2.4, 420));
      at(520, () => setHead(0, 0, 0.4, 380));
      at(1020, () => setHead(0.6, 0, 2.2, 400));
      at(1540, () => rest(720));
      return 2400;
    };

    /* ── زمان‌بندی غیرلوپی: فاصلهٔ تصادفی بین gestureهای بزرگ ── */
    const pickGesture = () => {
      const roll = Math.random();
      if (roll < 0.24) return look(1);
      if (roll < 0.48) return look(-1);
      if (roll < 0.64) return curious();
      if (roll < 0.78) return thinking();
      if (roll < 0.9) return armLift();
      return nod();
    };

    const scheduleNext = () => {
      const wait = 5200 + Math.random() * 7800; // ۵٫۲ تا ۱۳ ثانیه
      at(wait, () => {
        const len = pickGesture();
        at(len + 400, scheduleNext);
      });
    };

    // ورود: یک greeting کوتاه، بعد چرخهٔ idle
    at(650, () => {
      const len = greeting();
      at(len + 3600 + Math.random() * 2400, scheduleNext);
    });

    return () => {
      alive = false;
      timers.forEach((id) => window.clearTimeout(id));
      timers.length = 0;
    };
  }, []);

  return (
    <div ref={wrapRef} className={cn('zhino-welcome-photo-wrap', className)} data-behavior="idle">
      {/* لایهٔ macro بالاتنه — فقط همراه gestureها می‌چرخد */}
      <div ref={macroBodyRef} className="zw-layer zw-body-macro">
        {/* لایه‌ micro تنفس (فاز ۱۴) */}
        <div ref={bodyRef} className="zhino-welcome-photo-body">
          {/* لایهٔ micro شانه (فاز ۱۴) */}
          <div ref={shoulderRef} className="zhino-welcome-photo-shoulder">
            {/* تنه + پاها — ماسک مکملِ سر و دست‌ها */}
            <div className="zw-layer zw-base">
              <img
                className="zhino-welcome-photo zw-img-base"
                src={ASSISTANT_BOT_IMAGE}
                alt={`تصویر واقعی ${ASSISTANT_NAME}`}
                draggable={false}
              />
            </div>
            {/* بازوی چپ — کپی هم‌تراز با ماسک نرم دور بازو */}
            <div ref={armLeftRef} className="zw-layer zw-arm-l">
              <img className="zw-img-arm zw-img-arm-l" src={ASSISTANT_BOT_IMAGE} alt="" aria-hidden="true" draggable={false} />
            </div>
            {/* بازوی راست — کپی هم‌تراز با ماسک نرم دور بازو */}
            <div ref={armRightRef} className="zw-layer zw-arm-r">
              <img className="zw-img-arm zw-img-arm-r" src={ASSISTANT_BOT_IMAGE} alt="" aria-hidden="true" draggable={false} />
            </div>
            {/* لایهٔ micro sway سر (فاز ۱۴) — حالا فقط دور سر */}
            <div ref={headStageRef} className="zhino-welcome-photo-stage">
              {/* لایهٔ macro سر — چرخش/کج‌شدن محسوس اما نرم */}
              <div ref={headRef} className="zw-layer zw-head">
                <img className="zw-img-head" src={ASSISTANT_BOT_IMAGE} alt="" aria-hidden="true" draggable={false} />
                <span ref={eyesRef} className="zhino-welcome-eyes" aria-hidden="true">
                  <span className="zhino-welcome-eye is-left" />
                  <span className="zhino-welcome-eye is-right" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
