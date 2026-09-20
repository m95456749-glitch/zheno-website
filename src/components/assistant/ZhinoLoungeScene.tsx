// ============================================================
// ZHINO — «لَونج لوکس ژینو» — صحنهٔ میزبان ربات در صفحهٔ /assistant
//
// بازطراحی پروفایل ربات (ترکیب کانسپت B + A):
//   • پایه B: اتاق گرم کرمی — قوس نیش، لامپ آویز، ریسهٔ نور،
//     قفسهٔ ژله، کانتر ZHINO، قالیچه، گلدان، محصولات ژله و کاستر
//   • لوکس A: هالهٔ نور سینمایی، قاب طلایی، جزئیات شیشه‌ای،
//     پلاک نام و پیل وضعیت
//
// ربات همان هویت concept-A-v3 است و زنده می‌ماند: پلک، نگاه (به
// اشاره‌گر)، تنفس، سلام، فکر کردن و صحبت. جایگاه انیمیشن‌های آینده
// همین ریگ است — state بیرونی فقط با mode به آن گوشزد می‌شود.
//
// نکته‌های فنی:
//   • انیمیشن‌ها فقط transform/opacity — بدون jank
//   • با تغییر ارتفاع اتاق (حالت چت) viewBox پویا کل صحنه را نشان
//     می‌دهد و برچسب‌های قیمت باز-جای‌گذاری می‌شوند
//   • در jsdom (تست‌های smoke) همهٔ APIهای اختیاری guard شده‌اند
// ============================================================

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { ASSISTANT_TAGLINE } from './assistantData';
import './zhino-lounge.css';

export type ZhinoLoungeMode = 'idle' | 'thinking' | 'speaking';

export interface ZhinoLoungeHandle {
  /** سلام ربات — روی ورود به صفحه و شروع گفتگوی تازه */
  wave: () => void;
}

interface Props {
  /** حالت ربات — از وضعیت واقعی گفتگو (thinking / پاسخ تازه) می‌آید */
  mode?: ZhinoLoungeMode;
  /** گفتگو هنوز تازه است؟ (صحنهٔ بزرگ + حباب خوش‌آمد) */
  fresh?: boolean;
  /** جملهٔ حباب خوش‌آمد */
  welcomeLine?: string;
}

/* ── پالت — همان هویت برند ── */
const GOLD_V_STOPS = (
  <>
    <stop offset="0" stopColor="#EAD097" />
    <stop offset="0.5" stopColor="#C9A55F" />
    <stop offset="1" stopColor="#8F6E2B" />
  </>
);
const GOLD_STOPS = (
  <>
    <stop offset="0" stopColor="#F2DCA9" />
    <stop offset="0.45" stopColor="#D2AF6C" />
    <stop offset="1" stopColor="#96752E" />
  </>
);
const MAROON_STOPS = (
  <>
    <stop offset="0" stopColor="#9A605C" />
    <stop offset="0.55" stopColor="#804D4C" />
    <stop offset="1" stopColor="#5E3634" />
  </>
);
const CREAM_R_STOPS = (
  <>
    <stop offset="0" stopColor="#F9F2E4" />
    <stop offset="0.45" stopColor="#F3E9D8" />
    <stop offset="0.8" stopColor="#E7DAC4" />
    <stop offset="1" stopColor="#D6C6AC" />
  </>
);
const CREAM_L_STOPS = (
  <>
    <stop offset="0" stopColor="#F7F0E1" />
    <stop offset="0.55" stopColor="#EFE4D1" />
    <stop offset="1" stopColor="#DACAB0" />
  </>
);
const CREAM_LR_STOPS = (
  <>
    <stop offset="0" stopColor="#F7F0E1" />
    <stop offset="0.55" stopColor="#EFE4D1" />
    <stop offset="1" stopColor="#DACAB0" />
  </>
);
const SCREEN_STOPS = (
  <>
    <stop offset="0" stopColor="#272524" />
    <stop offset="0.55" stopColor="#141312" />
    <stop offset="1" stopColor="#060605" />
  </>
);

/* جمله‌های لمس محصولات — نمایشی و دوست‌داشتنی */
const JAR_LINES: Record<string, string> = {
  'انار': 'این ژلهٔ اناره! قرمزِ درخشان، محبوبِ همهٔ مهمانی‌ها 😍',
  'پرتقال': 'ژلهٔ پرتقال زیر گنبد شیشه‌ای! انگار برش صبحگاهی پرتقال توی بسته است 🍊',
  'کیوی': 'ژلهٔ کیوی! سبز و شاد — بچه‌ها عاشقش می‌شوند 🥝',
  'بلوبری': 'و این هم ژلهٔ بلوبری؛ آبیِ آرام و خوش‌طعم 🫐',
  'کاستر': 'کاستر محلبی‌وانیلی! نرم و خوش‌عطر — ستارهٔ سینی دسر 🍮',
};

const STATUS_LABEL: Record<ZhinoLoungeMode, string> = {
  idle: 'آنلاین و آمادهٔ گفتگو',
  thinking: 'در حال فکر کردن…',
  speaking: 'در حال پاسخ…',
};

/** موتور زندهٔ ربات — همان ریگ concept-A-v3 */
interface LoungeEngine {
  set: (mode: ZhinoLoungeMode) => void;
  wave: () => void;
  grin: (ms: number) => void;
}

