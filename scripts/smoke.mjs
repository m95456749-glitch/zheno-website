// ============================================================
// ZHINO — production-equivalent runtime smoke test (Node + jsdom)
//
// Bundles the real app source (src/main.tsx) with esbuild using the same
// production defines Vite uses (BASE_URL=/, NODE_ENV, frontend-only
// API mode), executes it in jsdom per route, and asserts the app
// renders content instead of a blank page — on BOTH the custom-domain
// root ("/...") and the legacy repository sub-path
// ("/zheno-website/...").
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
const BASE_DEFINES = {
  'process.env.NODE_ENV': '"production"',
  'import.meta.env.BASE_URL': '"/"',
  'import.meta.env.MODE': '"production"',
  'import.meta.env.DEV': 'false',
  'import.meta.env.PROD': 'true',
  'import.meta.env.VITE_API_BASE_URL': '""',
  'import.meta.env.VITE_ENABLE_CHECKOUT': '"true"',
  'import.meta.env.VITE_ENABLE_ACCOUNT': '"false"',
  'import.meta.env.VITE_ADMIN_AUTH_MODE': '"demo"',
  // No database configured → the local/base-data mode the site has always had.
  'import.meta.env.VITE_SUPABASE_URL': '""',
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '""',
  'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
};

function buildApp(defines) {
  return buildSync({
    entryPoints: ['src/main.tsx'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    write: false,
    logLevel: 'silent',
    define: defines,
  }).outputFiles[0].text;
}

let appCode;
let appCodeWithDb;
let appCodeConnected;
let appCodeSecretKey;
try {
  appCode = buildApp(BASE_DEFINES);
  ok(`app bundles for runtime test (${(appCode.length / 1024).toFixed(0)} KB)`);

  // Same app, configured for a database. The first variant keeps the
  // demo admin-auth mode (used to prove the storefront renders from base
  // data when the database cannot be reached), the second uses the real
  // Supabase provider (used to prove the admin write path).
  // A bundle configured with a SECRET key on purpose: the app must refuse
  // the database and refuse to use it, not ship it into the panel.
  const secretKeyDefines = {
    ...BASE_DEFINES,
    'import.meta.env.VITE_SUPABASE_URL': '"https://smoke-test.supabase.co"',
    // Assembled at runtime so this test fixture is not itself a string that
    // resembles a committed secret key (scripts/verify-supabase.mjs scans
    // this repository for exactly that).
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
      'sb_' + 'secret_smoke_test_placeholder_value',
    ),
  };
  appCodeSecretKey = buildApp(secretKeyDefines);
  ok('app bundles with a secret key configured (refusal test)');

  const dbDefines = {
    ...BASE_DEFINES,
    'import.meta.env.VITE_SUPABASE_URL': '"https://smoke-test.supabase.co"',
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '"sb_publishable_smoke_test_key"',
  };
  appCodeWithDb = buildApp(dbDefines);
  appCodeConnected = buildApp({ ...dbDefines, 'import.meta.env.VITE_ADMIN_AUTH_MODE': '""' });
  ok('app bundles with a database configured (connected + offline-fallback tests)');
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
async function render(
  path,
  { seed, clickAddToCart = false, settleMs = 0, appSource, fetchStub, exposeNodeApis = false } = {},
) {
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
      // jsdom ships no fetch/Headers/Response; the app's (optional)
      // database layer needs them. Either stub fetch so requests fail
      // like an offline network, or expose the real Node primitives so a
      // simulated PostgREST backend can answer them.
      // A stub wins over the real implementation: jsdom has no fetch, and
      // a test must never reach the network by accident.
      if (fetchStub) window.fetch = fetchStub;
      if (exposeNodeApis) {
        if (!fetchStub) window.fetch = globalThis.fetch;
        window.Headers = globalThis.Headers;
        window.Request = globalThis.Request;
        window.Response = globalThis.Response;
        window.AbortController = globalThis.AbortController;
        window.TextEncoder = globalThis.TextEncoder;
        window.TextDecoder = globalThis.TextDecoder;
      }
    },
  });

  if (seed) seed(dom.window);

  const { document } = dom.window;
  const script = document.createElement('script');
  script.textContent = appSource ?? appCode;
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

  // Optional settle window (lets the 3 s hero rotation advance) before inventory.
  if (settleMs > 0) await sleep(settleMs);

  const text = rootEl?.textContent ?? '';
  const toastText = document.querySelector('[role="status"]')?.textContent ?? '';
  // Hero slideshow inventory (imgs inside the hero section only — product
  // cards further down the page also render images and must not be mixed in)
  const heroSection = document.querySelector('section[aria-label="معرفی ژینو"]');
  const heroImgs = heroSection ? Array.from(heroSection.querySelectorAll('img')) : [];
  const heroImgSrcs = heroImgs.map((img) => img.getAttribute('src') ?? '');
  const heroFirstPriority = heroImgs[0]?.getAttribute('fetchpriority') ?? '';
  const heroWebpSrcs = heroSection
    ? Array.from(heroSection.querySelectorAll('source[type="image/webp"]')).map(
        (el) => el.getAttribute('srcset') ?? '',
      )
    : [];
  // rotation dots: one per slide in the rotation (mounted or not)
  const heroDots = heroSection
    ? heroSection.querySelectorAll('div[aria-hidden="true"] span.rounded-full').length
    : 0;
  // link hrefs (e.g. to verify the hidden footer entry)
  const links = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
  const result = { text, errors, toastText, heroImgSrcs, heroFirstPriority, heroWebpSrcs, heroDots, links };
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
  const { text, errors, heroImgSrcs, heroFirstPriority, heroWebpSrcs, heroDots } =
    await render('/zheno-website/');
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
  expectContains('home', text, 'طعم‌ های جذاب،');
  expectContains('home', text, 'در یک مجموعه');
  expectContains('home', text, 'واردکننده و پخش‌کننده پودر ژله و کاستر');
  // Hero slideshow: ONLY the owner-uploaded real finished-dessert photos.
  // Progressive loading mounts the visible slide + the next one on first
  // paint (not all 9), while the rotation still covers all 9 (dots).
  const realSlides = heroImgSrcs.filter((s) => s.includes('images/IMG_20260903_002'));
  if (realSlides.length === 2) ok('hero first paint mounts visible + next slide only (progressive)');
  else
    fail(
      `hero first paint must mount exactly 2 slides, found ${realSlides.length} ` +
        `(all hero imgs: ${heroImgSrcs.join(', ')})`,
    );
  if (heroDots === 9) ok('hero rotation still covers all 9 real dessert photos (dots)');
  else fail(`hero rotation must cover 9 slides, found ${heroDots} dots`);
  if (heroFirstPriority === 'high') ok('hero LCP slide loads with high priority');
  else fail(`first hero slide must have fetchpriority="high" (got: "${heroFirstPriority}")`);
  const webpOk =
    heroWebpSrcs.length === realSlides.length &&
    heroWebpSrcs.every((ss) => ss.includes('images/opt/') && ss.includes('480w') && ss.includes('860w'));
  if (webpOk) ok('hero slides serve responsive WebP with JPEG fallback');
  else fail(`hero WebP srcsets missing/malformed: ${JSON.stringify(heroWebpSrcs)}`);
  const bannedHeroImgs = heroImgSrcs.filter((s) =>
    ['jelly-powder-hero', 'hero-dish', 'showcase/', 'images/products/'].some((b) => s.includes(b)),
  );
  if (bannedHeroImgs.length === 0) ok('hero has no powder/product/generated images');
  else fail(`hero must not contain powder/product/generated images: ${bannedHeroImgs.join(', ')}`);
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

