// ============================================================
// ZHINO — ربات دستیار هوشمند ژینو (Concept A: Compact Companion)
// طراحی کاملاً اختصاصی برای برند ژینو:
//   • بدنه استوانه‌ای جمع‌وجور مات عاجی (Ivory Matte)
//   • سر گنبدی بزرگ با وایزر OLED مشکی و چشم‌های LED طلایی
//   • مفاصل مکانیکی طلایی شامپاینی (Neck, Shoulders, Elbows, Knees, Ankles)
//   • پنل سینه زرشکی (#71313B) با نشان LED طلایی
//   • آنتن کوچک با گوی طلایی
//   • پاها و دست‌های رباتیک با کف زرشکی
//
// قطعات مستقل برای انیمیشن:
//   چشم‌ها (people)، پلک (blink)، دهان (mouth)، سر (head)،
//   بدن (body)، بازوی چپ (wave/think)، بازوی راست (محصول)، پاها
//
// حالت‌ها: idle, greeting, thinking, speaking, waving
// سبک: SVG + CSS + JS — بدون وابستگی خارجی، سبک و روان
// ============================================================

import { useEffect, useRef, useState, useCallback, useId } from 'react';
import { cn } from '../../utils/cn';
import './zhino-character.css';

type Mode = 'idle' | 'greeting' | 'thinking' | 'speaking' | 'waving';

interface Props {
  mode?: Mode;
  size?: number;
  showProduct?: boolean;
  className?: string;
  compact?: boolean;
  onGreetingComplete?: () => void;
}

// ── پالت رنگ برند ──
const C = {
  ivoryLight: '#FFFEFB',
  ivory:       '#F5EFE6',
  ivoryMid:    '#E8DDCE',
  ivoryDark:   '#D6C6B2',
  ivoryShadow: '#C2AF96',
  burgundy:    '#71313B',
  burgundyDark:'#5A1725',
  burgundyDk2: '#421019',
  goldLight:   '#EBD9B2',
  gold:        '#D4B884',
  goldMid:     '#B89A62',
  goldDark:    '#8C723F',
  visor:       '#0E0A0B',
  visorInner:  '#1F1618',
  led:         '#FFD98A',
  ledGlow:     '#FFE8B0',
  ledDim:      '#E2B96E',
};

