// ============================================================
// ZHINO — «استودیوی ژینو» — صحنهٔ میزبان ربات در صفحهٔ /assistant
//
// بازطراحی کامل فضای بالای چت (ترکیب گرمای کانسپت B + سینمایی کانسپت A):
//   • اتاقک/استودیوی اختصاصی ربات: طاق نیش با نور گرمِ نفس‌کش، لامپ
//     آویز با مخروط نور، ریسهٔ نور، قفسهٔ ژله، گلدان، قالیچهٔ زرشکی
//   • میز کوچک کنار ربات با محصولات واقعی فروشگاه (ژلهٔ قالبی، کاستر،
//     گنبد شیشه‌ای) — رنگ و نام از کاتالوگ واقعی، نه تستی
//   • عمق سه‌بعدی: سه لایهٔ پارالاکس (دور/میانه/ربات) که با اشاره‌گر
//     کاربر آرام جابه‌جا می‌شوند + شناوری بسیار ظریف دوربین
//   • ربات قهرمان صحنه است: وسط طاق، تمام‌قد و کمی کوچک‌تر از قبل تا
//     سر، تنه و دست‌ها همیشه با هم در قاب باشند — با پلک، نگاه،
//     تنفس، سلام، فکر کردن، صحبت و حالت خوشحال
//
// حالت‌ها (از گفتگوی واقعی): idle / thinking / speaking / happy
// محصولات صحنه فقط «جزئیات محیط»اند و در شروع گفتگو پنهان‌اند؛ بعد از
// این‌که کاربر سراغ محصولات رفت (productsVisible) روی قفسه و میز ظاهر
// می‌شوند و لمس هر کدام = پرسش واقعی از دستیار (اطلاعات از سیستم واقعی
// فروشگاه). هیچ داده‌ای برای این صحنه ساخته نشده است.
//
// نکته‌های فنی:
//   • انیمیشن‌ها فقط transform/opacity — بدون jank
//   • با تغییر ارتفاع اتاق (حالت چت) viewBox پویا کل صحنه را نشان می‌دهد
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
} from 'react';
import { ASSISTANT_TAGLINE } from './assistantData';
import { FLAVORS } from '../../data/products';
import { useCatalog } from '../../services/catalog';
import './zhino-lounge.css';

export type ZhinoLoungeMode = 'idle' | 'thinking' | 'speaking' | 'happy';

export interface ZhinoLoungeHandle {
  /** سلام ربات — روی ورود به صفحه و شروع گفتگوی تازه */
  wave: () => void;
}

interface Props {
  /** حالت ربات — از وضعیت واقعی گفتگو می‌آید */
  mode?: ZhinoLoungeMode;
  /** گفتگو هنوز تازه است؟ (صحنهٔ بزرگ + حباب خوش‌آمد) */
  fresh?: boolean;
  /** جملهٔ حباب خوش‌آمد */
  welcomeLine?: string;
  /** لمس محصولات صحنه → پرسش واقعی از دستیار */
  onAsk?: (question: string) => void;
  /**
   * محصولاتِ صحنه (قفسه و میز) فقط وقتی کاربر سراغ محصولات رفته
   * نمایش داده می‌شوند؛ در شروع گفتگو صحنه فقط ربات و اتاق است.
   */
  productsVisible?: boolean;
}

/* ── قاب‌بندی صحنه (واحدها = واحدِ viewBox صحنه) ─────────────
   ربات کمی کوچک‌تر شده است (۰/۷۲ → ۰/۶۳) تا سر، تنه و دست‌ها
   همیشه با هم در قاب دیده شوند و صورت به لبهٔ بالای قاب نچسبد.
   پنجرهٔ دید (viewBox) طوری انتخاب می‌شود که بالای سرِ ربات همیشه
   فضا داشته باشد و در حالت گفتگو، دست‌ها پایینِ قاب بمانند. */
const ROBOT_SCALE = 0.63;
const ROBOT_TX = 153.2;
const ROBOT_TY = 84.2;
/** مرکز صحنه — ربات دقیقاً روی همین خط می‌ایستد */
const SCENE_CENTER_X = 380;
/** حالت تازه: کل استودیو (دیوار، طاق، قالیچه) */
const FRAME_FRESH = { y: 0, h: 680 };
/** حالت گفتگو: رباتِ کامل (سر، تنه، دست‌ها و پاها) با حاشیهٔ امن */
const FRAME_CHAT = { y: 80, h: 585 };

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
const SCREEN_STOPS = (
  <>
    <stop offset="0" stopColor="#272524" />
    <stop offset="0.55" stopColor="#141312" />
    <stop offset="1" stopColor="#060605" />
  </>
);

const STATUS_LABEL: Record<ZhinoLoungeMode, string> = {
  idle: 'آنلاین و آمادهٔ گفتگو',
  thinking: 'در حال فکر کردن…',
  speaking: 'در حال پاسخ…',
  happy: 'خوشحال از معرفی محصول',
};

/** موتور زندهٔ ربات + پارالاکس صحنه */
interface LoungeEngine {
  set: (mode: ZhinoLoungeMode) => void;
  wave: () => void;
  grin: (ms: number) => void;
  destroy: () => void;
}