// ── 1b. Custom-domain root mount (https://zheno.devs.surf/) ───
// The same build must render at "/" — a hardcoded sub-path basename
// here is what produced the blank white page on the custom domain.
{
  const { text, errors, heroImgSrcs } = await render('/');
  if (text.trim().length > 200) ok('root home renders substantial content (not blank)');
  else fail(`root home looks blank (only ${text.trim().length} chars)`);
  expectContains('root home', text, 'ژینو');
  expectContains('root home', text, 'طعم‌ های جذاب،');
  expectContains('root home', text, 'در یک مجموعه');
  expectContains('root home', text, 'واردکننده و پخش‌کننده پودر ژله و کاستر');
  expectContains('root home', text, 'مشاهده محصولات');
  // After one 3 s rotation the slideshow mounts one more slide ahead,
  // so the upcoming photo always has a full interval to preload.
  const rotated = await render('/', { settleMs: 4000 });
  const rotatedSlides = rotated.heroImgSrcs.filter((s) => s.includes('images/IMG_20260903_002'));
  if (rotatedSlides.length === 3) ok('hero rotation progressively mounts the next slide');
  else fail(`hero rotation must mount 3 slides after ~4 s, found ${rotatedSlides.length}`);
  const rooted = heroImgSrcs.filter((s) => s.startsWith('/images/'));
  if (rooted.length === heroImgSrcs.length && rooted.length > 0)
    ok('root hero images resolve from the domain root (/images/…)');
  else fail(`root hero images must start with /images/ (got: ${heroImgSrcs.join(', ')})`);
  expectNoErrors('root home', errors);
}
{
  const r = await render('/products');
  expectContains('root products', r.text, 'محصولات ژینو');
  expectContains('root products', r.text, 'ژله انار');
  expectNoErrors('root products', r.errors);
}
{
  const r = await render('/products/jelly-strawberry');
  expectContains('root product detail', r.text, 'پودر ژله توت فرنگی ژینو');
  expectNoErrors('root product detail', r.errors);
}
{
  const r = await render('/cart');
  expectContains('root cart', r.text, 'سبد خرید شما خالی است');
  expectNoErrors('root cart', r.errors);
}
{
  const r = await render('/admin/login');
  expectContains('root admin login', r.text, 'ورود به پنل مدیریت');
  expectNoErrors('root admin login', r.errors);
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

// ── 13. Hidden admin entry — the quiet three-flag footer group ──
{
  const { text, links, errors } = await render('/zheno-website/');
  expectContains('footer flags', text, '🇮🇷');
  expectContains('footer flags', text, '🇹');
  expectContains('footer flags', text, '🇮🇶');
  if (links.some((h) => h.includes('/admin/login'))) ok('footer flag group links to /admin/login');
  else fail('footer flag group must link to /admin/login');
  expectNoErrors('footer flags', errors);
}

// ── 14. Admin login page (honest demo-auth disclosure) ──────
{
  const { text, errors } = await render('/zheno-website/admin/login');
  expectContains('admin login', text, 'ورود به پنل مدیریت');
  expectContains('admin login', text, 'احراز هویت واقعی');
  expectNotContains('admin login', text, 'سفارش‌های در انتظار');
  expectNoErrors('admin login', errors);
}

// ── 15. Admin guard — no session means the login page ───────
{
  const { text, errors } = await render('/zheno-website/admin');
  expectContains('admin guard', text, 'ورود به پنل مدیریت');
  expectNoErrors('admin guard', errors);
}
{
  const { text, errors } = await render('/zheno-website/admin/products');
  expectContains('admin deep-link guard', text, 'ورود به پنل مدیریت');
  expectNoErrors('admin deep-link guard', errors);
}

// ── 16. Demo login flow → dashboard (in-memory session) ─────
{
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
    url: 'http://localhost/zheno-website/admin/login',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.scrollTo = () => undefined;
      window.scrollBy = () => undefined;
      // seed one recorded order (exactly what the frontend-only checkout writes)
      window.localStorage.setItem(
        'zhino_admin_orders_v1',
        JSON.stringify([
          {
            id: 'ZH-SMOKE01',
            createdAt: new Date().toISOString(),
            status: 'new',
            items: [
              {
                productId: 'jelly-strawberry',
                variantId: 'jelly-strawberry-250',
                quantity: 3,
                productName: 'ژله توت فرنگی',
                weight: '۲۵۰ گرم',
                unitPrice: 200000,
              },
            ],
            customer: { firstName: 'سارا', lastName: 'محمدی', phone: '09120000000', email: '' },
            address: { province: 'تهران', city: 'تهران', address: 'خیابان نمونه', postalCode: '1234567890' },
            shippingMethod: 'standard',
            subtotal: 600000,
            shippingCost: 50000,
            total: 650000,
          },
        ]),
      );
    },
  });

  const { document } = dom.window;
  const script = document.createElement('script');
  script.textContent = appCode;
  document.body.appendChild(script);

  const deadline = Date.now() + 12000;
  let loginForm = null;
  while (Date.now() < deadline) {
    const form = document.querySelector('form');
    if (form && document.querySelector('input[autocomplete="username"]')) {
      loginForm = form;
      break;
    }
    await sleep(100);
  }

  if (!loginForm) {
    fail('admin login form did not render');
  } else {
    // fill the controlled inputs the way a user would (native setter + input event)
    const setReactValue = (input, value) => {
      const proto =
        input.tagName === 'TEXTAREA'
          ? dom.window.HTMLTextAreaElement.prototype
          : dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    setReactValue(document.querySelector('input[autocomplete="username"]'), 'admin');
    setReactValue(document.querySelector('input[type="password"]'), 'demo-1234');
    loginForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

    const text = () => document.getElementById('root')?.textContent ?? '';
    const textDeadline = Date.now() + 12000;
    let sawDashboard = false;
    while (Date.now() < textDeadline) {
      if (text().includes('سفارش‌های در انتظار')) {
        sawDashboard = true;
        break;
      }
      await sleep(100);
    }
    if (sawDashboard) {
      ok('demo login reaches the dashboard (in-memory session)');
      const t = text();
      expectContains('admin dashboard', t, 'ZH-SMOKE01');
      expectContains('admin dashboard', t, 'سارا');
      expectContains('admin dashboard', t, '۶۵۰٬۰۰۰ تومان');
      // main admin navigation is present
      expectContains('admin dashboard', t, 'محصولات');
      expectContains('admin dashboard', t, 'سفارش‌ها');
      expectContains('admin dashboard', t, 'موجودی');
      expectContains('admin dashboard', t, 'تنظیمات');
      expectContains('admin dashboard', t, 'خروج');
      // demo-mode disclosure is visible
      expectContains('admin dashboard', t, 'نمایشی');
    } else {
      fail('demo login did not reach the dashboard (text: ' + text().slice(0, 220) + ')');
    }
  }

  dom.window.close();
  expectNoErrors('admin login flow', errors);
}

