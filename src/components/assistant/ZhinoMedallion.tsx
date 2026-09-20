// ============================================================
// ZHINO — مدالیون سه‌بعدی دستیار (آواتار جدید)
//
// جایگزین آواتار تصویری قدیمی: یک مدالیون فلزیِ طلایی مات با میدان
// زرشکی، گنبد شیشه‌ای و سرِ ربات ژینو داخل آن. ربات داخل مدالیون
// «زنده» است: پلک نامنظم، نگاه آرام، لبخند؛ و با حالت گفتگو واکنش
// نشان می‌دهد:
//
//   idle     → تنفس آرام هاله + پلک و نگاه طبیعی
//   thinking → چشم‌ها به بالا، دهان بستهٔ کوچک، هالهٔ طلایی تندتر
//   speaking → دهان باز/بسته هماهنگ، هالهٔ زرشکی ضربان‌دار
//   happy    → چشم‌های خندان (بوبِ بسته)، لبخند پهن، هالهٔ گرم
//
// پیاده‌سازی: SVG خالص + یک حلقهٔ rAF مشترک (module-level ticker) تا
// ده‌ها مدالیون روی صفحه هرکدام حلقهٔ جدا نداشته باشند. فقط
// transform/opacity تغییر می‌کند → بدون jank.
// ============================================================

import { useEffect, useId, useRef } from 'react';
import './zhino-medallion.css';

export type ZhinoMedallionMode = 'idle' | 'greeting' | 'thinking' | 'speaking' | 'waving' | 'happy';

interface Props {
  mode?: ZhinoMedallionMode;
  size?: number;
  className?: string;
  /** هالهٔ نور بیرونی (برای زمینه‌های تیره/روشن) */
  glow?: boolean;
}

/* ── حلقهٔ زمان مشترک ── */
type TickFn = (t: number, dt: number) => void;
const subscribers = new Set<TickFn>();
let rafId = 0;
let lastTs: number | null = null;
let clock = 0;

function loop(ts: number) {
  rafId = window.requestAnimationFrame(loop);
  if (lastTs === null) lastTs = ts;
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;
  clock += dt;
  subscribers.forEach((fn) => fn(clock, dt));
}

function startTicker() {
  if (!rafId && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    lastTs = null;
    rafId = window.requestAnimationFrame(loop);
  }
}

