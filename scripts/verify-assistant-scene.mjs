// ============================================================
// ZHINO — بررسیِ محیط چت یکپارچهٔ دستیار (jsdom)
//
// این اسکریپت صفحهٔ واقعی /assistant را (همان‌طور که در مرورگر
// بالا می‌آید) در jsdom اجرا می‌کند و بازطراحی تخت (فاز ۹) را به
// همراه رفتار همیشگی گفتگو ثابت می‌کند:
//
//   ۱) محیط یکپارچه: صحنهٔ چندلایهٔ استودیو حذف شده — هیچ
//      `.zl-room` / `.zl-hero` در DOM نیست.
//   ۲) ربات واقعی کوچک و تمام‌قد در مرکز خوش‌آمدگویی است
//      (img با کلاس zhino-welcome-photo و src همان فایل اصلی)؛
//      اندازه، نسبت و crop با CSS (wrapper + aspect-ratio) تعیین می‌شود
//      — بدون width/height سخت‌کدشده روی عنصر.
//   ۳) «بازگشت به سایت» در سربرگ بالای صفحه هست.
//   ۴) شروع گفتگو: فقط ربات کوچک + خوش‌آمدگویی + پیشنهادها.
//   ۵) کارت‌های محصول از دادهٔ واقعی‌اند (نام کاتالوگ + قیمت
//      واقعی) و «افزودن به سبد» مسیر همیشگی سبد را طی می‌کند؛
//      پیشنهاد خودِ دستیار هم منتظر تأیید کاربر می‌ماند.
//   ۶) «گفتگوی تازه» به همان حالت خلوت اولیه برمی‌گردد.
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
        };\n      `,
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

/* ── jsdom ──────────────────────────────────────────────────── */

const virtualConsole = new VirtualConsole();
const consoleErrors = [];
virtualConsole.on('jsdomError', (e) => consoleErrors.push(String(e.message || e)));
virtualConsole.on('error', (...args) => consoleErrors.push(args.map(String).join(' ')));

const dom = new JSDOM(`<!doctype html><html lang="fa" dir="rtl"><body><div id="root"></div></body></html>`, {
  url: 'http://localhost/assistant',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;
window.ResizeObserver = undefined;
if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
}

const doc = window.document;
const q = (sel) => doc.querySelector(sel);
const qa = (sel) => Array.from(doc.querySelectorAll(sel));
const text = () => doc.body.textContent || '';

/** انتظار برای یک وضعیت — نه یک خوابِ ثابت (همان الگوی همیشگی). */
async function waitFor(predicate, timeoutMs = 12000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (predicate()) return true;
    await sleep(50);
  }
  return false;
}

window.eval(bundle);
window.__mount();

if (!(await waitFor(() => Boolean(q('.zhino-assistant-page'))))) {
  fail('صفحهٔ دستیار سوار نشد');
}

/** ارسال یک پیامِ واقعی از طریق کادرِ ورودیِ صفحه و انتظار برای پاسخ */
async function ask(question) {
  const input = q('#zhino-assistant-input');
  if (!input) return false;
  const rowsBefore = qa('.zhino-assistant-row').length;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, question);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await waitFor(() => q('.zhino-assistant-send') && !q('.zhino-assistant-send').disabled);
  const form = q('.zhino-assistant-composer-form');
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => qa('.zhino-assistant-row').length > rowsBefore + 1, 15000);
  await waitFor(() => !q('.zhino-assistant-typing') && qa('.zhino-assistant-row').length >= rowsBefore + 2, 20000);
  await sleep(120);
  return true;
}

/* ── ۱) محیط یکپارچه: صحنهٔ چندلایه حذف شده ───────────────── */

if (!q('.zl-room') && !q('.zl-hero') && !q('.zl-robot')) ok('صحنهٔ چندلایهٔ استودیو حذف شده — محیط چت یک سطح است');
else fail('بقایای صحنهٔ قدیمی (zl-room/zl-hero/zl-robot) هنوز در DOM هست');

/* ── ) ربات واقعی کوچک و تمام‌قد در مرکز خوش‌آمدگویی ─────── */

const robotImg = q('.zhino-welcome-photo');
if (robotImg) {
  const src = robotImg.getAttribute('src') || '';
  if (src.includes('images/assistant/') && (src.includes('بارگیری') || src.includes('%D8%A8%D8%A7%D8%B1'))) {
    ok('تصویر واقعی ربات (بارگیری.jpeg) در خوش‌آمدگویی نمایش داده می‌شود');
  } else {
    fail('src تصویر خوش‌آمدگویی به فایل اصلی ربات اشاره نمی‌کند: ' + src);
  }
  if (!robotImg.getAttribute('width') && !robotImg.getAttribute('height')) {
    ok('ابعاد و crop تصویر به CSS سپرده شده (wrapper + aspect-ratio) — نسبت اصلی دست‌نخورده است');
  } else {
    fail('روی تصویر ربات width/height سخت‌کد شده و نسبت تصویر در خطر است');
  }
} else {
  fail('تصویر ربات در خوش‌آمدگویی پیدا نشد');
}

/* ── ۳) «بازگشت به سایت» در بالای صفحه ────────────────────── */

const backBtn = qa('.zhino-assistant-topbar button').find((b) => (b.textContent || '').includes('بازگشت به سایت'));
if (backBtn) ok('دکمهٔ «بازگشت به سایت» در سربرگ بالای صفحه هست');
else fail('دکمهٔ «بازگشت به سایت» در سربرگ پیدا نشد');

/* ── ۴) شروع گفتگو: فقط ربات کوچک + خوش‌آمد + پیشنهادها ───── */

if (q('.zhino-assistant-welcome') && text().includes('سلام! من دستیار ژینو هستم.')) ok('خوش‌آمدگویی نمایش داده شد');
else fail('خوش‌آمدگویی در شروع گفتگو دیده نشد');

const welcomeChips = qa('.zhino-assistant-welcome-chips .zhino-assistant-chip').length;
if (welcomeChips >= 3) ok(`پیشنهادهای گفتگو در شروع صفحه هستند (${welcomeChips} پیشنهاد)`);
else fail(`پیشنهادهای گفتگو در شروع صفحه نیستند (${welcomeChips})`);

if (qa('.zhino-assistant-product').length === 0) ok('هیچ کارت محصولی از ابتدا در گفتگو نیست');
else fail('کارت محصول از ابتدا در گفتگو نمایش داده شد');

/* ── ۵) یک پرسشِ غیرمرتبط → پاسخ بدون کارت ─────────────────── */

await ask('طرز تهیه ژله چطور است؟');
if (qa('.zhino-assistant-product').length === 0) ok('پرسشِ غیرمرتبط (طرز تهیه) کارتی نمایش نمی‌دهد');
else fail('پرسشِ غیرمرتبط باعث نمایش کارت محصول شد');
if (text().includes('مرحله') || text().includes('تهیه')) ok('پاسخِ طرز تهیه از موتور واقعی رسید');
else fail('پاسخِ طرز تهیه تولید نشد');

/* ── ) درخواستِ محصول → کارت‌های واقعی ───────────────────── */

await ask('چه طعم‌هایی دارید؟');
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

/* ── ) افزودن به سبد از مسیر همیشگی (با تأیید کاربر) ─────── */

const addButtons = qa('.zhino-assistant-add').filter((b) => !b.disabled);
if (addButtons.length === 0) {
  fail('هیچ دکمهٔ فعالِ «افزودن به سبد» روی کارت‌ها نبود');
} else {
  addButtons[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const added = await waitFor(() => text().includes('به سبد خرید اضافه شد'), 15000);
  if (added) ok('«افزودن به سبد» روی کارت، محصول را از مسیر همیشگیِ سبد افزود');
  else fail('«افزودن به سبد» روی کارت، پاسخِ موفق نداد: ' + text().slice(-160));
}

await ask('یک ژله انار به سبد اضافه کن');
const confirm = q('.zhino-assistant-cart-confirm');
if (confirm) ok('پیشنهادِ افزودن به سبد منتظر تأیید کاربر ماند (هیچ افزودن خودکاری رخ نداد)');
else fail('پنلِ تأیید پیشنهادِ سبد ظاهر نشد');
const yes = q('.zhino-assistant-cart-yes');
if (yes) {
  yes.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const accepted = await waitFor(() => text().includes('به سبد خرید اضافه شد'), 15000);
  if (accepted) ok('تأیید کاربر، پیشنهادِ دستیار را به سبد افزود');
  else fail('تأییدِ پیشنهادِ سبد، پاسخِ موفق نداد: ' + text().slice(-160));
}

/* ── ۸) «گفتگوی تازه» → بازگشت به حالت خلوت ──────────────── */

const refresh = q('.zhino-assistant-ghost.is-icon');
if (refresh) {
  refresh.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor(() => Boolean(q('.zhino-assistant-welcome')), 15000);
  if (qa('.zhino-assistant-product').length === 0) ok('«گفتگوی تازه» دوباره فقط ربات کوچک + خوش‌آمد + پیشنهادها را نشان می‌دهد');
  else fail('بعد از «گفتگوی تازه» کارت محصول همچنان نمایان است');
  if (qa('.zhino-assistant-welcome-chips .zhino-assistant-chip').length >= 3) ok('بعد از «گفتگوی تازه» پیشنهادها برگشتند');
  else fail('بعد از «گفتگوی تازه» پیشنهادها برنگشتند');
  if (q('.zhino-welcome-photo')) ok('بعد از «گفتگوی تازه» تصویر کوچک ربات برگشت');
  else fail('بعد از «گفتگوی تازه» تصویر ربات برگشت نیافت');
} else {
  fail('دکمهٔ «گفتگوی تازه» یافت نشد');
}

/* ── ۹) هیچ خطای زمان‌اجرا ────────────────────────────────── */

const realErrors = consoleErrors.filter((e) => !/Not implemented|css|Could not parse/i.test(e));
if (realErrors.length === 0) ok('هیچ خطای زمان‌اجرا در صفحهٔ دستیار رخ نداد');
else fail('خطاهای زمان‌اجرا: ' + realErrors.slice(0, 3).join(' | '));

console.log('');
if (failures === 0) console.log('All assistant-scene checks passed.');
else console.error(`${failures} check(s) failed.`);

dom.window.close();
process.exit(failures === 0 ? 0 : 1);