// ── 17. Database configured but unreachable → storefront still renders ──
// The admin panel may be connected to Supabase; the public site must
// never depend on that connection to render.
{
  const fetchStub = () => Promise.reject(new Error('offline (smoke test)'));
  const home = await render('/zheno-website/', { appSource: appCodeWithDb, fetchStub, settleMs: 300 });
  if (home.text.trim().length > 200) ok('offline database — home renders from base data (not blank)');
  else fail(`offline database — home looks blank (only ${home.text.trim().length} chars)`);
  expectContains('offline database home', home.text, 'ژینو');

  const products = await render('/zheno-website/products', { appSource: appCodeWithDb, fetchStub });
  expectContains('offline database products', products.text, 'ژله توت فرنگی');

  const adminLogin = await render('/zheno-website/admin/login', { appSource: appCodeWithDb, fetchStub });
  expectContains('offline database admin login', adminLogin.text, 'ورود به پنل مدیریت');

  // A configured-but-unreachable database must not produce console noise
  // beyond the failed request itself (no crash, no unhandled rejection).
  const fatal = [...home.errors, ...products.errors, ...adminLogin.errors].filter(
    (e) => !/offline \(smoke test\)|Failed to fetch|fetch failed|NetworkError/i.test(e),
  );
  if (fatal.length === 0) ok('offline database — no fatal runtime errors (graceful fallback)');
  else fail('offline database runtime errors:\n    - ' + fatal.join('\n    - '));
}