function buildLoungeEngine(root: SVGSVGElement | null): LoungeEngine | null {
  if (!root) return null;
  const $ = (id: string): SVGElement | null => root.querySelector(`#${id}`);
  const els = {
    head: $('g-head'),
    antenna: $('g-antenna'),
    eyes: $('g-eyes'),
    torso: $('g-torso'),
    armL: $('g-upper-l'),
    foreL: $('g-fore-l'),
    elbowL: $('g-elbow-l'),
    armR: $('g-upper-r'),
    foreR: $('g-fore-r'),
    elbowR: $('g-elbow-r'),
    smile: $('m-smile'),
    talk: $('m-talk'),
    grin: $('m-grin'),
    talkGlow: $('m-talk-glow'),
    talkDots: $('m-talk-dots'),
  } as Record<string, SVGElement | null>;
  if (!els.head || !els.eyes || !els.torso || !els.antenna) return null;

  const R = Math.random;
  const seeds: number[] = [];
  for (let i = 0; i < 14; i++) seeds.push(R() * Math.PI * 2);

  const noise = (t: number, i: number, speed = 1): number => {
    const s = seeds[i % seeds.length];
    return (
      Math.sin(t * 0.9 * speed + s) * 0.55 +
      Math.sin(t * 1.73 * speed + s * 2.7) * 0.3 +
      Math.sin(t * 2.57 * speed + s * 5.1) * 0.15
    );
  };
  const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
  const ease = (x: number) => {
    x = clamp(x, 0, 1);
    return x * x * (3 - 2 * x);
  };
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

  let reduce = 1;
  try {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reduce = 0.25;
    }
  } catch {
    /* noop */
  }

  type Mode = ZhinoLoungeMode;
  let state: Mode = 'idle';
  const w = { idle: 1, thinking: 0, speaking: 0 };
  const target = { idle: 1, thinking: 0, speaking: 0 };
  let waveT0 = -100;
  let thinkSide = R() < 0.5 ? -1 : 1;
  let speechSeed = R() * 10;
  let clock = 0;
  let grinUntil = -1;

  const set = (s: Mode) => {
    if (!(s in target)) return;
    if (s === state) return;
    state = s;
    for (const k of Object.keys(target) as (keyof typeof target)[]) {
      target[k] = k === s ? 1 : 0;
    }
    if (s === 'thinking') thinkSide = R() < 0.5 ? -1 : 1;
    if (s === 'speaking') speechSeed = R() * 10;
  };
  const wave = () => {
    waveT0 = clock;
  };
  const grin = (ms: number) => {
    grinUntil = clock + ms / 1000;
  };

  /* نگاه به اشاره‌گر کاربر */
  const ptr = { x: 0, y: 0 };
  const ptrT = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent) => {
    const r = root.getBoundingClientRect();
    if (r.width < 2) return;
    const hx = r.left + r.width * 0.5;
    const hy = r.top + r.height * 0.3;
    ptrT.x = clamp((e.clientX - hx) / (r.width * 0.5), -1, 1);
    ptrT.y = clamp((e.clientY - hy) / (r.height * 0.5), -1, 1);
  };
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onPointer, { passive: true });

  /* پلک نامنظم + پلک دوبلهٔ گاه‌به‌گاه */
  let nextBlink = 0.9 + R() * 2.2;
  let blinkStart = -1;
  let blinkDouble = false;
  const blinkScale = (t: number): number => {
    if (blinkStart < 0) {
      if (t >= nextBlink) {
        blinkStart = t;
        blinkDouble = R() < 0.2;
      } else return 1;
    }
    const p = t - blinkStart;
    if (p < 0) return 1;
    const c = 0.085;
    const h = 0.04;
    const o = 0.17;
    if (p < c) return 1 - 0.94 * ease(p / c);
    if (p < c + h) return 0.06;
    if (p < c + h + o) return 0.06 + 0.94 * ease((p - c - h) / o);
    if (blinkDouble) {
      blinkDouble = false;
      blinkStart = t + 0.14;
      return 1;
    }
    blinkStart = -1;
    nextBlink = t + 1.5 + R() * 4.6;
    return 1;
  };

  /* حرکت چشم‌ها */
  let gx = 0;
  let gy = 0;
  let sx0 = 0;
  let sy0 = 0;
  let sx1 = 0;
  let sy1 = 0;
  let sacT0 = -1;
  let sacDur = 0.12;
  let nextSac = 0.5 + R();
  const stepGaze = (t: number, dt: number) => {
    ptr.x = lerp(ptr.x, ptrT.x, Math.min(1, dt * 3.4));
    ptr.y = lerp(ptr.y, ptrT.y, Math.min(1, dt * 3.4));
    if (t >= nextSac) {
      sx0 = gx;
      sy0 = gy;
      let tx: number;
      let ty: number;
      let hold: number;
      if (w.thinking > 0.4) {
        tx = thinkSide * (3 + R() * 3);
        ty = -6 - R() * 3;
        hold = 1.1;
      } else if (w.speaking > 0.4) {
        tx = (R() - 0.5) * 7;
        ty = (R() - 0.5) * 4;
        hold = 0.55;
      } else {
        tx = (R() - 0.5) * 11;
        ty = (R() - 0.5) * 5;
        hold = 0.75;
      }
      sx1 = tx + ptr.x * 7;
      sy1 = ty + ptr.y * 4.2;
      sacT0 = t;
      sacDur = 0.09 + R() * 0.09;
      nextSac = t + hold * (0.4 + R() * 1.6);
    }
    const k = sacT0 < 0 ? 1 : ease((t - sacT0) / sacDur);
    gx = lerp(sx0, sx1, k) + 0.35 * noise(t, 5, 1.9);
    gy = lerp(sy0, sy1, k) + 0.25 * noise(t, 6, 2.3);
  };

  let antA = 0;
  let antV = 0;
  let last: number | null = null;
  let raf = 0;

  const step = (dt: number) => {
    const t = clock;
    for (const k of Object.keys(w) as (keyof typeof w)[]) {
      w[k] += (target[k] - w[k]) * Math.min(1, dt / 0.26);
    }
    const wp = t - waveT0;
    let raise = 0;
    if (wp >= 0) {
      if (wp < 0.55) raise = ease(wp / 0.55);
      else if (wp < 2.35) raise = 1;
      else if (wp < 3.0) raise = 1 - ease((wp - 2.35) / 0.65);
      else raise = 0;
    }
    const grin = t < grinUntil ? 1 : 0;
    const syl = Math.pow(Math.max(0, Math.sin(t * 2 * Math.PI * 2.7 + speechSeed)), 0.65);
    const gate = clamp(noise(t, 7, 0.5) * 0.9 + 0.62, 0, 1);
    const talkAmp = w.speaking * gate;
    const open = talkAmp * (0.22 + 0.78 * syl);

    const brPhase = t * 2 * Math.PI * 0.235 + 0.7 * noise(t, 3, 0.11);
    const br = 1 + reduce * 0.011 * Math.sin(brPhase);
    const torsoTy = reduce * 0.9 * Math.sin(brPhase);
    const torsoRot = reduce * 0.35 * noise(t, 9, 0.17);

    const hr =
      reduce *
      (1.05 * noise(t, 0, 0.19) +
        w.thinking * (1.6 * Math.sin(t * 0.7 + seeds[2]) + 1.2 * thinkSide) +
        w.speaking * 1.5 * syl * gate +
        raise * 1.9 * thinkSide * 0.6 +
        ptr.x * 2.6);
    const hx = reduce * (1.4 * noise(t, 1, 0.15) + w.thinking * 1.2 * thinkSide + ptr.x * 2.2);
    const hy = reduce * (-1.1 * (br - 1) * 90 + w.thinking * 1.4 + raise * -1.0 + ptr.y * 2.0);

    const antTarget =
      -hr * 1.9 + reduce * (1.5 * noise(t, 4, 0.55)) * (0.55 + w.thinking * 0.9 + raise * 1.1 + w.speaking * 0.5);
    antV += ((antTarget - antA) * 46 - antV * 7.5) * dt;
    antA += antV * dt;

    stepGaze(t, dt);
    const bs = blinkScale(t);
    const squint = 1 - 0.16 * raise;

    const talkOp = clamp(w.speaking * 1.25, 0, 1) * clamp(gate * 2.2, 0, 1);
    const grinOp = clamp(Math.max(raise * 1.1, grin), 0, 1);
    const smileOp = clamp(1 - talkOp * 0.92 - grinOp * 0.85, 0, 1);
    const mrx = 13 + 8 * open;
    const mry = 3 + 12 * open;

    const aL = reduce * (0.9 * noise(t, 8, 0.21) + w.speaking * 2.2 * Math.sin(t * 1.9 + 1.2) * gate);
    const fL = reduce * (1.3 * noise(t, 10, 0.29) + w.speaking * 5.5 * Math.sin(t * 2 * Math.PI * 0.85 + 0.4) * gate);
    const aR = reduce * (0.9 * noise(t, 11, 0.23)) - raise * 107;
    const fR = reduce * (1.3 * noise(t, 12, 0.31)) + raise * (-140 + 16 * Math.sin(t * 2 * Math.PI * 1.9 + 0.7));

    els.torso?.setAttribute(
      'transform',
      `translate(0 ${torsoTy.toFixed(2)}) rotate(${torsoRot.toFixed(2)} 360 662) translate(360 662) scale(1 ${br.toFixed(4)}) translate(-360 -662)`,
    );
    els.head?.setAttribute(
      'transform',
      `translate(${hx.toFixed(2)} ${hy.toFixed(2)}) rotate(${hr.toFixed(2)} 360 400)`,
    );
    els.antenna?.setAttribute('transform', `rotate(${antA.toFixed(2)} 136 236)`);
    els.eyes?.setAttribute(
      'transform',
      `translate(${gx.toFixed(2)} ${gy.toFixed(2)}) translate(360 254) scale(1 ${(bs * squint).toFixed(3)}) translate(-360 -254)`,
    );
    els.armL?.setAttribute('transform', `rotate(${aL.toFixed(2)} 204 472)`);
    els.foreL?.setAttribute('transform', `rotate(${fL.toFixed(2)} 185 557)`);
    els.elbowL?.setAttribute('transform', `rotate(${aL.toFixed(2)} 204 472) rotate(8 185 557)`);
    els.armR?.setAttribute('transform', `rotate(${aR.toFixed(2)} 516 472)`);
    els.foreR?.setAttribute('transform', `rotate(${fR.toFixed(2)} 535 557)`);
    els.elbowR?.setAttribute('transform', `rotate(${aR.toFixed(2)} 516 472) rotate(-8 535 557)`);
    els.smile?.setAttribute('opacity', smileOp.toFixed(3));
    els.talk?.setAttribute('opacity', talkOp.toFixed(3));
    els.grin?.setAttribute('opacity', grinOp.toFixed(3));
    els.talkGlow?.setAttribute('rx', mrx.toFixed(2));
    els.talkGlow?.setAttribute('ry', mry.toFixed(2));
    els.talkDots?.setAttribute('rx', mrx.toFixed(2));
    els.talkDots?.setAttribute('ry', mry.toFixed(2));
  };

  const frame = (ts: number) => {
    raf = window.requestAnimationFrame(frame);
    if (last === null) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    clock += dt;
    step(dt);
  };
  raf = window.requestAnimationFrame(frame);

  const onVisibility = () => {
    if (document.hidden) {
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
    } else if (!raf) {
      last = null;
      raf = window.requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    set,
    wave,
    grin,
    /* متغیرهای داخلی برای cleanup */
    destroy: () => {
      if (raf) window.cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
    },
  } as LoungeEngine & { destroy: () => void };
}

