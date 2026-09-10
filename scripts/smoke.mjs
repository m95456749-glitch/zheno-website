// ============================================================
// ZHINO — production-equivalent runtime smoke test (Node + jsdom)
//
// Bundles the real app source (src/main.tsx) with esbuild using the same
// production defines Vite uses (BASE_URL=/zheno-website/, NODE_ENV,
// frontend-only API mode), executes it in jsdom per route, and asserts
// the app renders content instead of a blank page.
//
// Note: jsdom cannot execute <script type="module">, so the dist bundle
// (an ES module by design) is verified separately: single-file output,
// no dev refs, HTTP 200 on every route incl. deep links. This script
// verifies RUNTIME behavior (render, router, cart, totals, guards).
//
// Usage:
//   npm run build && npm run smoke
// ============================================================

import { buildSync } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

let failures = 0;
const fail = (msg) => {
  console.error('FAIL: ' + msg);
  failures += 1;
};
const ok = (msg) => console.log('PASS: ' + msg);

// ── Bundle the real app (production defines, CSS excluded) ──
let appCode;
try {
  const result = buildSync({
    entryPoints: ['src/main.tsx'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    write: false,
    logLevel: 'silent',
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env.BASE_URL': '"/zheno-website/"',
      'import.meta.env.MODE': '"production"',
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env.VITE_API_BASE_URL': '""',
      'import.meta.env.VITE_ENABLE_CHECKOUT': '"true"',
      'import.meta.env.VITE_ENABLE_ACCOUNT': '"false"',
    },
  });
  appCode = result.outputFiles[0].text;
  ok(`app bundles for runtime test (${(appCode.length / 1024).toFixed(0)} KB)`);
} catch (err) {
  fail('esbuild bundling failed: ' + (err?.message ?? err));
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SHELL =
  '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"></head>' +
  '<body><div id="root"></div></body></html>';

/**
 * Render a route and return its text.
 * `seed` runs after DOM creation but before the app script executes,
 * e.g. to seed localStorage.
 */
async function render(path, { seed, clickAddToCart = false } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    const msg = String(e?.message ?? e);
    if (/Could not load|ENOTFOUND|EAI_AGAIN|network|Not implemented/i.test(msg)) return;
    errors.push('jsdomError: ' + msg);
  });
  virtualConsole.on('error', (...args) => {
    errors.push('console.error: ' + args.map(String).join(' '));
  });

  const dom = new JSDOM(SHELL, {
    url: `http://localhost${path}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.scrollTo = () => undefined;
      window.scrollBy = () => undefined;
    },
  });

  if (seed) seed(dom.window);

  const { document } = dom.window;
  const script = document.createElement('script');
  script.textContent = appCode;
  document.body.appendChild(script);

  const deadline = Date.now() + 12000;
  let rootEl = null;
  while (Date.now() < deadline) {
    rootEl = document.getElementById('root');
    if (rootEl && rootEl.children.length > 0) break;
    await sleep(100);
  }

  if (clickAddToCart && rootEl) {
    const btn = document.querySelector('button[aria-label^="افزودن"]');
    if (btn) {
      btn.click();
      const toastDeadline = Date.now() + 5000;
      while (Date.now() < toastDeadline) {
        if (document.querySelector('[role="status"]')) break;
        await sleep(100);
      }
    } else {
      errors.push('add-to-cart button not found for click test');
    }
  }

  const text = rootEl?.textContent ?? '';
  const toastText = document.querySelector('[role="status"]')?.textContent ?? '';
  const result = { text, errors, toastText };
  dom.window.close();
  return result;
}

function expectContains(label, text, needle) {
  if (text.includes(needle)) ok(`${label} renders «${needle}»`);
  else fail(`${label} MISSING «${needle}»`);
}

function expectNotContains(label, text, needle) {
  if (!text.includes(needle)) ok(`${label} does not contain «${needle}»`);
  else fail(`${label} MUST NOT contain «${needle}»`);
}

function expectNoErrors(label, errors) {
  if (errors.length === 0) ok(`${label} — no runtime errors`);
  else fail(`${label} runtime errors:\n    - ${errors.join('\n    - ')}`);
}

// ── 1. Home ──────────────────────────────────────────────────
{
  const { text, errors } = await render('/zheno-website/');
  if (text.trim().length > 200) ok('home renders substantial content (not blank)');
  else fail(`home looks blank (only ${text.trim().length} chars)`);
  expectContains('home', text, 'ژینو');
  expectContains('home', text, 'پودر ژله');
  expectContains('home', text, 'پودر کاستر');
  // All 22 products render on the homepage (15 jelly + 7 custard)
  expectContains('home', text, 'ژله انار');
  expectContains('home', text, 'ژله آلبالو');
  expectContains('home', text, 'ژله توت فرنگی');
  expectContains('home', text, 'کاستر موز');
  expectContains('home', text, 'کاستر محلبی وانیلی');
  // Season-2 jelly cards (7 new real-photo flavors)
  expectContains('home', text, 'ژله هندوانه');
  expectContains('home', text, 'ژله طالبی');
  expectContains('home', text, 'ژله شاتوت');
  expectContains('home', text, 'ژله انبه');
  expectContains('home', text, 'ژله انگور');
  expectContains('home', text, 'ژله کیوی');
  expectContains('home', text, 'ژله لیمو');
  // Hero content + CTA
  expectContains('home', text, 'طعمِ اصیل');
  expectNotContains('home', text, 'طعم متفاوت، برای لحظه‌هایی که متفاوت.');
  expectNotContains('home', text, 'یک تجربه متفاوت از دنیای ژله و کاستر');
  expectContains('home', text, 'مشاهده محصولات');
  // All 7 custard cards render with their verified photos' products
  expectContains('home', text, 'کاستر طالبی');
  expectContains('home', text, 'کاستر توت فرنگی');
  expectContains('home', text, 'کاستر کاکائو');
  expectContains('home', text, 'کاستر هفت میوه');
  expectContains('home', text, 'کاستر پرتقال');
  // Recipes + flavor index present
  expectContains('home', text, 'دستور تهیه');
  // The old spelling must be gone everywhere
  expectNotContains('home', text, 'کاستارد');
  expectNoErrors('home', errors);
}

// ── 2. Products listing ──────────────────────────────────────
{
  const { text, errors } = await render('/zheno-website/products');
  expectContains('products', text, 'محصولات ژینو');
  expectContains('products', text, 'ژله انار');
  expectContains('products', text, 'کاستر موز');
  expectContains('products', text, 'کاستر محلبی وانیلی');
  expectNotContains('products', text, 'کاستارد');
  expectNoErrors('products', errors);
}

// ── 3. Product detail (deep link) ────────────────────────────
{
  const { text, errors } = await render('/zheno-website/products/jelly-strawberry');
  expectContains('product detail', text, 'پودر ژله توت فرنگی ژینو');
  expectContains('product detail', text, 'افزودن به سبد خرید');
  expectContains('product detail', text, '۲۰۰٬۰۰۰ تومان');
  expectNoErrors('product detail', errors);
}

// ── 3b. Custard product detail (renamed terminology) ────────
{
  const { text, errors } = await render('/zheno-website/products/custard-mahlab-vanilla');
  expectContains('custard detail', text, 'پودر کاستر محلبی وانیلی ژینو');
  expectContains('custard detail', text, 'افزودن به سبد خرید');
  expectNotContains('custard detail', text, 'کاستارد');
  expectNoErrors('custard detail', errors);
}

// ── 4. Unknown product id ────────────────────────────────────
{
  const { text, errors } = await render('/zheno-website/products/does-not-exist');
  expectContains('unknown product', text, 'محصول یافت نشد');
  expectNoErrors('unknown product', errors);
}

// ── 5. Empty cart ────────────────────────────────────────────
{
  const { text, errors } = await render('/zheno-website/cart');
  expectContains('empty cart', text, 'سبد خرید شما خالی است');
  expectNoErrors('empty cart', errors);
}

// ── 6. Cart with persisted items (totals math) ───────────────
{
  const { text, errors } = await render('/zheno-website/cart', {
    seed(window) {
      window.localStorage.setItem(
        'zhino_cart',
        JSON.stringify([
          { productId: 'jelly-strawberry', variantId: 'jelly-strawberry-250', quantity: 2 },
          { productId: 'custard-banana', variantId: 'custard-banana-250', quantity: 1 },
        ]),
      );
    },
  });
  expectContains('persisted cart', text, 'توت فرنگی');
  expectContains('persisted cart', text, 'موز');
  // subtotal = 3 × 200,000 = 600,000 (below free-shipping threshold)
  expectContains('persisted cart', text, '۶۰۰٬۰۰۰ تومان');
  // + standard shipping 50,000 = 650,000 total
  expectContains('persisted cart', text, '۶۵۰٬۰۰۰ تومان');
  expectContains('persisted cart', text, 'تا ارسال رایگان');
  expectNoErrors('persisted cart', errors);
}

// ── 7. Invalid stored cart must not break the page ──────────
{
  const { text, errors } = await render('/zheno-website/cart', {
    seed(window) {
      window.localStorage.setItem(
        'zhino_cart',
        JSON.stringify([{ productId: 'nope', variantId: 'nope', quantity: 3 }, { garbage: true }, 'junk']),
      );
    },
  });
  expectContains('invalid cart', text, 'سبد خرید شما خالی است');
  expectNoErrors('invalid cart', errors);
}

// ── 8. Corrupt (non-JSON) stored cart ───────────────────────
{
  const { text, errors } = await render('/zheno-website/cart', {
    seed(window) {
      window.localStorage.setItem('zhino_cart', '{{{not-json');
    },
  });
  expectContains('corrupt cart', text, 'سبد خرید شما خالی است');
  expectNoErrors('corrupt cart', errors);
}

// ── 9. Checkout with empty cart redirects to cart ───────────
{
  const { text, errors } = await render('/zheno-website/checkout');
  expectContains('empty checkout guard', text, 'سبد خرید شما خالی است');
  expectNoErrors('empty checkout guard', errors);
}

// ── 10. Checkout with items renders form + free shipping ────
{
  const { text, errors } = await render('/zheno-website/checkout', {
    seed(window) {
      window.localStorage.setItem(
        'zhino_cart',
        JSON.stringify([{ productId: 'jelly-peach', variantId: 'jelly-peach-250', quantity: 4 }]),
      );
    },
  });
  expectContains('checkout form', text, 'تسویه حساب');
  expectContains('checkout form', text, 'مشخصات تحویل‌گیرنده');
  // 4 × 200,000 = 800,000 → free shipping unlocked
  expectContains('checkout form', text, 'ارسال سفارش شما رایگان شد');
  expectNoErrors('checkout form', errors);
}

// ── 11. Add-to-cart click → success toast ───────────────────
{
  const { text, errors, toastText } = await render('/zheno-website/products', {
    clickAddToCart: true,
  });
  expectContains('add-to-cart click', toastText || text, 'به سبد خرید اضافه شد');
  expectNoErrors('add-to-cart click', errors);
}

// ── 12. Recipes / About / Contact / 404 ─────────────────────
{
  const r = await render('/zheno-website/recipes');
  expectContains('recipes', r.text, 'دستور تهیه ژله');
  expectContains('recipes', r.text, 'دستور تهیه کاستر');
  expectContains('recipes', r.text, '۱.۵ لیوان آب');
  expectContains('recipes', r.text, '۲ قاشق شکر');
  expectNoErrors('recipes', r.errors);
}
{
  const r = await render('/zheno-website/about');
  expectContains('about', r.text, 'کیفیت واقعی');
  expectNoErrors('about', r.errors);
}
{
  const r = await render('/zheno-website/contact');
  expectContains('contact', r.text, 'تماس با ژینو');
  expectNoErrors('contact', r.errors);
}
{
  const r = await render('/zheno-website/this-page-does-not-exist');
  expectContains('404 page', r.text, 'صفحه یافت نشد');
  expectNoErrors('404 page', r.errors);
}

console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