function buildLoungeEngine(root: SVGSVGElement | null, room: HTMLElement | null): LoungeEngine | null {
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
    far: $('zl-far'),
    mid: $('zl-mid'),
    hero: $('zl-hero'),
  } as Record<string, SVGElement | null>;
  if (!els.head || !els.eyes || !els.torso || !els.antenna) return null;

  const R = Math.random;
  const seeds: number[] = [];
  for (let i = 0; i < 16; i++) seeds.push(R() * Math.PI * 2);

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
  const w = { idle: 1, thinking: 0, speaking: 0, happy: 0 };
  const target = { idle: 1, thinking: 0, speaking: 0, happy: 0 };
  let waveT0 = -100;
  let thinkSide = R() < 0.5 ? -1 : 1;
  let speechSeed = R() * 10;
  let clock = 0;
  let grinUntil = -1;
  let happyClassOn = false;

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

  /* نگاه به اشاره‌گر کاربر + پارالاکس لایه‌ها */
  const ptr = { x: 0, y: 0 };
  const ptrT = { x: 0, y: 0 };
  const par = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent) => {
    const host = room ?? root;
    const r = host.getBoundingClientRect();
    if (r.width < 2) return;
    const hx = r.left + r.width * 0.5;
    const hy = r.top + r.height * 0.32;
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
    /* نگاه به اشاره‌گر: هموارتر از قبل تا حرکت چشم پرشی به‌نظر نرسد */
    ptr.x = lerp(ptr.x, ptrT.x, Math.min(1, dt * 3.0));
    ptr.y = lerp(ptr.y, ptrT.y, Math.min(1, dt * 3.0));
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
      } else if (w.happy > 0.4) {
        tx = (R() - 0.5) * 5;
        ty = 1.5 + R() * 1.5;
        hold = 0.7;
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
    const grinOn = t < grinUntil ? 1 : 0;
    const happy = w.happy;
    const bounceEnv = happy * Math.abs(Math.sin(t * Math.PI * 1.15 + 0.4));
    const syl = Math.pow(Math.max(0, Math.sin(t * 2 * Math.PI * 2.7 + speechSeed)), 0.65);
    const gate = clamp(noise(t, 7, 0.5) * 0.9 + 0.62, 0, 1);
    const talkAmp = w.speaking * gate;
    const open = talkAmp * (0.22 + 0.78 * syl);

    /* تنفس: دامنهٔ کمی بیشتر + جابه‌جایی وزنِ خیلی آرام روی پاها،
       تا ایستادنِ ربات مصنوعی/خشک به‌نظر نرسد */
    const brPhase = t * 2 * Math.PI * 0.235 + 0.7 * noise(t, 3, 0.11);
    const br = 1 + reduce * 0.015 * Math.sin(brPhase);
    const torsoTy = reduce * (1.3 * Math.sin(brPhase) - 3.1 * bounceEnv);
    const torsoTx = reduce * (0.85 * noise(t, 15, 0.08) + w.thinking * 0.9 * thinkSide);
    const torsoRot = reduce * (0.5 * noise(t, 9, 0.17) + happy * 1.4 * Math.sin(t * Math.PI * 1.15));

    const hr =
      reduce *
      (1.05 * noise(t, 0, 0.19) +
        w.thinking * (1.6 * Math.sin(t * 0.7 + seeds[2]) + 1.2 * thinkSide) +
        w.speaking * 1.5 * syl * gate +
        happy * 2.4 * Math.sin(t * Math.PI * 1.15 + 0.6) +
        raise * 1.9 * thinkSide * 0.6 +
        ptr.x * 2.6);
    const hx = reduce * (1.4 * noise(t, 1, 0.15) + w.thinking * 1.2 * thinkSide + ptr.x * 2.2);
    const hy =
      reduce *
      (-1.1 * (br - 1) * 90 + w.thinking * 1.4 + happy * -1.6 * bounceEnv + raise * -1.0 + ptr.y * 2.0);

    const antTarget =
      -hr * 1.9 +
      reduce *
        (1.5 * noise(t, 4, 0.55)) *
        (0.55 + w.thinking * 0.9 + raise * 1.1 + w.speaking * 0.5 + happy * 1.6) -
      happy * 6 * Math.sin(t * Math.PI * 2.3);
    antV += ((antTarget - antA) * 46 - antV * 7.5) * dt;
    antA += antV * dt;

    stepGaze(t, dt);
    const bs = blinkScale(t);
    /* چشم‌های خندان: باریک و کمی بالا */
    const happySquint = 1 - 0.52 * happy;
    const squint = (1 - 0.16 * raise) * happySquint;
    const eyeLift = -1.6 * happy;

    const talkOp = clamp(w.speaking * 1.25, 0, 1) * clamp(gate * 2.2, 0, 1);
    const grinOp = clamp(Math.max(raise * 1.1, grinOn, happy), 0, 1);
    const smileOp = clamp(1 - talkOp * 0.92 - grinOp * 0.85, 0, 1);
    const mrx = 13 + 8 * open;
    const mry = 3 + 12 * open;

    /* بازوی چپ: فکر کردن → دست به چانه؛ صحبت → ژست؛ خوشحال → بالا */
    const aL =
      reduce *
        (0.9 * noise(t, 8, 0.21) +
          w.speaking * 2.2 * Math.sin(t * 1.9 + 1.2) * gate +
          w.thinking * -7 +
          happy * -14) -
      happy * 6 * bounceEnv;
    const fL =
      reduce *
        (1.3 * noise(t, 10, 0.29) +
          w.speaking * 5.5 * Math.sin(t * 2 * Math.PI * 0.85 + 0.4) * gate +
          w.thinking * -34) -
      happy * (26 + 7 * Math.sin(t * 6.2));
    const aR = reduce * (0.9 * noise(t, 11, 0.23) + w.thinking * 3) - raise * 107 - happy * (10 + 5 * bounceEnv);
    const fR =
      reduce * (1.3 * noise(t, 12, 0.31)) +
      raise * (-140 + 16 * Math.sin(t * 2 * Math.PI * 1.9 + 0.7)) -
      happy * (22 + 7 * Math.sin(t * 6.2 + 1.3));

    els.torso?.setAttribute(
      'transform',
      `translate(${torsoTx.toFixed(2)} ${torsoTy.toFixed(2)}) rotate(${torsoRot.toFixed(2)} 360 662) translate(360 662) scale(1 ${br.toFixed(4)}) translate(-360 -662)`,
    );
    els.head?.setAttribute(
      'transform',
      `translate(${hx.toFixed(2)} ${hy.toFixed(2)}) rotate(${hr.toFixed(2)} 360 400)`,
    );
    els.antenna?.setAttribute('transform', `rotate(${antA.toFixed(2)} 136 236)`);
    els.eyes?.setAttribute(
      'transform',
      `translate(${gx.toFixed(2)} ${(gy + eyeLift).toFixed(2)}) translate(360 254) scale(1 ${(bs * squint).toFixed(3)}) translate(-360 -254)`,
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

    /* پارالاکس سه‌لایه — عمق استودیو */
    par.x += (ptrT.x - par.x) * Math.min(1, dt * 2.1);
    par.y += (ptrT.y - par.y) * Math.min(1, dt * 2.1);
    const dx = reduce * (par.x + 0.18 * noise(t, 13, 0.12));
    const dy = reduce * (par.y + 0.14 * noise(t, 14, 0.1));
    els.far?.setAttribute('transform', `translate(${(-dx * 4.5).toFixed(2)} ${(-dy * 2.6).toFixed(2)})`);
    els.mid?.setAttribute('transform', `translate(${(-dx * 8.5).toFixed(2)} ${(-dy * 4.6).toFixed(2)})`);
    els.hero?.setAttribute('transform', `translate(${(-dx * 13).toFixed(2)} ${(-dy * 7).toFixed(2)})`);
    if (room) {
      room.style.setProperty('--zl-px', `${(dx * 10).toFixed(2)}px`);
      room.style.setProperty('--zl-py', `${(dy * 6).toFixed(2)}px`);
    }

    /* کلاس حالت خوشحال برای جرقه‌ها/نور CSS */
    const wantHappy = happy > 0.45;
    if (wantHappy !== happyClassOn) {
      happyClassOn = wantHappy;
      root.classList.toggle('zl-is-happy', wantHappy);
    }
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
    destroy: () => {
      if (raf) window.cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
    },
  };
}