// ── 18. Connected mode — the storefront reads the database ──
// A simulated PostgREST backend answers the three catalog reads the
// app performs (products / product_variants / inventory). This proves
// the read path end-to-end: rows → Product model → storefront render.
{
  const DB_ROWS = {
    products: [
      {
        id: 'jelly-strawberry',
        category: 'jelly',
        flavor_id: 'strawberry-j',
        name: 'پودر ژله توت فرنگی ژینو (دیتابیس)',
        short_name: 'ژله توت فرنگی دیتابیس',
        category_label: 'پودر ژله',
        image_url: 'images/products/jelly-strawberry.jpg',
        active: true,
        featured: true,
        special: false,
      },
    ],
    product_variants: [
      {
        id: 'jelly-strawberry-250',
        product_id: 'jelly-strawberry',
        weight: '۲۵۰ گرم',
        weight_grams: 250,
        price: 200000,
        sku: 'ZJ-STR-250',
      },
    ],
    inventory: [{ variant_id: 'jelly-strawberry-250', current_stock: 7, active: true }],
  };

  const seen = [];
  // PostgREST answers GET /rest/v1/<table>?select=… with a JSON array.
  const dbFetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    seen.push(url);
    const table = Object.keys(DB_ROWS).find((t) => url.includes(`/rest/v1/${t}`));
    const body = table ? JSON.stringify(DB_ROWS[table]) : '[]';
    return new globalThis.Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' },
    });
  };

  const products = await render('/zheno-website/products', {
    appSource: appCodeWithDb,
    exposeNodeApis: true,
    settleMs: 400,
    fetchStub: dbFetch,
  });

  const readTables = ['products', 'product_variants', 'inventory'].filter((t) =>
    seen.some((u) => u.includes(`/rest/v1/${t}`)),
  );
  if (readTables.length === 3) ok('connected mode — catalog read from the database (3 tables)');
  else fail(`connected mode — expected 3 catalog reads, saw: ${seen.join(' | ') || 'none'}`);

  expectContains('connected mode products', products.text, 'ژله توت فرنگی دیتابیس');
  // Only the single database row is sold: the other 21 base products are
  // not shown, i.e. the database really is the source of truth.
  expectNotContains('connected mode products', products.text, 'ژله انار');

  const home = await render('/zheno-website/', {
    appSource: appCodeWithDb,
    exposeNodeApis: true,
    settleMs: 400,
    fetchStub: dbFetch,
  });
  if (home.text.trim().length > 200) ok('connected mode — home renders with database data');
  else fail('connected mode — home looks blank');
}

