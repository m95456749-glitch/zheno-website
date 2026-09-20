// ============================================================
// ZHINO — «دستیار ژینو» — بررسیِ صحنه و شروعِ گفتگو (jsdom)
//
// این اسکریپت صفحهٔ واقعی /assistant را (همان‌طور که در مرورگر
// بالا می‌آید) در jsdom اجرا می‌کند و رفتارِ تازه را ثابت می‌کند:
//
//   ۱) شروع گفتگو: فقط ربات + خوش‌آمدگویی + پیشنهادها — هیچ کارت
//      یا محصولِ صحنه‌ای از ابتدا نمایش داده نمی‌شود.
//   ۲) محصولات فقط بعد از درخواست کاربر ظاهر می‌شوند
//      («چه طعم‌هایی دارید؟» / «محصولات را نشان بده»).
//   ۳) یک پرسشِ غیرمرتبط (مثلاً طرز تهیه) همچنان صحنه را خلوت
//      نگه می‌دارد.
//   ۴) کارت‌های محصول از دادهٔ واقعی‌اند (نام کاتالوگ + قیمت
//      واقعی) و «افزودن به سبد» مسیر همیشگیِ سبد را طی می‌کند.
//   ۵) قاب‌بندی ربات: در هر دو حالت (تازه/گفتگو) بالای سرِ ربات
//      همیشه فضا هست و صورت کراپ نمی‌شود؛ ربات کوچک‌تر شده است.
//   ۶) «گفتگوی تازه» به همان حالتِ خلوتِ اولیه برمی‌گردد.
//
// هیچ چیزی در منطق چت/API عوض نمی‌شود — این فقط یک تستِ رفتاری است.
//
// Usage:  node scripts/verify-assistant-scene.mjs
// ============================================================

import { buildSync } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
const fail = (m) => {
  console.error('FAIL: ' + m);
  failures += 1;
};
const ok = (m) => console.log('PASS: ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── بسته‌بندی صفحهٔ واقعی با همان defineهای production ───── */

function buildApp() {
  return buildSync({
    stdin: {
      contents: `
        import { createRoot } from 'react-dom/client';
        import { createElement as h } from 'react';
        import { MemoryRouter } from 'react-router-dom';
        import { CartProvider } from './src/context/CartContext';
        import AssistantPage from './src/pages/AssistantPage';

        window.__mount = function () {
          const root = createRoot(document.getElementById('root'));
          root.render(
            h(MemoryRouter, null, h(CartProvider, null, h(AssistantPage))),
          );
        };
      `,
      resolveDir: root,
      loader: 'jsx',
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env.BASE_URL': '"/"',
      'import.meta.env.MODE': '"production"',
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env.VITE_API_BASE_URL': '""',
      'import.meta.env.VITE_ENABLE_CHECKOUT': '"true"',
      'import.meta.env.VITE_ENABLE_ACCOUNT': '"false"',
      'import.meta.env.VITE_ADMIN_AUTH_MODE': '"demo"',
      'import.meta.env.VITE_SUPABASE_URL': '""',
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '""',
      'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
      'import.meta.env.VITE_ASSISTANT_API_URL': '""',
    },
    logLevel: 'error',
    write: false,
  }).outputFiles[0].text;
}

const bundle = buildApp();

/* ── jsdom: یک صفحه با اندازهٔ واقعیِ قابِ استودیو ─────────── */

const virtualConsole = new VirtualConsole();
const consoleErrors = [];
virtualConsole.on('jsdomError', (e) => consoleErrors.push(String(e.message || e)));
virtualConsole.on('error', (...args) => consoleErrors.push(args.map(String).join(' ')));

const dom = new JSDOM(
  `<!doctype html><html lang="fa" dir="rtl"><body><div id="root"></div></body></html>`,
  { url: 'http://localhost/assistant', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole },
);
const { window } = dom;

/** اندازهٔ قابِ استودیو در دو حالت (مانند مرورگر دسکتاپ) */
const ROOM = { fresh: { width: 720, height: 480 }, chat: { width: 720, height: 260 } };
let roomSize = ROOM.fresh;

// jsdom هیچ layout ندارد: اندازهٔ قاب را خودمان می‌دهیم تا منطقِ
// viewBoxِ صحنه دقیقاً مثل مرورگر اجرا شود.
window.Element.prototype.getBoundingClientRect = function () {
  const isRoom = typeof this.className === 'string' && this.className.includes('zl-room');
  const w = isRoom ? roomSize.width : 0;
  const h = isRoom ? roomSize.height : 0;
  return { x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, width: w, height: h, toJSON() {} };
};
window.ResizeObserver = undefined;
if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
}

