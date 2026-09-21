// ============================================================
// ZHINO — «فروشگاه ژینو» — صحنهٔ میزبان ربات در صفحهٔ /assistant
//
// طراحی نهایی (بازطراحی کامل ظاهر):
//   • ربات کاملاً رباتیک با فرم گرد، کوچک و جمع‌وجور — نه خرس،
//     نه حیوان، نه موجود ژله‌ای:
//       – بدنهٔ زرشکی تیره و مات با سطح نرم و لطیف
//       – ترکیب بدنهٔ نرم با جزئیات مکانیکی ظریف (مفصل‌های طلایی
//         شامپاینی: شانه، آرنج، مچ، مچ‌پا؛ نوار کمر، پنل سینه)
//       – چهرهٔ دیجیتالی روی نمایشگر تیره با عمق سه‌بعدی (باز،
//         سایهٔ داخلی، درخشش شیشه) و حالت‌های زنده و دوست‌داشتنی
//       – دست‌های کوتاه و گرد با گیرندهٔ توپ‌شکل و بندهای طلایی
//       – نشان کوچک و ظریف برند (حلقهٔ طلایی با مونوگرام) روی سینه
//       – حالت ایستادهٔ آمادهٔ کمک با ژست دوستانه و حرفه‌ای
//   • محیط: یک فروشگاه کوچک و زیبا برای محصولات ژله و کاستر —
//     پیش‌خوان کرمی با فرم‌های قوسی ظریف، دو ردیف قفسهٔ شناور با
//     نور طلایی زیرسقفی، تابلوی «ژینو»، لامپ آویز با مخروط نور
//     گرم، قورقرهای دیواری، گلدان و لوازم چیدمان بامزه.
//   • رنگ‌بندی برند: زرشکی تیره، عاجی، کرم و طلایی مات.
//   • نورپردازی سینمایی گرم: نور کلیدی نرم پشت ربات، هالهٔ
//     زرشکی کنترل‌شده، نور لبهٔ طلایی روی بدنه — بدون شلوغی.
//   • بدون قاب‌های بزرگ و ویترین‌مانند: ربات کوچک است و فضای
//     اصلی صفحه به چت و محصولات اختصاص دارد.
//
// حالت‌ها (از گفتگوی واقعی): idle / thinking / speaking / happy
// محصولات صحنه فقط «جزئیات محیط»اند و در شروع گفتگو پنهان‌اند؛ بعد از
// این‌که کاربر سراغ محصولات رفت (productsVisible) روی قفسه و پیش‌خوان
// ظاهر می‌شوند و لمس هر کدام = پرسش واقعی از دستیار (داده از کاتالوگ
// واقعی فروشگاه). هیچ داده‌ای برای این صحنه ساخته نشده است.
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
   * محصولاتِ صحنه (قفسه و پیش‌خوان) فقط وقتی کاربر سراغ محصولات رفته
   * نمایش داده می‌شوند؛ در شروع گفتگو صحنه فقط ربات و فروشگاه است.
   */
  productsVisible?: boolean;
}

/* ── قاب‌بندی صحنه (واحدها = واحدِ viewBox صحنه) ─────────────
   رباتِ نهایی کوچک و جمع‌وجور است (مقیاس ۰/۵۵) تا فضای اصلیِ
   صفحه به چت و محصولات بماند. پنجرهٔ دید (viewBox) طوری انتخاب
   می‌شود که بالای سرِ ربات همیشه فضا داشته باشد (دیوار و قفسه‌ها)
   و در حالت گفتگو، دست‌ها پایینِ قاب بمانند. */