// ── 19. Connected mode — admin session writes to the database ──
// A simulated Supabase backend (Auth + PostgREST) answers the login,
// the is_admin() check and the two admin writes (stock RPC + product
// active flag). This proves the write path: UI action → HTTP request
// with the right payload → optimistic UI → authoritative re-read.
{
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        sub: '00000000-0000-0000-0000-000000000001',
        role: 'authenticated',
        aud: 'authenticated',
        email: 'admin@example.com',
        app_metadata: { role: 'admin' },
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url'),
    'signature',
  ].join('.');

  const calls = [];
  let productActive = true;
  let currentStock = 25;

  const dbFetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method ?? (typeof input === 'string' ? 'GET' : input.method) ?? 'GET').toUpperCase();
    const body = typeof init.body === 'string' ? init.body : '';
    calls.push({ method, url, body });

    const json = (payload, status = 200) =>
      new globalThis.Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    if (url.includes('/auth/v1/token')) {
      return json({
        access_token: jwt,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'smoke-refresh-token',
        user: {
          id: '00000000-0000-0000-0000-000000000001',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'admin@example.com',
          app_metadata: { role: 'admin' },
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      });
    }
    if (url.includes('/rest/v1/rpc/is_admin')) return json(true);
    if (url.includes('/rest/v1/rpc/set_inventory_stock')) {
      const payload = JSON.parse(body || '{}');
      currentStock = payload.p_current_stock;
      return json([{ variant_id: payload.p_variant_id, current_stock: currentStock, active: true }]);
    }
    if (url.includes('/rest/v1/products') && method === 'PATCH') {
      productActive = false;
      return new globalThis.Response(null, { status: 204 });
    }
    if (url.includes('/rest/v1/products')) {
      return json([
        {
          id: 'jelly-strawberry',
          category: 'jelly',
          flavor_id: 'strawberry-j',
          name: 'پودر ژله توت فرنگی ژینو',
          short_name: 'ژله توت فرنگی',
          category_label: 'پودر ژله',
          image_url: 'images/products/jelly-strawberry.jpg',
          active: productActive,
          featured: true,
          special: false,
        },
      ]);
    }
    if (url.includes('/rest/v1/product_variants')) {
      return json([
        {
          id: 'jelly-strawberry-250',
          product_id: 'jelly-strawberry',
          weight: '۲۵۰ گرم',
          weight_grams: 250,
          price: 200000,
          sku: 'ZJ-STR-250',
        },
      ]);
    }
    if (url.includes('/rest/v1/inventory')) {
      return json([{ variant_id: 'jelly-strawberry-250', current_stock: currentStock, active: true }]);
    }
    return json([]);
  };

  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    const msg = String(e?.message ?? e);
    if (/Could not load|ENOTFOUND|EAI_AGAIN|network|Not implemented|navigation/i.test(msg)) return;
    errors.push('jsdomError: ' + msg);
  });
  virtualConsole.on('error', (...args) => errors.push('console.error: ' + args.map(String).join(' ')));

  const dom = new JSDOM(SHELL, {
    url: 'http://localhost/zheno-website/admin/login',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.scrollTo = () => undefined;
      window.scrollBy = () => undefined;
      window.fetch = dbFetch;
      window.Headers = globalThis.Headers;
      window.Request = globalThis.Request;
      window.Response = globalThis.Response;
      window.AbortController = globalThis.AbortController;
      window.TextEncoder = globalThis.TextEncoder;
      window.TextDecoder = globalThis.TextDecoder;
    },
  });

  const { document } = dom.window;
  const script = document.createElement('script');
  script.textContent = appCodeConnected;
  document.body.appendChild(script);

  const waitFor = async (predicate, timeoutMs = 12000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await sleep(100);
    }
    return false;
  };

  const text = () => document.getElementById('root')?.textContent ?? '';
  const setReactValue = (input, value) => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  };

  const loginReady = await waitFor(() => document.querySelector('input[autocomplete="username"]'));
  if (!loginReady) {
    fail('connected admin — login form did not render');
  } else {
    setReactValue(document.querySelector('input[autocomplete="username"]'), 'admin@example.com');
    setReactValue(document.querySelector('input[type="password"]'), 'correct-horse-battery');
    document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

    const reachedDashboard = await waitFor(() => text().includes('سفارش‌های در انتظار'));
    if (reachedDashboard) ok('connected admin — Supabase Auth login + is_admin() accepted');
    else fail('connected admin — login did not reach the dashboard: ' + text().slice(0, 200));
    if (calls.some((c) => c.url.includes('/auth/v1/token'))) ok('connected admin — credentials sent to /auth/v1/token');
    else fail('connected admin — no auth request was made');
    if (calls.some((c) => c.url.includes('/rest/v1/rpc/is_admin'))) ok('connected admin — admin role verified via is_admin()');
    else fail('connected admin — is_admin() was never called');
    expectContains('connected admin', text(), 'متصل به دیتابیس');

    // navigate to inventory through the panel's own navigation (SPA link)
    const inventoryLink = Array.from(document.querySelectorAll('a')).find((a) =>
      (a.getAttribute('href') ?? '').endsWith('/admin/inventory'),
    );
    if (inventoryLink) inventoryLink.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    const onInventory = await waitFor(() => text().includes('موجودی (عدد)'));
    if (onInventory) ok('connected admin — inventory page reached through the panel nav');
    else fail('connected admin — inventory page did not render: ' + text().slice(0, 200));

    const stockInput = document.querySelector('input[aria-label^="موجودی"]');
    if (!stockInput) {
      fail('connected admin — stock input not found');
    } else {
      setReactValue(stockInput, '42');
      // React's onBlur listens to the bubbling 'focusout' event.
      stockInput.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }));
      const rpc = () => calls.find((c) => c.url.includes('/rest/v1/rpc/set_inventory_stock'));
      const saved = await waitFor(() => Boolean(rpc()));
      if (saved) ok('connected admin — stock saved through the atomic set_inventory_stock RPC');
      else fail('connected admin — stock update did not reach the database');
      const payload = rpc() ? JSON.parse(rpc().body) : {};
      if (payload.p_variant_id === 'jelly-strawberry-250' && payload.p_current_stock === 42) {
        ok('connected admin — stock payload is correct (variant + new value)');
      } else {
        fail(`connected admin — unexpected stock payload: ${JSON.stringify(payload)}`);
      }
    }

    // navigate to products and toggle the storefront visibility
    const productsLink = Array.from(document.querySelectorAll('a')).find((a) =>
      (a.getAttribute('href') ?? '').endsWith('/admin/products'),
    );
    if (productsLink) productsLink.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    const onProducts = await waitFor(() => text().includes('افزودن محصول'));
    if (onProducts) ok('connected admin — products page reached through the panel nav');
    else fail('connected admin — products page did not render: ' + text().slice(0, 200));

    const toggle = document.querySelector('button[role="switch"]');
    if (!toggle) {
      fail('connected admin — visibility toggle not found');
    } else {
      toggle.click();
      const patched = await waitFor(() => calls.find((c) => c.method.toUpperCase() === 'PATCH'));
      const patch = calls.find((c) => c.method.toUpperCase() === 'PATCH' && c.url.includes('/rest/v1/products'));
      if (patched && patch) ok('connected admin — visibility toggle PATCHed the product row');
      else fail(`connected admin — no PATCH to /rest/v1/products (saw: ${calls.map((c) => c.method + ' ' + c.url).slice(-3).join(' | ')})`);
      if (patch && JSON.parse(patch.body).active === false) ok('connected admin — payload sets active=false (hide, never delete)');
      else fail(`connected admin — unexpected product payload: ${patch ? patch.body : 'none'}`);
      if (!calls.some((c) => c.method.toUpperCase() === 'DELETE')) ok('connected admin — no DELETE request was ever sent');
      else fail('connected admin — a DELETE request was sent (must never happen)');
    }
  }

  dom.window.close();
  if (errors.length === 0) ok('connected admin flow — no runtime errors');
  else fail('connected admin flow runtime errors:\n    - ' + errors.join('\n    - '));
}

// ── 20. A secret key must never be used (security regression test) ──
{
  const res = await render('/zheno-website/products', { appSource: appCodeSecretKey });
  expectContains('secret-key build', res.text, 'ژله توت فرنگی');
  if (res.text.trim().length > 200) ok('secret-key build — storefront still renders (database refused)');
  else fail('secret-key build — page looks blank');
  const refused = res.errors.some((e) => /SECRET/i.test(e));
  if (refused) ok('secret-key build — the app logged a loud refusal instead of using the secret key');
  else fail('secret-key build — a service_role/secret key was accepted silently');
}

console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