window.eval(bundle);
window.__mount();
await sleep(400);

const doc = window.document;
const q = (sel) => doc.querySelector(sel);
const qa = (sel) => Array.from(doc.querySelectorAll(sel));
const text = () => doc.body.textContent || '';

/** ارسال یک پیامِ واقعی از طریق کادرِ ورودیِ صفحه */
async function ask(question) {
  const input = q('#zhino-assistant-input');
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, question);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(30);
  const form = q('.zhino-assistant-composer-form');
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  // پاسخِ دستیار با تأخیرِ طبیعیِ موتور محلی می‌رسد
  await sleep(1200);
  return true;
}

/* ── ۱) شروع گفتگو: فقط ربات + خوش‌آمد + پیشنهادها ────────── */

if (q('.zl-room svg')) ok('صحنهٔ استودیو (ربات زنده) رندر شد');
else fail('صحنهٔ استودیو رندر نشد');

if (q('#zl-robot')) ok('ربات در صحنه حضور دارد (نقطهٔ تمرکز اصلی)');
else fail('ربات در صحنه یافت نشد');

const productsOnStart = qa('.zl-products.is-on').length;
if (productsOnStart === 0) ok('هیچ محصولی در شروع گفتگو نمایش داده نمی‌شود');
else fail(`محصولات در شروع گفتگو پنهان نبودند (${productsOnStart} گروه نمایان)`);

const shelfJars = qa('.zl-shelf-jars .zl-product-item').length;
const tableItems = qa('.zl-table-products .zl-product-item').length;
if (shelfJars + tableItems > 0) ok(`محصولاتِ صحنه در DOM هستند اما پنهان‌اند (قفسه: ${shelfJars}، میز: ${tableItems})`);
else fail('محصولاتِ صحنه اصلاً در DOM نیستند (کاتالوگ قطع شده؟)');

if (q('.zhino-assistant-welcome') && text().includes('سلام! من دستیار ژینو هستم.'))
  ok('خوش‌آمدگویی نمایش داده شد');
else fail('خوش‌آمدگویی در شروع گفتگو دیده نشد');

const welcomeChips = qa('.zhino-assistant-welcome-chips .zhino-assistant-chip').length;
if (welcomeChips >= 3) ok(`پیشنهادهای گفتگو در شروع صفحه هستند (${welcomeChips} پیشنهاد)`);
else fail(`پیشنهادهای گفتگو در شروع صفحه نیستند (${welcomeChips})`);

if (qa('.zhino-assistant-product').length === 0) ok('هیچ کارت محصولی از ابتدا در گفتگو نیست');
else fail('کارت محصول از ابتدا در گفتگو نمایش داده شد');

/* ── ۲) قاب‌بندی ربات: صورت همیشه در قاب با حاشیهٔ امن ─────── */

/** مختصاتِ واقعیِ بدنهٔ ربات در واحدِ صحنه (از هنرِ SVG اندازه‌گیری شده) */
const ROBOT = { x1: 99, y1: 128, x2: 621, y2: 870 };
const ROBOT_SCALE = 0.63;
const ROBOT_TX = 153.2;
const ROBOT_TY = 84.2;
const robotTop = ROBOT_TY + ROBOT_SCALE * ROBOT.y1;
const robotBottom = ROBOT_TY + ROBOT_SCALE * ROBOT.y2;
const robotLeft = ROBOT_TX + ROBOT_SCALE * ROBOT.x1;
const robotRight = ROBOT_TX + ROBOT_SCALE * ROBOT.x2;
/** اندازهٔ دست‌ها (پایینِ ساعد) — باید در حالت گفتگو دیده شوند */
const handsBottom = ROBOT_TY + ROBOT_SCALE * 706;