const ZhinoLoungeScene = forwardRef<ZhinoLoungeHandle, Props>(function ZhinoLoungeScene(
  { mode = 'idle', fresh = true, welcomeLine },
  ref,
) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const roomRef = useRef<HTMLDivElement | null>(null);
  const jellyAnchorRef = useRef<SVGCircleElement | null>(null);
  const custardAnchorRef = useRef<SVGCircleElement | null>(null);
  const tagJellyRef = useRef<HTMLButtonElement | null>(null);
  const tagCustardRef = useRef<HTMLButtonElement | null>(null);
  const engineRef = useRef<(LoungeEngine & { destroy: () => void }) | null>(null);

  const [bubble, setBubble] = useState<{ text: string; dots?: boolean }>({ text: '' });
  const bubbleTextRef = useRef('');
  const typeTimerRef = useRef<number | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      wave: () => engineRef.current?.wave(),
    }),
    [],
  );

  /* ── موتور زندهٔ ربات ── */
  useEffect(() => {
    engineRef.current = buildLoungeEngine(svgRef.current) as (LoungeEngine & { destroy: () => void }) | null;
    const engine = engineRef.current;
    const intro = window.setTimeout(() => engine?.wave(), 700);
    return () => {
      window.clearTimeout(intro);
      engine?.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.set(mode);
  }, [mode]);

  /* ── حباب گفتار ── */
  const say = (text: string, dots = false) => {
    if (typeTimerRef.current) window.clearInterval(typeTimerRef.current);
    typeTimerRef.current = null;
    if (dots) {
      setBubble({ text: '', dots: true });
      return;
    }
    bubbleTextRef.current = text;
    setBubble({ text: '' });
    let i = 0;
    const stepSize = Math.max(2, Math.round(text.length / 70));
    typeTimerRef.current = window.setInterval(() => {
      i = Math.min(text.length, i + stepSize);
      setBubble({ text: text.slice(0, i) });
      if (i >= text.length && typeTimerRef.current) {
        window.clearInterval(typeTimerRef.current);
        typeTimerRef.current = null;
      }
    }, 26);
  };

  useEffect(() => {
    if (fresh && welcomeLine) say(welcomeLine);
    if (!fresh) {
      if (typeTimerRef.current) window.clearInterval(typeTimerRef.current);
      typeTimerRef.current = null;
      setBubble({ text: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, welcomeLine]);

  useEffect(
    () => () => {
      if (typeTimerRef.current) window.clearInterval(typeTimerRef.current);
    },
    [],
  );

  /* ── چیدمان واکنش‌گرا: viewBox پویا + جای برچسب‌های قیمت ── */
  useEffect(() => {
    const room = roomRef.current;
    const svg = svgRef.current;
    if (!room || !svg) return;

    const place = (
      tag: HTMLElement | null,
      anchor: SVGCircleElement | null,
      dx: number,
      dy: number,
    ) => {
      if (!tag || !anchor) return;
      const rr = room.getBoundingClientRect();
      const ar = anchor.getBoundingClientRect();
      if (rr.width < 2 || ar.width === 0) return;
      const x = ar.left - rr.left + dx;
      const y = ar.top - rr.top + dy;
      const w = tag.offsetWidth || 150;
      const h = tag.offsetHeight || 28;
      tag.style.left = `${Math.max(8, Math.min(rr.width - w - 8, x))}px`;
      tag.style.top = `${Math.max(8, Math.min(rr.height - h - 8, y))}px`;
      tag.classList.add('is-set');
    };

    const layout = () => {
      const rr = room.getBoundingClientRect();
      if (rr.width < 2 || rr.height < 2) return;
      /* پنجرهٔ دید همیشه تمام ارتفاع صحنه را نشان می‌دهد — هیچ‌گاه
         چیزی از بالا بریده نمی‌شود؛ عرض بر اساس نسبت واقعی اتاق */
      const vbw = Math.max(430, Math.min(1600, 680 * (rr.width / rr.height)));
      const x0 = 380 - vbw / 2 + (vbw < 620 ? 12 : 0);
      svg.setAttribute('viewBox', `${x0.toFixed(1)} 0 ${vbw.toFixed(1)} 680`);
      place(tagJellyRef.current, jellyAnchorRef.current, -((tagJellyRef.current?.offsetWidth || 150) * 0.55), -32);
      place(tagCustardRef.current, custardAnchorRef.current, 8, -14);
    };

    layout();
    const t1 = window.setTimeout(layout, 80);
    const t2 = window.setTimeout(layout, 500);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(layout);
      ro.observe(room);
    }
    window.addEventListener('resize', layout);
    window.addEventListener('orientationchange', layout);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro?.disconnect();
      window.removeEventListener('resize', layout);
      window.removeEventListener('orientationchange', layout);
    };
  }, [fresh]);

  /* ── لمس محصولات: لرزش ژله + لبخند + حباب معرفی ── */
  const jiggle = (el: SVGGraphicsElement | null) => {
    if (!el || typeof el.animate !== 'function') return;
    el.animate(
      [
        { transform: 'scale(1,1)' },
        { transform: 'scale(1.06,0.9) rotate(-2deg)' },
        { transform: 'scale(0.95,1.07) rotate(2deg)' },
        { transform: 'scale(1.03,0.96) rotate(-1deg)' },
        { transform: 'scale(0.99,1.02) rotate(0.6deg)' },
        { transform: 'scale(1,1)' },
      ],
      { duration: 900, easing: 'cubic-bezier(.36,.07,.19,.97)' },
    );
  };

  const onJarClick = (e: ReactMouseEvent<SVGGElement>) => {
    const inner = e.currentTarget.querySelector('.zl-jelly-inner') as SVGGraphicsElement | null;
    jiggle(inner);
    const flavor = e.currentTarget.getAttribute('data-flavor');
    engineRef.current?.grin(1600);
    if (flavor && JAR_LINES[flavor]) say(JAR_LINES[flavor]);
  };

  const onProductTag = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const kind = e.currentTarget.getAttribute('data-prod');
    engineRef.current?.grin(1800);
    say(
      kind === 'jelly'
        ? 'ژلهٔ انار ژینو — بستهٔ ۲۵۰ گرمی. رنگش روی میز مهمانی معجزه می‌کند!'
        : 'کاستر محلبی‌وانیلی ژینو — بستهٔ ۲۵۰ گرمی. عطر محلبی همهٔ خانه را برمی‌دارد 🍮',
    );
  };

  const onRoomClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    if (typeof target.closest === 'function' && target.closest('#g-head,#g-torso')) {
      engineRef.current?.wave();
    }
  };

  /* ذرات طلایی معلق — یک‌بار برای هر نصب */
  const motes = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        size: 2 + Math.random() * 3.5,
        left: 10 + Math.random() * 80,
        top: 34 + Math.random() * 58,
        opacity: 0.3 + Math.random() * 0.45,
        dx: (Math.random() - 0.5) * 46,
        duration: 10 + Math.random() * 13,
        delay: -Math.random() * 15,
      })),
    [],
  );

  /* قفسه و کانتر — ژله‌ها در گروه بیرونیِ ثابت جاسازی شده‌اند تا
     انیمیشن CSS هرگز جای‌شان را عوض نکند */
  const jar = (
    flavor: string,
    x: number,
    y: number,
    children: ReactNode,
    delay?: number,
  ): ReactNode => (
    <g transform={`translate(${x} ${y})`}>
      <g
        className="zl-jar zl-wobble zl-jelly-inner"
        data-flavor={flavor}
        style={delay ? { animationDelay: `${delay}s` } : undefined}
        onClick={onJarClick}
      >
        {children}
      </g>
    </g>
  );

  return (
    <section className={`zl-hero${fresh ? '' : ' is-compact'}`} aria-label="لَونج ربات ژینو">
      <div className="zl-room" ref={roomRef}>
        <svg
          ref={svgRef}
          viewBox="0 0 760 680"
          role="img"
          aria-label="اتاق ربات ژینو با قفسهٔ ژله و کانتر محصولات"
          onClick={onRoomClick}
        >
          <defs>
            <linearGradient id="zl-wall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F9F1E3" />
              <stop offset="1" stopColor="#F1E2CB" />
            </linearGradient>
            <linearGradient id="zl-band" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F2DFDA" />
              <stop offset="1" stopColor="#EED4CC" />
            </linearGradient>
            <radialGradient id="zl-niche" cx="50%" cy="34%" r="72%">
              <stop offset="0" stopColor="#FBEFD9" />
              <stop offset="0.62" stopColor="#F4E3C8" />
              <stop offset="1" stopColor="#E9D3B2" />
            </radialGradient>
            <linearGradient id="zl-floor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#EDDEC4" />
              <stop offset="1" stopColor="#E4D1B2" />
            </linearGradient>
            <linearGradient id="zl-counterTop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FCF6EA" />
              <stop offset="1" stopColor="#EBD9BC" />
            </linearGradient>
            <linearGradient id="zl-counterFront" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F3E6CF" />
              <stop offset="1" stopColor="#E4CFAE" />
            </linearGradient>
            <linearGradient id="zl-goldV" x1="0" y1="0" x2="0" y2="1">
              {GOLD_V_STOPS}
            </linearGradient>
            <radialGradient id="zl-gold" cx="35%" cy="30%" r="85%">
              {GOLD_STOPS}
            </radialGradient>
            <radialGradient id="zl-maroon" cx="35%" cy="30%" r="85%">
              {MAROON_STOPS}
            </radialGradient>
            <radialGradient id="zl-creamR" cx="35%" cy="28%" r="80%">
              {CREAM_R_STOPS}
            </radialGradient>
            <linearGradient id="zl-creamL" x1="0" y1="0" x2="1" y2="0">
              {CREAM_L_STOPS}
            </linearGradient>
            <linearGradient id="zl-creamLr" x1="1" y1="0" x2="0" y2="0">
              {CREAM_LR_STOPS}
            </linearGradient>
            <radialGradient id="zl-creamPod" cx="35%" cy="30%" r="80%">
              <stop offset="0" stopColor="#F9F2E4" />
              <stop offset="1" stopColor="#DFD0B6" />
            </radialGradient>
            <radialGradient id="zl-screen" cx="42%" cy="34%" r="85%">
              {SCREEN_STOPS}
            </radialGradient>
            <filter id="zl-b4" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
            <filter id="zl-b8" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="8" />
            </filter>
            <filter id="zl-b16" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="16" />
            </filter>
            <radialGradient id="zl-bulbG" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#FFE9B8" />
              <stop offset="0.55" stopColor="rgba(255,222,150,.55)" />
              <stop offset="1" stopColor="rgba(255,222,150,0)" />
            </radialGradient>
            <radialGradient id="zl-warmCone" cx="50%" cy="0%" r="100%">
              <stop offset="0" stopColor="rgba(255,226,160,.4)" />
              <stop offset="0.65" stopColor="rgba(255,226,160,.12)" />
              <stop offset="1" stopColor="rgba(255,226,160,0)" />
            </radialGradient>
            <radialGradient id="zl-headHalo" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="rgba(238,217,164,.5)" />
              <stop offset="0.6" stopColor="rgba(238,217,164,.18)" />
              <stop offset="1" stopColor="rgba(238,217,164,0)" />
            </radialGradient>
            <radialGradient id="zl-wineHalo" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="rgba(122,42,54,.16)" />
              <stop offset="1" stopColor="rgba(122,42,54,0)" />
            </radialGradient>
            <clipPath id="zl-headClip">
              <ellipse cx="360" cy="262" rx="220" ry="134" />
              <rect x="150" y="196" width="420" height="132" rx="66" />
            </clipPath>
            <clipPath id="zl-torsoClip">
              <path d="M 212,470 C 212,446 246,432 292,428 C 330,424 390,424 428,428 C 474,433 508,446 508,470 C 514,508 516,554 506,592 C 496,638 434,662 360,662 C 286,662 224,638 214,592 C 204,554 206,508 212,470 Z" />
            </clipPath>
          </defs>

          {/* دیوار و کف — پهن‌تر از قاب برای همهٔ نسبت‌ها */}
          <rect x="-900" width="3400" height="574" fill="url(#zl-wall)" />
          <rect x="-900" width="3400" height="86" fill="url(#zl-band)" />
          <rect x="-900" y="86" width="3400" height="6" fill="url(#zl-goldV)" />
          <rect x="-900" y="92" width="3400" height="2" fill="#8F6E2B" opacity=".35" />
          <rect x="-900" y="560" width="3400" height="120" fill="url(#zl-floor)" />
          <rect x="-900" y="556" width="3400" height="7" fill="#E2CBA8" opacity=".8" />
          <rect x="-900" y="563" width="3400" height="2" fill="#D5BC95" opacity=".5" />
          <ellipse cx="92" cy="612" rx="96" ry="18" fill="rgba(255,226,160,.4)" filter="url(#zl-b8)" />
          <ellipse cx="668" cy="612" rx="96" ry="18" fill="rgba(255,226,160,.4)" filter="url(#zl-b8)" />

          {/* قوس نیش پشت ربات */}
          <g>
            <path d="M 236,560 L 236,300 Q 236,150 380,150 Q 524,150 524,300 L 524,560 Z" fill="url(#zl-niche)" />
            <path
              d="M 236,560 L 236,300 Q 236,150 380,150 Q 524,150 524,300 L 524,560"
              fill="none"
              stroke="#D9BE97"
              strokeWidth="3"
              opacity=".8"
            />
            <path
              d="M 248,560 L 248,302 Q 248,162 380,162 Q 512,162 512,302 L 512,560"
              fill="none"
              stroke="#C9A55F"
              strokeWidth="1.4"
              opacity=".5"
              strokeDasharray="1 7"
              strokeLinecap="round"
            />
            <ellipse cx="380" cy="330" rx="150" ry="180" fill="rgba(255,232,180,.4)" filter="url(#zl-b16)" />
            <path
              d="M 285,205 C 268,300 270,430 292,532"
              stroke="rgba(255,255,255,.55)"
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              opacity=".38"
              filter="url(#zl-b4)"
            />
            <path
              d="M 478,215 C 492,300 491,420 472,520"
              stroke="rgba(255,255,255,.4)"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
              opacity=".24"
              filter="url(#zl-b4)"
            />
          </g>

          {/* ریسهٔ نور بالای قوس */}
          <path
            d="M 236,270 Q 240,170 380,158 Q 520,170 524,270"
            fill="none"
            stroke="#C9A55F"
            strokeWidth="1.6"
            opacity=".55"
          />
          <g fill="#F2C879">
            <circle className="zl-bulb" cx="262" cy="222" r="4" />
            <circle className="zl-bulb" cx="288" cy="182" r="4" />
            <circle className="zl-bulb" cx="328" cy="164" r="4" />
            <circle className="zl-bulb" cx="380" cy="158" r="4.6" />
            <circle className="zl-bulb" cx="432" cy="164" r="4" />
            <circle className="zl-bulb" cx="472" cy="182" r="4" />
            <circle className="zl-bulb" cx="498" cy="222" r="4" />
          </g>
          <g fill="url(#zl-bulbG)" opacity=".8">
            <circle className="zl-bulb" cx="262" cy="222" r="10" />
            <circle className="zl-bulb" cx="288" cy="182" r="10" />
            <circle className="zl-bulb" cx="328" cy="164" r="10" />
            <circle className="zl-bulb" cx="380" cy="158" r="13" />
            <circle className="zl-bulb" cx="432" cy="164" r="10" />
            <circle className="zl-bulb" cx="472" cy="182" r="10" />
            <circle className="zl-bulb" cx="498" cy="222" r="10" />
          </g>

          {/* لامپ آویز */}
          <g>
            <line x1="380" y1="0" x2="380" y2="52" stroke="#8A6A2C" strokeWidth="2.4" />
            <path d="M 348,86 Q 348,54 380,54 Q 412,54 412,86 Z" fill="#71313B" />
            <path d="M 348,86 Q 348,54 380,54 Q 412,54 412,86" fill="none" stroke="#5A1725" strokeWidth="2" />
            <path d="M 352,80 Q 356,60 380,58" stroke="#A9706C" strokeWidth="2" fill="none" opacity=".6" />
            <rect x="344" y="84" width="72" height="7" rx="3.5" fill="url(#zl-goldV)" />
            <ellipse cx="380" cy="96" rx="17" ry="9" fill="#FFE2A0" filter="url(#zl-b4)" />
            <circle cx="380" cy="95" r="5.5" fill="#FFEDBE" />
            <polygon points="380,98 236,560 524,560" fill="url(#zl-warmCone)" opacity=".55" />
            <polygon points="380,98 320,560 440,560" fill="url(#zl-warmCone)" opacity=".4" />
          </g>

          {/* قفسهٔ بالا-چپ: ژله‌ها */}
          <g>
            <rect x="150" y="150" width="180" height="12" rx="6" fill="#E0C69E" />
            <rect x="150" y="160" width="180" height="5" rx="2.5" fill="#C8A97B" opacity=".7" />
            <rect x="164" y="162" width="10" height="22" rx="4" fill="url(#zl-goldV)" />
            <rect x="306" y="162" width="10" height="22" rx="4" fill="url(#zl-goldV)" />
            {jar(
              'انار',
              188,
              82,
              <>
                <rect x="0" y="26" width="46" height="40" rx="9" fill="rgba(255,255,255,.55)" stroke="#D9C6A6" strokeWidth="1.5" />
                <rect x="3.5" y="34" width="39" height="29" rx="6.5" fill="#C34A57" />
                <ellipse cx="16" cy="42" rx="7" ry="10" fill="#FFFFFF" opacity=".3" />
                <rect x="-2" y="18" width="50" height="12" rx="6" fill="#F5EBD7" stroke="#D9C6A6" strokeWidth="1.2" />
                <circle cx="23" cy="24" r="2.6" fill="url(#zl-gold)" />
              </>,
            )}
            {jar(
              'پرتقال',
              242,
              82,
              <>
                <rect x="0" y="26" width="46" height="40" rx="9" fill="rgba(255,255,255,.55)" stroke="#D9C6A6" strokeWidth="1.5" />
                <rect x="3.5" y="34" width="39" height="29" rx="6.5" fill="#E28B36" />
                <ellipse cx="16" cy="42" rx="7" ry="10" fill="#FFFFFF" opacity=".3" />
                <rect x="-2" y="18" width="50" height="12" rx="6" fill="#F5EBD7" stroke="#D9C6A6" strokeWidth="1.2" />
                <circle cx="23" cy="24" r="2.6" fill="url(#zl-gold)" />
              </>,
              1.8,
            )}
            {jar(
              'کیوی',
              296,
              82,
              <>
                <rect x="0" y="26" width="46" height="40" rx="9" fill="rgba(255,255,255,.55)" stroke="#D9C6A6" strokeWidth="1.5" />
                <rect x="3.5" y="34" width="39" height="29" rx="6.5" fill="#7CA653" />
                <ellipse cx="16" cy="42" rx="7" ry="10" fill="#FFFFFF" opacity=".3" />
                <rect x="-2" y="18" width="50" height="12" rx="6" fill="#F5EBD7" stroke="#D9C6A6" strokeWidth="1.2" />
                <circle cx="23" cy="24" r="2.6" fill="url(#zl-gold)" />
              </>,
              3.4,
            )}
          </g>

          {/* گلدان کنار راست (حاشیهٔ صحنه) */}
          <g transform="translate(-52 0)">
            <g className="zl-leaf">
              <path d="M 700,470 C 676,430 668,392 686,352 C 700,386 706,424 712,462 Z" fill="#8FAF6C" />
              <path d="M 704,470 C 722,436 734,404 726,366 C 708,398 700,432 694,464 Z" fill="#7CA653" />
              <path d="M 700,468 C 698,430 702,398 712,376" stroke="#6B8F49" strokeWidth="2" fill="none" opacity=".6" />
            </g>
            <path d="M 682,468 L 724,468 L 716,516 L 690,516 Z" fill="#B14A57" />
            <rect x="678" y="462" width="50" height="12" rx="5" fill="#C45763" />
            <ellipse cx="712" cy="516" rx="26" ry="6" fill="#C9A97B" opacity=".5" filter="url(#zl-b4)" />
          </g>

          {/* قالیچه */}
          <g>
            <ellipse cx="380" cy="634" rx="252" ry="34" fill="#71313B" />
            <ellipse cx="380" cy="634" rx="252" ry="34" fill="none" stroke="#5A1725" strokeWidth="3" />
            <ellipse
              cx="380"
              cy="634"
              rx="216"
              ry="27"
              fill="none"
              stroke="#C9A55F"
              strokeWidth="1.6"
              strokeDasharray="6 8"
              opacity=".8"
            />
            <ellipse cx="380" cy="634" rx="170" ry="20" fill="none" stroke="#E8D5B5" strokeWidth="1.2" opacity=".55" />
            <circle cx="290" cy="634" r="3.4" fill="#E8D5B5" opacity=".8" />
            <circle cx="380" cy="634" r="3.4" fill="#E8D5B5" opacity=".8" />
            <circle cx="470" cy="634" r="3.4" fill="#E8D5B5" opacity=".8" />
          </g>

          {/* نورپردازی سینمایی ربات */}
          <ellipse cx="380" cy="300" rx="180" ry="190" fill="url(#zl-wineHalo)" />
          <ellipse className="zl-haloBreath" cx="380" cy="245" rx="135" ry="125" fill="url(#zl-headHalo)" />
          <ellipse cx="380" cy="560" rx="150" ry="20" fill="rgba(90,23,37,.16)" filter="url(#zl-b8)" />

          {/* ═══ ربات ژینو — ریگ زندهٔ concept-A-v3 ═══ */}
          <g transform="translate(164 58) scale(0.6)">
            <rect x="324" y="374" width="72" height="48" rx="13" fill="url(#zl-goldV)" />
            <path
              d="M 330,392 H 390 M 330,402 H 390 M 330,412 H 390"
              stroke="#8A6A2C"
              strokeWidth="3"
              opacity="0.45"
              fill="none"
            />
            <ellipse cx="360" cy="380" rx="46" ry="9" fill="#6E5522" opacity="0.35" />
            <path
              d="M 281,666 C 278,698 270,748 268,788 C 267,806 283,814 303,814 C 323,814 339,806 338,788 C 336,748 328,698 325,666 C 317,657 289,657 281,666 Z"
              fill="url(#zl-creamL)"
            />
            <circle cx="269" cy="796" r="12" fill="url(#zl-gold)" />
            <circle cx="269" cy="796" r="4" fill="#6E5522" opacity="0.8" />
            <g transform="rotate(8 303 832)">
              <rect x="253" y="842" width="100" height="22" rx="10" fill="url(#zl-maroon)" />
              <path
                d="M 257,836 C 257,806 277,792 303,792 C 329,792 349,806 349,836 C 349,851 332,858 303,858 C 274,858 257,851 257,836 Z"
                fill="url(#zl-creamR)"
              />
              <ellipse cx="290" cy="814" rx="26" ry="12" fill="#FFFFFF" opacity="0.3" />
            </g>
            <circle cx="303" cy="668" r="11" fill="url(#zl-gold)" />
            <circle cx="303" cy="668" r="4" fill="#6E5522" opacity="0.8" />
            <path
              d="M 439,666 C 442,698 450,748 452,788 C 453,806 437,814 417,814 C 397,814 381,806 382,788 C 384,748 392,698 395,666 C 403,657 431,657 439,666 Z"
              fill="url(#zl-creamLr)"
            />
            <circle cx="451" cy="796" r="12" fill="url(#zl-gold)" />
            <circle cx="451" cy="796" r="4" fill="#6E5522" opacity="0.8" />
            <g transform="rotate(-8 417 832)">
              <rect x="367" y="842" width="100" height="22" rx="10" fill="url(#zl-maroon)" />
              <path
                d="M 371,836 C 371,806 391,792 417,792 C 443,792 463,806 463,836 C 463,851 446,858 417,858 C 388,858 371,851 371,836 Z"
                fill="url(#zl-creamR)"
              />
              <ellipse cx="430" cy="814" rx="26" ry="12" fill="#FFFFFF" opacity="0.3" />
            </g>
            <circle cx="417" cy="668" r="11" fill="url(#zl-gold)" />
            <circle cx="417" cy="668" r="4" fill="#6E5522" opacity="0.8" />
            <g id="g-torso">
              <path
                d="M 212,470 C 212,446 246,432 292,428 C 330,424 390,424 428,428 C 474,433 508,446 508,470 C 514,508 516,554 506,592 C 496,638 434,662 360,662 C 286,662 224,638 214,592 C 204,554 206,508 212,470 Z"
                fill="url(#zl-creamR)"
              />
              <g clipPath="url(#zl-torsoClip)">
                <ellipse cx="360" cy="674" rx="175" ry="58" fill="#D5C9AE" opacity="0.55" filter="url(#zl-b8)" />
                <ellipse cx="516" cy="534" rx="56" ry="115" fill="#D5C9AE" opacity="0.4" filter="url(#zl-b8)" />
                <ellipse cx="204" cy="534" rx="46" ry="105" fill="#D5C9AE" opacity="0.3" filter="url(#zl-b8)" />
                <path d="M 238,580 C 292,616 428,616 482,580" stroke="#CFC3A9" strokeWidth="3" fill="none" opacity="0.8" />
              </g>
              <path
                d="M 292,478 C 292,466 302,459 316,459 L 404,459 C 418,459 428,466 428,478 L 424,530 C 422,549 408,558 392,558 L 328,558 C 312,558 298,549 296,530 Z"
                fill="url(#zl-maroon)"
              />
              <path d="M 299,472 C 320,464 400,464 421,472" stroke="#A9706C" strokeWidth="3" opacity="0.55" fill="none" />
              <circle cx="360" cy="492" r="9" fill="#F0A243" opacity="0.6" filter="url(#zl-b4)" />
              <circle cx="360" cy="492" r="10" fill="url(#zl-gold)" />
              <circle cx="360" cy="492" r="4.5" fill="#FFD98F" />
            </g>
            <rect x="292" y="632" width="24" height="30" rx="7" fill="url(#zl-goldV)" />
            <circle cx="304" cy="650" r="15" fill="url(#zl-gold)" />
            <circle cx="304" cy="650" r="5" fill="#6E5522" opacity="0.8" />
            <rect x="404" y="632" width="24" height="30" rx="7" fill="url(#zl-goldV)" />
            <circle cx="416" cy="650" r="15" fill="url(#zl-gold)" />
            <circle cx="416" cy="650" r="5" fill="#6E5522" opacity="0.8" />
            <g id="g-upper-l">
              <line x1="198" y1="502" x2="186" y2="552" stroke="url(#zl-creamL)" strokeWidth="50" strokeLinecap="round" />
              <g id="g-fore-l">
                <line x1="184" y1="560" x2="172" y2="628" stroke="url(#zl-creamL)" strokeWidth="54" strokeLinecap="round" />
                <line x1="154" y1="660" x2="151" y2="690" stroke="#DCCDB4" strokeWidth="21" strokeLinecap="round" />
                <line x1="170" y1="664" x2="169" y2="696" stroke="#DCCDB4" strokeWidth="21" strokeLinecap="round" />
                <line x1="186" y1="662" x2="187" y2="692" stroke="#DCCDB4" strokeWidth="21" strokeLinecap="round" />
                <line x1="192" y1="650" x2="201" y2="663" stroke="#DCCDB4" strokeWidth="19" strokeLinecap="round" />
                <line x1="154" y1="660" x2="151" y2="690" stroke="#F5ECDC" strokeWidth="18" strokeLinecap="round" />
                <line x1="170" y1="664" x2="169" y2="696" stroke="#F5ECDC" strokeWidth="18" strokeLinecap="round" />
                <line x1="186" y1="662" x2="187" y2="692" stroke="#F5ECDC" strokeWidth="18" strokeLinecap="round" />
                <line x1="192" y1="650" x2="201" y2="663" stroke="#F5ECDC" strokeWidth="16" strokeLinecap="round" />
                <line x1="153" y1="670" x2="152" y2="676" stroke="#7E4A48" strokeWidth="13" strokeLinecap="round" />
                <line x1="170" y1="676" x2="169" y2="682" stroke="#7E4A48" strokeWidth="13" strokeLinecap="round" />
                <line x1="186" y1="672" x2="187" y2="678" stroke="#7E4A48" strokeWidth="13" strokeLinecap="round" />
                <line x1="196" y1="656" x2="199" y2="660" stroke="#7E4A48" strokeWidth="12" strokeLinecap="round" />
                <circle cx="170" cy="644" r="25" fill="url(#zl-creamR)" />
              </g>
            </g>
            <circle cx="204" cy="472" r="42" fill="url(#zl-creamR)" />
            <ellipse cx="184" cy="462" rx="24" ry="28" fill="url(#zl-gold)" transform="rotate(-22 184 462)" />
            <ellipse cx="184" cy="462" rx="19" ry="23" fill="url(#zl-maroon)" transform="rotate(-22 184 462)" />
            <circle cx="184" cy="462" r="7" fill="url(#zl-gold)" />
            <circle cx="184" cy="462" r="2.5" fill="#6E5522" opacity="0.8" />
            <g id="g-elbow-l" transform="rotate(8 185 557)">
              <rect x="157" y="542" width="56" height="30" rx="8" fill="url(#zl-goldV)" />
              <path
                d="M 160,550 H 210 M 160,557 H 210 M 160,564 H 210"
                stroke="#8A6A2C"
                strokeWidth="2"
                opacity="0.4"
                fill="none"
              />
            </g>
            <g id="g-upper-r">
              <line x1="522" y1="502" x2="534" y2="552" stroke="url(#zl-creamLr)" strokeWidth="50" strokeLinecap="round" />
              <g id="g-fore-r">
                <line x1="536" y1="560" x2="548" y2="628" stroke="url(#zl-creamLr)" strokeWidth="54" strokeLinecap="round" />
                <line x1="566" y1="660" x2="569" y2="690" stroke="#DCCDB4" strokeWidth="21" strokeLinecap="round" />
                <line x1="550" y1="664" x2="551" y2="696" stroke="#DCCDB4" strokeWidth="21" strokeLinecap="round" />
                <line x1="534" y1="662" x2="533" y2="692" stroke="#DCCDB4" strokeWidth="21" strokeLinecap="round" />
                <line x1="528" y1="650" x2="519" y2="663" stroke="#DCCDB4" strokeWidth="19" strokeLinecap="round" />
                <line x1="566" y1="660" x2="569" y2="690" stroke="#F5ECDC" strokeWidth="18" strokeLinecap="round" />
                <line x1="550" y1="664" x2="551" y2="696" stroke="#F5ECDC" strokeWidth="18" strokeLinecap="round" />
                <line x1="534" y1="662" x2="533" y2="692" stroke="#F5ECDC" strokeWidth="18" strokeLinecap="round" />
                <line x1="528" y1="650" x2="519" y2="663" stroke="#F5ECDC" strokeWidth="16" strokeLinecap="round" />
                <line x1="567" y1="670" x2="568" y2="676" stroke="#7E4A48" strokeWidth="13" strokeLinecap="round" />
                <line x1="550" y1="676" x2="551" y2="682" stroke="#7E4A48" strokeWidth="13" strokeLinecap="round" />
                <line x1="534" y1="672" x2="533" y2="678" stroke="#7E4A48" strokeWidth="13" strokeLinecap="round" />
                <line x1="524" y1="656" x2="521" y2="660" stroke="#7E4A48" strokeWidth="12" strokeLinecap="round" />
                <circle cx="550" cy="644" r="25" fill="url(#zl-creamR)" />
              </g>
            </g>
            <circle cx="516" cy="472" r="42" fill="url(#zl-creamR)" />
            <ellipse cx="536" cy="462" rx="24" ry="28" fill="url(#zl-gold)" transform="rotate(22 536 462)" />
            <ellipse cx="536" cy="462" rx="19" ry="23" fill="url(#zl-maroon)" transform="rotate(22 536 462)" />
            <circle cx="536" cy="462" r="7" fill="url(#zl-gold)" />
            <circle cx="536" cy="462" r="2.5" fill="#6E5522" opacity="0.8" />
            <g id="g-elbow-r" transform="rotate(-8 535 557)">
              <rect x="507" y="542" width="56" height="30" rx="8" fill="url(#zl-goldV)" />
              <path
                d="M 510,550 H 560 M 510,557 H 560 M 510,564 H 560"
                stroke="#8A6A2C"
                strokeWidth="2"
                opacity="0.4"
                fill="none"
              />
            </g>
            <g id="g-head">
              <ellipse cx="360" cy="262" rx="220" ry="134" fill="url(#zl-creamR)" />
              <rect x="150" y="196" width="420" height="132" rx="66" fill="url(#zl-creamR)" />
              <g clipPath="url(#zl-headClip)">
                <ellipse cx="360" cy="386" rx="220" ry="54" fill="#D5C9AE" opacity="0.45" filter="url(#zl-b8)" />
                <ellipse cx="290" cy="166" rx="160" ry="48" fill="#FFFFFF" opacity="0.3" filter="url(#zl-b8)" />
                <ellipse cx="566" cy="262" rx="48" ry="92" fill="#D5C9AE" opacity="0.3" filter="url(#zl-b8)" />
              </g>
              <circle cx="138" cy="268" r="38" fill="url(#zl-gold)" />
              <circle cx="138" cy="268" r="30" fill="url(#zl-maroon)" />
              <circle cx="138" cy="268" r="14" fill="url(#zl-creamPod)" />
              <circle cx="582" cy="268" r="38" fill="url(#zl-gold)" />
              <circle cx="582" cy="268" r="30" fill="url(#zl-maroon)" />
              <circle cx="582" cy="268" r="14" fill="url(#zl-creamPod)" />
              <g id="g-antenna">
                <path d="M 136,236 L 126,176" stroke="url(#zl-goldV)" strokeWidth="5" strokeLinecap="round" />
                <circle cx="124" cy="168" r="10" fill="url(#zl-gold)" />
                <circle cx="121" cy="164" r="3" fill="#FFFFFF" opacity="0.55" />
                <circle cx="124" cy="168" r="15" fill="rgba(238,217,164,.4)" filter="url(#zl-b4)" />
              </g>
              <rect x="168" y="170" width="384" height="188" rx="80" fill="#D8CDB5" />
              <rect x="174" y="176" width="372" height="176" rx="74" fill="url(#zl-screen)" />
              <rect x="180" y="182" width="360" height="164" rx="70" fill="none" stroke="#3B3835" strokeWidth="2" opacity="0.35" />
              <path
                d="M 240,206 C 310,182 410,182 480,206 C 486,209 486,216 480,218 C 410,198 310,198 240,218 C 234,216 234,209 240,206 Z"
                fill="#FFFFFF"
                opacity="0.12"
              />
              <ellipse cx="462" cy="214" rx="40" ry="13" fill="#FFFFFF" opacity="0.18" transform="rotate(-20 462 214)" />
              <ellipse cx="258" cy="332" rx="36" ry="10" fill="#FFFFFF" opacity="0.05" transform="rotate(-12 258 332)" />
              <g id="g-eyes">
                <g filter="url(#zl-b4)" opacity="0.85">
                  <ellipse cx="292" cy="254" rx="30" ry="34" fill="none" stroke="#F09F3C" strokeWidth="14" />
                  <ellipse cx="428" cy="254" rx="30" ry="34" fill="none" stroke="#F09F3C" strokeWidth="14" />
                </g>
                <ellipse
                  cx="292"
                  cy="254"
                  rx="30"
                  ry="34"
                  fill="none"
                  stroke="#FFC673"
                  strokeWidth="7.5"
                  strokeDasharray="0.1 10.5"
                  strokeLinecap="round"
                />
                <ellipse
                  cx="428"
                  cy="254"
                  rx="30"
                  ry="34"
                  fill="none"
                  stroke="#FFC673"
                  strokeWidth="7.5"
                  strokeDasharray="0.1 10.5"
                  strokeLinecap="round"
                />
              </g>
              <g id="g-mouth">
                <g id="m-smile">
                  <path
                    d="M 324,298 Q 360,320 396,298"
                    fill="none"
                    stroke="#F09F3C"
                    strokeWidth="12"
                    strokeLinecap="round"
                    filter="url(#zl-b4)"
                    opacity="0.85"
                  />
                  <path
                    d="M 324,298 Q 360,320 396,298"
                    fill="none"
                    stroke="#FFC673"
                    strokeWidth="7.5"
                    strokeDasharray="0.1 9.65"
                    strokeLinecap="round"
                  />
                </g>
                <g id="m-talk" opacity="0">
                  <ellipse
                    id="m-talk-glow"
                    cx="360"
                    cy="308"
                    rx="14"
                    ry="8"
                    fill="none"
                    stroke="#F09F3C"
                    strokeWidth="12"
                    filter="url(#zl-b4)"
                    opacity="0.85"
                  />
                  <ellipse
                    id="m-talk-dots"
                    cx="360"
                    cy="308"
                    rx="14"
                    ry="8"
                    fill="none"
                    stroke="#FFC673"
                    strokeWidth="7"
                    strokeDasharray="0.1 8.2"
                    strokeLinecap="round"
                  />
                </g>
                <g id="m-grin" opacity="0">
                  <path
                    d="M 318,294 Q 360,332 402,294"
                    fill="none"
                    stroke="#F09F3C"
                    strokeWidth="12"
                    strokeLinecap="round"
                    filter="url(#zl-b4)"
                    opacity="0.85"
                  />
                  <path
                    d="M 318,294 Q 360,332 402,294"
                    fill="none"
                    stroke="#FFC673"
                    strokeWidth="7.5"
                    strokeDasharray="0.1 9.4"
                    strokeLinecap="round"
                  />
                </g>
              </g>
            </g>
          </g>

          {/* ستاره‌های شادی */}
          <g fill="#D2AF6C">
            <path
              className="zl-spark"
              d="M 548,150 l 3.2,7.4 7.4,3.2 -7.4,3.2 -3.2,7.4 -3.2,-7.4 -7.4,-3.2 7.4,-3.2 Z"
            />
            <path
              className="zl-spark s2"
              d="M 212,176 l 2.6,6 6,2.6 -6,2.6 -2.6,6 -2.6,-6 -6,-2.6 6,-2.6 Z"
            />
          </g>

          {/* کانتر محصولات */}
          <g>
            <rect x="128" y="498" width="504" height="26" rx="13" fill="url(#zl-counterTop)" />
            <rect x="128" y="498" width="504" height="26" rx="13" fill="none" stroke="#D9C6A6" strokeWidth="1.6" />
            <path
              d="M 150,506 C 240,502 300,512 380,507 C 460,502 540,512 610,507"
              stroke="rgba(201,165,95,.4)"
              strokeWidth="1.2"
              fill="none"
              opacity=".7"
            />
            <path
              d="M 170,514 C 260,510 330,518 420,514"
              stroke="rgba(201,165,95,.25)"
              strokeWidth="1"
              fill="none"
              opacity=".6"
            />
            <rect x="142" y="524" width="476" height="62" rx="14" fill="url(#zl-counterFront)" stroke="#DCC9A8" strokeWidth="1.4" />
            <rect x="142" y="524" width="476" height="10" fill="#C8A97B" opacity=".35" />
            <g>
              <rect x="330" y="540" width="100" height="24" rx="8" fill="#FBF4E4" stroke="url(#zl-goldV)" strokeWidth="1.8" />
              <text x="380" y="557" textAnchor="middle" fontFamily="Marcellus,serif" fontSize="12" letterSpacing="4" fill="#8A6A2C">
                ZHINO
              </text>
            </g>
            <ellipse cx="380" cy="586" rx="240" ry="10" fill="rgba(90,23,37,.14)" filter="url(#zl-b8)" />

            {/* سینی و محصولات روی کانتر */}
            <g>
              <ellipse cx="294" cy="494" rx="80" ry="12" fill="#E4CFA9" />
              <ellipse cx="294" cy="490" rx="80" ry="12" fill="#F0E0C0" stroke="#D2B990" strokeWidth="1.6" />
              {jar(
                'بلوبری',
                174,
                436,
                <>
                  <rect x="0" y="26" width="40" height="34" rx="8" fill="rgba(255,255,255,.55)" stroke="#D9C6A6" strokeWidth="1.4" />
                  <rect x="3.5" y="33" width="33" height="24" rx="6" fill="#6B7FB3" />
                  <ellipse cx="13" cy="40" rx="6" ry="8" fill="#FFFFFF" opacity=".3" />
                  <rect x="-2" y="19" width="44" height="11" rx="5.5" fill="#F5EBD7" stroke="#D9C6A6" strokeWidth="1.1" />
                </>,
                2.4,
              )}
              {jar(
                'انار',
                222,
                440,
                <>
                  <path d="M 2,26 Q 2,50 24,50 Q 46,50 46,26 L 45,18 L 3,18 Z" fill="#C34A57" />
                  <ellipse cx="24" cy="18" rx="21" ry="7" fill="#D6646F" />
                  <ellipse cx="15" cy="30" rx="6" ry="11" fill="#FFFFFF" opacity=".33" />
                  <circle cx="24" cy="18" r="3" fill="#A93C48" />
                </>,
              )}
              <g transform="translate(272 436)">
                <g className="zl-jar zl-custard zl-jelly-inner" data-flavor="کاستر" onClick={onJarClick}>
                  <g className="zl-steam" fill="none" stroke="#C9A97B" strokeWidth="2.6" strokeLinecap="round" opacity=".8">
                    <path d="M 12,4 Q 8,-4 12,-10" />
                    <path d="M 24,2 Q 20,-6 24,-13" />
                    <path d="M 36,4 Q 33,-3 36,-9" />
                  </g>
                  <path d="M 0,22 Q 0,42 24,42 Q 48,42 48,22 L 47,15 L 1,15 Z" fill="#F4E3BC" />
                  <ellipse cx="24" cy="15" rx="23" ry="7.5" fill="#D9A05B" />
                  <ellipse cx="24" cy="13.4" rx="18" ry="5" fill="#C98F4E" />
                  <path d="M 13,13 Q 24,6 35,13 Q 29,16.5 24,15 Q 18,16.5 13,13 Z" fill="#B87B3E" opacity=".85" />
                  <ellipse cx="15" cy="23" rx="4.6" ry="8" fill="#FFFFFF" opacity=".4" />
                </g>
              </g>
              {jar(
                'پرتقال',
                326,
                446,
                <>
                  <path d="M 0,24 Q 0,44 20,44 Q 40,44 40,24 L 39,17 L 1,17 Z" fill="#E28B36" />
                  <ellipse cx="20" cy="17" rx="18" ry="6" fill="#EBA055" />
                  <ellipse cx="12" cy="26" rx="5" ry="9" fill="#FFFFFF" opacity=".33" />
                </>,
                1.2,
              )}
              {/* گنبد شیشه‌ای روی ژلهٔ پرتقال */}
              <g pointerEvents="none">
                <path
                  d="M 322,490 C 322,458 331,448 346,448 C 361,448 370,458 370,490 Z"
                  fill="rgba(255,255,255,.3)"
                  stroke="rgba(180,150,100,.5)"
                  strokeWidth="1.5"
                />
                <path
                  d="M 328,486 C 328,464 334,454 344,451"
                  stroke="rgba(255,255,255,.75)"
                  strokeWidth="2.4"
                  fill="none"
                  strokeLinecap="round"
                  opacity=".8"
                />
                <ellipse cx="346" cy="490" rx="24" ry="4.5" fill="none" stroke="rgba(180,150,100,.45)" strokeWidth="1.4" />
                <circle cx="346" cy="445" r="4" fill="url(#zl-gold)" />
                <ellipse cx="346" cy="492" rx="20" ry="3" fill="rgba(90,23,37,.1)" filter="url(#zl-b4)" />
              </g>
            </g>
          </g>

          {/* لنگرهای برچسب قیمت */}
          <circle ref={jellyAnchorRef} id="zl-anchor-jelly" cx="245" cy="434" r="1" fill="none" opacity="0" />
          <circle ref={custardAnchorRef} id="zl-anchor-custard" cx="302" cy="478" r="1" fill="none" opacity="0" />
        </svg>

        {/* پیل وضعیت — فقط وضعیت ربات، نه وضعیت فنی سرویس */}
        <div className={`zl-status${mode === 'thinking' ? ' is-think' : mode === 'speaking' ? ' is-speak' : ''}`} role="status">
          <i aria-hidden="true" />
          <span>{STATUS_LABEL[mode]}</span>
        </div>

        {/* حباب گفتار ژینو */}
        {bubble.text || bubble.dots ? (
          <div className="zl-speech" aria-live="polite">
            {bubble.dots ? (
              <span className="zl-dots" aria-label="…">
                <span />
                <span />
                <span />
              </span>
            ) : (
              <>
                <span>{bubble.text}</span>
                <span className="zl-caret" aria-hidden="true" />
              </>
            )}
          </div>
        ) : null}

        {/* برچسب قیمت محصولات */}
        <button ref={tagJellyRef} className="zl-tag zl-tag-jelly" type="button" data-prod="jelly" onClick={onProductTag}>
          <i style={{ background: 'var(--jelly-raspberry)' }} aria-hidden="true" />
          ژلهٔ انار · ۲۵۰ گرم
        </button>
        <button ref={tagCustardRef} className="zl-tag zl-tag-custard" type="button" data-prod="custard" onClick={onProductTag}>
          <i style={{ background: '#D9A05B' }} aria-hidden="true" />
          کاستر محلبی · ۲۵۰ گرم
        </button>

        {/* ذرات طلایی معلق */}
        <div className="zl-motes" aria-hidden="true">
          {motes.map((m) => (
            <i
              key={m.id}
              style={{
                width: `${m.size}px`,
                height: `${m.size}px`,
                left: `${m.left}%`,
                top: `${m.top}%`,
                ['--zl-o' as string]: String(m.opacity),
                ['--zl-dx' as string]: `${m.dx}px`,
                animationDuration: `${m.duration}s`,
                animationDelay: `${m.delay}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* پلاک نام */}
      <div className="zl-plaque">
        <span className="zl-plaque-en">SMART&nbsp;ASSISTANT&nbsp;·&nbsp;LOUNGE</span>
        <p className="zl-plaque-title">{ASSISTANT_TAGLINE}</p>
        <span className="zl-rule" aria-hidden="true" />
      </div>
    </section>
  );
});

export default ZhinoLoungeScene;
