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
//   • intervalها تصادفی و متنوع‌اند (۶–۱۵ ثانیه) تا حس loop نباشد.
//   • prefers-reduced-motion → کل macro خاموش (micro هم مثل قبل خاموش).
//
// اصلاح کیفیت حرکات درشت (بدون ویرایش عکس و بدون AI image):
//   • دست: «بالا آمدن» با translate + scale جزئی؛ rotate حداکثر ۳ درجه —
//     نمای روبه‌رو حفظ می‌شود و پشت/لبهٔ دستِ سه‌بعدی‌وار ساخته نمی‌شود.
//   • سر: pivot نزدیک محل اتصال به گردن؛ rotate ≤۳ درجه + کمی translate
//     و scale — لایهٔ سر همیشه از روی سرِ اصلی می‌پوشاند؛ لبهٔ دوتایی
//     یا فضای خالی کنار گردن/پشت سر ظاهر نمی‌شود و سر از بدن جدا نمی‌شود.
//   • شانه/بالاتنه: حرکت ثانویه، کوچک‌تر و با تأخیر از حرکت اصلی.
//   • رفتن سریع‌تر از برگشت؛ مکث‌ها و دامنه‌ها در هر اجرا اندکی متفاوت —
//     هیچ A→B→A دقیق و هیچ لوپ تکراری ساخته نمی‌شود.
//   • لایهٔ underlay (همان تصویر، ایستا و بدون transform) زیر همهٔ لایه‌ها
//     هر فضای خالی احتمالی را با محتوای اصلی همان ناحیه پر می‌کند.
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

  /* ══════════════ موتور رفتار macro — اصلاح کیفیت حرکات درشت ══════════════ */
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

    /* رفتن: نرم و سریع‌تر — برگشت: بلندتر و آرام‌تر (تقارن نداریم) */
    const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
    const EASE_SOFT = 'cubic-bezier(0.4, 0, 0.2, 1)';
    const ROT_MAX = 3; // سقف چرخش — نمای روبه‌رو هرگز به نمای کنار/پشت تبدیل نمی‌شود

    const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
    /** هر اجرا اندکی متفاوت — تا هیچ A→B→A دقیق یا لوپ تکراری ساخته نشود */
    const vary = (k = 0.14) => 1 + (Math.random() * 2 - 1) * k;
    /** زمان‌ها هم اندکی تصادفی‌اند تا مکث‌ها طبیعی به‌نظر برسند */
    const durJ = (ms: number) => Math.round(ms * (0.9 + Math.random() * 0.28));

    const move = (el: HTMLDivElement, tf: string, dur: number, ease: string) => {
      el.style.transitionDuration = `${dur}ms`;
      el.style.transitionTimingFunction = ease;
      el.style.transform = tf;
    };

    /**
     * سر — pivot نزدیک محل اتصال سر به گردن (در CSS)؛ چرخش محدود +
     * کمی translate و scale. scale جزئی طوری محاسبه می‌شود که لایهٔ سر
     * همیشه از روی سرِ اصلی بپوشاند؛ پس لبهٔ دوتایی، حفرهٔ خالی یا
     * جدا شدن سر از گردن هرگز دیده نمی‌شود.
     */
    const setHead = (r: number, x: number, y: number, dur: number, ease = EASE_OUT) => {
      const rr = clamp(r, -ROT_MAX, ROT_MAX);
      const s = Math.abs(rr) < 0.05 ? 1 : 1.01 + Math.abs(rr) * 0.0185;
      move(
        head,
        `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rr.toFixed(2)}deg) scale(${s.toFixed(4)})`,
        dur,
        ease,
      );
    };

    /**
     * دست — «بالا آمدن» طبیعی با translate + scale بسیار جزئی؛ چرخش
     * فقط ≤۳ درجه در همان نمای روبه‌رو. pivot شانه در CSS نزدیک مفصل
     * واقعی است تا دست شناور یا چرخیدهٔ سه‌بعدی به‌نظر نرسد.
     */
    const setArm = (el: HTMLDivElement, x: number, y: number, r: number, dur: number, ease = EASE_OUT) => {
      const rr = clamp(r, -ROT_MAX, ROT_MAX);
      const s = y < -0.15 ? 1 + Math.min(0.024, Math.abs(y) * 0.0032 + Math.abs(rr) * 0.003) : 1;
      move(
        el,
        `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rr.toFixed(2)}deg) scale(${s.toFixed(4)})`,
        dur,
        ease,
      );
    };

    /** بدن/شانه — ثانویه: دامنه کوچک‌تر از حرکت اصلی و همیشه با تأخیر صدا زده می‌شود */
    const setBody = (r: number, y: number, dur: number, ease = EASE_OUT) => {
      move(body, `translateY(${y.toFixed(2)}px) rotate(${clamp(r, -1.6, 1.6).toFixed(2)}deg)`, dur, ease);
    };

    /** بازگشت نرم، بلند و آرام‌تر از رفتن — بدون توقف یا پرش ناگهانی */
    const rest = (dur: number) => {
      setHead(0, 0, 0, dur, EASE_SOFT);
      setArm(armL, 0, 0, 0, Math.round(dur * 0.94), EASE_SOFT);
      setArm(armR, 0, 0, 0, Math.round(dur * 0.94), EASE_SOFT);
      setBody(0, 0, dur + 200, EASE_SOFT);
    };
    const setState = (s: Behavior) => {
      wrap.dataset.behavior = s;
    };

    /* ── gestureها: هر کدام طول خودشان را برمی‌گردانند ── */

    // Greeting: بالا آوردن یک دست (ترجمهٔ محوری + چرخش خیلی کم) +
    // تکان ملایم با دامنهٔ کاهشی + کج شدن جزئی سر و بدن با تأخیر
    const greeting = (): number => {
      setState('greeting');
      const k = vary();
      const R = -1.6 * k; // پایهٔ چرخش ≤ ~۱٫۹° — بقیهٔ «بالا رفتن» از translate
      const Y = -6.4 * k;
      const X = 1.3 * k;
      at(0, () => setArm(armR, X, Y, R, durJ(560)));
      at(130, () => setHead(1.7 * k, 0.8 * k, -0.7 * k, durJ(640))); // سر کمی عقب‌تر از دست
      at(240, () => setBody(-0.85 * k, -0.35 * k, durJ(760))); // شانه/بالاتنه ثانویه

      // تکان دست — نوسان کوتاه، دامنهٔ کاهشی و زمان‌های نامنظم (نورَن نیست)
      at(660, () => setArm(armR, X + 0.2 * k, Y - 1.1 * k, R - 0.85 * k, durJ(300)));
      at(980, () => setArm(armR, X, Y + 0.2 * k, R + 0.15 * k, durJ(290)));
      at(1300, () => setArm(armR, X + 0.3 * k, Y - 1.3 * k, R - 0.95 * k, durJ(310)));
      at(1640, () => setArm(armR, X, Y, R - 0.1 * k, durJ(300)));
      at(1960, () => setArm(armR, X + 0.2 * k, Y - 0.8 * k, R - 0.6 * k, durJ(330)));

      at(2400, () => rest(durJ(1020))); // توقف کوتاه، بعد برگشتِ بلند و نرم
      at(3450, () => setState('idle'));
      return 3600;
    };

    // نگاه به یک طرف: چرخش محدود سر + همراهی کوچک و تأخیری بدن
    const look = (dir: 1 | -1): number => {
      setState('curious');
      const k = vary();
      at(0, () => setHead(dir * 2.5 * k, dir * 1.5 * k, 0.3 * k, durJ(800)));
      at(150 + Math.round(Math.random() * 90), () => setBody(dir * 1.25 * k, 0, durJ(900)));
      at(1080, () => setHead(dir * 2.0 * k, dir * 1.15 * k, 0.55 * k, durJ(520))); // settle کوچک حین نگاه
      at(2150 + Math.round(Math.random() * 200), () => rest(durJ(1000)));
      at(3300, () => setState('idle'));
      return 3450;
    };

    // Thinking: چرخش کم سر + مکث + جابجایی جزئی بدن (ثانویه، با تأخیر)
    const thinking = (): number => {
      setState('thinking');
      const k = vary();
      at(0, () => setHead(-2.2 * k, -1.0 * k, -1.2 * k, durJ(840)));
      at(170, () => setBody(0.8 * k, 0.3 * k, durJ(940)));
      at(1250, () => setHead(-1.6 * k, -0.7 * k, -1.5 * k, durJ(560))); // جابجایی ریز بعد از مکث
      at(2500, () => rest(durJ(1020)));
      at(3600, () => setState('idle'));
      return 3750;
    };

    // Curious: کج‌کردن کوچک سر + چرخش خفیف بدن در جهت مخالف
    const curious = (): number => {
      setState('curious');
      const k = vary();
      at(0, () => setHead(2.1 * k, 1.3 * k, 1.0 * k, durJ(760)));
      at(160, () => setBody(-1.05 * k, 0, durJ(880)));
      at(1020, () => setHead(2.55 * k, 1.6 * k, 1.35 * k, durJ(480)));
      at(2150, () => rest(durJ(980)));
      at(3300, () => setState('idle'));
      return 3450;
    };

    // بالا آوردن جزئی دستِ دیگر — هیچ‌وقت هر دو دست با هم نه
    const armLift = (): number => {
      setState('idle');
      const k = vary();
      at(0, () => setArm(armL, -1.0 * k, -4.8 * k, 1.7 * k, durJ(660)));
      at(150, () => setHead(-1.1 * k, -0.5 * k, 0.2, durJ(720)));
      at(260, () => setBody(0.7 * k, -0.3, durJ(840)));
      at(1580, () => rest(durJ(1000)));
      return 2750;
    };

    // یک تکانِ سرِ کوچک (nod) — تنوع
    const nod = (): number => {
      setState('idle');
      const k = vary(0.2);
      at(0, () => setHead(0.3 * k, 0, 1.9 * k, durJ(450)));
      at(560, () => setHead(0.1 * k, 0, 0.5, durJ(420)));
      at(1060, () => setHead(0.3 * k, 0, 1.6 * k, durJ(430)));
      at(1600, () => rest(durJ(780)));
      return 2550;
    };

    /* ── زمان‌بندی غیرلوپی: فاصلهٔ تصادفی و متنوع بین gestureهای بزرگ ── */
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
      const wait = 6000 + Math.random() * 9000; // ۶ تا ۱۵ ثانیه — فاصله متنوع
      at(wait, () => {
        const len = pickGesture();
        at(len + 400 + Math.round(Math.random() * 900), scheduleNext);
      });
    };

    // ورود: یک greeting کوتاه، بعد چرخهٔ idle
    at(650, () => {
      const len = greeting();
      at(len + 4200 + Math.random() * 3200, scheduleNext);
    });

    return () => {
      alive = false;
      timers.forEach((id) => window.clearTimeout(id));
      timers.length = 0;
    };
  }, []);

  return (
    <div ref={wrapRef} className={cn('zhino-welcome-photo-wrap', className)} data-behavior="idle">
      {/* لایهٔ underlay — همان تصویر، ایستا و بدون transform؛ زیر همهٔ
          لایه‌ها هر فضای خالیِ احتمالی هنگام جدا شدن سر/دست را با
          محتوای اصلی همان ناحیه پر می‌کند (بدون حفره و بدون ویرایش عکس) */}
      <div className="zw-layer zw-underlay" aria-hidden="true">
        <img className="zw-img-underlay" src={ASSISTANT_BOT_IMAGE} alt="" draggable={false} />
      </div>
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
      {/* fade لبهٔ پایینی — ایستا و جدا از لایه‌های متحرک: لبهٔ مستطیلی
          عکس بی‌آنکه با gestureها حرکت کند یا دوبل دیده شود محو می‌شود */}
      <div className="zw-layer zw-fade" aria-hidden="true" />
    </div>
  );
}