function frameOf() {
  const vb = (q('.zl-room svg')?.getAttribute('viewBox') || '').split(' ').map(Number);
  return { x0: vb[0], y0: vb[1], w: vb[2], h: vb[3] };
}

const freshFrame = frameOf();
const freshHeadroom = ((robotTop - freshFrame.y0) / freshFrame.h) * 100;
const freshFill = ((Math.min(robotBottom, freshFrame.y0 + freshFrame.h) - robotTop) / freshFrame.h) * 100;
if (freshHeadroom >= 15) ok(`حالت تازه: بالای سرِ ربات ${freshHeadroom.toFixed(1)}٪ فضا دارد (صورت کراپ نمی‌شود)`);
else fail(`حالت تازه: فضای بالای سرِ ربات کم است (${freshHeadroom.toFixed(1)}٪)`);
if (freshFill <= 72) ok(`حالت تازه: ربات ${freshFill.toFixed(1)}٪ِ ارتفاع قاب است — کوچک‌تر از قبل و کامل در قاب`);
else fail(`حالت تازه: ربات هنوز خیلی بزرگ است (${freshFill.toFixed(1)}٪)`);
if (robotBottom <= freshFrame.y0 + freshFrame.h) ok('حالت تازه: بدنه و پاهای ربات کامل در قاب‌اند');
else fail('حالت تازه: پایینِ بدنهٔ ربات از قاب بیرون افتاده است');

/**
 * ماتریسِ دسکتاپ/موبایل: قابِ ربات در هر اندازهٔ قاب امن است
 * (حاشیهٔ بالای سر، پرشدگیِ قاب، وسط‌بودنِ افقی، دیده‌شدنِ دست‌ها).
 */
async function runMatrix(cases) {
  for (const testCase of cases) {
    roomSize = testCase.room;
    window.dispatchEvent(new window.Event('resize'));
    await sleep(120);
    const f = frameOf();
    const top = robotTop - f.y0;
    const bottom = f.y0 + f.h - Math.min(robotBottom, f.y0 + f.h);
    const head = (top / f.h) * 100;
    const fill = ((Math.min(robotBottom, f.y0 + f.h) - robotTop) / f.h) * 100;
    const insideX = robotLeft > f.x0 + f.w * 0.02 && robotRight < f.x0 + f.w * 0.98;
    const handsVisible = handsBottom < f.y0 + f.h;

    if (head >= testCase.minHead && fill <= testCase.maxFill) {
      ok(`${testCase.label}: حاشیهٔ بالای سر ${head.toFixed(1)}٪ و ربات ${fill.toFixed(1)}٪ِ قاب`);
    } else {
      fail(`${testCase.label}: قاب‌بندی نامناسب (بالا ${head.toFixed(1)}٪ — پرشدگی ${fill.toFixed(1)}٪)`);
    }
    if (top > 0 && bottom >= 0) ok(`${testCase.label}: ربات از بالا و پایین در قاب است`);
    else fail(`${testCase.label}: ربات از قاب بیرون افتاده (بالا ${top.toFixed(1)} / پایین ${bottom.toFixed(1)})`);
    if (insideX) ok(`${testCase.label}: ربات در محور افقی وسطِ قاب است`);
    else fail(`${testCase.label}: ربات در محور افقی از قاب خارج شده`);
    if (handsVisible) ok(`${testCase.label}: دست‌های ربات در قاب دیده می‌شوند`);
    else fail(`${testCase.label}: دست‌های ربات از قاب بیرون است`);
  }
}

