// ============================================================
// ZHINO — کاراکتر سه‌بعدی Premium دستیار ژینو
// طراحی کامل: سر، بدن، دو دست، دو پا، چشم‌های زنده، لبخند
// محصول «محصولات ژله و کاستر» در دست راست
// حالت‌ها: idle, greeting, thinking, speaking, waving
// سبک: SVG + CSS + JS — بدون وابستگی خارجی، سبک و سریع
// رنگ برند: #71313B + ivory / champagne
// نکته مهم: تمام IDهای SVG بر اساس useId یکتا می‌شوند تا چند نمونه همزمان تداخل نداشته باشند
// ============================================================

import { useEffect, useRef, useState, useCallback, useId } from 'react';
import { cn } from '../../utils/cn';
import './zhino-character.css';

type Mode = 'idle' | 'greeting' | 'thinking' | 'speaking' | 'waving';

interface Props {
  mode?: Mode;
  size?: number; // px, default 200
  showProduct?: boolean;
  className?: string;
  compact?: boolean; // برای آواتارهای کوچک فقط سر نمایش داده می‌شود
  onGreetingComplete?: () => void;
}

export default function ZhinoCharacter({
  mode = 'idle',
  size = 200,
  showProduct = true,
  className,
  compact = false,
  onGreetingComplete,
}: Props) {
  // شناسه یکتا برای هر instance تا gradient/filter IDها تداخل نکنند
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, '_'); // sanitize : و ...
  const gid = (name: string) => `${uid}_${name}`;

  const [blink, setBlink] = useState(false);
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
  const [mouthOpen, setMouthOpen] = useState(0); // 0..1
  const [greetingPhase, setGreetingPhase] = useState<'enter' | 'smile' | 'wave' | 'product' | 'settle'>('enter');
  const [idleTilt, setIdleTilt] = useState({ x: 0, y: 0, r: 0 });
  const blinkTimer = useRef<number | null>(null);
  const blinkInnerTimer = useRef<number | null>(null);
  const eyeTimer = useRef<number | null>(null);
  const tiltTimer = useRef<number | null>(null);
  const mouthTimer = useRef<number | null>(null);
  const greetingTimer = useRef<number | null>(null);

  // ---- پلک زدن نامنظم — با مدیریت کامل timeoutها ----
  const scheduleBlink = useCallback(() => {
    if (blinkTimer.current) window.clearTimeout(blinkTimer.current);
    const next = 2200 + Math.random() * 3800; // 2.2 تا 6 ثانیه
    blinkTimer.current = window.setTimeout(() => {
      setBlink(true);
      if (blinkInnerTimer.current) window.clearTimeout(blinkInnerTimer.current);
      blinkInnerTimer.current = window.setTimeout(() => {
        setBlink(false);
        blinkInnerTimer.current = null;
      }, 120 + Math.random() * 80) as unknown as number;
      scheduleBlink();
    }, next) as unknown as number;
  }, []);

  // ---- حرکت چشم طبیعی ----
  const scheduleEyeMove = useCallback(() => {
    if (eyeTimer.current) window.clearTimeout(eyeTimer.current);
    const next = 1800 + Math.random() * 4200;
    eyeTimer.current = window.setTimeout(() => {
      const presets = [
        { x: 0, y: 0 },
        { x: -2.5, y: -0.5 },
        { x: 2.5, y: -0.5 },
        { x: -1.5, y: 1.2 },
        { x: 1.8, y: 0.8 },
        { x: 0, y: -1.8 },
        { x: -3, y: 0.2 },
        { x: 3, y: 0.2 },
      ];
      const pool = mode === 'thinking'
        ? [{ x: -2, y: -2.5 }, { x: 2, y: -2.2 }, { x: 0, y: -2.8 }, { x: 1.5, y: -1.5 }]
        : presets;
      const target = pool[Math.floor(Math.random() * pool.length)];
      setEyeOffset({
        x: target.x + (Math.random() - 0.5) * 0.8,
        y: target.y + (Math.random() - 0.5) * 0.6,
      });
      scheduleEyeMove();
    }, next) as unknown as number;
  }, [mode]);

  // ---- حرکت سر بسیار ظریف ----
  const scheduleTilt = useCallback(() => {
    if (tiltTimer.current) window.clearTimeout(tiltTimer.current);
    const next = 3000 + Math.random() * 5000;
    tiltTimer.current = window.setTimeout(() => {
      if (mode === 'idle' || mode === 'speaking') {
        setIdleTilt({
          x: (Math.random() - 0.5) * 2,
          y: (Math.random() - 0.5) * 1.5,
          r: (Math.random() - 0.5) * 3.5,
        });
      }
      scheduleTilt();
    }, next) as unknown as number;
  }, [mode]);

  // ---- دهان هنگام صحبت ----
  useEffect(() => {
    if (mode !== 'speaking') {
      setMouthOpen(0);
      return;
    }
    const tick = () => {
      setMouthOpen(Math.random() * 0.85 + 0.15);
      mouthTimer.current = window.setTimeout(tick, 120 + Math.random() * 220) as unknown as number;
    };
    tick();
    return () => {
      if (mouthTimer.current) window.clearTimeout(mouthTimer.current);
      mouthTimer.current = null;
    };
  }, [mode]);

  // ---- شروع انیمیشن‌ها — با cleanup کامل ----
  useEffect(() => {
    scheduleBlink();
    scheduleEyeMove();
    scheduleTilt();
    return () => {
      if (blinkTimer.current) {
        window.clearTimeout(blinkTimer.current);
        blinkTimer.current = null;
      }
      if (blinkInnerTimer.current) {
        window.clearTimeout(blinkInnerTimer.current);
        blinkInnerTimer.current = null;
      }
      if (eyeTimer.current) {
        window.clearTimeout(eyeTimer.current);
        eyeTimer.current = null;
      }
      if (tiltTimer.current) {
        window.clearTimeout(tiltTimer.current);
        tiltTimer.current = null;
      }
    };
  }, [scheduleBlink, scheduleEyeMove, scheduleTilt]);

  // ---- توالی سلام کردن — زمان‌بندی اصلاح شده حدود 2.7 ثانیه ----
  // قبلاً delayها تجمعی 4.8ث می‌شد (0+350+650+1450+2350). حالا کل توالی 2.7ث روان است:
  // enter 0ms → smile 300ms → wave 500ms → product 700ms → settle 700ms → complete 500ms = 2700ms
  useEffect(() => {
    if (mode !== 'greeting') return;
    setGreetingPhase('enter');
    const steps: Array<{ phase: typeof greetingPhase; delay: number }> = [
      { phase: 'enter', delay: 0 },      // 0ms
      { phase: 'smile', delay: 300 },    // 300ms
      { phase: 'wave', delay: 500 },     // 800ms
      { phase: 'product', delay: 700 },  // 1500ms
      { phase: 'settle', delay: 700 },   // 2200ms
    ];
    const finalDelay = 500; // بعد از settle تا onGreetingComplete
    let idx = 0;
    const run = () => {
      if (idx >= steps.length) {
        // آخرین مرحله - کمی مکث سپس تکمیل
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
      if (greetingTimer.current) {
        window.clearTimeout(greetingTimer.current);
        greetingTimer.current = null;
      }
    };
  }, [mode, onGreetingComplete]);

  const isThinking = mode === 'thinking';
  const isGreeting = mode === 'greeting';
  const isSpeaking = mode === 'speaking';
  const isWaving = mode === 'waving' || (isGreeting && greetingPhase === 'wave');
  const eyeScaleY = isThinking ? 0.92 : 1;
  const smileIntensity = isGreeting ? 1 : isThinking ? 0.3 : isSpeaking ? 0.6 + mouthOpen * 0.4 : 0.7;

  return (
    <div
      className={cn('zhino-char-root', `is-${mode}`, compact && 'is-compact', blink && 'is-blink', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox={compact ? '0 0 120 120' : '0 0 200 260'}
        width={size}
        height={size}
        className="zhino-char-svg"
        role="img"
      >
        <defs>
          <radialGradient id={gid('head')} cx="42%" cy="32%" r="78%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="18%" stopColor="#FFFEFB" />
            <stop offset="42%" stopColor="#FAF7F2" />
            <stop offset="78%" stopColor="#F1E7DC" />
            <stop offset="100%" stopColor="#E8DCC8" />
          </radialGradient>
          <radialGradient id={gid('head-shadow')} cx="50%" cy="85%" r="65%">
            <stop offset="0%" stopColor="#71313B" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#71313B" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={gid('body')} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#8A3D4A" />
            <stop offset="18%" stopColor="#7C3843" />
            <stop offset="55%" stopColor="#71313B" />
            <stop offset="100%" stopColor="#5A1725" />
          </linearGradient>
          <radialGradient id={gid('belly')} cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#FFFEFB" />
            <stop offset="100%" stopColor="#F5EDE2" />
          </radialGradient>
          <linearGradient id={gid('arm')} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFEFB" />
            <stop offset="100%" stopColor="#E8DCC8" />
          </linearGradient>
          <radialGradient id={gid('eye-white')} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#F5F0E8" />
          </radialGradient>
          <radialGradient id={gid('iris')} cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#8A4A55" />
            <stop offset="35%" stopColor="#71313B" />
            <stop offset="100%" stopColor="#4A1220" />
          </radialGradient>
          <linearGradient id={gid('product')} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#FAF7F2" />
          </linearGradient>
          <filter id={gid('soft-shadow')} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#2A0B12" floodOpacity="0.18" />
          </filter>
          <filter id={gid('inner-glow')} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="0.5" floodColor="#FFFFFF" floodOpacity="0.9" />
          </filter>
          <linearGradient id={gid('gold')} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E0D0AB" />
            <stop offset="100%" stopColor="#B89A62" />
          </linearGradient>
        </defs>

        {!compact && (
          <ellipse cx="100" cy="238" rx="42" ry="9" fill="#2A0B12" opacity="0.09" className="zc-ground-shadow" />
        )}

        {!compact && (
          <g className="zc-legs">
            <g className="zc-leg zc-leg-left">
              <path d="M78 176 Q76 195 76 210 Q76 218 84 218 Q92 218 92 210 Q92 195 90 176 Z" fill={`url(#${gid('arm')})`} stroke="#D8C9B6" strokeWidth="0.8" />
              <ellipse cx="84" cy="218" rx="12" ry="6" fill="#5A1725" />
              <ellipse cx="84" cy="216.5" rx="12" ry="5.5" fill={`url(#${gid('body')})`} />
            </g>
            <g className="zc-leg zc-leg-right">
              <path d="M110 176 Q112 195 112 210 Q112 218 120 218 Q128 218 128 210 Q128 195 126 176 Z" fill={`url(#${gid('arm')})`} stroke="#D8C9B6" strokeWidth="0.8" />
              <ellipse cx="120" cy="218" rx="12" ry="6" fill="#5A1725" />
              <ellipse cx="120" cy="216.5" rx="12" ry="5.5" fill={`url(#${gid('body')})`} />
            </g>
          </g>
        )}

        {!compact && (
          <g className="zc-body-group" style={{ transformOrigin: '100px 155px' } as any}>
            <path
              d="M62 128 Q62 112 100 112 Q138 112 138 128 L138 168 Q138 186 100 186 Q62 186 62 168 Z"
              fill={`url(#${gid('body')})`}
              filter={`url(#${gid('soft-shadow')})`}
              className="zc-body-main"
            />
            <ellipse cx="100" cy="154" rx="28" ry="22" fill={`url(#${gid('belly')})`} opacity="0.92" />
            <g className="zc-buttons">
              <circle cx="100" cy="142" r="3.2" fill={`url(#${gid('gold')})`} stroke="#B89A62" strokeWidth="0.5" />
              <circle cx="100" cy="154" r="3.2" fill={`url(#${gid('gold')})`} stroke="#B89A62" strokeWidth="0.5" />
              <circle cx="100" cy="166" r="3.2" fill={`url(#${gid('gold')})`} stroke="#B89A62" strokeWidth="0.5" />
            </g>
            <path d="M82 118 Q100 124 118 118 Q112 112 100 112 Q88 112 82 118 Z" fill="#FAF7F2" stroke="#E8DCC8" strokeWidth="0.8" />
            <path d="M62 128 Q62 112 100 112 Q138 112 138 128" fill="none" stroke={`url(#${gid('gold')})`} strokeWidth="1.2" opacity="0.55" strokeLinecap="round" />
          </g>
        )}

        {!compact && (
          <g
            className={cn('zc-arm-group zc-arm-left', isWaving && 'is-waving', isThinking && 'is-thinking')}
            style={{ transformOrigin: compact ? undefined : '68px 134px' } as any}
          >
            <path
              d={isThinking ? 'M68 134 Q52 128 46 112 Q44 106 50 104 Q56 102 60 110 Q64 122 72 132 Z' : 'M68 134 Q50 138 38 128 Q32 122 36 116 Q40 110 50 116 Q60 124 70 130 Z'}
              fill={`url(#${gid('arm')})`}
              stroke="#D8C9B6"
              strokeWidth="0.8"
              className="zc-arm"
            />
            <g className="zc-hand" transform={isThinking ? 'translate(44 102)' : isWaving ? 'translate(32 116)' : 'translate(36 118)'}>
              <ellipse cx="0" cy="0" rx="9" ry="8.5" fill={`url(#${gid('arm')})`} stroke="#D8C9B6" strokeWidth="0.8" />
              {isWaving ? (
                <>
                  <ellipse cx="-3" cy="-7" rx="2.2" ry="3" fill={`url(#${gid('arm')})`} stroke="#D8C9B6" strokeWidth="0.6" />
                  <ellipse cx="1.5" cy="-8" rx="2.2" ry="3.2" fill={`url(#${gid('arm')})`} stroke="#D8C9B6" strokeWidth="0.6" />
                  <ellipse cx="6" cy="-6.5" rx="2" ry="2.8" fill={`url(#${gid('arm')})`} stroke="#D8C9B6" strokeWidth="0.6" />
                </>
              ) : isThinking ? (
                <ellipse cx="2" cy="-2" rx="3" ry="2.5" fill={`url(#${gid('arm')})`} />
              ) : null}
            </g>
          </g>
        )}

        {!compact && showProduct && (
          <g className={cn('zc-arm-group zc-arm-right', isGreeting && greetingPhase === 'product' && 'is-lifted')} style={{ transformOrigin: '132px 134px' } as any}>
            <path
              d="M132 134 Q148 142 152 154 Q154 160 148 162 Q142 164 138 156 Q134 144 128 136 Z"
              fill={`url(#${gid('arm')})`}
              stroke="#D8C9B6"
              strokeWidth="0.8"
              className="zc-arm"
            />
            <g className="zc-product-group" transform="translate(148 150)">
              <ellipse cx="2" cy="20" rx="18" ry="5" fill="#2A0B12" opacity="0.1" />
              <g className="zc-product-box" filter={`url(#${gid('soft-shadow')})`}>
                <rect x="-20" y="-16" width="44" height="32" rx="7" fill={`url(#${gid('product')})`} stroke="#71313B" strokeWidth="1.1" />
                <rect x="-20" y="-16" width="44" height="9" rx="7" fill="#71313B" />
                <rect x="-20" y="-9" width="44" height="4" fill="#71313B" />
                <circle cx="0" cy="-11.5" r="3" fill={`url(#${gid('gold')})`} />
                <text x="0" y="2" textAnchor="middle" fontSize="6.2" fontWeight="700" fill="#4A1220" fontFamily="Vazirmatn, sans-serif">
                  <tspan x="0" dy="0">محصولات</tspan>
                  <tspan x="0" dy="7.2">ژله و کاستر</tspan>
                </text>
                <path d="M-12 12 Q0 14 12 12" stroke={`url(#${gid('gold')})`} strokeWidth="0.8" fill="none" opacity="0.7" strokeLinecap="round" />
              </g>
              <ellipse cx="-8" cy="-8" rx="6" ry="4" fill="white" opacity="0.35" />
            </g>
          </g>
        )}

        <g
          className="zc-head-group"
          style={
            {
              transformOrigin: compact ? '60px 60px' : '100px 90px',
              transform: `translate(${idleTilt.x}px, ${idleTilt.y}px) rotate(${idleTilt.r}deg)`,
            } as any
          }
        >
          <ellipse cx={compact ? 60 : 100} cy={compact ? 68 : 98} rx={compact ? 38 : 52} ry={compact ? 36 : 48} fill={`url(#${gid('head-shadow')})`} />

          <ellipse
            cx={compact ? 60 : 100}
            cy={compact ? 60 : 88}
            rx={compact ? 36 : 54}
            ry={compact ? 36 : 52}
            fill={`url(#${gid('head')})`}
            stroke="#E8DCC8"
            strokeWidth="1"
            className="zc-head-base"
            filter={`url(#${gid('soft-shadow')})`}
          />

          <ellipse cx={compact ? 48 : 82} cy={compact ? 46 : 68} rx={compact ? 14 : 20} ry={compact ? 10 : 14} fill="white" opacity="0.42" />

          <ellipse cx={compact ? 34 : 68} cy={compact ? 72 : 102} rx={compact ? 7 : 10} ry={compact ? 4 : 5.5} fill="#E8A0A8" opacity="0.18" />
          <ellipse cx={compact ? 86 : 132} cy={compact ? 72 : 102} rx={compact ? 7 : 10} ry={compact ? 4 : 5.5} fill="#E8A0A8" opacity="0.18" />

          <g className="zc-eyes">
            <g className="zc-eye zc-eye-left" transform={`translate(${compact ? 40 : 76} ${compact ? 58 : 86})`}>
              <ellipse cx="0" cy="0" rx={compact ? 10 : 15} ry={compact ? 12 : 17} fill={`url(#${gid('eye-white')})`} stroke="#E8DCC8" strokeWidth="0.8" />
              <ellipse cx="0" cy="1" rx={compact ? 9 : 13.5} ry={compact ? 10.5 : 15} fill="#71313B" opacity="0.04" />
              <g className="zc-pupil-group" style={{ transform: `translate(${eyeOffset.x}px, ${eyeOffset.y * eyeScaleY}px) scaleY(${eyeScaleY})` } as any}>
                <circle cx="0" cy="0.5" r={compact ? 5.5 : 7.5} fill={`url(#${gid('iris')})`} />
                <circle cx="0" cy="0.8" r={compact ? 3 : 4.2} fill="#2A0B12" />
                <circle cx={-1.5} cy={-1.5} r={compact ? 1.8 : 2.4} fill="white" opacity="0.85" />
                <circle cx={-0.5} cy={-1} r={compact ? 0.8 : 1} fill="white" opacity="0.6" />
              </g>
              <g className={cn('zc-eyelid zc-eyelid-top', blink && 'is-closed')}>
                <path d={`M-${compact ? 10 : 15} -${compact ? 2 : 3} Q0 -${compact ? 14 : 18} ${compact ? 10 : 15} -${compact ? 2 : 3} Q${compact ? 8 : 12} 0 -${compact ? 10 : 15} -${compact ? 2 : 3}`} fill={`url(#${gid('head')})`} stroke="#E8DCC8" strokeWidth="0.5" />
              </g>
              <path d={`M-${compact ? 8 : 12} -${compact ? 9 : 13} Q-${compact ? 4 : 6} -${compact ? 11 : 15} 0 -${compact ? 11 : 15.5} Q${compact ? 4 : 6} -${compact ? 11 : 15} ${compact ? 8 : 12} -${compact ? 9 : 13}`} fill="none" stroke="#71313B" strokeWidth={compact ? 0.7 : 0.9} opacity="0.35" strokeLinecap="round" />
            </g>

            <g className="zc-eye zc-eye-right" transform={`translate(${compact ? 80 : 124} ${compact ? 58 : 86})`}>
              <ellipse cx="0" cy="0" rx={compact ? 10 : 15} ry={compact ? 12 : 17} fill={`url(#${gid('eye-white')})`} stroke="#E8DCC8" strokeWidth="0.8" />
              <ellipse cx="0" cy="1" rx={compact ? 9 : 13.5} ry={compact ? 10.5 : 15} fill="#71313B" opacity="0.04" />
              <g className="zc-pupil-group" style={{ transform: `translate(${eyeOffset.x}px, ${eyeOffset.y * eyeScaleY}px) scaleY(${eyeScaleY})` } as any}>
                <circle cx="0" cy="0.5" r={compact ? 5.5 : 7.5} fill={`url(#${gid('iris')})`} />
                <circle cx="0" cy="0.8" r={compact ? 3 : 4.2} fill="#2A0B12" />
                <circle cx={-1.5} cy={-1.5} r={compact ? 1.8 : 2.4} fill="white" opacity="0.85" />
                <circle cx={-0.5} cy={-1} r={compact ? 0.8 : 1} fill="white" opacity="0.6" />
              </g>
              <g className={cn('zc-eyelid zc-eyelid-top', blink && 'is-closed')}>
                <path d={`M-${compact ? 10 : 15} -${compact ? 2 : 3} Q0 -${compact ? 14 : 18} ${compact ? 10 : 15} -${compact ? 2 : 3} Q${compact ? 8 : 12} 0 -${compact ? 10 : 15} -${compact ? 2 : 3}`} fill={`url(#${gid('head')})`} stroke="#E8DCC8" strokeWidth="0.5" />
              </g>
              <path d={`M-${compact ? 8 : 12} -${compact ? 9 : 13} Q-${compact ? 4 : 6} -${compact ? 11 : 15} 0 -${compact ? 11 : 15.5} Q${compact ? 4 : 6} -${compact ? 11 : 15} ${compact ? 8 : 12} -${compact ? 9 : 13}`} fill="none" stroke="#71313B" strokeWidth={compact ? 0.7 : 0.9} opacity="0.35" strokeLinecap="round" />
            </g>
          </g>

          <g className="zc-eyebrows" opacity={isThinking ? 0.9 : 0.55}>
            <path d={isThinking ? `M${compact ? 30 : 62} ${compact ? 44 : 68} Q${compact ? 40 : 76} ${compact ? 42 : 65} ${compact ? 50 : 90} ${compact ? 44 : 68}` : `M${compact ? 30 : 62} ${compact ? 43 : 67} Q${compact ? 40 : 76} ${compact ? 41 : 64} ${compact ? 50 : 90} ${compact ? 43 : 67}`} fill="none" stroke="#5A1725" strokeWidth={compact ? 1.2 : 1.6} strokeLinecap="round" />
            <path d={isThinking ? `M${compact ? 70 : 110} ${compact ? 44 : 68} Q${compact ? 80 : 124} ${compact ? 42 : 65} ${compact ? 90 : 138} ${compact ? 44 : 68}` : `M${compact ? 70 : 110} ${compact ? 43 : 67} Q${compact ? 80 : 124} ${compact ? 41 : 64} ${compact ? 90 : 138} ${compact ? 43 : 67}`} fill="none" stroke="#5A1725" strokeWidth={compact ? 1.2 : 1.6} strokeLinecap="round" />
          </g>

          <ellipse cx={compact ? 60 : 100} cy={compact ? 70 : 98} rx={compact ? 1.5 : 2} ry={compact ? 1 : 1.4} fill="#D8C9B6" opacity="0.5" />

          <g className="zc-mouth" transform={`translate(${compact ? 60 : 100} ${compact ? 82 : 112})`}>
            {isThinking ? (
              <g>
                <ellipse cx="0" cy="0" rx={compact ? 2.5 : 3.5} ry={compact ? 3 : 4} fill="#5A1725" opacity="0.85" />
                <ellipse cx="0" cy="0.5" rx={compact ? 1 : 1.5} ry={compact ? 1.2 : 1.8} fill="#8A3D4A" opacity="0.6" />
              </g>
            ) : (
              <>
                <path
                  d={
                    isSpeaking
                      ? `M-${compact ? 8 : 12} 0 Q0 ${2 + mouthOpen * (compact ? 6 : 8)} ${compact ? 8 : 12} 0 Q${compact ? 4 : 6} ${1 + mouthOpen * 2} -${compact ? 8 : 12} 0`
                      : `M-${compact ? 8 : 12} 0 Q0 ${compact ? 5 : 7 * smileIntensity} ${compact ? 8 : 12} 0`
                  }
                  fill={isSpeaking && mouthOpen > 0.4 ? '#5A1725' : 'none'}
                  stroke="#5A1725"
                  strokeWidth={compact ? 1.4 : 1.8}
                  strokeLinecap="round"
                  opacity={isSpeaking && mouthOpen > 0.4 ? 0.9 : 0.85}
                  className="zc-mouth-path"
                />
                {isSpeaking && mouthOpen > 0.5 && (
                  <ellipse cx="0" cy={2} rx={compact ? 3 : 5} ry={compact ? 1.5 : 2.5 * mouthOpen} fill="#8A3D4A" opacity="0.5" />
                )}
                {isGreeting && greetingPhase === 'smile' && (
                  <path d={`M-${compact ? 10 : 14} -1 Q0 ${compact ? 7 : 10} ${compact ? 10 : 14} -1`} fill="none" stroke="#71313B" strokeWidth={compact ? 1.6 : 2} strokeLinecap="round" />
                )}
              </>
            )}
            {(smileIntensity > 0.6 || isGreeting) && !isThinking && (
              <>
                <path d={`M-${compact ? 14 : 20} -2 Q-${compact ? 15 : 22} 1 -${compact ? 13 : 18} 3`} fill="none" stroke="#71313B" strokeWidth="0.6" opacity="0.18" strokeLinecap="round" />
                <path d={`M${compact ? 14 : 20} -2 Q${compact ? 15 : 22} 1 ${compact ? 13 : 18} 3`} fill="none" stroke="#71313B" strokeWidth="0.6" opacity="0.18" strokeLinecap="round" />
              </>
            )}
          </g>

          {!compact && (
            <g className="zc-hat" transform="translate(100 42)">
              <ellipse cx="0" cy="0" rx="14" ry="5" fill="#5A1725" opacity="0.9" />
              <path d="M-12 -1 Q-10 -12 0 -14 Q10 -12 12 -1 Z" fill={`url(#${gid('body')})`} stroke="#4A1220" strokeWidth="0.8" />
              <circle cx="0" cy="-12" r="2.5" fill={`url(#${gid('gold')})`} />
            </g>
          )}
        </g>

        {isGreeting && greetingPhase === 'smile' && !compact && (
          <g className="zc-sparkles">
            <circle cx="42" cy="62" r="1.5" fill={`url(#${gid('gold')})`} opacity="0.8">
              <animate attributeName="opacity" values="0;1;0" dur="0.8s" repeatCount="2" />
              <animateTransform attributeName="transform" type="scale" values="0;1.5;0" dur="0.8s" repeatCount="2" additive="sum" />
            </circle>
            <circle cx="158" cy="68" r="1.2" fill={`url(#${gid('gold')})`} opacity="0.7">
              <animate attributeName="opacity" values="0;1;0" dur="0.9s" repeatCount="2" />
            </circle>
            <circle cx="100" cy="28" r="1" fill="#FFFFFF" opacity="0.9">
              <animate attributeName="opacity" values="0;1;0" dur="0.6s" repeatCount="3" />
            </circle>
          </g>
        )}
      </svg>

      <div className="zc-breath" />
    </div>
  );
}