function stopTicker() {
  if (rafId) {
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function subscribeTick(fn: TickFn): () => void {
  subscribers.add(fn);
  startTicker();
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) stopTicker();
  };
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ease = (x: number) => {
  const k = clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};

export default function ZhinoMedallion({ mode = 'idle', size = 44, className, glow = true }: Props) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, '_');
  const g = (name: string) => `${uid}-${name}`;

  const eyesRef = useRef<SVGGElement | null>(null);
  const lidsRef = useRef<SVGGElement | null>(null);
  const smileRef = useRef<SVGPathElement | null>(null);
  const talkRef = useRef<SVGEllipseElement | null>(null);
  const grinRef = useRef<SVGPathElement | null>(null);
  const headRef = useRef<SVGGElement | null>(null);
  const modeRef = useRef<ZhinoMedallionMode>(mode);
  modeRef.current = mode;

  /* seed تصادفی هر نمونه تا پلک‌ها هم‌زمان نباشند */
  const seedRef = useRef<number>(Math.random() * 100);

  useEffect(() => {
    const seed = seedRef.current;
    let nextBlink = 0.8 + Math.random() * 2.4;
    let blinkStart = -1;
    let gx = 0;
    let gy = 0;
    let tx = 0;
    let ty = 0;
    let nextLook = 0.6 + Math.random();
    let talkPhase = Math.random() * 10;

    return subscribeTick((t, dt) => {
      const m = modeRef.current;
      const thinking = m === 'thinking';
      const speaking = m === 'speaking';
      const happy = m === 'happy' || m === 'greeting' || m === 'waving';

      /* پلک */
      let lid = 0; // 0 = باز، 1 = بسته
      if (blinkStart < 0) {
        if (t >= nextBlink) blinkStart = t;
      } else {
        const p = t - blinkStart;
        const close = 0.07;
        const hold = 0.035;
        const open = 0.14;
        if (p < close) lid = ease(p / close);
        else if (p < close + hold) lid = 1;
        else if (p < close + hold + open) lid = 1 - ease((p - close - hold) / open);
        else {
          blinkStart = -1;
          nextBlink = t + 1.6 + Math.random() * 4.4;
        }
      }

      /* نگاه */
      if (t >= nextLook) {
        nextLook = t + 0.8 + Math.random() * 2.2;
        if (thinking) {
          tx = (Math.random() - 0.5) * 2.4;
          ty = -2.2 - Math.random() * 0.8;
        } else if (happy) {
          tx = (Math.random() - 0.5) * 2.2;
          ty = 0.4 + Math.random() * 0.6;
        } else {
          tx = (Math.random() - 0.5) * 3.4;
          ty = (Math.random() - 0.5) * 1.6;
        }
      }
      const k = Math.min(1, dt * 6);
      gx += (tx - gx) * k;
      gy += (ty - gy) * k;

      /* سر: تنفس بسیار ظریف */
      const breath = Math.sin(t * 2 * Math.PI * 0.22 + seed) * 0.5;
      const tilt = thinking ? -2.2 : happy ? 2.0 : Math.sin(t * 0.31 + seed) * 1.2;

      /* دهان */
      const syl = Math.pow(Math.max(0, Math.sin(t * 2 * Math.PI * 2.6 + talkPhase)), 0.6);
      const talkOpen = speaking ? 0.35 + 0.65 * syl : 0;

      const eyes = eyesRef.current;
      const lids = lidsRef.current;
      const smile = smileRef.current;
      const talk = talkRef.current;
      const grin = grinRef.current;
      const head = headRef.current;

      if (eyes) {
        eyes.setAttribute('transform', `translate(${gx.toFixed(2)} ${(gy + (thinking ? -0.6 : 0)).toFixed(2)})`);
      }
      if (lids) {
        const squint = happy ? 0.42 : thinking ? 0.8 : 1;
        lids.setAttribute('transform', `translate(50 51) scale(1 ${((1 - lid) * squint).toFixed(3)}) translate(-50 -51)`);
      }
      if (head) {
        head.setAttribute('transform', `translate(0 ${breath.toFixed(2)}) rotate(${tilt.toFixed(2)} 50 52)`);
      }
      if (smile) smile.setAttribute('opacity', (happy ? 0 : speaking ? clamp(1 - talkOpen * 1.4, 0, 1) * 0.9 : thinking ? 0 : 0.95).toFixed(3));
      if (grin) grin.setAttribute('opacity', (happy ? 1 : 0).toFixed(3));
      if (talk) {
        talk.setAttribute('opacity', (speaking ? 1 : 0).toFixed(3));
        talk.setAttribute('ry', (1.1 + 2.6 * talkOpen).toFixed(2));
        talk.setAttribute('rx', (3.4 + 1.4 * talkOpen).toFixed(2));
      }
    });
  }, []);

  const stateClass =
    mode === 'thinking' ? 'is-thinking' : mode === 'speaking' ? 'is-speaking' : mode === 'happy' || mode === 'greeting' || mode === 'waving' ? 'is-happy' : 'is-idle';

  return (
    <span
      className={`zh-med ${stateClass}${glow ? '' : ' is-plain'}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" className="zh-med-svg">
        <defs>
          <linearGradient id={g('ring')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F6E3B4" />
            <stop offset="0.35" stopColor="#D8B878" />
            <stop offset="0.62" stopColor="#A98344" />
            <stop offset="1" stopColor="#7C5D26" />
          </linearGradient>
          <linearGradient id={g('ring-in')} x1="1" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#F3DCA6" />
            <stop offset="0.5" stopColor="#B08A48" />
            <stop offset="1" stopColor="#6E5222" />
          </linearGradient>
          <radialGradient id={g('disc')} cx="38%" cy="30%" r="82%">
            <stop offset="0" stopColor="#8E4250" />
            <stop offset="0.55" stopColor="#6B2836" />
            <stop offset="1" stopColor="#420F1B" />
          </radialGradient>
          <radialGradient id={g('head')} cx="36%" cy="28%" r="80%">
            <stop offset="0" stopColor="#FFFEFB" />
            <stop offset="0.5" stopColor="#F5EFE6" />
            <stop offset="0.85" stopColor="#E4D8C6" />
            <stop offset="1" stopColor="#CDBBA2" />
          </radialGradient>
          <radialGradient id={g('visor')} cx="46%" cy="32%" r="80%">
            <stop offset="0" stopColor="#2A2023" />
            <stop offset="0.55" stopColor="#170F12" />
            <stop offset="1" stopColor="#080506" />
          </radialGradient>
          <radialGradient id={g('led')} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#FFF6D6" />
            <stop offset="0.5" stopColor="#FFD98A" />
            <stop offset="1" stopColor="#DFA855" />
          </radialGradient>
          <linearGradient id={g('glass')} x1="0" y1="0" x2="0.7" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.34" />
            <stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.07" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* حلقهٔ فلزی مات با پخ نور */}
        <circle cx="50" cy="50" r="48.6" fill={`url(#${g('ring')})`} />
        <circle cx="50" cy="50" r="48.6" fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="0.7" />
        <circle cx="50" cy="50" r="45.4" fill={`url(#${g('ring-in')})`} />
        {/* بافت ماشین‌کاری‌شدهٔ حلقه */}
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="#6E5222"
          strokeOpacity="0.35"
          strokeWidth="0.6"
          strokeDasharray="0.7 2.6"
        />
        {/* میدان زرشکی */}
        <circle cx="50" cy="50" r="43.6" fill={`url(#${g('disc')})`} />
        <circle cx="50" cy="50" r="43.6" fill="none" stroke="#2E0913" strokeOpacity="0.55" strokeWidth="0.8" />

        {/* ربات ژینو داخل مدالیون */}
        <g ref={headRef}>
          {/* آنتن */}
          <line x1="31.5" y1="33.5" x2="28" y2="26.5" stroke={`url(#${g('ring')})`} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="27.4" cy="25.4" r="2.5" fill={`url(#${g('led')})`} />
          {/* گوش‌ها */}
          <circle cx="25.5" cy="51" r="5.4" fill={`url(#${g('ring')})`} />
          <circle cx="25.5" cy="51" r="3.1" fill="#5A1725" />
          <circle cx="74.5" cy="51" r="5.4" fill={`url(#${g('ring')})`} />
          <circle cx="74.5" cy="51" r="3.1" fill="#5A1725" />
          {/* گنبد سر */}
          <ellipse cx="50" cy="50" rx="24.5" ry="22.5" fill={`url(#${g('head')})`} />
          <ellipse cx="43" cy="40" rx="9.5" ry="5" fill="#FFFFFF" opacity="0.55" />
          {/* وایزر */}
          <rect x="29" y="40" width="42" height="23" rx="11.5" fill={`url(#${g('visor')})`} />
          <rect x="29" y="40" width="42" height="23" rx="11.5" fill="none" stroke="#000000" strokeOpacity="0.5" strokeWidth="0.6" />
          <path d="M34 44.5 Q50 39.5 66 44.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.14" strokeWidth="2.4" strokeLinecap="round" />

          {/* چشم‌ها */}
          <g ref={eyesRef}>
            <g ref={lidsRef}>
              <circle cx="41.5" cy="51" r="5.6" fill={`url(#${g('led')})`} opacity="0.22" />
              <circle cx="58.5" cy="51" r="5.6" fill={`url(#${g('led')})`} opacity="0.22" />
              <circle cx="41.5" cy="51" r="3.5" fill="none" stroke={`url(#${g('led')})`} strokeWidth="1.5" />
              <circle cx="58.5" cy="51" r="3.5" fill="none" stroke={`url(#${g('led')})`} strokeWidth="1.5" />
              <circle cx="41.5" cy="51" r="1.7" fill={`url(#${g('led')})`} />
              <circle cx="58.5" cy="51" r="1.7" fill={`url(#${g('led')})`} />
              <circle cx="40.9" cy="50.3" r="0.55" fill="#FFFFFF" opacity="0.9" />
              <circle cx="57.9" cy="50.3" r="0.55" fill="#FFFFFF" opacity="0.9" />
            </g>
          </g>

          {/* دهان */}
          <path
            ref={smileRef}
            d="M44.5 58.2 Q50 61.6 55.5 58.2"
            fill="none"
            stroke={`url(#${g('led')})`}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            ref={grinRef}
            d="M43 57.4 Q50 63.4 57 57.4"
            fill="none"
            stroke={`url(#${g('led')})`}
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0"
          />
          <ellipse ref={talkRef} cx="50" cy="59" rx="3.6" ry="1.6" fill={`url(#${g('led')})`} opacity="0" />
        </g>

        {/* گنبد شیشه‌ای روی مدالیون */}
        <path d="M14 44 A37 37 0 0 1 62 12 L58 20 A30 30 0 0 0 21 46 Z" fill={`url(#${g('glass')})`} opacity="0.85" />
        <ellipse cx="34" cy="26" rx="14" ry="6.5" fill="#FFFFFF" opacity="0.16" transform="rotate(-24 34 26)" />
        <path d="M20 74 A38 38 0 0 0 78 72" fill="none" stroke="#FFFFFF" strokeOpacity="0.14" strokeWidth="1.6" />
      </svg>
    </span>
  );
}