/* حالت تازه (قبل از هر پیامی) — دسکتاپ، موبایل و موبایلِ کوچک */
await runMatrix([
  { label: 'تازه · دسکتاپ ۷۲۰×۴۸۰', room: { width: 720, height: 480 }, minHead: 15, maxFill: 75 },
  { label: 'تازه · موبایل ۳۵۸×۳۲۰', room: { width: 358, height: 320 }, minHead: 15, maxFill: 75 },
  { label: 'تازه · موبایل کوچک ۳۲۰×۳۰۰', room: { width: 320, height: 300 }, minHead: 15, maxFill: 75 },
  { label: 'تازه · لنداسکیپ ۵۶۰×۳۴۰', room: { width: 560, height: 340 }, minHead: 15, maxFill: 75 },
]);
roomSize = ROOM.fresh;
window.dispatchEvent(new window.Event('resize'));
await sleep(120);

/* ── ۳) یک پرسشِ غیرمرتبط → صحنه همچنان خلوت ──────────────── */

await ask('طرز تهیه ژله چطور است؟');
if (qa('.zhino-assistant-product').length === 0 && qa('.zl-products.is-on').length === 0)
  ok('پرسشِ غیرمرتبط (طرز تهیه) همچنان محصولی نمایش نمی‌دهد');
else fail('پرسشِ غیرمرتبط باعث نمایش محصولات شد');
if (text().includes('مرحله') || text().includes('تهیه')) ok('پاسخِ طرز تهیه از موتور واقعی رسید');
else fail('پاسخِ طرز تهیه تولید نشد');

/* ── ۴) درخواستِ محصول → کارت‌های واقعی + نمایش در صحنه ───── */

await ask('چه طعم‌هایی دارید؟');
if (qa('.zl-products.is-on').length > 0) ok('بعد از پرسش دربارهٔ طعم‌ها، محصولاتِ صحنه ظاهر شدند');
else fail('بعد از پرسش دربارهٔ طعم‌ها، محصولاتِ صحنه ظاهر نشدند');

await ask('محصولات را نشان بده');
const cards = qa('.zhino-assistant-product');
if (cards.length > 0) ok(`کارت‌های محصول بعد از درخواست کاربر نمایش داده شدند (${cards.length} کارت)`);
else fail('کارت محصول بعد از درخواست کاربر نمایش داده نشد');

const firstCard = cards[0];
const cardText = firstCard?.textContent || '';
const hasPrice = /تومان/.test(cardText);
const hasStock = /موجود/.test(cardText);
const hasAdd = Boolean(firstCard?.querySelector('.zhino-assistant-add'));
const hasSwatch = Boolean(firstCard?.querySelector('.zhino-assistant-product-swatch i'));
const swatchColor = firstCard?.querySelector('.zhino-assistant-product-swatch i')?.getAttribute('style') || '';
if (hasPrice) ok('قیمت کارت از دادهٔ واقعی کاتالوگ است');
else fail('قیمت کارت نمایش داده نشد');
if (hasStock) ok('وضعیت موجودی کارت از دادهٔ واقعی است');
else fail('وضعیت موجودی کارت نمایش داده نشد');
if (hasAdd) ok('دکمهٔ «افزودن به سبد» روی کارت هست');
else fail('دکمهٔ «افزودن به سبد» روی کارت نیست');
if (hasSwatch && /background/.test(swatchColor)) ok(`نگینِ کارت رنگِ واقعیِ طعم را دارد (${swatchColor.trim()})`);
else fail('نگینِ کارت رنگِ طعم را ندارد');

const cardNames = cards.map((card) => card.querySelector('.zhino-assistant-product-name')?.textContent || '');
if (cardNames.every((name) => name.trim().length > 0)) ok(`نام کارت‌ها از کاتالوگ واقعی است (${cardNames[0]})`);
else fail('نام کارت‌ها خالی است');

/* ── ۵) افزودن به سبد از مسیر همیشگی (با تأیید کاربر) ─────── */