const ZhinoLoungeScene = forwardRef<ZhinoLoungeHandle, Props>(function ZhinoLoungeScene(
  { mode = 'idle', fresh = true, welcomeLine, onAsk, productsVisible = false },
  ref,
) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const roomRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<LoungeEngine | null>(null);

  const [bubble, setBubble] = useState<{ text: string; dots?: boolean }>({ text: '' });
  const typeTimerRef = useRef<number | null>(null);

  /* محصولات واقعی فروشگاه برای قفسه و میز استودیو */
  const catalog = useCatalog();
  const shelf = useMemo(() => {
    const jellies = catalog.filter((p) => p.category === 'jelly').slice(0, 3);
    const custard = catalog.find((p) => p.category === 'custard');
    const heroJelly = jellies[0];
    return {
      jellies,
      custard,
      heroJelly,
      jellyColor: heroJelly ? FLAVORS[heroJelly.flavorId]?.color ?? '#C34A57' : '#C34A57',
      shelfColors: jellies.map((p) => FLAVORS[p.flavorId]?.color ?? '#C34A57'),
    };
  }, [catalog]);

  useImperativeHandle(
    ref,
    () => ({
      wave: () => engineRef.current?.wave(),
    }),
    [],
  );

  /* ── موتور زندهٔ ربات ─ */
  useEffect(() => {
    engineRef.current = buildLoungeEngine(svgRef.current, roomRef.current);
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

  /* وقتی کاربر سراغ محصولات می‌رود، ربات با لبخند واکنش نشان می‌دهد —
     همان واکنشی که هنگام لمسِ یک محصول در صحنه می‌گیرد */
  useEffect(() => {
    if (productsVisible) engineRef.current?.grin(1800);
  }, [productsVisible]);

  /* ── حباب گفتار ── */
  const say = (text: string, dots = false) => {
    if (typeTimerRef.current) window.clearInterval(typeTimerRef.current);
    typeTimerRef.current = null;
    if (dots) {
      setBubble({ text: '', dots: true });
      return;
    }
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

  /* ── چیدمان واکنش‌گرا: viewBox پویا ── */
  useEffect(() => {
    const room = roomRef.current;
    const svg = svgRef.current;
    if (!room || !svg) return;

    const layout = () => {
      const rr = room.getBoundingClientRect();
      if (rr.width < 2 || rr.height < 2) return;
      /* حالت تازه: کل استودیو؛ حالت گفتگو: قابِ نیم‌تنه با فضا و
         حاشیهٔ کافی بالای سرِ ربات (صورت هرگز کراپ نمی‌شود).
         همیشه viewBox روی مرکز صحنه قفل است، پس ربات وسط می‌ماند. */
      const frame = fresh ? FRAME_FRESH : FRAME_CHAT;
      const vbh = frame.h;
      const y0 = frame.y;
      const vbw = Math.max(520, Math.min(1600, vbh * (rr.width / rr.height)));
      const x0 = SCENE_CENTER_X - vbw / 2;
      svg.setAttribute('viewBox', `${x0.toFixed(1)} ${y0} ${vbw.toFixed(1)} ${vbh}`);
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

  /* ── لمس محصولات: لرزش نرم + پرسش واقعی از دستیار ── */
  const jiggle = (el: SVGGraphicsElement | null) => {
    if (!el || typeof el.animate !== 'function') return;
    el.animate(
      [
        { transform: 'scale(1,1)' },
        { transform: 'scale(1.05,0.92) rotate(-1.6deg)' },
        { transform: 'scale(0.96,1.05) rotate(1.4deg)' },
        { transform: 'scale(1.02,0.98) rotate(-0.7deg)' },
        { transform: 'scale(1,1)' },
      ],
      { duration: 850, easing: 'cubic-bezier(.36,.07,.19,.97)' },
    );
  };

  const askAbout = (label: string) => {
    engineRef.current?.grin(1500);
    onAsk?.(`قیمت و موجودی ${label} چطور است؟`);
  };

  const onJarClick = (e: ReactMouseEvent<SVGGElement>) => {
    const inner = e.currentTarget.querySelector('.zl-jelly-inner') as SVGGraphicsElement | null;
    jiggle(inner);
    const label = e.currentTarget.getAttribute('data-label');
    if (label) askAbout(label);
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
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        size: 2 + Math.random() * 3.5,
        left: 8 + Math.random() * 84,
        top: 30 + Math.random() * 62,
        opacity: 0.35 + Math.random() * 0.45,
        dx: (Math.random() - 0.5) * 52,
        duration: 11 + Math.random() * 14,
        delay: -Math.random() * 16,
      })),
    [],
  );

  /** شیشهٔ ژله قفسه (جزئیات محیط — رنگ از کاتالوگ واقعی) */
  const shelfJar = (key: string, x: number, color: string, label: string, delay?: number) => (
    <g key={key} transform={`translate(${x} 86)`}>
      <g className="zl-jar zl-wobble zl-tap" data-label={label} style={delay ? { animationDelay: `${delay}s` } : undefined} onClick={onJarClick}>
        <g className="zl-jelly-inner">
          <rect x="0" y="26" width="42" height="38" rx="9" fill="rgba(255,255,255,.5)" stroke="#D9C6A6" strokeWidth="1.4" />
          <rect x="3.2" y="33" width="35.6" height="27.5" rx="6.5" fill={color} />
          <ellipse cx="14" cy="41" rx="6" ry="9" fill="#FFFFFF" opacity=".3" />
          <rect x="-2" y="18.5" width="46" height="11" rx="5.5" fill="#F5EBD7" stroke="#D9C6A6" strokeWidth="1.1" />
          <circle cx="21" cy="24" r="2.4" fill="url(#zl-gold)" />
        </g>
      </g>
    </g>
  );

  return (
    <section className={`zl-hero${fresh ? '' : ' is-compact'}`} aria-label="استودیوی ربات ژینو">
      <div className="zl-room" ref={roomRef}>
        <svg
          ref={svgRef}
          viewBox="0 0 760 680"
          role="img"
          aria-label="استودیوی گرم دستیار ژینو با ربات زنده، قفسهٔ ژله و میز محصولات"
          onClick={onRoomClick}
        >
          <defs>
            {/* userSpaceOnUse: با بزرگ‌تر شدن مستطیل‌ها (پوششِ لبه‌های
                قابِ باریک موبایل) گرادیان ثابت می‌ماند */}
            <linearGradient id="zl-wall" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="574">
              <stop offset="0" stopColor="#F7EEDF" />
              <stop offset="1" stopColor="#EEDFC6" />
            </linearGradient>
            <linearGradient id="zl-band" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="86">
              <stop offset="0" stopColor="#F0DCD6" />
              <stop offset="1" stopColor="#EBD0C8" />
            </linearGradient>
            <radialGradient id="zl-niche" cx="50%" cy="30%" r="76%">
              <stop offset="0" stopColor="#FCEFD6" />
              <stop offset="0.6" stopColor="#F4E2C4" />
              <stop offset="1" stopColor="#E7CFA9" />
            </radialGradient>
            {/* سایهٔ لبه‌های داخلی طاق — حسِ فرورفتگیِ واقعی */}
            <radialGradient id="zl-nicheShade" cx="50%" cy="26%" r="82%">
              <stop offset="0" stopColor="rgba(255,240,210,0)" />
              <stop offset="0.55" stopColor="rgba(160,120,70,0.04)" />
              <stop offset="1" stopColor="rgba(118,82,50,0.24)" />
            </radialGradient>
            {/* سایهٔ زیر تاقچهٔ بالا — عمقِ قاب بالای ربات */}
            <linearGradient id="zl-nicheTop" gradientUnits="userSpaceOnUse" x1="0" y1="138" x2="0" y2="352">
              <stop offset="0" stopColor="rgba(112,76,46,.3)" />
              <stop offset="1" stopColor="rgba(112,76,46,0)" />
            </linearGradient>
            {/* مولدینگ طلاییِ برجسته دور طاق */}
            <linearGradient id="zl-mold" gradientUnits="userSpaceOnUse" x1="0" y1="122" x2="0" y2="572">
              <stop offset="0" stopColor="#F3E1B0" />
              <stop offset="0.42" stopColor="#C9A55F" />
              <stop offset="1" stopColor="#8A6A2C" />
            </linearGradient>
            <linearGradient id="zl-floor" gradientUnits="userSpaceOnUse" x1="0" y1="560" x2="0" y2="680">
              <stop offset="0" stopColor="#EAD9BC" />
              <stop offset="1" stopColor="#DCC49F" />
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
              {CREAM_L_STOPS}
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
              <stop offset="0" stopColor="rgba(255,224,150,.5)" />
              <stop offset="0.6" stopColor="rgba(255,224,150,.14)" />
              <stop offset="1" stopColor="rgba(255,224,150,0)" />
            </radialGradient>
            <radialGradient id="zl-keyGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="rgba(255,232,176,.6)" />
              <stop offset="0.55" stopColor="rgba(255,226,160,.22)" />
              <stop offset="1" stopColor="rgba(255,226,160,0)" />
            </radialGradient>
            <radialGradient id="zl-headHalo" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="rgba(240,216,158,.55)" />
              <stop offset="0.6" stopColor="rgba(240,216,158,.2)" />
              <stop offset="1" stopColor="rgba(240,216,158,0)" />
            </radialGradient>
            <radialGradient id="zl-wineHalo" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="rgba(122,42,54,.18)" />
              <stop offset="1" stopColor="rgba(122,42,54,0)" />
            </radialGradient>
            <linearGradient id="zl-glass" x1="0" y1="0" x2="0.6" y2="1">
              <stop offset="0" stopColor="rgba(255,255,255,.55)" />
              <stop offset="0.5" stopColor="rgba(255,255,255,.16)" />
              <stop offset="1" stopColor="rgba(255,255,255,.05)" />
            </linearGradient>
            <linearGradient id="zl-tableTop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FCF5E7" />
              <stop offset="1" stopColor="#E9D6B6" />
            </linearGradient>
            <clipPath id="zl-headClip">
              <ellipse cx="360" cy="262" rx="220" ry="134" />
              <rect x="150" y="196" width="420" height="132" rx="66" />
            </clipPath>
            <clipPath id="zl-torsoClip">
              <path d="M 212,470 C 212,446 246,432 292,428 C 330,424 390,424 428,428 C 474,433 508,446 508,470 C 514,508 516,554 506,592 C 496,638 434,662 360,662 C 286,662 224,638 214,592 C 204,554 206,508 212,470 Z" />
            </clipPath>
          </defs>

          {/* ═══ لایهٔ دور: دیوار، طاق، نورها، قفسه، گلدان ═══ */}
          <g id="zl-far">
            {/* دیوار/کف تا دور دست کشیده شده‌اند تا در قاب‌های خیلی
                باریک (موبایل) هیچ نوارِ خالی‌ای دیده نشود */}
            <rect x="-1400" y="-600" width="4200" height="1174" fill="url(#zl-wall)" />
            <rect x="-1400" width="4200" height="86" fill="url(#zl-band)" />
            <rect x="-1400" y="86" width="4200" height="6" fill="url(#zl-goldV)" />
            <rect x="-1400" y="92" width="4200" height="2" fill="#8F6E2B" opacity=".35" />
            <rect x="-1400" y="560" width="4200" height="900" fill="url(#zl-floor)" />
            <rect x="-900" y="556" width="3400" height="7" fill="#DFC69F" opacity=".8" />
            <rect x="-900" y="563" width="3400" height="2" fill="#CDB287" opacity=".5" />

            {/* نور کلیدی گرم — آرام جابه‌جا می‌شود */}
            <ellipse id="zl-keylight" cx="380" cy="300" rx="290" ry="250" fill="url(#zl-keyGlow)" />

            {/* طاق نیش پشت ربات — قابِ سه‌بعدی: فرورفتگی، مولدینگ
                برجسته، سایهٔ زیر تاقچه و کلیدسنگ طلایی */}
            <g>
              {/* بدنهٔ فرورفتهٔ طاق */}
              <path d="M 214,566 L 214,300 Q 214,138 380,138 Q 546,138 546,300 L 546,566 Z" fill="url(#zl-niche)" />
              {/* سایهٔ لبه‌های داخلی → عمقِ فرورفتگی */}
              <path d="M 214,566 L 214,300 Q 214,138 380,138 Q 546,138 546,300 L 546,566 Z" fill="url(#zl-nicheShade)" />
              {/* سایهٔ زیر تاقچهٔ بالا → قاب بالای سرِ ربات برجسته‌تر */}
              <path d="M 214,300 Q 214,138 380,138 Q 546,138 546,300 L 546,344 Q 380,300 214,344 Z" fill="url(#zl-nicheTop)" />
              <path
                d="M 214,560 L 214,300 Q 214,138 380,138 Q 546,138 546,300 L 546,560"
                fill="none"
                stroke="#D8BC93"
                strokeWidth="3.4"
                opacity=".85"
              />
              <path
                d="M 227,560 L 227,302 Q 227,151 380,151 Q 533,151 533,302 L 533,560"
                fill="none"
                stroke="#C9A55F"
                strokeWidth="1.4"
                opacity=".5"
                strokeDasharray="1 7"
                strokeLinecap="round"
              />
              {/* مولدینگ برجستهٔ دور طاق + لبهٔ تیره برای جداشدن از دیوار */}
              <path
                d="M 205,572 L 205,300 Q 205,128 380,128 Q 555,128 555,300 L 555,572"
                fill="none"
                stroke="url(#zl-mold)"
                strokeWidth="13"
                strokeLinecap="round"
              />
              <path
                d="M 205,572 L 205,300 Q 205,128 380,128 Q 555,128 555,300 L 555,572"
                fill="none"
                stroke="rgba(94,66,30,.32)"
                strokeWidth="1.6"
              />
              {/* هایلایتِ سمت نور (چپ) و سایهٔ سمت راست → برجستگیِ قاب */}
              <path d="M 214,552 L 214,302 Q 214,140 380,140" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="3" opacity=".5" />
              <path d="M 546,552 L 546,302 Q 546,140 380,140" fill="none" stroke="rgba(118,82,50,.3)" strokeWidth="3.4" />
              {/* کلیدسنگِ طلاییِ بالای طاق */}
              <g>
                <path d="M 380,116 L 397,138 L 380,160 L 363,138 Z" fill="url(#zl-gold)" />
                <path d="M 380,123 L 391,138 L 380,153 L 369,138 Z" fill="url(#zl-maroon)" />
                <circle cx="380" cy="138" r="3.2" fill="url(#zl-gold)" />
              </g>
              <ellipse cx="380" cy="320" rx="158" ry="196" fill="rgba(255,232,178,.42)" filter="url(#zl-b16)" />
              <path
                d="M 262,200 C 246,300 248,430 270,532"
                stroke="rgba(255,255,255,.5)"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                opacity=".35"
                filter="url(#zl-b4)"
              />
              <path
                d="M 500,212 C 514,300 513,420 494,520"
                stroke="rgba(255,255,255,.38)"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                opacity=".22"
                filter="url(#zl-b4)"
              />
            </g>

            {/* ریسهٔ نور روی طاق */}
            <path d="M 214,268 Q 220,162 380,148 Q 540,162 546,268" fill="none" stroke="#C9A55F" strokeWidth="1.6" opacity=".55" />
            <g fill="#F2C879">
              <circle className="zl-bulb" cx="242" cy="216" r="4" />
              <circle className="zl-bulb" cx="270" cy="176" r="4" />
              <circle className="zl-bulb" cx="320" cy="156" r="4" />
              <circle className="zl-bulb" cx="380" cy="150" r="4.6" />
              <circle className="zl-bulb" cx="440" cy="156" r="4" />
              <circle className="zl-bulb" cx="490" cy="176" r="4" />
              <circle className="zl-bulb" cx="518" cy="216" r="4" />
            </g>
            <g fill="url(#zl-bulbG)" opacity=".85">
              <circle className="zl-bulb" cx="242" cy="216" r="10" />
              <circle className="zl-bulb" cx="270" cy="176" r="10" />
              <circle className="zl-bulb" cx="320" cy="156" r="10" />
              <circle className="zl-bulb" cx="380" cy="150" r="13" />
              <circle className="zl-bulb" cx="440" cy="156" r="10" />
              <circle className="zl-bulb" cx="490" cy="176" r="10" />
              <circle className="zl-bulb" cx="518" cy="216" r="10" />
            </g>

            {/* لامپ آویز با مخروط نور روی ربات */}
            <g className="zl-lamp">
              <line x1="380" y1="0" x2="380" y2="44" stroke="#8A6A2C" strokeWidth="2.4" />
              <path d="M 350,76 Q 350,46 380,46 Q 410,46 410,76 Z" fill="#71313B" />
              <path d="M 350,76 Q 350,46 380,46 Q 410,46 410,76" fill="none" stroke="#5A1725" strokeWidth="2" />
              <path d="M 354,70 Q 358,52 380,50" stroke="#A9706C" strokeWidth="2" fill="none" opacity=".6" />
              <rect x="346" y="74" width="68" height="7" rx="3.5" fill="url(#zl-goldV)" />
              <ellipse className="zl-lampGlow" cx="380" cy="86" rx="18" ry="10" fill="#FFE2A0" filter="url(#zl-b4)" />
              <circle cx="380" cy="85" r="5.5" fill="#FFEDBE" />
              <polygon className="zl-cone" points="380,88 262,560 498,560" fill="url(#zl-warmCone)" opacity=".44" />
              <polygon className="zl-cone" points="380,88 330,560 430,560" fill="url(#zl-warmCone)" opacity=".32" />
            </g>

            {/* دو چراغ آویز کناری — عمق و تقارن استودیو */}
            <g className="zl-lamp zl-lamp-side">
              <line x1="64" y1="0" x2="64" y2="196" stroke="#8A6A2C" strokeWidth="1.8" opacity=".8" />
              <path d="M 46,222 Q 46,198 64,198 Q 82,198 82,222 Z" fill="#71313B" />
              <rect x="43" y="220" width="42" height="5" rx="2.5" fill="url(#zl-goldV)" />
              <ellipse className="zl-sconceGlow" cx="64" cy="230" rx="15" ry="9" fill="#FFE2A0" filter="url(#zl-b4)" />
              <circle cx="64" cy="229" r="4.2" fill="#FFEDBE" />
              <polygon className="zl-cone" points="64,232 30,470 98,470" fill="url(#zl-warmCone)" opacity=".35" />
            </g>
            <g className="zl-lamp zl-lamp-side">
              <line x1="696" y1="0" x2="696" y2="248" stroke="#8A6A2C" strokeWidth="1.8" opacity=".8" />
              <path d="M 678,274 Q 678,250 696,250 Q 714,250 714,274 Z" fill="#71313B" />
              <rect x="675" y="272" width="42" height="5" rx="2.5" fill="url(#zl-goldV)" />
              <ellipse className="zl-sconceGlow" cx="696" cy="282" rx="15" ry="9" fill="#FFE2A0" filter="url(#zl-b4)" />
              <circle cx="696" cy="281" r="4.2" fill="#FFEDBE" />
              <polygon className="zl-cone" points="696,284 662,520 730,520" fill="url(#zl-warmCone)" opacity=".35" />
            </g>

            {/* قفسهٔ ژله — تختهٔ قفسه همیشه هست (دکور اتاق)، اما
                شیشه‌های محصول فقط وقتی کاربر سراغ محصولات رفت ظاهر
                می‌شوند تا شروع گفتگو فقط ربات و خوش‌آمدگویی باشد */}
            <g>
              <rect x="86" y="150" width="176" height="12" rx="6" fill="#E0C69E" />
              <rect x="86" y="160" width="176" height="5" rx="2.5" fill="#C8A97B" opacity=".7" />
              <rect x="100" y="162" width="10" height="22" rx="4" fill="url(#zl-goldV)" />
              <rect x="238" y="162" width="10" height="22" rx="4" fill="url(#zl-goldV)" />
              <g className={`zl-products zl-shelf-jars${productsVisible ? ' is-on' : ''}`}>
                {shelf.jellies.map((p, i) => (
                  <g key={p.id} className="zl-product-item" style={{ transitionDelay: `${(i * 0.08).toFixed(2)}s` }}>
                    {shelfJar(p.id, 100 + i * 52, shelf.shelfColors[i], p.shortName, i * 1.7)}
                  </g>
                ))}
              </g>
            </g>

            {/* گلدان سمت راست */}
            <g transform="translate(-64 0)">
              <g className="zl-leaf">
                <path d="M 700,470 C 676,430 668,392 686,352 C 700,386 706,424 712,462 Z" fill="#8FAF6C" />
                <path d="M 704,470 C 722,436 734,404 726,366 C 708,398 700,432 694,464 Z" fill="#7CA653" />
                <path d="M 700,468 C 698,430 702,398 712,376" stroke="#6B8F49" strokeWidth="2" fill="none" opacity=".6" />
              </g>
              <path d="M 682,468 L 724,468 L 716,516 L 690,516 Z" fill="#B14A57" />
              <rect x="678" y="462" width="50" height="12" rx="5" fill="#C45763" />
              <ellipse cx="712" cy="516" rx="26" ry="6" fill="#C9A97B" opacity=".5" filter="url(#zl-b4)" />
            </g>
          </g>

          {/* ═══ لایهٔ میانه: قالیچه، میز کوچک، محصولات ═══ */}
          <g id="zl-mid">
            {/* قالیچهٔ زرشکی */}
            <g>
              <ellipse cx="380" cy="638" rx="250" ry="32" fill="#71313B" />
              <ellipse cx="380" cy="638" rx="250" ry="32" fill="none" stroke="#5A1725" strokeWidth="3" />
              <ellipse
                cx="380"
                cy="638"
                rx="214"
                ry="25"
                fill="none"
                stroke="#C9A55F"
                strokeWidth="1.6"
                strokeDasharray="6 8"
                opacity=".8"
              />
              <ellipse cx="380" cy="638" rx="168" ry="18" fill="none" stroke="#E8D5B5" strokeWidth="1.2" opacity=".55" />
              <circle cx="292" cy="638" r="3.2" fill="#E8D5B5" opacity=".8" />
              <circle cx="380" cy="638" r="3.2" fill="#E8D5B5" opacity=".8" />
              <circle cx="468" cy="638" r="3.2" fill="#E8D5B5" opacity=".8" />
            </g>

            {/* سایهٔ ربات روی قالیچه */}
            <ellipse cx="380" cy="630" rx="140" ry="17" fill="rgba(70,16,27,.2)" filter="url(#zl-b8)" />

            {/* میز کوچک کنار ربات */}
            <g>
              <path d="M 106,514 C 102,548 100,580 102,606" stroke="#C9A55F" strokeWidth="5" fill="none" strokeLinecap="round" />
              <path d="M 186,514 C 190,548 192,580 190,606" stroke="#C9A55F" strokeWidth="5" fill="none" strokeLinecap="round" />
              <path d="M 102,606 L 190,606" stroke="#B08A48" strokeWidth="4" strokeLinecap="round" opacity=".8" />
              <ellipse cx="146" cy="512" rx="72" ry="12" fill="#D9BE93" />
              <ellipse cx="146" cy="507" rx="72" ry="12" fill="url(#zl-tableTop)" stroke="#D2B990" strokeWidth="1.4" />
              <rect x="122" y="524" width="48" height="16" rx="5" fill="#FBF4E4" stroke="url(#zl-goldV)" strokeWidth="1.4" />
              <text x="146" y="535.5" textAnchor="middle" fontFamily="Marcellus,serif" fontSize="8.5" letterSpacing="3" fill="#8A6A2C">
                ZHINO
              </text>

              {/* ژلهٔ قالبی زیر گنبد شیشه‌ای + کاستر — فقط بعد از
                  درخواست محصول توسط کاربر */}
              <g className={`zl-products zl-table-products${productsVisible ? ' is-on' : ''}`}>
                <g className="zl-product-item" style={{ transitionDelay: '0.06s' }}>
                  <g className="zl-jar zl-tap" data-label={shelf.heroJelly?.shortName ?? undefined} onClick={onJarClick}>
                    <g className="zl-jelly-inner">
                      <path d="M 116,502 C 116,484 122,476 134,476 C 146,476 152,484 152,502 Z" fill={shelf.jellyColor} />
                      <path d="M 122,502 C 122,489 126,482 134,482 C 142,482 146,489 146,502 Z" fill="#FFFFFF" opacity=".14" />
                      <ellipse cx="127" cy="487" rx="4.4" ry="7.5" fill="#FFFFFF" opacity=".34" />
                      <ellipse cx="134" cy="503" rx="24" ry="4.5" fill="#E8D5B5" />
                    </g>
                  </g>
                  {/* گنبد شیشه‌ای روی ژله */}
                  <g pointerEvents="none">
                    <path d="M 108,503 C 108,466 118,455 134,455 C 150,455 160,466 160,503 Z" fill="url(#zl-glass)" stroke="rgba(180,150,100,.45)" strokeWidth="1.4" />
                    <path d="M 115,498 C 115,472 121,461 131,458" stroke="rgba(255,255,255,.8)" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".85" />
                    <circle cx="134" cy="452" r="3.6" fill="url(#zl-gold)" />
                  </g>
                </g>

                {/* کاستر روی میز */}
                <g className="zl-product-item" style={{ transitionDelay: '0.16s' }}>
                  <g className="zl-jar zl-tap" data-label={shelf.custard?.shortName ?? undefined} onClick={onJarClick}>
                    <g className="zl-jelly-inner">
                      <g className="zl-steam" fill="none" stroke="#C9A97B" strokeWidth="2.2" strokeLinecap="round" opacity=".8">
                        <path d="M 168,462 Q 165,455 168,450" />
                        <path d="M 178,460 Q 175,452 178,446" />
                      </g>
                      <path d="M 160,480 Q 160,498 178,498 Q 196,498 196,480 L 195,474 L 161,474 Z" fill="#F4E3BC" />
                      <ellipse cx="178" cy="474" rx="17.5" ry="5.6" fill="#D9A05B" />
                      <ellipse cx="178" cy="472.8" rx="13.5" ry="3.8" fill="#C98F4E" />
                      <ellipse cx="171" cy="482" rx="3.6" ry="6" fill="#FFFFFF" opacity=".4" />
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </g>

          {/* ═══ لایهٔ قهرمان: ربات ژینو ═══ */}
          <g id="zl-hero">
            {/* هالهٔ سینمایی پشت سر — ربات از محیط جدا می‌ماند */}
            <ellipse cx="380" cy="300" rx="196" ry="208" fill="url(#zl-wineHalo)" />
            <ellipse className="zl-haloBreath" cx="380" cy="240" rx="132" ry="122" fill="url(#zl-headHalo)" />

            <g
              id="zl-robot"
              transform={`translate(${ROBOT_TX} ${ROBOT_TY}) scale(${ROBOT_SCALE})`}
            >
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
          </g>

          {/* جرقه‌های شادی — فقط در حالت خوشحال می‌درخشند */}
          <g fill="#D2AF6C" className="zl-sparks">
            <path className="zl-spark" d="M 560,140 l 3.4,7.8 7.8,3.4 -7.8,3.4 -3.4,7.8 -3.4,-7.8 -7.8,-3.4 7.8,-3.4 Z" />
            <path className="zl-spark s2" d="M 196,168 l 2.8,6.4 6.4,2.8 -6.4,2.8 -2.8,6.4 -2.8,-6.4 -6.4,-2.8 6.4,-2.8 Z" />
            <path className="zl-spark s3" d="M 610,268 l 2.4,5.6 5.6,2.4 -5.6,2.4 -2.4,5.6 -2.4,-5.6 -5.6,-2.4 5.6,-2.4 Z" />
            <path className="zl-spark s4" d="M 152,300 l 2.4,5.6 5.6,2.4 -5.6,2.4 -2.4,5.6 -2.4,-5.6 -5.6,-2.4 5.6,-2.4 Z" />
          </g>
        </svg>

        {/* پیل وضعیت — فقط حالت ربات */}
        <div
          className={`zl-status${mode === 'thinking' ? ' is-think' : mode === 'speaking' ? ' is-speak' : mode === 'happy' ? ' is-happy' : ''}`}
          role="status"
        >
          <i aria-hidden="true" />
          <span>{STATUS_LABEL[mode]}</span>
        </div>

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

      {/* حباب گفتار ژینو — بیرون از قاب بریده‌شدهٔ اتاق */}
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

      {/* پلاک نام */}
      <div className="zl-plaque">
        <span className="zl-plaque-en">SMART&nbsp;ASSISTANT&nbsp;·&nbsp;STUDIO</span>
        <p className="zl-plaque-title">{ASSISTANT_TAGLINE}</p>
        <span className="zl-rule" aria-hidden="true" />
      </div>
    </section>
  );
});

export default ZhinoLoungeScene;