const ROBOT_SCALE = 0.55;
const ROBOT_TX = 182;
const ROBOT_TY = 140;
/** مرکز صحنه — ربات دقیقاً روی همین خط می‌ایستد */
const SCENE_CENTER_X = 380;
/** حالت تازه: کل فروشگاه (دیوار، قفسه‌ها، پیش‌خوان، قالیچه) */
const FRAME_FRESH = { y: 0, h: 680 };
/** حالت گفتگو: رباتِ کامل با فضای کافی بالای سر و پیش‌خوان پشت سر */
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
    /* دهان LED متناسب با نمایشگرِ تازه (چهرهٔ جمع‌وجور) */
    const mrx = 9 + 6 * open;
    const mry = 2.5 + 8.5 * open;

    /* بازوی چپ: فکر کردن → دست به سینه؛ صحبت → ژست؛ خوشحال → بالا */
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
          w.thinking * -55) -
      happy * (26 + 7 * Math.sin(t * 6.2));
    const aR = reduce * (0.9 * noise(t, 11, 0.23) + w.thinking * 3) - raise * 118 - happy * (10 + 5 * bounceEnv);
    const fR =
      reduce * (1.3 * noise(t, 12, 0.31)) +
      raise * (-150 + 16 * Math.sin(t * 2 * Math.PI * 1.9 + 0.7)) -
      happy * (22 + 7 * Math.sin(t * 6.2 + 1.3));

    /* لولاها با هندسهٔ رباتِ گرد و جمع‌وجورِ تازه تنظیم شده‌اند:
       تنه (پایین: 360،780)، سر (گردن: 360،520)، آنتن (پایه: 268،244)،
       چشم‌ها (خط چشم: 360،358)، شانه‌ها (243/477،590)، آرنج‌ها (222/498،668) */
    els.torso?.setAttribute(
      'transform',
      `translate(${torsoTx.toFixed(2)} ${torsoTy.toFixed(2)}) rotate(${torsoRot.toFixed(2)} 360 780) translate(360 780) scale(1 ${br.toFixed(4)}) translate(-360 -780)`,
    );
    els.head?.setAttribute(
      'transform',
      `translate(${hx.toFixed(2)} ${hy.toFixed(2)}) rotate(${hr.toFixed(2)} 360 520)`,
    );
    els.antenna?.setAttribute('transform', `rotate(${antA.toFixed(2)} 268 244)`);
    els.eyes?.setAttribute(
      'transform',
      `translate(${gx.toFixed(2)} ${(gy + eyeLift).toFixed(2)}) translate(360 358) scale(1 ${(bs * squint).toFixed(3)}) translate(-360 -358)`,
    );
    els.armL?.setAttribute('transform', `rotate(${aL.toFixed(2)} 243 590)`);
    els.foreL?.setAttribute('transform', `rotate(${fL.toFixed(2)} 222 668)`);
    els.elbowL?.setAttribute('transform', `rotate(${aL.toFixed(2)} 243 590) rotate(8 222 668)`);
    els.armR?.setAttribute('transform', `rotate(${aR.toFixed(2)} 477 590)`);
    els.foreR?.setAttribute('transform', `rotate(${fR.toFixed(2)} 498 668)`);
    els.elbowR?.setAttribute('transform', `rotate(${aR.toFixed(2)} 477 590) rotate(-8 498 668)`);
    els.smile?.setAttribute('opacity', smileOp.toFixed(3));
    els.talk?.setAttribute('opacity', talkOp.toFixed(3));
    els.grin?.setAttribute('opacity', grinOp.toFixed(3));
    els.talkGlow?.setAttribute('rx', mrx.toFixed(2));
    els.talkGlow?.setAttribute('ry', mry.toFixed(2));
    els.talkDots?.setAttribute('rx', mrx.toFixed(2));
    els.talkDots?.setAttribute('ry', mry.toFixed(2));

    /* پارالاکس سه‌لایه — عمق فروشگاه */
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

  /* محصولات واقعی فروشگاه برای قفسه و پیش‌خوان */
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
      /* حالت تازه: کل فروشگاه؛ حالت گفتگو: قابِ نیم‌تنه با فضا و
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

  /** شیشهٔ ژلهٔ قفسه (جزئیات محیط — رنگ از کاتالوگ واقعی) */
  const shelfJar = (key: string, x: number, shelfY: number, color: string, label: string, delay?: number) => (
    <g key={key} transform={`translate(${x} ${shelfY - 63})`}>
      <g className="zl-jar zl-wobble zl-tap" data-label={label} style={delay ? { animationDelay: `${delay}s` } : undefined} onClick={onJarClick}>
        <g className="zl-jelly-inner">
          <ellipse cx="21" cy="62.5" rx="16.5" ry="2.6" fill="#421019" opacity=".14" />
          <rect x="2.5" y="21" width="37" height="40" rx="10" fill="rgba(255,255,255,.55)" stroke="#D9C6A6" strokeWidth="1.3" />
          <rect x="5.5" y="29" width="31" height="29.5" rx="7.5" fill={color} />
          <rect x="5.5" y="29" width="31" height="8" rx="4" fill="#FFFFFF" opacity=".14" />
          <ellipse cx="12.5" cy="39" rx="4.6" ry="8" fill="#FFFFFF" opacity=".3" />
          <rect x="0" y="11.5" width="42" height="12.5" rx="6" fill="#F5EBD7" stroke="#D9C6A6" strokeWidth="1.1" />
          <rect x="2.5" y="13.5" width="37" height="3" rx="1.5" fill="#E4D5B8" />
          <circle cx="21" cy="19" r="2.1" fill="url(#zl-gold)" />
        </g>
      </g>
    </g>
  );

  /** تختهٔ قفسهٔ شناور با پراکندگی طلایی زیر سقف (دکور فروشگاه) */
  const shelfBoard = (x: number, y: number) => (
    <g>
      <rect x={x} y={y} width="205" height="11" rx="5.5" fill="#E0C69E" />
      <rect x={x + 4} y={y + 10} width="197" height="3.5" rx="1.75" fill="#C8A97B" opacity=".65" />
      <rect x={x + 14} y={y + 11} width="8" height="18" rx="4" fill="url(#zl-goldV)" opacity=".9" />
      <rect x={x + 183} y={y + 11} width="8" height="18" rx="4" fill="url(#zl-goldV)" opacity=".9" />
      <rect x={x + 6} y={y + 13} width="193" height="16" fill="url(#zl-shelfGlow)" opacity=".55" />
    </g>
  );

  /** لیوان کاسترِ چیدمانی (کرمی — بدون دادهٔ محصول) */
  const custardCup = (x: number, y: number, s = 1) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M -12,0 L -9.5,-13 L 9.5,-13 L 12,0 Z" fill="#F4E3BC" stroke="#D9B98A" strokeWidth="0.8" />
      <ellipse cx="0" cy="-13" rx="9.5" ry="3" fill="#D9A05B" />
      <ellipse cx="0" cy="-13.6" rx="6.5" ry="2" fill="#C98F4E" opacity=".8" />
      <path d="M -8,-3 L 8,-3" stroke="#E4CFA4" strokeWidth="0.8" opacity=".7" />
    </g>
  );

  /** گلدان کوچک (دکور بامزهٔ فروشگاه) */
  const plant = (x: number, y: number, s = 1) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="zl-leaf">
        <path d="M 0,-26 C -10,-38 -12,-52 -4,-64 C 2,-50 2,-36 2,-26 Z" fill="#8FAF6C" />
        <path d="M 1,-26 C 10,-36 14,-48 8,-60 C 0,-48 -2,-36 -1,-26 Z" fill="#7CA653" />
        <path d="M 0,-28 C 0,-40 1,-50 4,-58" stroke="#6B8F49" strokeWidth="1.2" fill="none" opacity=".6" />
      </g>
      <path d="M -11,-26 L 11,-26 L 8,0 L -8,0 Z" fill="#9A4A55" />
      <rect x="-12" y="-29" width="24" height="5" rx="2.5" fill="#B14A57" />
    </g>
  );

  /** خطِ پنل‌بندی ظریف دیوار (صحنه ۷۶۰px + حاشیه برای قاب‌های باریک) */
  const wallPanels = useMemo(
    () => Array.from({ length: 21 }, (_, i) => -380 + i * 95),
    [],
  );

  return (
    <section className={`zl-hero${fresh ? '' : ' is-compact'}`} aria-label="فروشگاه دستیار ژینو">
      <div className="zl-room" ref={roomRef}>
        <svg
          ref={svgRef}
          viewBox="0 0 760 680"
          role="img"
          aria-label="فروشگاه گرم ژینو: ربات دستیار زرشکیِ کوچک جلوی پیش‌خوان، قفسه‌های ژله و کاستر و نور طلایی"
          onClick={onRoomClick}
        >
          <defs>
            {/* ── فضای فروشگاه ── */}
            <linearGradient id="zl-wall" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="520">
              <stop offset="0" stopColor="#F9F1E2" />
              <stop offset="1" stopColor="#EBD9BD" />
            </linearGradient>
            <linearGradient id="zl-floor" gradientUnits="userSpaceOnUse" x1="0" y1="520" x2="0" y2="680">
              <stop offset="0" stopColor="#E9D8B8" />
              <stop offset="1" stopColor="#D9C29B" />
            </linearGradient>
            <linearGradient id="zl-counterFront" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F5EBD6" />
              <stop offset="1" stopColor="#E5D2B2" />
            </linearGradient>
            <linearGradient id="zl-tableTop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FCF5E7" />
              <stop offset="1" stopColor="#E9D6B6" />
            </linearGradient>
            <linearGradient id="zl-shelfGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgba(234,208,151,.5)" />
              <stop offset="1" stopColor="rgba(234,208,151,0)" />
            </linearGradient>
            <linearGradient id="zl-plaqueG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FBF4E4" />
              <stop offset="1" stopColor="#EFDFC4" />
            </linearGradient>

            {/* ── نورپردازی سینمایی گرم ── */}
            <radialGradient id="zl-keyGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="rgba(255,232,176,.55)" />
              <stop offset="0.55" stopColor="rgba(255,226,160,.2)" />
              <stop offset="1" stopColor="rgba(255,226,160,0)" />
            </radialGradient>
            <radialGradient id="zl-bulbG" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#FFE9B8" />
              <stop offset="0.55" stopColor="rgba(255,222,150,.55)" />
              <stop offset="1" stopColor="rgba(255,222,150,0)" />
            </radialGradient>
            <radialGradient id="zl-warmCone" cx="50%" cy="0%" r="100%">
              <stop offset="0" stopColor="rgba(255,224,150,.45)" />
              <stop offset="0.6" stopColor="rgba(255,224,150,.12)" />
              <stop offset="1" stopColor="rgba(255,224,150,0)" />
            </radialGradient>
            <radialGradient id="zl-headHalo" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="rgba(240,216,158,.5)" />
              <stop offset="0.6" stopColor="rgba(240,216,158,.18)" />
              <stop offset="1" stopColor="rgba(240,216,158,0)" />
            </radialGradient>
            <radialGradient id="zl-wineHalo" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="rgba(122,42,54,.16)" />
              <stop offset="1" stopColor="rgba(122,42,54,0)" />
            </radialGradient>

            {/* ── فلز و جنس ── */}
            <linearGradient id="zl-goldV" x1="0" y1="0" x2="0" y2="1">
              {GOLD_V_STOPS}
            </linearGradient>
            <radialGradient id="zl-gold" cx="35%" cy="30%" r="85%">
              {GOLD_STOPS}
            </radialGradient>
            <linearGradient id="zl-shade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7E3A48" />
              <stop offset="1" stopColor="#4E1A28" />
            </linearGradient>
            <linearGradient id="zl-glass" x1="0" y1="0" x2="0.6" y2="1">
              <stop offset="0" stopColor="rgba(255,255,255,.55)" />
              <stop offset="0.5" stopColor="rgba(255,255,255,.16)" />
              <stop offset="1" stopColor="rgba(255,255,255,.05)" />
            </linearGradient>

            {/* ── ربات: زرشکی تیره و مات ── */}
            <linearGradient id="zl-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8A4653" />
              <stop offset="0.45" stopColor="#71313B" />
              <stop offset="1" stopColor="#4A1826" />
            </linearGradient>
            <radialGradient id="zl-bodyR" cx="38%" cy="30%" r="80%">
              <stop offset="0" stopColor="#95505E" />
              <stop offset="0.55" stopColor="#71313B" />
              <stop offset="1" stopColor="#4A1826" />
            </radialGradient>
            <linearGradient id="zl-bodyL" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#8F4C5B" />
              <stop offset="0.6" stopColor="#66303F" />
              <stop offset="1" stopColor="#4A1826" />
            </linearGradient>
            <linearGradient id="zl-leg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#55202E" />
              <stop offset="1" stopColor="#3A0F1B" />
            </linearGradient>
            <linearGradient id="zl-foot" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4A1826" />
              <stop offset="1" stopColor="#2E0913" />
            </linearGradient>
            <linearGradient id="zl-bezel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4E1A28" />
              <stop offset="1" stopColor="#350E19" />
            </linearGradient>
            <radialGradient id="zl-screen" cx="46%" cy="32%" r="85%">
              <stop offset="0" stopColor="#26201F" />
              <stop offset="0.55" stopColor="#120D0E" />
              <stop offset="1" stopColor="#070505" />
            </radialGradient>
            <radialGradient id="zl-eyeGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="rgba(255,214,138,.5)" />
              <stop offset="0.7" stopColor="rgba(255,214,138,.18)" />
              <stop offset="1" stopColor="rgba(255,214,138,0)" />
            </radialGradient>
            <radialGradient id="zl-eyeCore" cx="42%" cy="36%" r="75%">
              <stop offset="0" stopColor="#FFF6DC" />
              <stop offset="0.5" stopColor="#FFDF9E" />
              <stop offset="1" stopColor="#F0B465" />
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
            <clipPath id="zl-headClip">
              <circle cx="360" cy="372" r="158" />
            </clipPath>
            <clipPath id="zl-torsoClip">
              <rect x="245" y="545" width="230" height="235" rx="98" />
            </clipPath>
          </defs>

          {/* ═══ لایهٔ دور: دیوار، نور، تابلو، قفسه‌ها ═══ */}
          <g id="zl-far">
            {/* دیوار و کف تا دور دست کشیده شده‌اند تا در قاب‌های خیلی
                باریک (موبایل) هیچ نوارِ خالی‌ای دیده نشود */}
            <rect x="-1400" y="-600" width="4200" height="1120" fill="url(#zl-wall)" />
            <rect x="-1400" y="520" width="4200" height="1200" fill="url(#zl-floor)" />

            {/* پنل‌بندی ظریف دیوار (خط‌های عمودی کم‌رنگ) */}
            <g stroke="#C9A87C" strokeWidth="1.4" opacity=".12">
              {wallPanels.map((x) => (
                <line key={x} x1={x} y1="78" x2={x} y2="512" />
              ))}
            </g>
            {/* خط طلایی ماتِ بالای دیوار */}
            <rect x="-1400" y="56" width="4200" height="3" fill="url(#zl-goldV)" opacity=".5" />
            <rect x="-1400" y="59" width="4200" height="2.5" fill="#A8814A" opacity=".3" />

            {/* نوار تاج‌بندی و خط کف */}
            <rect x="-1400" y="511" width="4200" height="2" fill="url(#zl-goldV)" opacity=".55" />
            <rect x="-1400" y="512" width="4200" height="8" fill="#DCC49F" />
            <rect x="-1400" y="519" width="4200" height="2" fill="#C9AC82" opacity=".6" />

            {/* نور کلیدی گرم — آرام جابه‌جا می‌شود */}
            <ellipse id="zl-keylight" cx="380" cy="296" rx="300" ry="245" fill="url(#zl-keyGlow)" />

            {/* دو قورقر دیواری — عمق و تقارن فروشگاه */}
            <g className="zl-lamp zl-lamp-side">
              <rect x="66" y="176" width="16" height="34" rx="8" fill="url(#zl-goldV)" />
              <circle cx="74" cy="214" r="5.5" fill="#FFEDBE" />
              <ellipse className="zl-sconceGlow" cx="74" cy="216" rx="14" ry="9" fill="#FFE2A0" filter="url(#zl-b4)" />
              <polygon className="zl-cone" points="74,218 44,330 104,330" fill="url(#zl-warmCone)" opacity=".22" />
            </g>
            <g className="zl-lamp zl-lamp-side">
              <rect x="678" y="176" width="16" height="34" rx="8" fill="url(#zl-goldV)" />
              <circle cx="686" cy="214" r="5.5" fill="#FFEDBE" />
              <ellipse className="zl-sconceGlow" cx="686" cy="216" rx="14" ry="9" fill="#FFE2A0" filter="url(#zl-b4)" />
              <polygon className="zl-cone" points="686,218 656,330 716,330" fill="url(#zl-warmCone)" opacity=".22" />
            </g>

            {/* لامپ آویز با مخروط نور گرم روی ربات */}
            <g className="zl-lamp">
              <line x1="380" y1="0" x2="380" y2="62" stroke="#8A6A2C" strokeWidth="2.4" />
              <circle cx="380" cy="64" r="5" fill="url(#zl-goldV)" />
              <path d="M 348,100 Q 348,64 380,64 Q 412,64 412,100 Z" fill="url(#zl-shade)" />
              <path d="M 354,74 Q 358,66 372,65" stroke="#A9706C" strokeWidth="1.6" fill="none" opacity=".5" />
              <rect x="344" y="98" width="72" height="7" rx="3.5" fill="url(#zl-goldV)" />
              <ellipse className="zl-lampGlow" cx="380" cy="110" rx="20" ry="10" fill="#FFE2A0" filter="url(#zl-b4)" />
              <circle cx="380" cy="108" r="5" fill="#FFEDBE" />
              <polygon className="zl-cone" points="380,112 268,520 492,520" fill="url(#zl-warmCone)" opacity=".4" />
              <polygon className="zl-cone" points="380,112 330,520 430,520" fill="url(#zl-warmCone)" opacity=".3" />
            </g>

            {/* تابلوی کوچک «ژینو» — بدون شلوغی، فقط هویت */}
            <g>
              <line x1="380" y1="105" x2="380" y2="124" stroke="#8A6A2C" strokeWidth="1.6" />
              <rect x="334" y="124" width="92" height="42" rx="14" fill="url(#zl-plaqueG)" stroke="url(#zl-goldV)" strokeWidth="1.8" />
              <rect x="338.5" y="128.5" width="83" height="33" rx="10.5" fill="none" stroke="#C9A55F" strokeWidth="0.8" opacity=".5" />
              <circle cx="344" cy="145" r="1.6" fill="#C9A55F" />
              <circle cx="416" cy="145" r="1.6" fill="#C9A55F" />
              <text x="380" y="153" textAnchor="middle" fontFamily="Vazirmatn, sans-serif" fontSize="21" fontWeight="700" fill="#6B2836">
                ژینو
              </text>
            </g>

            {/* چهار قفسهٔ شناور — تخته‌ها همیشه هست (دکور فروشگاه)؛
                شیشه‌های محصول فقط وقتی کاربر سراغ محصولات رفت ظاهر
                می‌شوند تا شروع گفتگو فقط ربات و فروشگاه باشد */}
            {shelfBoard(100, 140)}
            {shelfBoard(455, 140)}
            {shelfBoard(100, 235)}
            {shelfBoard(455, 235)}

            {/* چیدمان‌های بامزهٔ ثابت: لیوان‌ها، گلدان، زنگ و بشقاب */}
            <g>
              {custardCup(512, 140)}
              {custardCup(510, 126, 0.94)}
              {custardCup(513, 113, 0.9)}
              {custardCup(600, 140, 1.1)}
              <path d="M 638,140 C 638,128 644,122 650,122 C 656,122 662,128 662,140 Z" fill="url(#zl-gold)" />
              <ellipse cx="650" cy="140" rx="12" ry="3" fill="#8F6E2B" />
              <circle cx="650" cy="121" r="2" fill="#8F6E2B" />
              {plant(152, 235, 1.05)}
              {custardCup(212, 235)}
              {custardCup(243, 235, 0.92)}
              <ellipse cx="540" cy="232" rx="21" ry="4.5" fill="#F4E8D2" stroke="#D9C6A6" strokeWidth="1" />
              <ellipse cx="540" cy="227" rx="17.5" ry="3.8" fill="#F8EFDD" stroke="#D9C6A6" strokeWidth="0.8" />
              <ellipse cx="540" cy="222" rx="14" ry="3.2" fill="#F4E8D2" stroke="#D9C6A6" strokeWidth="0.8" />
              {plant(612, 235, 0.9)}
            </g>

            {/* شیشه‌های ژلهٔ واقعی — فقط بعد از درخواست کاربر */}
            <g className={`zl-products zl-shelf-jars${productsVisible ? ' is-on' : ''}`}>
              {shelf.jellies.map((p, i) => (
                <g key={p.id} className="zl-product-item" style={{ transitionDelay: `${(i * 0.08).toFixed(2)}s` }}>
                  {shelfJar(p.id, 116 + i * 50, 140, shelf.shelfColors[i], p.shortName, i * 1.7)}
                </g>
              ))}
            </g>
          </g>

          {/* ═══ لایهٔ میانه: پیش‌خوان، قالیچه، محصولات ═══ */}
          <g id="zl-mid">
            {/* سایهٔ پیش‌خوان روی کف */}
            <ellipse cx="380" cy="517" rx="300" ry="9" fill="rgba(122,82,40,.18)" filter="url(#zl-b8)" />

            {/* پیش‌خوان کرمی با فرم‌های قوسی ظریف */}
            <g>
              <rect x="84" y="394" width="592" height="13" rx="6.5" fill="url(#zl-tableTop)" />
              <rect x="84" y="405.5" width="592" height="2.5" fill="url(#zl-goldV)" opacity=".8" />
              <rect x="92" y="408" width="576" height="104" fill="url(#zl-counterFront)" />
              <g stroke="rgba(201,165,95,.35)" strokeWidth="1.2" fill="rgba(160,116,60,.1)">
                <path d="M 114,505 L 114,452 Q 114,428 150,428 Q 186,428 186,452 L 186,505 Z" />
                <path d="M 214,505 L 214,452 Q 214,428 250,428 Q 286,428 286,452 L 286,505 Z" />
                <path d="M 474,505 L 474,452 Q 474,428 510,428 Q 546,428 546,452 L 546,505 Z" />
                <path d="M 574,505 L 574,452 Q 574,428 610,428 Q 646,428 646,452 L 646,505 Z" />
              </g>
              <rect x="92" y="505" width="576" height="7" fill="#C9A97B" opacity=".3" />
            </g>

            {/* چیدمانِ ثابت روی پیش‌خوان: گلدان و بشقاب */}
            {plant(140, 396, 1.1)}
            <g transform="translate(640 396)">
              <ellipse cx="0" cy="-3" rx="21" ry="4.5" fill="#F4E8D2" stroke="#D9C6A6" strokeWidth="1" />
              <ellipse cx="0" cy="-8" rx="17.5" ry="3.8" fill="#F8EFDD" stroke="#D9C6A6" strokeWidth="0.8" />
              <ellipse cx="0" cy="-13" rx="14" ry="3.2" fill="#F4E8D2" stroke="#D9C6A6" strokeWidth="0.8" />
            </g>

            {/* قالیچهٔ زرشکی کوچک زیر ربات */}
            <g>
              <ellipse cx="380" cy="616" rx="205" ry="30" fill="#71313B" />
              <ellipse cx="380" cy="616" rx="205" ry="30" fill="none" stroke="#5A1725" strokeWidth="3" />
              <ellipse
                cx="380"
                cy="616"
                rx="172"
                ry="24"
                fill="none"
                stroke="#C9A55F"
                strokeWidth="1.5"
                strokeDasharray="6 8"
                opacity=".75"
              />
              <ellipse cx="380" cy="616" rx="134" ry="18" fill="none" stroke="#E8D5B5" strokeWidth="1.2" opacity=".5" />
              <circle cx="308" cy="616" r="3" fill="#E8D5B5" opacity=".8" />
              <circle cx="380" cy="616" r="3" fill="#E8D5B5" opacity=".8" />
              <circle cx="452" cy="616" r="3" fill="#E8D5B5" opacity=".8" />
            </g>

            {/* سایهٔ ربات روی قالیچه */}
            <ellipse cx="380" cy="612" rx="118" ry="13" fill="rgba(70,16,27,.2)" filter="url(#zl-b8)" />

            {/* محصولات واقعی پیش‌خوان — فقط بعد از درخواست کاربر */}
            <g className={`zl-products zl-table-products${productsVisible ? ' is-on' : ''}`}>
              {/* ژلهٔ قالبی زیر گنبد شیشه‌ای */}
              <g className="zl-product-item" style={{ transitionDelay: '0.06s' }}>
                <g transform="translate(235 396)">
                  <g className="zl-jar zl-tap" data-label={shelf.heroJelly?.shortName ?? undefined} onClick={onJarClick}>
                    <g className="zl-jelly-inner">
                      <ellipse cx="0" cy="0" rx="27" ry="4.5" fill="#E8D5B5" />
                      <path d="M -23,-2 C -23,-18 -16,-27 0,-27 C 16,-27 23,-18 23,-2 Z" fill={shelf.jellyColor} />
                      <path d="M -17,-2 C -17,-14 -12,-20 -4,-22" stroke="#FFFFFF" strokeWidth="3" fill="none" opacity=".3" strokeLinecap="round" />
                    </g>
                  </g>
                  {/* گنبد شیشه‌ای روی ژله */}
                  <g pointerEvents="none">
                    <path d="M -30,-1 C -30,-38 -18,-53 0,-53 C 18,-53 30,-38 30,-1 Z" fill="url(#zl-glass)" stroke="rgba(180,150,100,.45)" strokeWidth="1.4" />
                    <path d="M -22,-8 C -22,-35 -14,-46 -4,-49" stroke="rgba(255,255,255,.8)" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".85" />
                    <circle cx="0" cy="-56" r="3.6" fill="url(#zl-gold)" />
                  </g>
                </g>
              </g>

              {/* کاستر روی پیش‌خوان */}
              <g className="zl-product-item" style={{ transitionDelay: '0.16s' }}>
                <g transform="translate(535 396)">
                  <g className="zl-jar zl-tap" data-label={shelf.custard?.shortName ?? undefined} onClick={onJarClick}>
                    <g className="zl-jelly-inner">
                      <g className="zl-steam" fill="none" stroke="#C9A97B" strokeWidth="2.2" strokeLinecap="round" opacity=".8">
                        <path d="M -8,-30 Q -11,-38 -8,-44" />
                        <path d="M 3,-32 Q 0,-40 3,-47" />
                      </g>
                      <path d="M -17,0 L -14.5,-22 L 14.5,-22 L 17,0 Z" fill="#F4E3BC" />
                      <ellipse cx="0" cy="-22" rx="14.5" ry="4.6" fill="#D9A05B" />
                      <ellipse cx="0" cy="-23" rx="11" ry="3" fill="#C98F4E" />
                      <ellipse cx="-7" cy="-11" rx="3.4" ry="6" fill="#FFFFFF" opacity=".4" />
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </g>

          {/* ═══ لایهٔ قهرمان: ربات ژینو — زرشکی، گرد، جمع‌وجور ═══ */}
          <g id="zl-hero">
            {/* هاله‌های سینمایی پشت ربات — جدا می‌ماند ولی در فروشگاه می‌درخشد */}
            <ellipse cx="380" cy="340" rx="200" ry="205" fill="url(#zl-wineHalo)" />
            <ellipse className="zl-haloBreath" cx="380" cy="344" rx="128" ry="118" fill="url(#zl-headHalo)" />

            <g id="zl-robot" transform={`translate(${ROBOT_TX} ${ROBOT_TY}) scale(${ROBOT_SCALE})`}>
              {/* ── پاها: کوتاه و گرد با کفش زرشکی ── */}
              <g className="zl-legs">
                <line x1="318" y1="770" x2="311" y2="828" stroke="url(#zl-leg)" strokeWidth="40" strokeLinecap="round" />
                <circle cx="311" cy="832" r="13.5" fill="url(#zl-goldV)" />
                <circle cx="311" cy="832" r="7" fill="#3E111B" />
                <ellipse cx="307" cy="851" rx="30" ry="16.5" fill="url(#zl-foot)" />
                <path d="M 281,856 Q 307,866 333,856" stroke="url(#zl-goldV)" strokeWidth="2" fill="none" opacity=".5" />
                <ellipse cx="297" cy="845" rx="11" ry="5.5" fill="#FFFFFF" opacity=".07" />
                <line x1="402" y1="770" x2="409" y2="828" stroke="url(#zl-leg)" strokeWidth="40" strokeLinecap="round" />
                <circle cx="409" cy="832" r="13.5" fill="url(#zl-goldV)" />
                <circle cx="409" cy="832" r="7" fill="#3E111B" />
                <ellipse cx="413" cy="851" rx="30" ry="16.5" fill="url(#zl-foot)" />
                <path d="M 387,856 Q 413,866 439,856" stroke="url(#zl-goldV)" strokeWidth="2" fill="none" opacity=".5" />
                <ellipse cx="403" cy="845" rx="11" ry="5.5" fill="#FFFFFF" opacity=".07" />
              </g>

              {/* ── گردن طلایی (اتصال سر و تنه) ── */}
              <rect x="326" y="506" width="68" height="48" rx="16" fill="url(#zl-goldV)" />
              <rect x="332" y="508" width="56" height="10" rx="5" fill="#8A6A2C" opacity=".4" />

              {/* ── تنهٔ گرد: زرشکی تیره و مات ── */}
              <g id="g-torso">
                <rect x="245" y="545" width="230" height="235" rx="98" fill="url(#zl-body)" />
                <g clipPath="url(#zl-torsoClip)">
                  <ellipse cx="322" cy="588" rx="96" ry="42" fill="#FFFFFF" opacity=".12" filter="url(#zl-b16)" />
                  <ellipse cx="480" cy="665" rx="42" ry="112" fill="#2E0913" opacity=".28" filter="url(#zl-b16)" />
                  <ellipse cx="360" cy="778" rx="112" ry="28" fill="#2E0913" opacity=".3" filter="url(#zl-b8)" />
                  {/* نوار کمر طلایی مات */}
                  <rect x="245" y="737" width="230" height="10" fill="url(#zl-goldV)" opacity=".85" />
                  <rect x="245" y="747" width="230" height="2.5" fill="#2E0913" opacity=".3" />
                </g>
                {/* نور لبهٔ طلایی (سینمایی) */}
                <path d="M 254,616 Q 254,562 316,550" fill="none" stroke="#F5D9A0" strokeWidth="4.5" strokeLinecap="round" opacity=".26" filter="url(#zl-b4)" />
                {/* درزهای جانبی ظریف */}
                <line x1="260" y1="572" x2="260" y2="732" stroke="#2E0913" strokeWidth="1.4" opacity=".22" />
                <line x1="460" y1="572" x2="460" y2="732" stroke="#2E0913" strokeWidth="1.4" opacity=".22" />
                {/* پنل سینهٔ فرورفته */}
                <rect x="304" y="590" width="112" height="76" rx="24" fill="#3E111B" stroke="rgba(201,165,95,.4)" strokeWidth="1.2" />
                <path d="M 316,598 Q 360,591 404,598" stroke="#000000" strokeWidth="3" opacity=".25" fill="none" strokeLinecap="round" />
                {/* نشان کوچک برند: حلقهٔ طلایی با مونوگرام */}
                <circle cx="360" cy="618" r="12.5" fill="none" stroke="url(#zl-gold)" strokeWidth="2.4" />
                <path
                  d="M 354.5,612.5 L 365.5,612.5 L 354.5,623.5 L 365.5,623.5"
                  fill="none"
                  stroke="#EAD097"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity=".95"
                />
                {/* چراغ‌های وضعیت */}
                <circle cx="346" cy="648" r="2.4" fill="#C9A55F" opacity=".85" />
                <circle cx="360" cy="648" r="2.4" fill="#EAD097" />
                <circle cx="374" cy="648" r="2.4" fill="#C9A55F" opacity=".4" />
              </g>

              {/* ── بازوی چپ: کوتاه و گرد ── */}
              <g id="g-upper-l">
                <line x1="243" y1="590" x2="222" y2="668" stroke="url(#zl-bodyL)" strokeWidth="38" strokeLinecap="round" />
                <g id="g-fore-l">
                  <line x1="222" y1="668" x2="209" y2="726" stroke="url(#zl-bodyL)" strokeWidth="33" strokeLinecap="round" />
                  <circle cx="208" cy="730" r="11.5" fill="url(#zl-goldV)" />
                  <circle cx="208" cy="730" r="6" fill="#3E111B" />
                  {/* دست گرد توپ‌شکل با جزئیات ظریف */}
                  <circle cx="206" cy="750" r="20.5" fill="url(#zl-bodyR)" />
                  <path d="M 193,742 Q 206,735 219,742" stroke="#2E0913" strokeWidth="1.5" opacity=".3" fill="none" />
                  <ellipse cx="199" cy="742" rx="7" ry="8" fill="#FFFFFF" opacity=".07" />
                </g>
              </g>
              {/* درپوش شانهٔ طلایی */}
              <circle cx="243" cy="590" r="25" fill="url(#zl-gold)" />
              <circle cx="243" cy="590" r="16.5" fill="url(#zl-bodyR)" />
              <circle cx="243" cy="590" r="4.5" fill="#8A6A2C" opacity=".7" />
              {/* مفصل آرنج طلایی */}
              <g id="g-elbow-l" transform="rotate(8 222 668)">
                <circle cx="222" cy="668" r="15" fill="url(#zl-goldV)" />
                <circle cx="222" cy="668" r="8" fill="#3E111B" />
                <circle cx="222" cy="668" r="2.5" fill="#8A6A2C" opacity=".8" />
              </g>

              {/* ── بازوی راست ── */}
              <g id="g-upper-r">
                <line x1="477" y1="590" x2="498" y2="668" stroke="url(#zl-bodyL)" strokeWidth="38" strokeLinecap="round" />
                <g id="g-fore-r">
                  <line x1="498" y1="668" x2="511" y2="726" stroke="url(#zl-bodyL)" strokeWidth="33" strokeLinecap="round" />
                  <circle cx="512" cy="730" r="11.5" fill="url(#zl-goldV)" />
                  <circle cx="512" cy="730" r="6" fill="#3E111B" />
                  <circle cx="514" cy="750" r="20.5" fill="url(#zl-bodyR)" />
                  <path d="M 501,742 Q 514,735 527,742" stroke="#2E0913" strokeWidth="1.5" opacity=".3" fill="none" />
                  <ellipse cx="521" cy="742" rx="7" ry="8" fill="#FFFFFF" opacity=".07" />
                </g>
              </g>
              <circle cx="477" cy="590" r="25" fill="url(#zl-gold)" />
              <circle cx="477" cy="590" r="16.5" fill="url(#zl-bodyR)" />
              <circle cx="477" cy="590" r="4.5" fill="#8A6A2C" opacity=".7" />
              <g id="g-elbow-r" transform="rotate(-8 498 668)">
                <circle cx="498" cy="668" r="15" fill="url(#zl-goldV)" />
                <circle cx="498" cy="668" r="8" fill="#3E111B" />
                <circle cx="498" cy="668" r="2.5" fill="#8A6A2C" opacity=".8" />
              </g>

              {/* ── سر گرد با نمایشگر چهره ── */}
              <g id="g-head">
                {/* بدنهٔ سر: زرشکی تیره و مات */}
                <circle cx="360" cy="372" r="158" fill="url(#zl-bodyR)" />
                <g clipPath="url(#zl-headClip)">
                  <ellipse cx="312" cy="272" rx="92" ry="44" fill="#FFFFFF" opacity=".12" filter="url(#zl-b16)" />
                  <ellipse cx="520" cy="390" rx="42" ry="100" fill="#2E0913" opacity=".25" filter="url(#zl-b16)" />
                  <ellipse cx="360" cy="516" rx="130" ry="34" fill="#2E0913" opacity=".3" filter="url(#zl-b8)" />
                </g>
                {/* نور لبهٔ طلایی روی شانهٔ سر */}
                <path d="M 220,300 A 158,158 0 0 1 306,224" fill="none" stroke="#F5D9A0" strokeWidth="5" strokeLinecap="round" opacity=".3" filter="url(#zl-b4)" />
                <path d="M 232,292 A 158,158 0 0 1 288,236" fill="none" stroke="#FFE8BC" strokeWidth="2.5" strokeLinecap="round" opacity=".45" />

                {/* گوش‌های رباتیک (حلقهٔ طلایی + میدان زرشکی) */}
                <g className="zl-ears">
                  <circle cx="198" cy="372" r="27" fill="url(#zl-gold)" />
                  <circle cx="198" cy="372" r="19.5" fill="#3E111B" />
                  <circle cx="198" cy="372" r="8" fill="#E8D5B5" />
                  <circle cx="198" cy="372" r="3" fill="url(#zl-gold)" />
                  <circle cx="522" cy="372" r="27" fill="url(#zl-gold)" />
                  <circle cx="522" cy="372" r="19.5" fill="#3E111B" />
                  <circle cx="522" cy="372" r="8" fill="#E8D5B5" />
                  <circle cx="522" cy="372" r="3" fill="url(#zl-gold)" />
                </g>

                {/* آنتن ظریف با گوی طلایی */}
                <g id="g-antenna">
                  <path d="M 268,244 L 256,198" stroke="url(#zl-goldV)" strokeWidth="5" strokeLinecap="round" />
                  <circle cx="254" cy="190" r="15" fill="rgba(238,217,164,.4)" filter="url(#zl-b4)" />
                  <circle cx="254" cy="190" r="10.5" fill="url(#zl-gold)" />
                  <circle cx="250.5" cy="186" r="3" fill="#FFFFFF" opacity=".6" />
                </g>

                {/* نمایشگر: بازِ فرورفته + شیشهٔ تیره با عمق سه‌بعدی */}
                <rect x="236" y="276" width="248" height="192" rx="76" fill="url(#zl-bezel)" />
                <rect x="236" y="276" width="248" height="192" rx="76" fill="none" stroke="#8A4653" strokeWidth="1.5" opacity=".35" />
                <rect x="244" y="284" width="232" height="176" rx="68" fill="url(#zl-screen)" />
                {/* سایهٔ داخلی بالای شیشه + بازتاب گرم پایین */}
                <ellipse cx="360" cy="292" rx="108" ry="16" fill="#000000" opacity=".3" filter="url(#zl-b8)" />
                <ellipse cx="360" cy="452" rx="100" ry="10" fill="#FFD98A" opacity=".06" filter="url(#zl-b8)" />
                {/* درخشش شیشه */}
                <path d="M 262,318 Q 330,286 420,296 L 424,306 Q 336,298 268,330 Z" fill="#FFFFFF" opacity=".07" />
                <ellipse cx="430" cy="312" rx="26" ry="8" fill="#FFFFFF" opacity=".06" transform="rotate(-14 430 312)" />

                {/* ── چشم‌های LED: درخشان، زنده، بدون انسانی‌شدن ── */}
                <g id="g-eyes">
                  <ellipse cx="306" cy="358" rx="36" ry="38" fill="url(#zl-eyeGlow)" />
                  <ellipse cx="414" cy="358" rx="36" ry="38" fill="url(#zl-eyeGlow)" />
                  <ellipse cx="306" cy="358" rx="20" ry="23" fill="url(#zl-eyeCore)" />
                  <ellipse cx="414" cy="358" rx="20" ry="23" fill="url(#zl-eyeCore)" />
                  <ellipse cx="306" cy="355" rx="9.5" ry="11.5" fill="#FFFBEF" opacity=".95" />
                  <ellipse cx="414" cy="355" rx="9.5" ry="11.5" fill="#FFFBEF" opacity=".95" />
                  <circle cx="298" cy="349" r="4.2" fill="#FFFFFF" opacity=".95" />
                  <circle cx="406" cy="349" r="4.2" fill="#FFFFFF" opacity=".95" />
                  <circle cx="314" cy="366" r="2" fill="#FFFFFF" opacity=".5" />
                  <circle cx="422" cy="366" r="2" fill="#FFFFFF" opacity=".5" />
                </g>

                {/* گونه‌های گرم و ظریف */}
                <ellipse cx="266" cy="402" rx="12" ry="7.5" fill="#FFC673" opacity=".15" />
                <ellipse cx="454" cy="402" rx="12" ry="7.5" fill="#FFC673" opacity=".15" />

                {/* ── دهان LED (لبخند / صحبت / خندهٔ پهن) ── */}
                <g id="g-mouth">
                  <g id="m-smile">
                    <path d="M 324,426 Q 360,450 396,426" fill="none" stroke="#F09F3C" strokeWidth="10" strokeLinecap="round" filter="url(#zl-b4)" opacity="0.85" />
                    <path d="M 324,426 Q 360,450 396,426" fill="none" stroke="#FFC673" strokeWidth="6.5" strokeDasharray="0.1 9.65" strokeLinecap="round" />
                  </g>
                  <g id="m-talk" opacity="0">
                    <ellipse id="m-talk-glow" cx="360" cy="434" rx="9" ry="2.5" fill="none" stroke="#F09F3C" strokeWidth="10" filter="url(#zl-b4)" opacity="0.85" />
                    <ellipse id="m-talk-dots" cx="360" cy="434" rx="9" ry="2.5" fill="none" stroke="#FFC673" strokeWidth="6" strokeDasharray="0.1 8.2" strokeLinecap="round" />
                  </g>
                  <g id="m-grin" opacity="0">
                    <path d="M 312,420 Q 360,462 408,420" fill="none" stroke="#F09F3C" strokeWidth="10" strokeLinecap="round" filter="url(#zl-b4)" opacity="0.85" />
                    <path d="M 312,420 Q 360,462 408,420" fill="none" stroke="#FFC673" strokeWidth="6.5" strokeDasharray="0.1 9.4" strokeLinecap="round" />
                  </g>
                </g>

                {/* چراغ‌های کوچک گوشهٔ نمایشگر */}
                <circle cx="264" cy="440" r="2.4" fill="#FFD98A" opacity=".45" />
                <circle cx="456" cy="440" r="2.4" fill="#FFD98A" opacity=".45" />
              </g>
            </g>
          </g>

          {/* جرقه‌های شادی — فقط در حالت خوشحال می‌درخشند */}
          <g fill="#D2AF6C" className="zl-sparks">
            <path className="zl-spark" d="M 556,214 l 3.4,7.8 7.8,3.4 -7.8,3.4 -3.4,7.8 -3.4,-7.8 -7.8,-3.4 7.8,-3.4 Z" />
            <path className="zl-spark s2" d="M 200,246 l 2.8,6.4 6.4,2.8 -6.4,2.8 -2.8,6.4 -2.8,-6.4 -6.4,-2.8 6.4,-2.8 Z" />
            <path className="zl-spark s3" d="M 590,330 l 2.4,5.6 5.6,2.4 -5.6,2.4 -2.4,5.6 -2.4,-5.6 -5.6,-2.4 5.6,-2.4 Z" />
            <path className="zl-spark s4" d="M 158,332 l 2.4,5.6 5.6,2.4 -5.6,2.4 -2.4,5.6 -2.4,-5.6 -5.6,-2.4 5.6,-2.4 Z" />
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
        <span className="zl-plaque-en">SMART&nbsp;ASSISTANT&nbsp;·&nbsp;JELLY&nbsp;&amp;&nbsp;CUSTARD&nbsp;SHOP</span>
        <p className="zl-plaque-title">{ASSISTANT_TAGLINE}</p>
        <span className="zl-rule" aria-hidden="true" />
      </div>
    </section>
  );
});

export default ZhinoLoungeScene;