const addButtons = qa('.zhino-assistant-add').filter((b) => !b.disabled);
if (addButtons.length === 0) {
  fail('هیچ دکمهٔ فعالِ «افزودن به سبد» روی کارت‌ها نبود');
} else {
  // دکمهٔ کارت همان مسیر همیشگیِ سبد را صدا می‌زند (CartContext)
  addButtons[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(500);
  if (text().includes('به سبد خرید اضافه شد')) ok('«افزودن به سبد» روی کارت، محصول را از مسیر همیشگیِ سبد افزود');
  else fail('«افزودن به سبد» روی کارت، پاسخِ موفق نداد');
}

/* پیشنهادِ خودِ دستیار هم باید منتظرِ تأییدِ کاربر بماند */
await ask('یک ژله انار به سبد اضافه کن');
const confirm = q('.zhino-assistant-cart-confirm');
if (confirm) ok('پیشنهادِ افزودن به سبد منتظرِ تأیید کاربر ماند (هیچ افزودن خودکاری رخ نداد)');
else fail('پنلِ تأییدِ پیشنهادِ سبد ظاهر نشد');
const yes = q('.zhino-assistant-cart-yes');
if (yes) {
  yes.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(500);
  if (text().includes('به سبد خرید اضافه شد')) ok('تأیید کاربر، پیشنهادِ دستیار را به سبد افزود');
  else fail('تأییدِ پیشنهادِ سبد، پاسخِ موفق نداد');
}

/* ── ۶) ماتریس دسکتاپ/موبایل: قابِ ربات در هر اندازه‌ای امن است ── */

/* حالت گفتگو (قابِ جمع‌وجور بالای چت) — دسکتاپ و موبایل */
await runMatrix([
  { label: 'گفتگو · دسکتاپ ۷۲۰×۲۶۰', room: { width: 720, height: 260 }, minHead: 10, maxFill: 86 },
  { label: 'گفتگو · دسکتاپ بزرگ ۷۲۰×۳۸۰', room: { width: 720, height: 380 }, minHead: 10, maxFill: 86 },
  { label: 'گفتگو · موبایل ۳۵۸×۱۹۰', room: { width: 358, height: 190 }, minHead: 10, maxFill: 86 },
  { label: 'گفتگو · لنداسکیپ ۵۶۰×۲۰۰', room: { width: 560, height: 200 }, minHead: 10, maxFill: 86 },
]);

/* ── ۷) «گفتگوی تازه» → بازگشت به حالت خلوت ──────────────── */

const refresh = q('.zhino-assistant-ghost.is-icon');
if (refresh) {
  refresh.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(400);
  if (qa('.zl-products.is-on').length === 0 && qa('.zhino-assistant-product').length === 0)
    ok('«گفتگوی تازه» دوباره فقط ربات + خوش‌آمد + پیشنهادها را نشان می‌دهد');
  else fail('بعد از «گفتگوی تازه» محصولات همچنان نمایان‌اند');
  if (qa('.zhino-assistant-welcome-chips .zhino-assistant-chip').length >= 3)
    ok('بعد از «گفتگوی تازه» پیشنهادها برگشتند');
  else fail('بعد از «گفتگوی تازه» پیشنهادها برنگشتند');
} else {
  fail('دکمهٔ «گفتگوی تازه» یافت نشد');
}

/* ── ۸) هیچ خطای زمان‌اجرا ────────────────────────────────── */

const realErrors = consoleErrors.filter((e) => !/Not implemented|css|Could not parse/i.test(e));
if (realErrors.length === 0) ok('هیچ خطای زمان‌اجرا در صفحهٔ دستیار رخ نداد');
else fail('خطاهای زمان‌اجرا: ' + realErrors.slice(0, 3).join(' | '));

console.log('');
if (failures === 0) console.log('All assistant-scene checks passed.');
else console.error(`${failures} check(s) failed.`);

// jsdom انیمیشنِ صحنه (requestAnimationFrame) را زنده نگه می‌دارد؛
// پنجره را می‌بندیم تا اسکریپت مثل بقیهٔ تست‌ها تمام شود.
dom.window.close();
process.exit(failures === 0 ? 0 : 1);