export default function ZhinoCharacter({
  mode = 'idle',
  size = 200,
  showProduct = true,
  className,
  compact = false,
  onGreetingComplete,
}: Props) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, '_');
  const gid = (name: string) => `${uid}_${name}`;

  // ── state انیمیشن ──
  const [blink, setBlink] = useState(false);
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
  const [mouthOpen, setMouthOpen] = useState(0); // 0..1
  const [greetingPhase, setGreetingPhase] = useState<'enter' | 'smile' | 'wave' | 'product' | 'settle'>('enter');
  const [idleTilt, setIdleTilt] = useState({ x: 0, y: 0, r: 0 });
  const [bodySway, setBodySway] = useState({ r: 0, y: 0 });
  const [leftArmWave, setLeftArmWave] = useState(0);

  // ── refs تایمر ──
  const blinkTimer = useRef<number | null>(null);
  const blinkInnerTimer = useRef<number | null>(null);
  const eyeTimer = useRef<number | null>(null);
  const tiltTimer = useRef<number | null>(null);
  const swayTimer = useRef<number | null>(null);
  const mouthTimer = useRef<number | null>(null);
  const greetingTimer = useRef<number | null>(null);
  const waveRaf = useRef<number | null>(null);

  // ── پلک‌زدن نامنظم (چشم‌های OLED با بسته شدن عمودی) ──
  const scheduleBlink = useCallback(() => {
    if (blinkTimer.current) window.clearTimeout(blinkTimer.current);
    const next = 2200 + Math.random() * 3800;
    blinkTimer.current = window.setTimeout(() => {
      setBlink(true);
      if (blinkInnerTimer.current) window.clearTimeout(blinkInnerTimer.current);
      blinkInnerTimer.current = window.setTimeout(() => {
        setBlink(false);
        blinkInnerTimer.current = null;
      }, 110 + Math.random() * 90) as unknown as number;
      // گاهی دوبل پلک (بسیار طبیعی)
      if (Math.random() < 0.18) {
        blinkInnerTimer.current = window.setTimeout(() => {
          setBlink(true);
          blinkInnerTimer.current = window.setTimeout(() => {
            setBlink(false);
            blinkInnerTimer.current = null;
          }, 90) as unknown as number;
        }, 260) as unknown as number;
      }
      scheduleBlink();
    }, next) as unknown as number;
  }, []);

  // ── حرکت طبیعی چشم‌ها روی صفحه OLED ──
  const scheduleEyeMove = useCallback(() => {
    if (eyeTimer.current) window.clearTimeout(eyeTimer.current);
    const next = 1600 + Math.random() * 3600;
    eyeTimer.current = window.setTimeout(() => {
      const presets = [
        { x: 0, y: 0 },
        { x: -1.8, y: -0.4 },
        { x: 1.8, y: -0.4 },
        { x: -1.2, y: 1.0 },
        { x: 1.4, y: 0.6 },
        { x: 0, y: -1.4 },
        { x: -2.4, y: 0.2 },
        { x: 2.4, y: 0.2 },
        { x: -0.6, y: 0.8 },
        { x: 0.8, y: -0.8 },
      ];
      const pool = mode === 'thinking'
        ? [{ x: -1.6, y: -2.0 }, { x: 1.6, y: -1.8 }, { x: 0, y: -2.4 }, { x: 1.2, y: -1.2 }, { x: -1.0, y: -2.2 }]
        : presets;
      const target = pool[Math.floor(Math.random() * pool.length)];
      setEyeOffset({
        x: target.x + (Math.random() - 0.5) * 0.6,
        y: target.y + (Math.random() - 0.5) * 0.5,
      });
      // گاهی چشم‌ها سریع saccade می‌زنند
      if (Math.random() < 0.22) {
        window.setTimeout(() => {
          setEyeOffset((p) => ({
            x: p.x + (Math.random() - 0.5) * 1.4,
            y: p.y + (Math.random() - 0.5) * 0.8,
          }));
        }, 180 + Math.random() * 140);
      }
      scheduleEyeMove();
    }, next) as unknown as number;
  }, [mode]);

  // ── حرکت بسیار ظریف سر (تصادفی، غیر لوپ) ──
  const scheduleTilt = useCallback(() => {
    if (tiltTimer.current) window.clearTimeout(tiltTimer.current);
    const next = 2800 + Math.random() * 4800;
    tiltTimer.current = window.setTimeout(() => {
      if (mode === 'idle' || mode === 'speaking') {
        setIdleTilt({
          x: (Math.random() - 0.5) * 2.2,
          y: (Math.random() - 0.5) * 1.8,
          r: (Math.random() - 0.5) * 3.2,
        });
      }
      scheduleTilt();
    }, next) as unknown as number;
  }, [mode]);

  // ── حرکت تنفس/sway بدن ──
  const scheduleSway = useCallback(() => {
    if (swayTimer.current) window.clearTimeout(swayTimer.current);
    const next = 3200 + Math.random() * 4200;
    swayTimer.current = window.setTimeout(() => {
      if (mode === 'idle') {
        setBodySway({
          r: (Math.random() - 0.5) * 1.2,
          y: (Math.random() - 0.5) * 0.8,
        });
      }
      scheduleSway();
    }, next) as unknown as number;
  }, [mode]);

  // ── دهان هنگام صحبت (دهان LED دیجیتال روی وایزر) ──
  useEffect(() => {
    if (mode !== 'speaking') {
      setMouthOpen(0);
      return;
    }
    const tick = () => {
      // شبیه‌سازی طبیعی با مقادیر متفاوت و گاهی مکث
      const r = Math.random();
      const val = r < 0.12 ? 0 : r < 0.3 ? 0.2 + Math.random() * 0.2 : 0.35 + Math.random() * 0.6;
      setMouthOpen(val);
      mouthTimer.current = window.setTimeout(tick, 90 + Math.random() * 200) as unknown as number;
    };
    tick();
    return () => {
      if (mouthTimer.current) window.clearTimeout(mouthTimer.current);
      mouthTimer.current = null;
    };
  }, [mode]);

  // ── راه‌اندازی زمان‌سنج‌ها با cleanup ──
  useEffect(() => {
    scheduleBlink();
    scheduleEyeMove();
    scheduleTilt();
    scheduleSway();
    return () => {
      [blinkTimer, blinkInnerTimer, eyeTimer, tiltTimer, swayTimer, mouthTimer, greetingTimer].forEach((ref) => {
        if (ref.current) { window.clearTimeout(ref.current); ref.current = null; }
      });
      if (waveRaf.current) cancelAnimationFrame(waveRaf.current);
    };
  }, [scheduleBlink, scheduleEyeMove, scheduleTilt, scheduleSway]);

  // ── wave دست چپ با requestAnimationFrame ──
  useEffect(() => {
    const isWaving = mode === 'waving' || (mode === 'greeting' && greetingPhase === 'wave');
    if (!isWaving) {
      setLeftArmWave(0);
      if (waveRaf.current) { cancelAnimationFrame(waveRaf.current); waveRaf.current = null; }
      return;
    }
    const start = performance.now();
    const animate = (t: number) => {
      const elapsed = (t - start) / 1000;
      // حرکت موجی طبیعی با کاهش دامنه
      const base = Math.sin(elapsed * 5.5) * 22 + Math.sin(elapsed * 2.0) * 6;
      setLeftArmWave(base);
      waveRaf.current = requestAnimationFrame(animate);
    };
    waveRaf.current = requestAnimationFrame(animate);
    return () => {
      if (waveRaf.current) cancelAnimationFrame(waveRaf.current);
    };
  }, [mode, greetingPhase]);

  // ── توالی greeting: enter → smile → wave → product → settle ──
  useEffect(() => {
    if (mode !== 'greeting') return;
    setGreetingPhase('enter');
    const steps: Array<{ phase: typeof greetingPhase; delay: number }> = [
      { phase: 'enter', delay: 0 },
      { phase: 'smile', delay: 280 },
      { phase: 'wave', delay: 450 },
      { phase: 'product', delay: 900 },
      { phase: 'settle', delay: 1100 },
    ];
    const finalDelay = 500;
    let idx = 0;
    const run = () => {
      if (idx >= steps.length) {
        greetingTimer.current = window.setTimeout(() => {
          onGreetingComplete?.();
          greetingTimer.current = null;
        }, finalDelay) as unknown as number;
        return;
      }
      setGreetingPhase(steps[idx].phase);
      greetingTimer.current = window.setTimeout(() => {
        idx++;
        run();
      }, steps[idx].delay) as unknown as number;
    };
    run();
    return () => {
      if (greetingTimer.current) { window.clearTimeout(greetingTimer.current); greetingTimer.current = null; }
    };
  }, [mode, onGreetingComplete]);

  const isThinking = mode === 'thinking';
  const isGreeting = mode === 'greeting';
  const isSpeaking = mode === 'speaking';
  const isWaving = mode === 'waving' || (isGreeting && greetingPhase === 'wave');
  const isProductLifted = isGreeting && greetingPhase === 'product';
  const isSmiling = isGreeting && (greetingPhase === 'smile' || greetingPhase === 'wave' || greetingPhase === 'product');
  const eyeScaleY = isThinking ? 0.75 : (blink ? 0.1 : 1);
  const eyeY = isThinking ? -0.4 : 0;

  // انیمیشن لبخند/دهان
  const smileCurve = isThinking
    ? 0   // دهان بسته — حالت فکر (چشم‌ها به بالا نگاه می‌کنند)
    : isSmiling
    ? 4.5 // لبخند پهن
    : isSpeaking
    ? 1.5 + mouthOpen * 3
    : 2.2; // لبخند ملایم عادی
  const mouthOpenAmt = isSpeaking ? mouthOpen * 4 : 0;

  // بازوی چپ: زاویه و جابجایی
  const leftArmTransform = isThinking
    ? 'rotate(-38deg) translate(-4px,-10px)'   // دست نزدیک چانه
    : isWaving
    ? `rotate(${-18 + leftArmWave}deg) translate(-2px,-6px)`
    : 'rotate(-4deg)';

  // بازوی راست: نگه داشتن محصول یا حالت عادی
  const rightArmTransform = isProductLifted
    ? 'rotate(-22deg) translate(2px,-8px)'
    : showProduct
    ? 'rotate(-6deg)'
    : 'rotate(3deg)';

  // حالت فکر کردن: سر کمی به چپ و بالا
  const headOverride = isThinking
    ? { x: -1.5, y: -1, r: -5 }
    : isGreeting && greetingPhase === 'enter'
    ? { x: 0, y: -4, r: 0 }
    : null;
  const headX = headOverride ? headOverride.x : idleTilt.x;
  const headY = headOverride ? headOverride.y : idleTilt.y;
  const headR = headOverride ? headOverride.r : idleTilt.r;

  // کمپکت: فقط سر (برای آواتارهای کوچک)
  const vb = compact ? '0 0 120 120' : '0 0 200 260';

  // پارامترهای کامپکت/فول
  const P = compact
    ? {
        cx: 60, cy: 62, headRX: 40, headRY: 42, visorW: 64, visorH: 28, visorY: 62,
        eyeR: 7.5, eyeLY: 62, eyeLXOff: -13, eyeRXOff: 13,
        mouthW: 16, mouthY: 78,
        antX: 22, antY: 28, earOff: 38,
      }
    : {
        cx: 100, cy: 95, headRX: 58, headRY: 60, visorW: 92, visorH: 38, visorY: 96,
        eyeR: 10.5, eyeLY: 96, eyeLXOff: -19, eyeRXOff: 19,
        mouthW: 22, mouthY: 118,
        antX: 46, antY: 36, earOff: 56,
      };

  return (
    <div
      className={cn('zhino-char-root', `is-${mode}`, compact && 'is-compact', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox={vb}
        width={size}
        height={size}
        className="zhino-char-svg"
        role="img"
      >
        <defs>
          {/* گرادیان سر گنبدی عاجی */}
          <radialGradient id={gid('head')} cx="38%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="25%" stopColor={C.ivoryLight} />
            <stop offset="55%" stopColor={C.ivory} />
            <stop offset="85%" stopColor={C.ivoryMid} />
            <stop offset="100%" stopColor={C.ivoryDark} />
          </radialGradient>
          {/* گرادیان وایزر OLED */}
          <radialGradient id={gid('visor')} cx="50%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#2A2023" />
            <stop offset="45%" stopColor="#1A1214" />
            <stop offset="100%" stopColor={C.visor} />
          </radialGradient>
          <linearGradient id={gid('visor-edge')} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3A2D30" />
            <stop offset="100%" stopColor="#080506" />
          </linearGradient>
          {/* درخشش شیشه وایزر */}
          <linearGradient id={gid('visor-glare')} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.28" />
            <stop offset="40%" stopColor="#FFFFFF" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          {/* LED چشم‌ها — درخشش طلایی */}
          <radialGradient id={gid('led')} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFF5D0" />
            <stop offset="35%" stopColor={C.ledGlow} />
            <stop offset="75%" stopColor={C.led} />
            <stop offset="100%" stopColor={C.ledDim} />
          </radialGradient>
          <radialGradient id={gid('led-halo')} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={C.ledGlow} stopOpacity="0.6" />
            <stop offset="100%" stopColor={C.led} stopOpacity="0" />
          </radialGradient>
          {/* گرادیان مفاصل طلایی */}
          <linearGradient id={gid('gold')} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={C.goldLight} />
            <stop offset="50%" stopColor={C.gold} />
            <stop offset="100%" stopColor={C.goldDark} />
          </linearGradient>
          <radialGradient id={gid('gold-ball')} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#FFF3CF" />
            <stop offset="55%" stopColor={C.gold} />
            <stop offset="100%" stopColor={C.goldDark} />
          </radialGradient>
          {/* بدنه عاجی */}
          <linearGradient id={gid('body')} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={C.ivoryLight} />
            <stop offset="30%" stopColor={C.ivory} />
            <stop offset="75%" stopColor={C.ivoryMid} />
            <stop offset="100%" stopColor={C.ivoryDark} />
          </linearGradient>
          <radialGradient id={gid('body-front')} cx="50%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
          {/* بازوها و پاها */}
          <linearGradient id={gid('limb')} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={C.ivoryLight} />
            <stop offset="100%" stopColor={C.ivoryMid} />
          </linearGradient>
          {/* پنل سینه زرشکی */}
          <linearGradient id={gid('panel')} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#8A3D4A" />
            <stop offset="50%" stopColor={C.burgundy} />
            <stop offset="100%" stopColor={C.burgundyDark} />
          </linearGradient>
          {/* کف پای زرشکی */}
          <linearGradient id={gid('sole')} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={C.burgundy} />
            <stop offset="100%" stopColor={C.burgundyDk2} />
          </linearGradient>
          {/* بسته محصول */}
          <linearGradient id={gid('pkg')} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor={C.ivory} />
          </linearGradient>

          {/* فیلترها */}
          <filter id={gid('soft-shadow')} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#2A0B12" floodOpacity="0.20" />
          </filter>
          <filter id={gid('glow-led')} x="-200%" y="-200%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* سایه زمین */}
        {!compact && (
          <ellipse cx="100" cy="244" rx="46" ry="7" fill="#2A0B12" opacity="0.10" className="zc-ground-shadow" />
        )}

        {/* ======================== پاها و کف (پایین‌ترین لایه) ======================== */}
        {!compact && (
          <g className="zc-legs">
            {/* پای چپ */}
            <g className="zc-leg zc-leg-left">
              {/* مفصل زانو */}
              <circle cx="78" cy="184" r="7" fill={`url(#${gid('gold')})`} stroke={C.goldDark} strokeWidth="0.6" />
              <circle cx="78" cy="184" r="3" fill={C.goldDark} opacity="0.35" />
              {/* ساق */}
              <path d="M73 188 Q72 205 73 218 L85 218 Q86 205 84 188 Z" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.8" />
              {/* مفصل مچ پا */}
              <circle cx="79" cy="220" r="5.5" fill={`url(#${gid('gold')})`} stroke={C.goldDark} strokeWidth="0.5" />
              {/* کف پا */}
              <ellipse cx="79" cy="232" rx="15" ry="8" fill={`url(#${gid('sole')})`} stroke={C.burgundyDk2} strokeWidth="0.6" />
              <path d="M65 230 Q79 224 93 230" stroke={C.burgundy} strokeWidth="1" fill="none" opacity="0.4" />
            </g>
            {/* پای راست */}
            <g className="zc-leg zc-leg-right">
              <circle cx="122" cy="184" r="7" fill={`url(#${gid('gold')})`} stroke={C.goldDark} strokeWidth="0.6" />
              <circle cx="122" cy="184" r="3" fill={C.goldDark} opacity="0.35" />
              <path d="M117 188 Q116 205 117 218 L129 218 Q130 205 128 188 Z" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.8" />
              <circle cx="123" cy="220" r="5.5" fill={`url(#${gid('gold')})`} stroke={C.goldDark} strokeWidth="0.5" />
              <ellipse cx="123" cy="232" rx="15" ry="8" fill={`url(#${gid('sole')})`} stroke={C.burgundyDk2} strokeWidth="0.6" />
              <path d="M109 230 Q123 224 137 230" stroke={C.burgundy} strokeWidth="1" fill="none" opacity="0.4" />
            </g>
          </g>
        )}

        {/* ======================== بدن ======================== */}
        {!compact && (
          <g className="zc-body-group" style={{ transformOrigin: '100px 160px', transform: `translateY(${bodySway.y}px) rotate(${bodySway.r}deg)` } as any}>
            {/* استوانه اصلی بدن */}
            <path
              d="M60 118 Q58 118 58 130 L60 178 Q60 186 70 186 L130 186 Q140 186 140 178 L142 130 Q142 118 140 118 Z"
              fill={`url(#${gid('body')})`}
              stroke={C.ivoryDark}
              strokeWidth="0.8"
              filter={`url(#${gid('soft-shadow')})`}
              className="zc-body-main"
            />
            {/* درخشش جلوی بدن */}
            <path
              d="M70 122 Q85 120 100 120 Q115 120 130 122 L128 170 Q100 174 72 170 Z"
              fill={`url(#${gid('body-front')})`}
              opacity="0.7"
            />
            {/* لبه بالای بدن (طوق طلایی در اتصال به مفصل گردن) */}
            <ellipse cx="100" cy="118" rx="42" ry="5" fill={`url(#${gid('gold')})`} stroke={C.goldDark} strokeWidth="0.5" />
            <ellipse cx="100" cy="117" rx="40" ry="3" fill={C.goldLight} opacity="0.55" />

            {/* پنل زرشکی سینه */}
            <path
              d="M78 132 Q78 126 86 124 L114 124 Q122 126 122 132 L120 158 Q120 164 112 166 L88 166 Q80 164 80 158 Z"
              fill={`url(#${gid('panel')})`}
              stroke={C.burgundyDk2}
              strokeWidth="0.8"
            />
            {/* LED وضعیت طلایی روی پنل */}
            <circle cx="100" cy="143" r="4.2" fill={`url(#${gid('gold')})`} stroke={C.goldDark} strokeWidth="0.5" />
            <circle cx="100" cy="143" r="2.6" fill={C.ledGlow} filter={`url(#${gid('glow-led')})`} opacity="0.95">
              <animate attributeName="opacity" values="0.7;1;0.8;0.95;0.7" dur="3.2s" repeatCount="indefinite" />
            </circle>
            {/* خط تزئینی زیر پنل */}
            <path d="M84 172 Q100 174 116 172" stroke={`url(#${gid('gold')})`} strokeWidth="0.9" fill="none" opacity="0.45" strokeLinecap="round" />
            {/* درز پنل‌های جانبی */}
            <path d="M64 130 L64 176" stroke={C.ivoryShadow} strokeWidth="0.7" opacity="0.5" />
            <path d="M136 130 L136 176" stroke={C.ivoryShadow} strokeWidth="0.7" opacity="0.5" />
          </g>
        )}

        {/* ======================== بازوی چپ (سلام / فکر کردن) ======================== */}
        {!compact && (
          <g
            className={cn('zc-arm-group zc-arm-left', isWaving && 'is-waving', isThinking && 'is-thinking')}
            style={{ transformOrigin: '62px 130px', transform: leftArmTransform, transition: isWaving ? 'none' : 'transform 0.45s cubic-bezier(0.22,1,0.36,1)' } as any}
          >
            {/* مفصل شانه طلایی */}
            <circle cx="62" cy="130" r="8.5" fill={`url(#${gid('gold')})`} stroke={C.goldDark} strokeWidth="0.6" />
            <circle cx="62" cy="130" r="4" fill={C.goldDark} opacity="0.3" />
            {/* بازوی بالا */}
            <path d="M54 134 Q42 148 42 164" stroke={`url(#${gid('limb')})`} strokeWidth="14" strokeLinecap="round" fill="none" />
            <path d="M54 134 Q42 148 42 164" stroke={C.ivoryDark} strokeWidth="14" strokeLinecap="round" fill="none" opacity="0.12" />
            {/* مفصل آرنج طلایی */}
            <circle cx="42" cy="164" r="7" fill={`url(#${gid('gold')})`} stroke={C.goldDark} strokeWidth="0.5" />
            {/* ساعد */}
            <path
              d={isThinking
                ? "M42 160 Q36 144 44 128"   // دست به سمت چانه خم می‌شود
                : isWaving
                ? "M42 160 Q46 144 56 132"  // دست بالا رفته برای تکان دادن
                : "M42 162 Q40 178 48 188"} // حالت عادی آویزان
              stroke={`url(#${gid('limb')})`} strokeWidth="12" strokeLinecap="round" fill="none" className="zc-forearm"
            />
            {/* مچ/دست */}
            <g
              className="zc-hand"
              transform={
                isThinking ? 'translate(46,124)' :
                isWaving ? 'translate(58,128)' :
                'translate(50,190)'
              }
            >
              {/* کف دست */}
              <ellipse cx="0" cy="0" rx="9" ry="8" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.7" />
              {/* انگشتان/گیرنده سه‌انگشتی با بندهای زرشکی */}
              {isThinking ? (
                <>
                  {/* یک انگشت اشاره نزدیک چانه */}
                  <ellipse cx="4" cy="-6" rx="3" ry="4" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.6" />
                  <rect x="2" y="-3" width="4" height="2" rx="1" fill={C.burgundy} />
                  <ellipse cx="-3" cy="-2" rx="2.5" ry="3" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.5" />
                  <ellipse cx="2" cy="4" rx="2.8" ry="2.5" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.5" />
                </>
              ) : isWaving ? (
                <>
                  {/* انگشتان باز برای تکان دادن */}
                  <ellipse cx="-4" cy="-7" rx="2.4" ry="3.8" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.5" />
                  <rect x="-6" y="-4" width="4" height="2" rx="1" fill={C.burgundy} opacity="0.8" />
                  <ellipse cx="1" cy="-8" rx="2.4" ry="4" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.5" />
                  <rect x="-1" y="-5" width="4" height="2" rx="1" fill={C.burgundy} opacity="0.8" />
                  <ellipse cx="6" cy="-6" rx="2.2" ry="3.4" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.5" />
                  <rect x="4" y="-3" width="4" height="2" rx="1" fill={C.burgundy} opacity="0.8" />
                </>
              ) : (
                <>
                  <ellipse cx="-3" cy="-5" rx="2.2" ry="3" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.5" />
                  <ellipse cx="2" cy="-6" rx="2.2" ry="3.2" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.5" />
                  <ellipse cx="6" cy="-3" rx="2" ry="2.6" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.5" />
                  <rect x="-5" y="-3" width="3.5" height="2" rx="1" fill={C.burgundy} opacity="0.7" />
                  <rect x="0.5" y="-4" width="3.5" height="2" rx="1" fill={C.burgundy} opacity="0.7" />
                </>
              )}
            </g>
          </g>
        )}

        {/* ======================== بازوی راست (نگه‌داشتن محصول یا عادی) ======================== */}
        {!compact && (
          <g
            className="zc-arm-group zc-arm-right"
            style={{ transformOrigin: '138px 130px', transform: rightArmTransform, transition: 'transform 0.55s cubic-bezier(0.22,1,0.36,1)' } as any}
          >
            <circle cx="138" cy="130" r="8.5" fill={`url(#${gid('gold')})`} stroke={C.goldDark} strokeWidth="0.6" />
            <circle cx="138" cy="130" r="4" fill={C.goldDark} opacity="0.3" />
            <path d="M146 134 Q158 148 158 164" stroke={`url(#${gid('limb')})`} strokeWidth="14" strokeLinecap="round" fill="none" />
            <path d="M146 134 Q158 148 158 164" stroke={C.ivoryDark} strokeWidth="14" strokeLinecap="round" fill="none" opacity="0.12" />
            <circle cx="158" cy="164" r="7" fill={`url(#${gid('gold')})`} stroke={C.goldDark} strokeWidth="0.5" />
            {/* ساعد — کمی به جلو خم برای نگه داشتن محصول */}
            <path
              d={isProductLifted
                ? "M158 158 Q160 142 150 128"
                : showProduct
                ? "M158 160 Q162 178 154 192"
                : "M158 162 Q160 178 152 188"}
              stroke={`url(#${gid('limb')})`} strokeWidth="12" strokeLinecap="round" fill="none"
            />
            {/* دست راست */}
            <g transform={
              isProductLifted ? 'translate(148,124)' :
              showProduct ? 'translate(152,194)' :
              'translate(150,190)'
            }>
              <ellipse cx="0" cy="0" rx="9.5" ry="8" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.7" />
              {/* انگشتان */}
              <ellipse cx="-4" cy="-6" rx="2.2" ry="3" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.5" />
              <ellipse cx="1.5" cy="-7" rx="2.2" ry="3.2" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.5" />
              <ellipse cx="6" cy="-5" rx="2" ry="2.6" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.5" />
              <rect x="-6" y="-4" width="3.5" height="2" rx="1" fill={C.burgundy} opacity="0.7" />
              <rect x="-0.5" y="-5" width="3.5" height="2" rx="1" fill={C.burgundy} opacity="0.7" />
              {/* شست روی بسته */}
              {showProduct && (
                <ellipse cx="-7" cy="0" rx="2.4" ry="3" fill={`url(#${gid('limb')})`} stroke={C.ivoryDark} strokeWidth="0.5" />
              )}
            </g>

            {/* بسته محصول — فقط وقتی showProduct=true */}
            {!compact && showProduct && (
              <g
                className="zc-product-group"
                transform={isProductLifted ? 'translate(136,110)' : 'translate(138,174)'}
                style={{ transition: 'transform 0.6s cubic-bezier(0.22,1,0.36,1)' } as any}
              >
                {/* سایه زیر محصول */}
                <ellipse cx="4" cy="22" rx="18" ry="4" fill="#2A0B12" opacity="0.08" />
                <g className="zc-product-box" filter={`url(#${gid('soft-shadow')})`}>
                  {/* بدنه جعبه */}
                  <rect x="-22" y="-18" width="48" height="34" rx="7" fill={`url(#${gid('pkg')})`} stroke={C.burgundy} strokeWidth="1.1" />
                  {/* درب زرشکی بالای جعبه */}
                  <path d="M-22 -18 Q-22 -26 -14 -26 L22 -26 Q30 -26 26 -18 Z" fill={`url(#${gid('panel')})`} stroke={C.burgundyDk2} strokeWidth="0.8" />
                  <rect x="-22" y="-18" width="48" height="4" fill={C.burgundy} opacity="0.4" />
                  {/* مهر طلایی */}
                  <circle cx="0" cy="-6" r="3.2" fill={`url(#${gid('gold')})`} stroke={C.goldDark} strokeWidth="0.4" />
                  {/* ناحیه لیبل — در این مرحله بدون متن (مطابق دستور) */}
                  <rect x="-16" y="-2" width="32" height="14" rx="3" fill={C.ivory} stroke={C.ivoryMid} strokeWidth="0.6" opacity="0.6" />
                  <path d="M-12 10 Q0 12 12 10" stroke={`url(#${gid('gold')})`} strokeWidth="0.8" fill="none" opacity="0.6" strokeLinecap="round" />
                  {/* درخشش */}
                  <ellipse cx="-10" cy="-10" rx="6" ry="3" fill="white" opacity="0.35" />
                </g>
              </g>
            )}
          </g>
        )}

        {/* ======================== سر (روی همه چیز) ======================== */}
        <g
          className="zc-head-group"
          style={{
            transformOrigin: `${P.cx}px ${P.cy}px`,
            transform: `translate(${headX}px, ${headY}px) rotate(${headR}deg)`,
            transition: 'transform 0.5s cubic-bezier(0.22,1,0.36,1)',
          } as any}
        >
          {/* سایه داخلی زیر سر */}
          <ellipse cx={P.cx} cy={P.cy + 6} rx={P.headRX - 4} ry={P.headRY * 0.2} fill={C.burgundy} opacity="0.05" />

          {/* گنبد سر اصلی */}
          <ellipse
            cx={P.cx}
            cy={P.cy}
            rx={P.headRX}
            ry={P.headRY}
            fill={`url(#${gid('head')})`}
            stroke={C.ivoryDark}
            strokeWidth="1"
            className="zc-head-base"
            filter={`url(#${gid('soft-shadow')})`}
          />

          {/* هایلایت بالای سر */}
          <ellipse
            cx={P.cx - P.headRX * 0.25}
            cy={P.cy - P.headRY * 0.4}
            rx={P.headRX * 0.35}
            ry={P.headRY * 0.22}
            fill="#FFFFFF"
            opacity="0.55"
          />
          <ellipse
            cx={P.cx - P.headRX * 0.2}
            cy={P.cy - P.headRY * 0.5}
            rx={P.headRX * 0.2}
            ry={P.headRY * 0.1}
            fill="#FFFFFF"
            opacity="0.5"
          />

          {/* پنل‌های گوش/بلندگو */}
          <g className="zc-ears">
            {/* گوش چپ */}
            <g>
              <circle cx={P.cx - P.earOff} cy={P.cy} r={compact ? 7 : 10} fill={`url(#${gid('gold')})`} stroke={C.goldDark} strokeWidth="0.6" />
              <circle cx={P.cx - P.earOff} cy={P.cy} r={compact ? 4 : 6} fill={C.burgundy} />
              <circle cx={P.cx - P.earOff} cy={P.cy - 1} r={compact ? 1.5 : 2.2} fill={C.burgundyDark} opacity="0.7" />
            </g>
            {/* گوش راست */}
            <g>
              <circle cx={P.cx + P.earOff} cy={P.cy} r={compact ? 7 : 10} fill={`url(#${gid('gold')})`} stroke={C.goldDark} strokeWidth="0.6" />
              <circle cx={P.cx + P.earOff} cy={P.cy} r={compact ? 4 : 6} fill={C.burgundy} />
              <circle cx={P.cx + P.earOff} cy={P.cy - 1} r={compact ? 1.5 : 2.2} fill={C.burgundyDark} opacity="0.7" />
            </g>
          </g>

          {/* آنتن با گوی طلایی */}
          <g className="zc-antenna">
            <line
              x1={P.antX}
              y1={P.antY + 2}
              x2={P.antX - 2}
              y2={P.antY - (compact ? 14 : 20)}
              stroke={`url(#${gid('gold')})`}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <circle cx={P.antX - 2} cy={P.antY - (compact ? 16 : 22)} r={compact ? 3 : 4.2} fill={`url(#${gid('gold-ball')})`} stroke={C.goldDark} strokeWidth="0.4">
              <animate attributeName="cy" values={`${P.antY - (compact ? 16 : 22)};${P.antY - (compact ? 17 : 23)};${P.antY - (compact ? 16 : 22)}`} dur="2.4s" repeatCount="indefinite" />
            </circle>
          </g>

          {/* ======================== وایزر OLED ======================== */}
          <g className="zc-visor">
            {/* قاب طلایی/زرشکی دور وایزر */}
            <ellipse
              cx={P.cx}
              cy={P.visorY}
              rx={P.visorW / 2 + 2}
              ry={P.visorH / 2 + 2}
              fill={C.burgundyDark}
            />
            <ellipse
              cx={P.cx}
              cy={P.visorY}
              rx={P.visorW / 2 + 1}
              ry={P.visorH / 2 + 1}
              fill={`url(#${gid('gold')})`}
              opacity="0.65"
            />
            {/* شیشه اصلی وایزر */}
            <ellipse
              cx={P.cx}
              cy={P.visorY}
              rx={P.visorW / 2}
              ry={P.visorH / 2}
              fill={`url(#${gid('visor')})`}
            />
            {/* درخشش شیشه */}
            <ellipse
              cx={P.cx - P.visorW / 6}
              cy={P.visorY - P.visorH / 4}
              rx={P.visorW / 2.7}
              ry={P.visorH / 5}
              fill={`url(#${gid('visor-glare')})`}
            />
            {/* خط نازک لبه بالای وایزر */}
            <path
              d={`M${P.cx - P.visorW / 2 + 6} ${P.visorY - P.visorH / 2 + 2} Q${P.cx} ${P.visorY - P.visorH / 2 - 2} ${P.cx + P.visorW / 2 - 6} ${P.visorY - P.visorH / 2 + 2}`}
              stroke="#3A2D30" strokeWidth="0.8" fill="none"
            />

            {/* ======================== چشم‌های LED دیجیتال ======================== */}
            <g className="zc-eyes">
              {/* چشم چپ */}
              <g className="zc-eye zc-eye-left" transform={`translate(${P.cx + P.eyeLXOff + eyeOffset.x} ${P.eyeLY + eyeY + eyeOffset.y})`}>
                {/* هاله درخشان اطراف چشم */}
                <circle r={P.eyeR * 1.9} fill={`url(#${gid('led-halo')})`} opacity={blink ? 0.2 : 0.9} />
                {/* حلقه چشم LED (ring) */}
                <g
                  className="zc-eye-shape"
                  style={{ transform: `scaleY(${eyeScaleY})`, transition: 'transform 0.11s ease', transformOrigin: '0 0' } as any}
                >
                  <circle r={P.eyeR} fill="none" stroke={`url(#${gid('led')})`} strokeWidth="2.6" opacity={blink ? 0.5 : 1} filter={`url(#${gid('glow-led')})`} />
                  {/* مرکز چشم */}
                  <circle r={P.eyeR * 0.55} fill={`url(#${gid('led')})`} opacity={blink ? 0 : 1} filter={`url(#${gid('glow-led')})`} />
                  {/* نقطه درخشان داخلی */}
                  <circle cx={-P.eyeR * 0.2} cy={-P.eyeR * 0.2} r={P.eyeR * 0.2} fill="#FFFFFF" opacity={blink ? 0 : 0.9} />
                </g>
                {/* پلک دیجیتال: وقتی blink=true چشم با یک مستطیل تیره بسته می‌شود */}
                {blink && (
                  <rect x={-P.eyeR - 1} y={-1.5} width={(P.eyeR + 1) * 2} height="3" rx="1.5" fill={C.led} opacity="0.7" filter={`url(#${gid('glow-led')})`} />
                )}
              </g>

              {/* چشم راست */}
              <g className="zc-eye zc-eye-right" transform={`translate(${P.cx + P.eyeRXOff + eyeOffset.x} ${P.eyeLY + eyeY + eyeOffset.y})`}>
                <circle r={P.eyeR * 1.9} fill={`url(#${gid('led-halo')})`} opacity={blink ? 0.2 : 0.9} />
                <g
                  className="zc-eye-shape"
                  style={{ transform: `scaleY(${eyeScaleY})`, transition: 'transform 0.11s ease', transformOrigin: '0 0' } as any}
                >
                  <circle r={P.eyeR} fill="none" stroke={`url(#${gid('led')})`} strokeWidth="2.6" opacity={blink ? 0.5 : 1} filter={`url(#${gid('glow-led')})`} />
                  <circle r={P.eyeR * 0.55} fill={`url(#${gid('led')})`} opacity={blink ? 0 : 1} filter={`url(#${gid('glow-led')})`} />
                  <circle cx={-P.eyeR * 0.2} cy={-P.eyeR * 0.2} r={P.eyeR * 0.2} fill="#FFFFFF" opacity={blink ? 0 : 0.9} />
                </g>
                {blink && (
                  <rect x={-P.eyeR - 1} y={-1.5} width={(P.eyeR + 1) * 2} height="3" rx="1.5" fill={C.led} opacity="0.7" filter={`url(#${gid('glow-led')})`} />
                )}
              </g>
            </g>

            {/* ======================== دهان LED ======================== */}
            <g className="zc-mouth" transform={`translate(${P.cx} ${P.mouthY})`}>
              {isThinking ? (
                /* حالت فکر: یک خط کوتاه افقی یا بیضی کوچک بسته */
                <ellipse rx="3.5" ry="2.2" fill="none" stroke={`url(#${gid('led')})`} strokeWidth="1.6" opacity="0.85" filter={`url(#${gid('glow-led')})`} />
              ) : mouthOpenAmt > 1.2 ? (
                /* دهان باز هنگام صحبت */
                <ellipse rx={P.mouthW / 2 - 3} ry={Math.max(1.5, mouthOpenAmt)} fill={`url(#${gid('led')})`} opacity="0.9" filter={`url(#${gid('glow-led')})`} />
              ) : (
                /* لبخند منحنی LED */
                <path
                  d={`M-${P.mouthW / 2} 0 Q0 ${smileCurve} ${P.mouthW / 2} 0`}
                  fill={mouthOpenAmt > 0.3 ? `url(#${gid('led')})` : 'none'}
                  stroke={`url(#${gid('led')})`}
                  strokeWidth={isSmiling ? '2.3' : '1.9'}
                  strokeLinecap="round"
                  opacity={isSmiling ? 1 : 0.85}
                  filter={`url(#${gid('glow-led')})`}
                  className="zc-mouth-path"
                />
              )}
            </g>

            {/* خطوط تزئینی کوچک روی وایزر (نشان وضعیت) */}
            <g opacity="0.45" className="zc-visornodes">
              <circle cx={P.cx - P.visorW / 2 + 6} cy={P.visorY - P.visorH / 2 + 6} r="1.2" fill={C.led} />
              <circle cx={P.cx + P.visorW / 2 - 6} cy={P.visorY - P.visorH / 2 + 6} r="1.2" fill={C.led} />
            </g>
          </g>

          {/* درز قطعات سر (خط افقی زیر سر) */}
          {!compact && (
            <path d="M70 146 Q100 152 130 146" stroke={C.ivoryDark} strokeWidth="0.8" fill="none" opacity="0.35" strokeLinecap="round" />
          )}
        </g>

        {/* جرقه‌های هنگام لبخند سلام */}
        {isGreeting && greetingPhase === 'smile' && !compact && (
          <g className="zc-sparkles">
            <circle cx="40" cy="60" r="1.5" fill={`url(#${gid('gold')})`} opacity="0.8">
              <animate attributeName="opacity" values="0;1;0" dur="0.8s" repeatCount="2" />
              <animateTransform attributeName="transform" type="scale" values="0;1.5;0" dur="0.8s" repeatCount="2" additive="sum" />
            </circle>
            <circle cx="162" cy="66" r="1.2" fill={`url(#${gid('gold')})`} opacity="0.7">
              <animate attributeName="opacity" values="0;1;0" dur="0.9s" repeatCount="2" />
            </circle>
            <circle cx="100" cy="26" r="1" fill="#FFFFFF" opacity="0.9">
              <animate attributeName="opacity" values="0;1;0" dur="0.6s" repeatCount="3" />
            </circle>
          </g>
        )}
      </svg>

      <div className="zc-breath" />
    </div>
  );
}
