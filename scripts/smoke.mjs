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
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
  // دستیار ژینو (فاز ۵): هیچ Backend هوش مصنوعی‌ای پیکربندی نشده →
  // صفحهٔ /assistant باید کاملاً آفلاین و بدون درخواست شبکه کار کند.
  'import.meta.env.VITE_ASSISTANT_API_URL': '""',
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
let appCodeInsecureUrl;
let appCodeWithAssistant;
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

  // A plaintext endpoint would send the admin's JWT over http:// — it must
  // be refused exactly like a secret key (https required; localhost exempt).
  appCodeInsecureUrl = buildApp({
    ...BASE_DEFINES,
    'import.meta.env.VITE_SUPABASE_URL': '"http://insecure.example.com"',
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '"sb_publishable_smoke_test_key"',
  });
  ok('app bundles with a secret key configured (refusal test)');

  const dbDefines = {
    ...BASE_DEFINES,
    'import.meta.env.VITE_SUPABASE_URL': '"https://smoke-test.supabase.co"',
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '"sb_publishable_smoke_test_key"',
  };
  appCodeWithDb = buildApp(dbDefines);
  appCodeConnected = buildApp({ ...dbDefines, 'import.meta.env.VITE_ADMIN_AUTH_MODE': '""' });
  ok('app bundles with a database configured (connected + offline-fallback tests)');

  // Same app with the assistant's AI proxy configured (a fake endpoint:
  // the test proves the request shape and the UI, never a real model).
  appCodeWithAssistant = buildApp({
    ...BASE_DEFINES,
    'import.meta.env.VITE_ASSISTANT_API_URL': '"https://assistant.smoke.test/chat"',
  });
  ok('app bundles with the assistant backend configured (AI proxy test)');
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
 * `live: true` keeps the window open and returns `{ waitFor, dom, close }`
 * so a caller can POLL for a state instead of napping a fixed number of
 * milliseconds (fixed naps are what made time-dependent checks flaky on
 * slow/loaded machines). The caller must call `close()`.
 */
async function render(
  path,
  { seed, clickAddToCart = false, settleMs = 0, appSource, fetchStub, exposeNodeApis = false, live = false } = {},
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

  if (live) {
    // Same window, still running: poll for a state instead of guessing
    // how many milliseconds the app needs to get there.
    const waitFor = async (predicate, timeoutMs = 12000) => {
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        if (predicate()) return true;
        await sleep(100);
      }
      return false;
    };
    return {
      ...result,
      dom,
      document,
      waitFor,
      text: () => document.getElementById('root')?.textContent ?? '',
      close: () => dom.window.close(),
    };
  }

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
  // After one 3 s rotation the slideshow mounts one more slide ahead, so
  // the upcoming photo always has a full interval to preload.
  //
  // The mount count is TIMED (2 → 3 at the first rotation, → 4 at the
  // second), so it must be polled, not sampled after a fixed nap: on a
  // loaded 2-core box the interval fires late and a 4 s snapshot used to
  // land on 2 slides ("hero rotation must mount 3 slides after ~4 s,
  // found 2"). We now wait for the state and read it the moment it holds.
  {
    const live = await render('/', { live: true });
    const slideCount = () =>
      Array.from(
        live.document.querySelectorAll('section[aria-label="معرفی ژینو"] img'),
      ).filter((img) => (img.getAttribute('src') ?? '').includes('images/IMG_20260903_002')).length;
    const progressed = await live.waitFor(() => slideCount() >= 3, 15000);
    const mounted = slideCount();
    if (progressed && mounted === 3) ok('hero rotation progressively mounts the next slide');
    else fail(`hero rotation must mount 3 slides after one rotation, found ${mounted}`);
    live.close();
  }
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
// Poll for the redirected cart content: the <Navigate> flushes in
// the next React scheduler turn, so a single synchronous snapshot
// of the first paint could race the redirect under load.
{
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/checkout', {
    stub: { fetchImpl: () => Promise.reject(new Error('offline (smoke test)')) },
    appSource: appCode,
  });
  const redirected = await waitFor(() => text().includes('سبد خرید شما خالی است'));
  if (redirected) ok('empty checkout guard renders «سبد خرید شما خالی است»');
  else fail('empty checkout guard MISSING «سبد خرید شما خالی است»');
  if (errors.length === 0) ok('empty checkout guard — no runtime errors');
  else fail('empty checkout guard runtime errors:\n    - ' + errors.join('\n    - '));
  dom.window.close();
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
  expectNotContains('admin login', text, 'سفارش‌های جدید');
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
      if (text().includes('ZH-SMOKE01')) {
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
      // the six statistics cards are no longer rendered at the top of the
      // page — their labels must stay out of the default dashboard view
      for (const label of ['سفارش‌های جدید', 'در حال آماده‌سازی', 'سفارش‌های ارسال‌شده', 'سفارش‌های تکمیل‌شده', 'مجموع فروش', 'موجودی کم یا رو به اتمام']) {
        expectNotContains('admin dashboard (stat cards hidden by default)', t, label);
      }
      for (const label of ['داشبورد', 'سفارش‌ها', 'محصولات', 'موجودی', 'قیمت‌ها', 'تصاویر محصولات', 'محتوای سایت', 'دستور تهیه', 'تنظیمات']) {
        expectContains('admin circular launchers', t, label);
      }
      const launcherHrefs = Array.from(document.querySelectorAll('a')).map((link) => link.getAttribute('href') ?? '');
      for (const href of ['/admin/products?view=prices', '/admin/product-images']) {
        if (launcherHrefs.some((actual) => actual.endsWith(href))) ok(`admin circular launchers link to ${href}`);
        else fail(`admin circular launchers missing ${href}`);
      }

      // ── «تصاویر محصولات» — the dedicated gallery section ──
      // Reached through the panel's own navigation, in demo mode (no
      // Supabase configured): it must list every product with its
      // flavour, offer upload/replace, and never pretend the photos
      // reached a real store.
      const waitForText = async (needle, ms = 12000) => {
        const until = Date.now() + ms;
        while (Date.now() < until) {
          if (text().includes(needle)) return true;
          await sleep(100);
        }
        return false;
      };
      const imagesLink = Array.from(document.querySelectorAll('a')).find((link) =>
        (link.getAttribute('href') ?? '').endsWith('/admin/product-images'),
      );
      if (!imagesLink) {
        fail('admin images — the panel navigation has no link to /admin/product-images');
      } else {
        imagesLink.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        if (await waitForText('بارگذاری تصویر')) ok('admin images — the gallery page renders through the panel nav');
        else fail('admin images — the gallery page did not render: ' + text().slice(0, 220));

        expectContains('admin images', text(), 'پودر ژله انار ژینو');
        expectContains('admin images', text(), 'طعم');
        expectContains('admin images', text(), 'جایگزینی تصویر اصلی');
        expectContains('admin images', text(), 'گالری این محصول');
        expectContains('admin images', text(), 'تصویر اصلی دارد');
        // demo mode must stay honest about where the bytes would go
        expectContains('admin images', text(), 'حالت نمایشی');
        expectContains('admin images', text(), 'حافظهٔ همین مرورگر');
        // the 22 committed photos are all registered in the gallery
        const frames = document.querySelectorAll('.adm-image-card').length;
        if (frames === 22) ok('admin images — all 22 products are listed with their photos');
        else fail(`admin images — expected 22 product cards, found ${frames}`);

        // Deleting always asks first, and the destructive button stays
        // locked until the manager ticks the confirmation box.
        const deleteControl = document.querySelector('button[aria-label^="حذف تصویر"]');
        if (!deleteControl) {
          fail('admin images — no delete control on a gallery thumbnail');
        } else {
          deleteControl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
          if (await waitForText('حذف قطعی تصویر')) ok('admin images — deletion opens a confirmation dialog');
          else fail('admin images — no confirmation dialog appeared before deleting');

          const confirmButton = Array.from(document.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('حذف قطعی تصویر'),
          );
          if (confirmButton && confirmButton.disabled) {
            ok('admin images — the destructive button is locked until the admin confirms');
          } else {
            fail('admin images — the destructive button was clickable without confirmation');
          }
          expectContains('admin images delete dialog', text(), 'سفارش‌ها، سبد خرید و قیمت‌ها دست‌نخورده می‌مانند');

          const cancelButton = Array.from(document.querySelectorAll('button')).find((button) =>
            button.textContent?.trim() === 'انصراف',
          );
          if (cancelButton) {
            cancelButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
            const closed = await waitForText('گالری این محصول');
            if (closed && !document.querySelector('.adm-modal')) ok('admin images — «انصراف» closes the dialog without deleting');
            else fail('admin images — the delete dialog did not close on «انصراف»');
          } else {
            fail('admin images — the delete dialog has no «انصراف» button');
          }
        }
      }
      // the stat cards were removed, so their customization panel must be
      // gone too — a control that only stores preferences while no card is
      // rendered would be fake UI
      const customizeButton = Array.from(document.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('تنظیم کارت‌ها'),
      );
      if (!customizeButton) {
        ok('admin dashboard — no card customization controls remain (stat cards removed)');
      } else {
        fail('admin dashboard — the card customization button is still present');
      }
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

  // The three catalog reads are asynchronous (fetch + commit), so poll for
  // them rather than sampling the DOM after a fixed 400 ms nap — on a slow
  // or loaded machine the reads had not all landed yet and the run failed
  // with «expected 3 catalog reads, saw: products | product_variants».
  const products = await render('/zheno-website/products', {
    appSource: appCodeWithDb,
    exposeNodeApis: true,
    live: true,
    fetchStub: dbFetch,
  });
  const CATALOG_TABLES = ['products', 'product_variants', 'inventory'];
  const readTables = () => CATALOG_TABLES.filter((t) => seen.some((u) => u.includes(`/rest/v1/${t}`)));
  const allRead = await products.waitFor(() => readTables().length === CATALOG_TABLES.length, 12000);

  if (allRead && readTables().length === 3) ok('connected mode — catalog read from the database (3 tables)');
  else fail(`connected mode — expected 3 catalog reads, saw: ${seen.join(' | ') || 'none'}`);

  expectContains('connected mode products', products.text(), 'ژله توت فرنگی دیتابیس');
  // Only the single database row is sold: the other 21 base products are
  // not shown, i.e. the database really is the source of truth.
  expectNotContains('connected mode products', products.text(), 'ژله انار');
  products.close();

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
    let headers = {};
    try {
      headers = Object.fromEntries(new globalThis.Headers(init.headers ?? {}).entries());
    } catch {
      /* header capture is best-effort */
    }
    calls.push({ method, url, body, headers });

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

    const reachedDashboard = await waitFor(() => text().includes('متصل به دیتابیس'));
    if (reachedDashboard) ok('connected admin — Supabase Auth login + is_admin() accepted');
    else fail('connected admin — login did not reach the dashboard: ' + text().slice(0, 200));
    if (calls.some((c) => c.url.includes('/auth/v1/token'))) ok('connected admin — credentials sent to /auth/v1/token');
    else fail('connected admin — no auth request was made');
    if (calls.some((c) => c.url.includes('/rest/v1/rpc/is_admin'))) ok('connected admin — admin role verified via is_admin()');
    else fail('connected admin — is_admin() was never called');
    expectContains('connected admin', text(), 'متصل به دیتابیس');

    // ── credential hygiene: what actually travels to the database ──
    const PUBLISHABLE = 'sb_publishable_smoke_test_key';
    const bearerOf = (c) => (c.headers?.authorization ?? c.headers?.Authorization ?? '').replace(/^Bearer /i, '');
    const apikeyOf = (c) => c.headers?.apikey ?? c.headers?.ApiKey ?? '';
    const writes = calls.filter(
      (c) => c.method !== 'GET' && !c.url.includes('/auth/v1/'),
    );
    const firstRead = calls.find((c) => c.url.includes('/rest/v1/products') && c.method === 'GET');
    const privileged = writes.filter((c) => Boolean(bearerOf(c)));

    if (writes.length > 0 && privileged.length === writes.length) {
      ok('credential hygiene — every database write is authenticated (no anonymous write)');
    } else {
      fail(`credential hygiene — ${writes.length - privileged.length} write(s) went out unauthenticated: ${JSON.stringify(writes.map((c) => c.method + ' ' + c.url))}`);
    }
    if (privileged.every((c) => bearerOf(c).startsWith('ey'))) {
      ok('credential hygiene — writes carry the signed-in user JWT (access token)');
    } else {
      fail('credential hygiene — a write did not use the user access token');
    }
    if (writes.every((c) => apikeyOf(c) === PUBLISHABLE || apikeyOf(c) === '')) {
      ok('credential hygiene — apikey header is only the publishable key');
    } else {
      fail(`credential hygiene — unexpected apikey header: ${writes.map((c) => apikeyOf(c)).join(', ')}`);
    }
    // the user JWT must be the signed-in account, never a service key
    const jwtRole = (() => {
      try {
        return JSON.parse(Buffer.from(bearerOf(privileged[0]).split('.')[1], 'base64url')).role;
      } catch {
        return null;
      }
    })();
    if (jwtRole === 'authenticated') ok('credential hygiene — writes run as role=authenticated (RLS applies)');
    else fail(`credential hygiene — unexpected write role: ${String(jwtRole)}`);
    if (firstRead && bearerOf(firstRead) === PUBLISHABLE && apikeyOf(firstRead) === PUBLISHABLE) {
      ok('credential hygiene — anonymous catalogue reads use the publishable key only');
    } else {
      fail(`credential hygiene — unexpected anonymous read credentials: ${firstRead ? JSON.stringify(firstRead.headers) : 'no read captured'}`);
    }
    if (!JSON.stringify(calls).includes('sb_secret') && !JSON.stringify(calls).includes('service_role')) {
      ok('credential hygiene — no secret/service_role material in any request');
    } else {
      fail('credential hygiene — a secret/service_role value appeared in a request');
    }

    // navigate to inventory through the panel's own navigation (SPA link)
    // Re-queried per attempt: on a loaded machine a single synthetic click
    // can be lost (stale node / mid-commit), and a user would click again.
    const clickEl = (element) =>
      element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    const findInventoryLink = () =>
      Array.from(document.querySelectorAll('a')).find((a) =>
        (a.getAttribute('href') ?? '').endsWith('/admin/inventory'),
      );
    const onInventory = await clickUntil(
      clickEl,
      findInventoryLink,
      () => text().includes('موجودی (عدد)'),
      waitFor,
    );
    if (onInventory) ok('connected admin — inventory page reached through the panel nav');
    else fail('connected admin — inventory page did not render: ' + text().slice(0, 200));

    const stockInput = document.querySelector('input[aria-label^="موجودی"]');
    if (!stockInput) {
      fail('connected admin — stock input not found');
    } else {
      const rpc = () => calls.find((c) => c.url.includes('/rest/v1/rpc/set_inventory_stock'));
      // A real user types and then leaves the field: two separate tasks,
      // with React committing the draft state in between. The panel's
      // onBlur handler (`commit`) reads that draft from its own render
      // closure, so firing both synthetic events inside a single task can
      // hand it the *previous* value — it then compares the old number with
      // itself and no save goes out at all.
      //
      // That is exactly what happened once on a pinned CPU («stock update
      // did not reach the database», empty payload after a 12 s poll). The
      // precise scheduling detail inside React is not what matters here —
      // what matters is that the check now behaves like a user: type, let
      // React commit, then blur; and if the save still did not go out,
      // retype and blur again instead of declaring a failure.
      const retypeAndBlur = async () => {
        setReactValue(stockInput, '42');
        // one macrotask: the pending React commit is flushed before this
        // timer callback runs (microtasks always drain first)
        await sleep(60);
        // React's onBlur listens to the bubbling 'focusout' event.
        stockInput.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }));
      };
      let saved = false;
      for (let attempt = 0; attempt < 4 && !saved; attempt += 1) {
        await retypeAndBlur();
        saved = await waitFor(() => Boolean(rpc()), 3000);
      }
      if (saved) ok('connected admin — stock saved through the atomic set_inventory_stock RPC');
      else
        fail(
          'connected admin — stock update did not reach the database (field connected=' +
            `${stockInput.isConnected}, value=${stockInput.value}; database calls seen: ` +
            `${calls.map((c) => `${c.method} ${String(c.url).replace(/^https?:\/\/[^/]+/, '')}`).join(' , ') || 'none'})`,
        );
      const payload = rpc() ? JSON.parse(rpc().body) : {};
      if (payload.p_variant_id === 'jelly-strawberry-250' && payload.p_current_stock === 42) {
        ok('connected admin — stock payload is correct (variant + new value)');
      } else {
        fail(`connected admin — unexpected stock payload: ${JSON.stringify(payload)}`);
      }
    }

    // navigate to products and toggle the storefront visibility
    const findProductsLink = () =>
      Array.from(document.querySelectorAll('a')).find((a) =>
        (a.getAttribute('href') ?? '').endsWith('/admin/products'),
      );
    const onProducts = await clickUntil(
      clickEl,
      findProductsLink,
      () => text().includes('افزودن محصول'),
      waitFor,
    );
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

/* ── shared Supabase stub (Auth + PostgREST) for the security tests ── */
// `orders` / `orderItems` seed the admin order reads; `createOrder`
// controls the guest checkout RPC ('accept' | 'reject-stock').
function makeSupabaseStub({
  isAdmin = true,
  activeById = {},
  stock = 25,
  rows,
  orders = [],
  orderItems = [],
  createOrder = 'accept',
  images = null,
  // true ⇒ the Storage bucket does not exist yet (the live project's
  // failure state before the images migration is applied). Flipping
  // stub.flags.bucketMissing to false simulates applying the migration.
  bucketMissing = false,
} = {}) {
  const calls = [];
  const flags = { bucketMissing };
  const createdOrderPayloads = [];
  const orderStatusPatches = [];
  const productPatches = [];
  const insertedImages = [];
  const deletedImageIds = [];
  const primaryPromotions = [];
  const uploadedObjects = [];
  const removedObjects = [];
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        sub: '00000000-0000-0000-0000-000000000001',
        role: 'authenticated',
        aud: 'authenticated',
        email: 'admin@example.com',
        app_metadata: isAdmin ? { role: 'admin' } : {},
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url'),
    'signature',
  ].join('.');

  const products = rows ?? [
    {
      id: 'jelly-strawberry',
      category: 'jelly',
      flavor_id: 'strawberry-j',
      name: 'پودر ژله توت فرنگی ژینو',
      short_name: 'ژله توت فرنگی',
      category_label: 'پودر ژله',
      image_url: 'images/products/jelly-strawberry.jpg',
      active: activeById['jelly-strawberry'] ?? true,
      featured: true,
      special: false,
    },
  ];

  // ── gallery state (public.product_images + the Storage bucket) ──
  // API v3 fixture: the existing site photo is a preserved legacy primary.
  // This in-memory stub never executes migrations or seed SQL.
  const shopImageUrl = products[0]?.image_url ?? 'images/products/jelly-strawberry.jpg';
  const gallery = {
    rows:
      images ??
      [
        {
          id: 'aaaaaaaa-0000-0000-0000-000000000001',
          product_id: products[0]?.id ?? 'jelly-strawberry',
          storage_bucket: 'site-public',
          storage_path: shopImageUrl,
          storefront_url: shopImageUrl,
          alt_text: products[0]?.short_name ?? 'ژله توت فرنگی',
          is_primary: true,
          sort_order: 0,
          width: null,
          height: null,
          mime_type: 'image/jpeg',
          size_bytes: 0,
          source: 'legacy',
          created_at: '2026-09-12T08:00:00.000Z',
        },
      ],
    cleanup: [],
  };
  const operationReceipts = new Map();
  const liveObjects = new Set(gallery.rows.filter(row => row.source === 'upload').map(row => row.storage_path));
  const pathReferenced = path => gallery.rows.some(row => row.storage_path === path || row.storefront_url?.includes(path))
    || products.some(product => product.image_url?.includes(path));
  const retire = path => {
    if (pathReferenced(path)) return false;
    if (!gallery.cleanup.some(job => job.storage_path === path)) gallery.cleanup.push({
      storage_path: path, created_at: Date.now(), next_attempt_at: Date.now(),
      attempt_count: 0, claim_id: null, lease_until: null, completed_at: null,
    });
    return true;
  };

  const fetchImpl = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method ?? 'GET').toUpperCase();
    const body = typeof init.body === 'string' ? init.body : '';
    let headers = {};
    try {
      headers = Object.fromEntries(new globalThis.Headers(init.headers ?? {}).entries());
    } catch {
      /* best effort */
    }
    calls.push({ method, url, body, headers });

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
          app_metadata: isAdmin ? { role: 'admin' } : {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      });
    }
    if (url.includes('/rest/v1/rpc/is_admin')) return json(isAdmin);
    if (url.includes('/rest/v1/rpc/set_inventory_stock')) {
      return json([{ variant_id: 'jelly-strawberry-250', current_stock: stock, active: true }]);
    }
    if (url.includes('/rest/v1/rpc/create_order')) {
      const payload = JSON.parse(body || '{}');
      createdOrderPayloads.push(payload);
      if (createOrder === 'reject-stock') {
        return json({ message: 'insufficient_stock', details: null, hint: null }, 400);
      }
      return json([
        { order_id: 'ZH-SMOKE0R1', subtotal: 600000, shipping_cost: 50000, total: 650000 },
      ]);
    }
    if (url.includes('/rest/v1/order_items') && method === 'GET') return json(orderItems);
    if (url.includes('/rest/v1/orders') && method === 'GET') return json(orders);
    if (url.includes('/rest/v1/orders') && method === 'PATCH') {
      const payload = JSON.parse(body || '{}');
      orderStatusPatches.push({ url, payload, headers });
      return new globalThis.Response(null, { status: 204 });
    }
    // ── Storage: product photos (bucket 'product-images') ──
    if (url.includes('/storage/v1/object/product-images') && (method === 'POST' || method === 'PUT')) {
      if (flags.bucketMissing) {
        // exactly what Supabase Storage answers when the bucket does not exist
        return json({ statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' }, 400);
      }
      const objectPath = decodeURIComponent(
        url.split('/storage/v1/object/')[1].replace(/^product-images\//, ''),
      );
      if (!isAdmin || headers.authorization !== `Bearer ${jwt}`) return json({ message: 'admin_required', code: '42501' }, 403);
      if (gallery.cleanup.some(job => job.storage_path === objectPath)) return json({ message: 'image_retired', code: '42501' }, 403);
      if (liveObjects.has(objectPath)) return json({ message: 'The resource already exists', statusCode: '409' }, 409);
      liveObjects.add(objectPath);
      uploadedObjects.push({ path: objectPath, headers, method });
      return json({ Id: `storage-${uploadedObjects.length}`, Key: `product-images/${objectPath}` });
    }
    if (url.includes('/storage/v1/object/product-images') && method === 'DELETE') {
      const payload = JSON.parse(body || '{}');
      if (!isAdmin || headers.authorization !== `Bearer ${jwt}`) return json({ message: 'admin_required', code: '42501' }, 403);
      for (const path of payload.prefixes ?? []) {
        if (!gallery.cleanup.some(job => job.storage_path === path) || pathReferenced(path)) {
          return json({ message: 'permission denied', code: '42501' }, 403);
        }
      }
      for (const path of payload.prefixes ?? []) {
        liveObjects.delete(path);
        removedObjects.push(path);
      }
      return json([]);
    }

    // API v3: version gate, operation receipts, leased cleanup and completion
    // verification. A successful remove alone must NOT consume the queue entry.
    if (url.includes('/rest/v1/rpc/product_image_api_version')) {
      return isAdmin ? json(3) : json({ message: 'admin_required', code: 'P0001' }, 403);
    }
    if (url.includes('/rest/v1/product_image_cleanup')) {
      const params = new URL(url).searchParams;
      return json(gallery.cleanup.filter(job => params.get('completed_at') !== 'is.null' || job.completed_at === null)
        .slice(0, Number(params.get('limit') ?? gallery.cleanup.length)));
    }
    if (url.includes('/rest/v1/rpc/claim_product_image_cleanup')) {
      if (!isAdmin || headers.authorization !== `Bearer ${jwt}`) return json({ message: 'admin_required', code: 'P0001' }, 403);
      const args = JSON.parse(body); const now = Date.now();
      const jobs = gallery.cleanup.filter(job => job.completed_at === null && job.next_attempt_at <= now
        && (job.lease_until === null || job.lease_until <= now))
        .sort((a, b) => a.next_attempt_at - b.next_attempt_at || a.created_at - b.created_at)
        .slice(0, Math.max(1, Math.min(args.p_limit ?? 20, 20)));
      for (const job of jobs) {
        job.claim_id = randomUUID(); job.lease_until = now + 120_000;
        job.next_attempt_at = job.lease_until; job.attempt_count++;
      }
      return json(jobs.map(({ storage_path, claim_id }) => ({ storage_path, claim_id })));
    }
    if (url.includes('/rest/v1/rpc/complete_product_image_cleanup')) {
      if (!isAdmin || headers.authorization !== `Bearer ${jwt}`) return json({ message: 'admin_required', code: 'P0001' }, 403);
      const args = JSON.parse(body);
      const job = gallery.cleanup.find(job => job.storage_path === args.p_path);
      if (!job || job.claim_id !== args.p_claim_id) return json(false);
      if (job.completed_at !== null) return json(true);
      if (job.lease_until === null || job.lease_until <= Date.now()) return json(false);
      if (args.p_storage_confirmed !== true || liveObjects.has(job.storage_path) || pathReferenced(job.storage_path)) {
        job.lease_until = null;
        job.next_attempt_at = Date.now() + Math.min(3600, 5 * 2 ** Math.min(job.attempt_count, 10)) * 1000;
        return json(false);
      }
      job.completed_at = Date.now(); job.lease_until = null;
      return json(true);
    }
    if (url.includes('/rest/v1/rpc/retire_product_image_upload')) {
      if (!isAdmin || headers.authorization !== `Bearer ${jwt}`) return json({ message: 'admin_required', code: 'P0001' }, 403);
      return json(retire(JSON.parse(body).p_path));
    }
    if (url.includes('/rest/v1/rpc/manage_product_image')) {
      const args = JSON.parse(body); const payload = args.p_payload ?? {};
      if (!isAdmin || headers.authorization !== `Bearer ${jwt}`) return json({ message: 'admin_required', code: 'P0001' }, 403);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(payload.operation_id ?? '')) {
        return json({ message: 'invalid_image_operation', code: 'P0001' }, 400);
      }
      const request = JSON.stringify(args);
      const receipt = operationReceipts.get(payload.operation_id);
      if (receipt) return receipt.request === request ? json(receipt.result)
        : json({ message: 'image_operation_conflict', code: 'P0001' }, 400);
      const finish = result => {
        operationReceipts.set(payload.operation_id, { request, result: JSON.parse(JSON.stringify(result)) });
        return json(result);
      };
      const shop = products.find(p => p.id === args.p_product_id);
      if (!shop) return json({ message: 'product_not_found' }, 400);
      let row = gallery.rows.find(r => r.id === args.p_image_id);
      if (row && row.product_id !== shop.id) return json({ message:'image_product_mismatch' },400);
      if (args.p_action === 'register' && row) return json({ message: 'image_operation_conflict', code: 'P0001' }, 400);
      if (shop.image_url !== args.p_expected_url) return json({ message:'image_conflict' },400);
      const promote = target => {
        for (const r of gallery.rows) if (r.product_id === shop.id) r.is_primary = r.id === target.id;
        shop.image_url = target.storefront_url;
        primaryPromotions.push({ payload: { p_image_id: target.id }, headers });
      };
      const remove = target => {
        deletedImageIds.push(target.id);
        gallery.rows = gallery.rows.filter(r => r.id !== target.id);
        if (target.source === 'upload') retire(target.storage_path);
      };
      if (args.p_action === 'register') {
        if (!liveObjects.has(payload.storage_path)) return json({ message: 'image_object_missing', code: 'P0001' }, 400);
        if (gallery.cleanup.some(job => job.storage_path === payload.storage_path)) return json({ message: 'image_retired', code: 'P0001' }, 400);
        if (payload.replace_id && !payload.make_primary && shop.image_url) return json({ message: 'replacement_requires_primary', code: 'P0001' }, 400);
        const previous = payload.replace_id ? gallery.rows.find(r => r.id === payload.replace_id) : null;
        if (payload.replace_id && (!previous || previous.product_id !== shop.id || previous.storefront_url !== shop.image_url)) {
          return json({ message: 'image_conflict', code: 'P0001' }, 400);
        }
        row = { ...payload, id:args.p_image_id, product_id:shop.id, storage_bucket:'product-images',
          is_primary:false, source:'upload', sort_order:0, created_at:new Date().toISOString() };
        insertedImages.push({ payload:{...row}, headers }); gallery.rows.push(row);
        if (payload.make_primary || !shop.image_url) promote(row);
        if (payload.replace_id) {
          const previous = gallery.rows.find(r => r.id === payload.replace_id);
          if (previous?.source === 'upload') remove(previous);
        }
      } else if (!row) return json({message:'image_not_found'},400);
      else if (args.p_action === 'primary') promote(row);
      else if (args.p_action === 'alt') row.alt_text = payload.alt_text;
      else if (args.p_action === 'delete') {
        if (row.is_primary) {
          const next = gallery.rows.find(r => r.product_id === shop.id && r.id !== row.id);
          if (next) promote(next);
          else if (payload.allow_empty) shop.image_url = null;
          else return json({message:'last_product_image'},400);
        }
        remove(row); return finish({id:row.id,deleted:true});
      }
      return finish(row);
    }
    // v3 does NOT permit old primary writers or direct gallery DML, even for
    // admins. Refuse here too, so a client regression cannot pass this smoke.
    if (url.includes('/rest/v1/rpc/set_primary_product_image')) {
      return json({ message: 'image_api_upgrade_required', code: 'P0001' }, 400);
    }
    if (url.includes('/rest/v1/product_images') && method !== 'GET') {
      return json({ message: 'permission denied', code: '42501' }, 403);
    }
    if (url.includes('/rest/v1/product_images')) {
      const params = new URL(url).searchParams;
      return json(gallery.rows.filter(row => (!params.get('id') || params.get('id') === `eq.${row.id}`)
        && (!params.get('product_id') || params.get('product_id') === `eq.${row.product_id}`)));
    }

    if (url.includes('/rest/v1/products') && method === 'PATCH') {
      const payload = JSON.parse(body || '{}');
      const idMatch = url.match(/[?&]id=eq\.([^&]+)/);
      const shopRow = products.find((row) => row.id === (idMatch ? decodeURIComponent(idMatch[1]) : row.id));
      productPatches.push({ url, payload, headers });
      // pushProductImageUrl() is the only writer of image_url here
      if (shopRow && Object.prototype.hasOwnProperty.call(payload, 'image_url')) {
        shopRow.image_url = payload.image_url;
      }
      return new globalThis.Response(null, { status: 204 });
    }
    if (url.includes('/rest/v1/products')) return json(products);
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
      return json([{ variant_id: 'jelly-strawberry-250', current_stock: stock, active: true }]);
    }
    return json([]);
  };

  return {
    fetchImpl,
    calls,
    jwt,
    flags,
    createdOrderPayloads,
    orderStatusPatches,
    productPatches,
    gallery,
    products,
    insertedImages,
    deletedImageIds,
    primaryPromotions,
    uploadedObjects,
    removedObjects,
  };
}

/** Render a route in a jsdom with a stubbed network + optional seed. */
async function renderWithStub(path, { stub, appSource = appCodeConnected, seed } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    const msg = String(e?.message ?? e);
    if (/Could not load|ENOTFOUND|EAI_AGAIN|network|Not implemented|navigation|Failed to fetch|fetch failed/i.test(msg)) return;
    errors.push('jsdomError: ' + msg);
  });
  virtualConsole.on('error', (...args) => errors.push('console.error: ' + args.map(String).join(' ')));

  const dom = new JSDOM(SHELL, {
    url: `http://localhost${path}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.scrollTo = () => undefined;
      window.scrollBy = () => undefined;
      window.fetch = stub.fetchImpl;
      window.Headers = globalThis.Headers;
      window.Request = globalThis.Request;
      window.Response = globalThis.Response;
      window.AbortController = globalThis.AbortController;
      window.TextEncoder = globalThis.TextEncoder;
      window.TextDecoder = globalThis.TextDecoder;
    },
  });

  if (seed) seed(dom.window);

  const { document } = dom.window;
  const script = document.createElement('script');
  script.textContent = appSource;
  document.body.appendChild(script);

  const text = () => document.getElementById('root')?.textContent ?? '';
  const waitFor = async (predicate, timeoutMs = 12000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await sleep(100);
    }
    return false;
  };

  return { dom, document, text, waitFor, errors };
}

/**
 * Click something and wait for the screen it leads to — and if that screen
 * does not appear, re-query the element and click again (up to `attempts`
 * times).
 *
 * A single synthetic click can be lost in a jsdom running on a loaded CPU:
 * the node we hold may be replaced by a later commit before the event is
 * processed (a stale node's events never reach React's root listener), or
 * the click may land while the tree is mid-commit — the suite did fail that
 * way once. A real user would simply click again, so the harness does the
 * same instead of reporting a failure
 * that looks like "the app did not navigate" — which is what this suite did
 * once under load («connected images — the gallery did not render», with the
 * dashboard still on screen after a 12 s poll).
 *
 * `find` is a function so every attempt re-queries the element.
 */
async function clickUntil(click, find, predicate, waitFor, { attempts = 4, eachMs = 6000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const element = typeof find === 'function' ? find() : find;
    if (!element) return false;
    click(element);
    if (await waitFor(predicate, eachMs)) return true;
  }
  return false;
}

// ════════════════════════════════════════════════════════════
// SECURITY / REGRESSION SUITE (pre-merge review of the database
// connection). Every check fails closed: an account without the
// admin role must not reach the panel, the panel must not write
// anonymously, and the storefront must never depend on the
// database to render.
// ════════════════════════════════════════════════════════════

// ── 20b. Connected mode — «تصاویر محصولات» end to end ──────
// The whole gallery write path against a Supabase-shaped API:
//   upload → Storage object → product_images row → atomic promotion
//   → products.image_url (the ONE field the storefront reads),
// then a confirmed delete that hands the shop back to the previous
// photo. Also proves the two safety promises: a committed site photo
// is never deleted, and no write ever leaves the browser anonymous.
{
  const stub = makeSupabaseStub();
  const { dom, document, text, waitFor, errors } = await renderWithStub('/zheno-website/admin/login', {
    stub,
    seed: (win) => {
      // jsdom has no image decoder: report the pixels and skip the
      // canvas round-trip (prepareProductImage keeps the original bytes
      // when there is no 2D context — exactly the documented fallback).
      win.createImageBitmap = async () => ({ width: 1600, height: 1200, close() {} });
    },
  });

  const setReactValue = (input, value) => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  };
  const click = (element) =>
    element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const findButton = (label) =>
    Array.from(document.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes(label),
    );

  const signedIn = await (async () => {
    if (!(await waitFor(() => document.querySelector('input[autocomplete="username"]')))) return false;
    setReactValue(document.querySelector('input[autocomplete="username"]'), 'admin@example.com');
    setReactValue(document.querySelector('input[type="password"]'), 'correct-horse-battery');
    document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    return waitFor(() => text().includes('متصل به دیتابیس'));
  })();
  if (!signedIn) {
    fail('connected images — the admin session did not open: ' + text().slice(0, 200));
  } else {
    // ── the gallery is reached through the panel's own navigation ──
    // Re-queried per attempt: a click can be lost on a loaded machine (see
    // clickUntil), and a real user would just click the link again.
    const findImagesLink = () =>
      Array.from(document.querySelectorAll('a')).find((link) =>
        (link.getAttribute('href') ?? '').endsWith('/admin/product-images'),
      );
    if (!findImagesLink()) fail('connected images — no navigation link to /admin/product-images');
    const onGallery = await clickUntil(
      click,
      findImagesLink,
      () => text().includes('فضای ذخیره‌سازی Supabase'),
      waitFor,
    );
    if (onGallery) ok('connected images — the gallery reads product_images from the database');
    else fail('connected images — the gallery did not render: ' + text().slice(0, 200));

    if (stub.calls.some((call) => call.url.includes('/rest/v1/product_images') && call.method === 'GET')) {
      ok('connected images — GET /rest/v1/product_images was issued');
    } else {
      fail('connected images — the gallery never read product_images');
    }
    expectContains('connected images', text(), 'فایل سایت');
    expectContains('connected images', text(), 'product-images');
    expectContains('connected images', text(), 'پودر ژله توت فرنگی ژینو');
    expectContains('connected images', text(), 'توت فرنگی');
    // wording: «صفحهٔ پرداخت» — never a phrase that looks like an error banner
    expectContains('connected images', text(), 'صفحهٔ پرداخت');
    expectNotContains('connected images', text(), 'تسویه‌حساب نمایش داده می‌شود');

    // ── replace the primary photo ─────────────────────────────
    const replaceButton = findButton('جایگزینی تصویر اصلی');
    if (!replaceButton) {
      fail('connected images — «جایگزینی تصویر اصلی» is missing');
    } else {
      click(replaceButton);
      const dialogOpen = await waitFor(() => text().includes('تصویر را اینجا رها کنید'));
      if (!dialogOpen) fail('connected images — the upload dialog did not open');

      const fileInput = document.querySelector('input[data-testid="product-image-file"]');
      if (!fileInput) {
        fail('connected images — no file input in the upload dialog');
      } else {
        const file = new dom.window.File([readFileSync(join(root, 'public/images/products/jelly-strawberry.jpg'))], 'new-photo.jpg', {
          type: 'image/jpeg',
        });
        Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
        fileInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

        const previewed = await waitFor(() => text().includes('حجم اصلی'));
        if (previewed) ok('connected images — the photo is previewed before anything is sent');
        else fail('connected images — no preview was rendered: ' + text().slice(0, 200));

        const saveButton = findButton('ذخیره و جایگزینی');
        if (!saveButton) fail('connected images — the save button is missing');
        else click(saveButton);

        const promoted = await waitFor(() => stub.primaryPromotions.length > 0);
        if (promoted) ok('connected images — promotion went through the manage_product_image transaction RPC');
        else fail('connected images — the RPC was never called: ' + text().slice(0, 200));

        const upload = stub.uploadedObjects[0];
        if (upload && upload.path.startsWith('products/jelly-strawberry/')) {
          ok('connected images — the object path is scoped to the product');
        } else {
          fail(`connected images — unexpected Storage path: ${upload ? upload.path : 'no upload'}`);
        }
        if (upload && upload.headers['x-upsert'] === 'false') {
          ok('connected images — uploads never silently overwrite an object (x-upsert: false)');
        } else {
          fail(`connected images — unexpected x-upsert header: ${upload ? upload.headers['x-upsert'] : 'no upload'}`);
        }
        if (upload && /^Bearer ey/.test(upload.headers.authorization ?? '')) {
          ok('connected images — the Storage write carries the signed-in admin JWT');
        } else {
          fail('connected images — the Storage write was not authenticated');
        }

        const insert = stub.insertedImages[0];
        if (insert && insert.payload.is_primary === false) {
          ok('connected images — the row is inserted non-primary (only the RPC promotes)');
        } else {
          fail(`connected images — unexpected insert payload: ${JSON.stringify(insert?.payload)}`);
        }
        if (
          insert &&
          insert.payload.source === 'upload' &&
          insert.payload.storage_bucket === 'product-images' &&
          insert.payload.product_id === 'jelly-strawberry'
        ) {
          ok('connected images — the row records product, bucket and source');
        } else {
          fail('connected images — the insert payload is missing product/bucket/source');
        }
        const publicUrl = insert?.payload.storefront_url ?? '';
        if (/^https:\/\/.+\/storage\/v1\/object\/public\/product-images\//.test(publicUrl)) {
          ok('connected images — the row stores the public Storage URL the shop will read');
        } else {
          fail(`connected images — unexpected storefront_url: ${publicUrl}`);
        }
        if (publicUrl && stub.products[0].image_url === publicUrl) {
          ok('connected images — promotion mirrored the URL into products.image_url');
        } else {
          fail(`connected images — products.image_url is ${stub.products[0].image_url}`);
        }

        // the committed site photo survives a replacement
        if (stub.deletedImageIds.length === 0 && stub.removedObjects.length === 0) {
          ok('connected images — replacing never deletes the committed site photo');
        } else {
          fail(`connected images — a legacy photo was removed: ${JSON.stringify(stub.deletedImageIds)}`);
        }
        if (stub.gallery.rows.length === 2) ok('connected images — the gallery keeps both photos');
        else fail(`connected images — expected 2 gallery rows, found ${stub.gallery.rows.length}`);
        expectContains('connected images', text(), '۲ تصویر');

        // ── delete the uploaded photo, with confirmation ───────
        const deletePrimary = document.querySelector('button[aria-label^="حذف تصویر اصلی"]');
        if (!deletePrimary) {
          fail('connected images — no delete control for the primary photo');
        } else {
          click(deletePrimary);
          const askedFirst = await waitFor(() => text().includes('حذف قطعی تصویر'));
          if (askedFirst) ok('connected images — deleting asks for an explicit confirmation');
          else fail('connected images — no confirmation dialog before deleting');

          const confirmButton = findButton('حذف قطعی تصویر');
          if (confirmButton && confirmButton.disabled) {
            ok('connected images — the destructive button stays locked until the admin confirms');
          } else {
            fail('connected images — the destructive button was clickable without confirmation');
          }

          const box = document.querySelector('.adm-confirm-row input[type="checkbox"]');
          if (!box) fail('connected images — the confirmation checkbox is missing');
          else box.click();

          const unlocked = await waitFor(() => {
            const button = findButton('حذف قطعی تصویر');
            return Boolean(button) && !button.disabled;
          });
          if (!unlocked) fail('connected images — the confirmation checkbox did not unlock the button');
          else click(findButton('حذف قطعی تصویر'));

          const removed = await waitFor(() => stub.removedObjects.length > 0);
          if (removed) ok('connected images — the uploaded object was removed from Storage');
          else fail('connected images — the Storage object was never removed');

          if (stub.deletedImageIds.length === 1 && stub.deletedImageIds[0] === stub.insertedImages[0]?.payload.id) {
            ok('connected images — only the uploaded gallery row was deleted');
          } else {
            fail(`connected images — unexpected deleted rows: ${JSON.stringify(stub.deletedImageIds)}`);
          }
          if (upload && stub.removedObjects[0] === upload.path) {
            ok('connected images — the exact uploaded path was removed');
          } else {
            fail(`connected images — removed ${JSON.stringify(stub.removedObjects)}, uploaded ${upload?.path}`);
          }
          if (stub.primaryPromotions.length === 2) {
            ok('connected images — the previous photo was promoted again through the same RPC');
          } else {
            fail(`connected images — expected 2 promotions, saw ${stub.primaryPromotions.length}`);
          }
          if (stub.products[0].image_url === 'images/products/jelly-strawberry.jpg') {
            ok('connected images — the shop falls back to the previous photo, never to a dead URL');
          } else {
            fail(`connected images — after the delete, image_url is ${stub.products[0].image_url}`);
          }
          const settled = await waitFor(() => text().includes('۱ تصویر'));
          if (settled) ok('connected images — the gallery re-read the database after the delete');
          else fail('connected images — the gallery did not refresh after the delete');
          const cleanupJob = stub.gallery.cleanup.find(job => job.storage_path === upload?.path);
          if (cleanupJob?.claim_id && cleanupJob.completed_at !== null) {
            ok('connected images — v3 cleanup was claimed and verified complete; retirement tombstone retained');
          } else {
            fail('connected images — cleanup lacks a verified v3 completion receipt');
          }

        }
      }
    }

    // ── credential hygiene for every image write ──────────────
    const writes = stub.calls.filter((call) => call.method !== 'GET' && !call.url.includes('/auth/v1/'));
    if (writes.length > 0 && writes.every((call) => /^Bearer ey/.test(call.headers.authorization ?? ''))) {
      ok(`connected images — all ${writes.length} gallery write(s) are authenticated (no anonymous write)`);
    } else {
      fail(`connected images — ${writes.length} write(s), unauthenticated: ${JSON.stringify(writes.map((c) => c.method + ' ' + c.url))}`);
    }
    const PUBLISHABLE = 'sb_publishable_smoke_test_key';
    if (writes.every((call) => call.headers.apikey === PUBLISHABLE || !call.headers.apikey)) {
      ok('connected images — the apikey header is only the publishable key');
    } else {
      fail(`connected images — unexpected apikey header: ${writes.map((c) => c.headers.apikey).join(', ')}`);
    }
    if (!JSON.stringify(stub.calls).includes('sb_secret') && !JSON.stringify(stub.calls).includes('service_role')) {
      ok('connected images — no secret/service_role material in any request');
    } else {
      fail('connected images — a secret/service_role value appeared in a request');
    }
  }

  dom.window.close();
  const fatal = errors.filter((e) => !/Not implemented/i.test(e));
  if (fatal.length === 0) ok('connected images — no runtime errors');
  else fail('connected images runtime errors:\n    - ' + fatal.join('\n    - '));
}

// ── 20c. The reported live failure: bucket missing ─────────
// Storage answers «Bucket not found» because the images migration was
// never (fully) applied on the project. The panel must:
//   1. show ONE honest Persian banner that names the missing bucket AND
//      the reviewed v3 migration guidance, instead of dying mid-write;
//   2. leave zero damage: no uploaded object, no gallery row, no delete,
//      no rewrite of the shop's image field;
//   3. recover on the spot once the migration is applied — the same
//      dialog retries and the same file goes through.
{
  const stub = makeSupabaseStub({ bucketMissing: true });
  const { dom, document, text, waitFor, errors } = await renderWithStub('/zheno-website/admin/login', {
    stub,
    seed: (win) => {
      win.createImageBitmap = async () => ({ width: 1600, height: 1200, close() {} });
    },
  });

  const setReactValue = (input, value) => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  };
  const click = (element) =>
    element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const findButton = (label) =>
    Array.from(document.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes(label),
    );

  const signedIn = await (async () => {
    if (!(await waitFor(() => document.querySelector('input[autocomplete="username"]')))) return false;
    setReactValue(document.querySelector('input[autocomplete="username"]'), 'admin@example.com');
    setReactValue(document.querySelector('input[type="password"]'), 'correct-horse-battery');
    document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    return waitFor(() => text().includes('متصل به دیتابیس'));
  })();
  if (!signedIn) {
    fail('bucket-missing — the admin session did not open: ' + text().slice(0, 200));
  } else {
    const findImagesLink = () =>
      Array.from(document.querySelectorAll('a')).find((link) =>
        (link.getAttribute('href') ?? '').endsWith('/admin/product-images'),
      );
    if (!findImagesLink()) fail('bucket-missing — no navigation link to /admin/product-images');
    await clickUntil(click, findImagesLink, () => text().includes('فضای ذخیره‌سازی Supabase'), waitFor);

    const replaceButton = findButton('جایگزینی تصویر اصلی');
    if (!replaceButton) {
      fail('bucket-missing — «جایگزینی تصویر اصلی» is missing');
    } else {
      click(replaceButton);
      await waitFor(() => text().includes('تصویر را اینجا رها کنید'));
      const fileInput = document.querySelector('input[data-testid="product-image-file"]');
      if (!fileInput) {
        fail('bucket-missing — no file input in the upload dialog');
      } else {
        const file = new dom.window.File([readFileSync(join(root, 'public/images/products/jelly-strawberry.jpg'))], 'replacement.jpg', {
          type: 'image/jpeg',
        });
        Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
        fileInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        await waitFor(() => text().includes('حجم اصلی'));

        const firstSave = findButton('ذخیره و جایگزینی');
        if (!firstSave) fail('bucket-missing — the save button is missing');
        else click(firstSave);
        const bannerShown = await waitFor(() =>
          text().includes('فضای ذخیره‌سازی «product-images»'),
        );
        if (bannerShown) ok('bucket-missing — the Persian «bucket missing» banner is shown verbatim');
        else fail('bucket-missing — no bucket error banner: ' + text().slice(0, 200));

        if (bannerShown && text().includes('نصب نسخهٔ ۳ را طبق راهنمای بازبینی‌شدهٔ migration بررسی کنید.')) {
          ok('bucket-missing — the banner gives the exact reviewed v3 migration guidance');
        } else {
          fail('bucket-missing — the banner is missing the exact reviewed v3 migration guidance');
        }

        // zero damage from the refused write
        if (stub.uploadedObjects.length === 0) ok('bucket-missing — nothing was uploaded');
        else fail(`bucket-missing — an object was uploaded: ${JSON.stringify(stub.uploadedObjects)}`);
        if (stub.insertedImages.length === 0) ok('bucket-missing — no orphan gallery row was created');
        else fail('bucket-missing — a gallery row was inserted despite the failed upload');
        if (stub.removedObjects.length === 0 && stub.deletedImageIds.length === 0) {
          ok('bucket-missing — nothing was deleted while cleaning up');
        } else {
          fail('bucket-missing — a delete happened for a write that never landed');
        }
        const stillShown = stub.products[0].image_url === 'images/products/jelly-strawberry.jpg';
        if (stillShown && stub.gallery.rows.length === 1) {
          ok('bucket-missing — the shop still shows the committed photo (no broken storefront)');
        } else {
          fail(`bucket-missing — storefront field = ${stub.products[0].image_url}`);
        }

        // the admin runs the migration → the same retry now succeeds
        stub.flags.bucketMissing = false;
        const retrySave = findButton('ذخیره و جایگزینی');
        if (!retrySave || retrySave.disabled) fail('bucket-missing — the dialog did not stay open for an in-place retry');
        else click(retrySave);
        const promoted = await waitFor(() => stub.primaryPromotions.length > 0);
        if (promoted) ok('bucket-missing — after applying the migration the RETRY succeeds');
        else fail('bucket-missing — the retry after healing never promoted: ' + text().slice(0, 200));

        const upload = stub.uploadedObjects[0];
        if (upload && upload.path.startsWith('products/jelly-strawberry/')) {
          ok('bucket-missing — the healed upload lands in the product-images bucket');
        } else {
          fail(`bucket-missing — healed upload path: ${upload ? upload.path : 'none'}`);
        }
        if (stub.products[0].image_url.includes('/storage/v1/object/public/product-images/')) {
          ok('bucket-missing — the storefront now points at the uploaded photo');
        } else {
          fail(`bucket-missing — image_url after heal: ${stub.products[0].image_url}`);
        }
        const healed = await waitFor(() => !text().includes('فضای ذخیره‌سازی «product-images» در Supabase ساخته نشده است'));
        if (healed) ok('bucket-missing — the error banner cleared after the successful retry');
        else fail('bucket-missing — the stale error banner never cleared');
      }
    }
  }

  dom.window.close();
  const fatal = errors.filter((e) => !/Not implemented/i.test(e));
  if (fatal.length === 0) ok('bucket-missing — no runtime errors');
  else fail('bucket-missing runtime errors:\n    - ' + fatal.join('\n    - '));
}

// ── 20d. Gallery curation: alt text, star-promote, lightbox ─
// The remaining «تصاویر محصولات» verbs end to end, still against the
// Supabase-shaped stub: a plain ADD leaves the current primary alone;
// the manager edits the alt text (PATCH row), promotes the new photo
// with the star button (the same RPC), and opens the large preview.
{
  const stub = makeSupabaseStub();
  const { dom, document, text, waitFor, errors } = await renderWithStub('/zheno-website/admin/login', {
    stub,
    seed: (win) => {
      win.createImageBitmap = async () => ({ width: 1600, height: 1200, close() {} });
    },
  });

  const setReactValue = (input, value) => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  };
  const click = (element) =>
    element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const findButton = (label) =>
    Array.from(document.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes(label),
    );

  const signedIn = await (async () => {
    if (!(await waitFor(() => document.querySelector('input[autocomplete="username"]')))) return false;
    setReactValue(document.querySelector('input[autocomplete="username"]'), 'admin@example.com');
    setReactValue(document.querySelector('input[type="password"]'), 'correct-horse-battery');
    document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    return waitFor(() => text().includes('متصل به دیتابیس'));
  })();
  if (!signedIn) {
    fail('gallery curation — the admin session did not open: ' + text().slice(0, 200));
  } else {
    const findImagesLink = () =>
      Array.from(document.querySelectorAll('a')).find((link) =>
        (link.getAttribute('href') ?? '').endsWith('/admin/product-images'),
      );
    if (!findImagesLink()) fail('gallery curation — no navigation link to /admin/product-images');
    await clickUntil(click, findImagesLink, () => text().includes('فضای ذخیره‌سازی Supabase'), waitFor);

    // ── ADD a second photo without touching the current primary ──
    click(findButton('بارگذاری تصویر'));
    await waitFor(() => text().includes('تصویر را اینجا رها کنید'));
    const fileInput = document.querySelector('input[data-testid="product-image-file"]');
    const file = new dom.window.File([readFileSync(join(root, 'public/images/products/jelly-strawberry.jpg'))], 'curation.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await waitFor(() => text().includes('حجم اصلی'));
    click(findButton('ذخیره و بارگذاری'));

    const added = await waitFor(() => stub.insertedImages.length === 1 && text().includes('۲ تصویر'));
    if (added) ok('gallery curation — the second photo is added to the gallery');
    else fail('gallery curation — the plain add never landed: ' + text().slice(0, 200));
    if (stub.insertedImages[0]?.payload.is_primary === false && stub.primaryPromotions.length === 0) {
      ok('gallery curation — a plain ADD never hijacks the current primary');
    } else {
      fail('gallery curation — the add unexpectedly promoted the new photo');
    }
    if (stub.products[0].image_url === 'images/products/jelly-strawberry.jpg') {
      ok('gallery curation — the shop still shows the previous primary');
    } else {
      fail(`gallery curation — shop field changed during add: ${stub.products[0].image_url}`);
    }
    const uploadRow = stub.gallery.rows.find((row) => row.source === 'upload');

    // ── save the alt text (متن جایگزین) ──
    const altButton = document.querySelector('button[aria-label="ویرایش توضیح شمارهٔ ۲ ژله توت فرنگی"]');
    if (!altButton) {
      fail('gallery curation — the alt-text edit control is missing');
    } else {
      click(altButton);
      const dialogOpen = await waitFor(() => document.querySelector('.adm-modal input'));
      if (!dialogOpen) fail('gallery curation — the alt-text dialog did not open');
      else {
        setReactValue(document.querySelector('.adm-modal input'), 'عکس تازهٔ ژله توت فرنگی');
        click(findButton('ذخیره'));
        const patched = await waitFor(() =>
          stub.calls.some((call) =>
            call.url.includes('/rest/v1/rpc/manage_product_image') &&
            JSON.parse(call.body || '{}').p_action === 'alt' &&
            call.body.includes('عکس تازهٔ ژله توت فرنگی'),
          ),
        );
        if (patched && stub.gallery.rows.find((row) => row.id === uploadRow?.id)?.alt_text === 'عکس تازهٔ ژله توت فرنگی') {
          ok('gallery curation — the alt text is saved through the transaction RPC');
        } else {
          fail('gallery curation — the alt text never reached the database');
        }
      }
    }

    // ── promote with the star button ──
    const star = document.querySelector('button[aria-label="انتخاب به‌عنوان تصویر اصلی شمارهٔ ۲ ژله توت فرنگی"]');
    if (!star) {
      fail('gallery curation — the star (make primary) control is missing');
    } else {
      click(star);
      const promoted = await waitFor(() => stub.primaryPromotions.length === 1);
      if (promoted && stub.primaryPromotions[0].payload.p_image_id === uploadRow?.id) {
        ok('gallery curation — the star button promotes through manage_product_image');
      } else if (!promoted) {
        fail('gallery curation — the star button never called the RPC: ' + text().slice(0, 160));
      }
      const newUrl = uploadRow?.storefront_url ?? '';
      if (newUrl && stub.products[0].image_url === newUrl) {
        ok('gallery curation — the promoted photo now feeds the storefront (card/details/cart/checkout)');
      } else {
        fail(`gallery curation — after promote, image_url is ${stub.products[0].image_url}`);
      }
      const primaryCount = stub.gallery.rows.filter((row) => row.is_primary).length;
      if (primaryCount === 1) ok('gallery curation — exactly one primary after the switch');
      else fail(`gallery curation — ${primaryCount} primaries after the switch`);
    }

    // ── large preview (lightbox) with the fresh alt text ──
    await waitFor(() => document.querySelector('button[aria-label="پیش‌نمایش اصلی ژله توت فرنگی"]'));
    const previewThumb = document.querySelector('button[aria-label="پیش‌نمایش اصلی ژله توت فرنگی"]');
    if (!previewThumb) {
      fail('gallery curation — the primary thumbnail did not move to the new photo');
    } else {
      click(previewThumb);
      const lightboxShown = await waitFor(() => document.querySelector('.adm-lightbox'));
      if (lightboxShown) ok('gallery curation — the large preview opens from the thumbnail');
      else fail('gallery curation — the lightbox did not open');
      if (lightboxShown && text().includes('عکس تازهٔ ژله توت فرنگی')) {
        ok('gallery curation — the preview shows the freshly saved alt text');
      } else if (lightboxShown) {
        fail('gallery curation — the saved alt text is not what the lightbox shows');
      }
      const closeButton = document.querySelector('.adm-lightbox-close');
      if (closeButton) click(closeButton);
      const closed = await waitFor(() => !document.querySelector('.adm-lightbox'));
      if (closed) ok('gallery curation — the lightbox closes cleanly');
      else fail('gallery curation — the lightbox never closed');
    }

    // zero damage across all curation steps
    if (stub.removedObjects.length === 0 && stub.deletedImageIds.length === 0) {
      ok('gallery curation — no object or row was deleted anywhere');
    } else {
      fail('gallery curation — an unexpected delete happened');
    }
  }

  dom.window.close();
  const fatal = errors.filter((e) => !/Not implemented/i.test(e));
  if (fatal.length === 0) ok('gallery curation — no runtime errors');
  else fail('gallery curation runtime errors:\n    - ' + fatal.join('\n    - '));
}

// ── 21. A non-admin account cannot open the panel ───────────
// The database's is_admin() answers false: login must fail with a
// message and no admin screen may appear.
{
  const stub = makeSupabaseStub({ isAdmin: false });
  const { dom, document, text, waitFor, errors } = await renderWithStub('/zheno-website/admin/login', { stub });

  const loginReady = await waitFor(() => document.querySelector('input[autocomplete="username"]'));
  if (!loginReady) fail('authz — login form did not render');
  else {
    const setReactValue = (input, value) => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    setReactValue(document.querySelector('input[autocomplete="username"]'), 'user@example.com');
    setReactValue(document.querySelector('input[type="password"]'), 'pepper-1234');
    document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

    const refused = await waitFor(() => text().includes('دسترسی مدیر ندارد'));
    if (refused) ok('authz — a non-admin account is refused with an explicit message');
    else fail('authz — non-admin login was not refused: ' + text().slice(0, 180));

    // «آخرین سفارش‌ها» only exists on the dashboard, so it is a reliable
    // "an admin screen rendered" probe
    if (!text().includes('آخرین سفارش‌ها') && !text().includes('افزودن محصول')) {
      ok('authz — no admin screen was ever rendered for the non-admin account');
    } else {
      fail('authz — the admin panel opened for a non-admin account');
    }
    if (stub.calls.some((c) => c.url.includes('/auth/v1/logout'))) {
      ok('authz — the refused session is signed out (no lingering token)');
    } else {
      fail('authz — the refused account was left signed in');
    }
    // is_admin() is itself a POST (PostgREST RPC) but it is read-only;
    // what must not exist is any mutating call to a table or RPC.
    const mutating = stub.calls.filter(
      (c) =>
        ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.method) &&
        c.url.includes('/rest/v1/') &&
        !c.url.includes('/rpc/is_admin'),
    );
    if (mutating.length === 0) {
      ok('authz — no database write was attempted for the non-admin account');
    } else {
      fail(`authz — mutating call(s) attempted for a non-admin account: ${JSON.stringify(mutating.map((c) => c.method + ' ' + c.url))}`);
    }
  }
  // Sign-out must also drop the admin-visible rows again: the catalogue is
  // re-read with anonymous credentials, so deactivated products disappear
  // from the storefront view.
  const productReads = stub.calls.filter(
    (c) => c.url.includes('/rest/v1/products') && c.method === 'GET',
  ).length;
  if (productReads >= 2) ok('authz — the catalogue is re-read anonymously after sign-out');
  else fail(`authz — no anonymous re-read after sign-out (product reads: ${productReads})`);

  if (errors.length === 0) ok('authz non-admin flow — no runtime errors');
  else fail('authz non-admin flow runtime errors:\n    - ' + errors.join('\n    - '));
  dom.window.close();
}

// ── 22. A persisted session without the admin role stays locked ──
// A refresh token alone must not open the panel: the stored session is
// restored, re-verified with is_admin() (which answers false) and the
// visitor lands on the login page.
{
  const stub = makeSupabaseStub({ isAdmin: false });
  const ref = 'smoke-test';
  const seededSession = {
    access_token: stub.jwt,
    refresh_token: 'seeded-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: '00000000-0000-0000-0000-000000000001',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'user@example.com',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/admin/products', {
    stub,
    seed: (window) => window.localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(seededSession)),
  });

  const sawLogin = await waitFor(() => text().includes('ورود به پنل مدیریت'));
  if (sawLogin) ok('authz — a stored non-admin session lands on the login page (fail closed)');
  else fail('authz — a stored non-admin session did not reach the login page: ' + text().slice(0, 180));
  if (stub.calls.some((c) => c.url.includes('/rest/v1/rpc/is_admin'))) {
    ok('authz — the restored session was re-verified with is_admin() before anything was shown');
  } else {
    fail('authz — the restored session was never verified (silent trust of localStorage)');
  }
  if (!text().includes('افزودن محصول')) ok('authz — the product editor never rendered');
  else fail('authz — the product editor rendered for a non-admin session');
  if (errors.length === 0) ok('authz restore flow — no runtime errors');
  else fail('authz restore flow runtime errors:\n    - ' + errors.join('\n    - '));
  dom.window.close();
}

// ── 23. Unconfigured build must not touch the network ───────
// No VITE_SUPABASE_* variables → not a single database request, on any
// route. This is the guarantee that the deployed site is unchanged
// until the operator opts in.
{
  const calls = [];
  const spy = () => {
    calls.push('called');
    return Promise.resolve(new globalThis.Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  const home = await render('/zheno-website/', { fetchStub: spy, settleMs: 300 });
  const products = await render('/zheno-website/products', { fetchStub: spy });
  const cart = await render('/zheno-website/cart', { fetchStub: spy });
  if (calls.length === 0) ok('offline build — zero network requests across home/products/cart');
  else fail(`offline build — ${calls.length} unexpected request(s)`);
  expectContains('offline build home', home.text, 'ژینو');
  expectContains('offline build products', products.text, 'ژله توت فرنگی');
  expectContains('offline build cart', cart.text, 'سبد خرید');
}

// ── 24. Storefront integrity: the database is the only authority ──
// The database holds ONE product; an existing cart line for a product
// that is not in the database (deactivated there, or never existed) must
// be dropped instead of being resurrected from the static catalog with a
// price the database no longer agrees with.
{
  const stub = makeSupabaseStub({ isAdmin: true });
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/cart', {
    stub,
    appSource: appCodeWithDb,
    seed: (window) =>
      window.localStorage.setItem(
        'zhino_cart',
        JSON.stringify([{ productId: 'jelly-pomegranate', variantId: 'jelly-pomegranate-250', quantity: 2 }]),
      ),
  });

  await waitFor(() => text().includes('سبد خرید'));
  if (text().includes('سبد خرید شما خالی است')) ok('storefront integrity — a product absent from the database is dropped from the cart');
  else fail('storefront integrity — a database-absent product survived in the cart: ' + text().slice(0, 200));
  expectNotContains('storefront integrity', text(), 'ژله انار');
  if (errors.length === 0) ok('storefront integrity — no runtime errors');
  else fail('storefront integrity runtime errors:\n    - ' + errors.join('\n    - '));
  dom.window.close();
}

// ── 25. Configured but unreachable database: panel fails closed ──
// The admin route must show the login page, never a permanent
// "checking session…" screen and never the panel itself.
{
  const { text, errors, dom } = await renderWithStub('/zheno-website/admin/products', {
    appSource: appCodeConnected,
    stub: { fetchImpl: () => Promise.reject(new Error('offline (smoke test)')) },
  });
  const deadline = Date.now() + 8000;
  let sawLogin = text().includes('ورود به پنل مدیریت');
  while (!sawLogin && Date.now() < deadline) {
    await sleep(150);
    sawLogin = text().includes('ورود به پنل مدیریت');
  }
  if (sawLogin) ok('degraded database — admin route fails closed to the login page');
  else fail('degraded database — admin route did not reach the login page: ' + text().slice(0, 180));
  if (!text().includes('افزودن محصول')) ok('degraded database — the panel never rendered');
  else fail('degraded database — the panel rendered without a verified session');
  const fatal = errors.filter((e) => !/offline \(smoke test\)|Failed to fetch|fetch failed|NetworkError/i.test(e));
  if (fatal.length === 0) ok('degraded database — no fatal runtime errors');
  else fail('degraded database runtime errors:\n    - ' + fatal.join('\n    - '));
  dom.window.close();
}

// ── 26. A plaintext endpoint must be refused (token never over http://) ──
{
  const calls = [];
  const spy = () => {
    calls.push('called');
    return Promise.resolve(new globalThis.Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  const res = await render('/zheno-website/products', { appSource: appCodeInsecureUrl, fetchStub: spy });
  if (calls.length === 0) ok('insecure endpoint — no request was made to a non-https URL');
  else fail(`insecure endpoint — ${calls.length} request(s) went to a plaintext endpoint`);
  if (res.errors.some((e) => /https/i.test(e))) ok('insecure endpoint — the refusal is logged explicitly');
  else fail('insecure endpoint — the non-https URL was accepted silently');
  expectContains('insecure endpoint build', res.text, 'ژله توت فرنگی');
}

// ════════════════════════════════════════════════════════════
// ORDER SUITE (phase 2): the checkout writes real orders to the
// database and the admin panel manages them there. Guest checkout
// goes through the create_order RPC; the panel reads/updates with
// the admin JWT. In every scenario the storefront never reads
// orders anonymously and the demo/local behaviour is untouched.
// ════════════════════════════════════════════════════════════

const PUBLISHABLE_KEY = 'sb_publishable_smoke_test_key';

/** React-compatible value setter for inputs (native setter + input event). */
function typeInto(dom, selector, value) {
  const el = dom.window.document.querySelector(selector);
  if (!el) throw new Error('form field not found: ' + selector);
  const proto =
    el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

/** Click the first button whose visible text contains `needle`. */
function clickButtonByContains(dom, needle) {
  const doc = dom.window.document;
  const btn = Array.from(doc.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(needle));
  if (!btn) throw new Error('button not found: ' + needle);
  btn.click();
  return btn;
}

/** Drive the checkout form through customer → address → payment. */
async function driveCheckoutToPayment(dom, waitFor, text) {
  const customerReady = await waitFor(() => text().includes('مشخصات تحویل‌گیرنده'));
  if (!customerReady) throw new Error('checkout form did not render: ' + text().slice(0, 200));
  typeInto(dom, '#firstName', 'سارا');
  typeInto(dom, '#lastName', 'محمدی');
  typeInto(dom, '#phone', '09120000000');
  clickButtonByContains(dom, 'ادامه به مرحله نشانی');
  const addressReady = await waitFor(() => text().includes('نشانی ارسال'));
  if (!addressReady) throw new Error('address step did not render');
  typeInto(dom, '#province', 'تهران');
  typeInto(dom, '#city', 'تهران');
  typeInto(dom, '#street', 'خیابان نمونه، پلاک ۱');
  typeInto(dom, '#postalCode', '1234567890');
  clickButtonByContains(dom, 'ادامه به مرحله پرداخت');
  const paymentReady = await waitFor(() => text().includes('روش ارسال و پرداخت'));
  if (!paymentReady) throw new Error('payment step did not render');
}

// ── 27. Guest checkout registers the order in the database ──
// A connected build, no login at all: the guest fills the checkout
// form and the order must be created through the create_order RPC
// with variant ids + quantities only (the database computes prices,
// shipping and totals), the confirmation shows the server id, the
// cart is cleared, and no localStorage order record is written.
{
  const stub = makeSupabaseStub({ isAdmin: false });
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/checkout', {
    stub,
    appSource: appCodeWithDb,
    seed: (window) =>
      window.localStorage.setItem(
        'zhino_cart',
        JSON.stringify([{ productId: 'jelly-strawberry', variantId: 'jelly-strawberry-250', quantity: 3 }]),
      ),
  });

  try {
    await driveCheckoutToPayment(dom, waitFor, text);
    clickButtonByContains(dom, 'پرداخت و ثبت سفارش');
    const confirmed = await waitFor(() => text().includes('ZH-SMOKE0R1'));
    if (confirmed) ok('checkout — the confirmation shows the server-generated order id');
    else fail('checkout — the confirmation never showed the server order id: ' + text().slice(0, 200));
    expectContains('checkout confirmation', text(), 'سفارش شما با موفقیت ثبت شد');

    if (stub.createdOrderPayloads.length === 1) {
      const payload = stub.createdOrderPayloads[0];
      ok('checkout — exactly one create_order RPC call was made');
      const itemsOk =
        JSON.stringify(payload.p_items) ===
        JSON.stringify([{ variant_id: 'jelly-strawberry-250', quantity: 3 }]);
      if (itemsOk) ok('checkout — items send variant_id + quantity only (no client-side prices)');
      else fail(`checkout — unexpected items payload: ${JSON.stringify(payload.p_items)}`);
      const customerOk = JSON.stringify(payload.p_customer) ===
        JSON.stringify({ firstName: 'سارا', lastName: 'محمدی', phone: '09120000000', email: '' });
      if (customerOk) ok('checkout — customer info is complete and trimmed');
      else fail(`checkout — unexpected customer payload: ${JSON.stringify(payload.p_customer)}`);
      const shippingOk =
        payload.p_shipping.province === 'تهران' &&
        payload.p_shipping.city === 'تهران' &&
        payload.p_shipping.address === 'خیابان نمونه، پلاک ۱' &&
        payload.p_shipping.postalCode === '1234567890' &&
        payload.p_shipping_method === 'standard';
      if (shippingOk) ok('checkout — address + shipping method payload is correct');
      else fail(`checkout — unexpected shipping payload: ${JSON.stringify(payload.p_shipping)}`);
    } else {
      fail(`checkout — expected 1 create_order call, saw ${stub.createdOrderPayloads.length}`);
    }

    // credential hygiene of the guest write: publishable key only,
    // never a service/secret key, and the request runs unauthenticated
    // (anon role — the RPC is the only guest write path, RLS-gated).
    const rpcCall = stub.calls.find((c) => c.url.includes('/rest/v1/rpc/create_order'));
    if (rpcCall) {
      const bearer = (rpcCall.headers?.authorization ?? rpcCall.headers?.Authorization ?? '').replace(/^Bearer /i, '');
      const apikey = rpcCall.headers?.apikey ?? rpcCall.headers?.ApiKey ?? '';
      if (bearer === PUBLISHABLE_KEY && apikey === PUBLISHABLE_KEY) {
        ok('checkout — the guest order write uses the publishable key only (no session, no secret)');
      } else {
        fail(`checkout — unexpected guest write credentials: bearer=${bearer} apikey=${apikey}`);
      }
    } else {
      fail('checkout — no create_order request was captured');
    }
    if (!JSON.stringify(stub.calls).includes('sb_secret') && !JSON.stringify(stub.calls).includes('service_role')) {
      ok('checkout — no secret/service_role material in any request');
    } else {
      fail('checkout — a secret/service_role value appeared in a request');
    }

    // the storefront never reads order rows anonymously
    const anonOrderReads = stub.calls.filter((c) => c.method === 'GET' && c.url.includes('/rest/v1/orders'));
    if (anonOrderReads.length === 0) ok('checkout — the storefront never read orders anonymously');
    else fail(`checkout — unexpected anonymous order reads: ${anonOrderReads.length}`);

    // cart cleared + no demo-mode local record in connected mode
    const cartRaw = dom.window.localStorage.getItem('zhino_cart');
    let cartOk = false;
    try {
      cartOk = JSON.parse(cartRaw ?? '[]').length === 0;
    } catch {
      cartOk = false;
    }
    if (cartOk) ok('checkout — the cart was cleared after a successful database order');
    else fail(`checkout — cart not cleared after success: ${cartRaw}`);
    if (dom.window.localStorage.getItem('zhino_admin_orders_v1') === null) {
      ok('checkout — no localStorage order record was written (the database is the source)');
    } else {
      fail('checkout — a local order record was written in connected mode');
    }

    if (errors.length === 0) ok('checkout flow — no runtime errors');
    else fail('checkout flow runtime errors:\n    - ' + errors.join('\n    - '));
  } finally {
    dom.window.close();
  }
}

// ── 28. A refused order keeps the cart and shows a real error ──
// The database rejects the order (insufficient stock): the checkout
// must surface a Persian error, stay on the payment step, keep the
// cart untouched (so the customer can retry) and must NOT write a
// local fallback record.
{
  const stub = makeSupabaseStub({ isAdmin: false, createOrder: 'reject-stock' });
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/checkout', {
    stub,
    appSource: appCodeWithDb,
    seed: (window) =>
      window.localStorage.setItem(
        'zhino_cart',
        JSON.stringify([{ productId: 'jelly-strawberry', variantId: 'jelly-strawberry-250', quantity: 3 }]),
      ),
  });

  try {
    await driveCheckoutToPayment(dom, waitFor, text);
    clickButtonByContains(dom, 'پرداخت و ثبت سفارش');
    const refused = await waitFor(() => text().includes('موجودی کافی برای این سفارش'));
    if (refused) ok('checkout refusal — the customer sees a clear stock error');
    else fail('checkout refusal — no error shown: ' + text().slice(0, 220));
    if (text().includes('روش ارسال و پرداخت')) ok('checkout refusal — still on the payment step (retry possible)');
    else fail('checkout refusal — left the payment step unexpectedly');
    if (!text().includes('سفارش شما با موفقیت ثبت شد')) ok('checkout refusal — no false confirmation');
    else fail('checkout refusal — a confirmation was shown for a refused order');
    const cartRaw = dom.window.localStorage.getItem('zhino_cart') ?? '[]';
    let cart = [];
    try {
      cart = JSON.parse(cartRaw);
    } catch { /* fail below */ }
    if (cart.length === 1 && cart[0].quantity === 3) ok('checkout refusal — the cart was kept intact for the retry');
    else fail(`checkout refusal — cart changed after a refused order: ${cartRaw}`);
    if (dom.window.localStorage.getItem('zhino_admin_orders_v1') === null) {
      ok('checkout refusal — no local order record was written');
    } else {
      fail('checkout refusal — a local order record was written for a refused order');
    }
    if (errors.length === 0) ok('checkout refusal flow — no runtime errors');
    else fail('checkout refusal flow runtime errors:\n    - ' + errors.join('\n    - '));
  } finally {
    dom.window.close();
  }
}

// ── 29. Connected admin: the orders page is database-backed ──
// The signed-in admin (is_admin() true) sees the database orders on
// the dashboard and the orders page, and changing a status sends an
// authenticated PATCH with the DATABASE enum value (UI «processing»
// → DB «preparing»). The publishable key is the only apikey anywhere.
{
  const orders = [
    {
      id: 'ZH-ADM1001',
      status: 'new',
      customer_first_name: 'سارا',
      customer_last_name: 'محمدی',
      customer_phone: '09120000000',
      customer_email: null,
      shipping_province: 'تهران',
      shipping_city: 'تهران',
      shipping_address: 'خیابان نمونه، پلاک ۱',
      shipping_postal_code: '1234567890',
      shipping_method: 'standard',
      subtotal: 600000,
      shipping_cost: 50000,
      total: 650000,
      created_at: '2026-09-16T09:00:00.000Z',
    },
    {
      id: 'ZH-ADM1002',
      status: 'shipped',
      customer_first_name: 'رضا',
      customer_last_name: 'کریمی',
      customer_phone: '09120000001',
      customer_email: 'reza@example.com',
      shipping_province: 'اصفهان',
      shipping_city: 'اصفهان',
      shipping_address: 'خیابان چهارباغ',
      shipping_postal_code: '8123456789',
      shipping_method: 'express',
      subtotal: 300000,
      shipping_cost: 100000,
      total: 400000,
      created_at: '2026-09-16T08:00:00.000Z',
    },
  ];
  const orderItems = [
    {
      order_id: 'ZH-ADM1001',
      product_id: 'jelly-strawberry',
      variant_id: 'jelly-strawberry-250',
      product_name: 'ژله توت فرنگی',
      weight: '۲۵۰ گرم',
      quantity: 3,
      unit_price: 200000,
    },
    {
      order_id: 'ZH-ADM1002',
      product_id: 'jelly-strawberry',
      variant_id: 'jelly-strawberry-250',
      product_name: 'ژله توت فرنگی',
      weight: '۲۵۰ گرم',
      quantity: 2,
      unit_price: 150000,
    },
  ];
  const stub = makeSupabaseStub({ isAdmin: true, orders, orderItems });
  const { dom, document, text, waitFor, errors } = await renderWithStub('/zheno-website/admin/login', {
    stub,
    appSource: appCodeConnected,
  });

  const setReactValue = (input, value) => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  };

  try {
    const loginReady = await waitFor(() => document.querySelector('input[autocomplete="username"]'));
    if (!loginReady) {
      fail('admin orders — login form did not render');
    } else {
      setReactValue(document.querySelector('input[autocomplete="username"]'), 'admin@example.com');
      setReactValue(document.querySelector('input[type="password"]'), 'correct-horse-battery');
      document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

      // the remote orders list (ZH-ADM1001) in the dashboard fold is the
      // first dashboard-only marker — the stat cards no longer render
      const onDashboard = await waitFor(() => text().includes('ZH-ADM1001'));
      if (onDashboard) {
        ok('admin orders — the panel opened for the verified admin session');
        // the dashboard already proves the remote source (per-order totals
        // in the recent list — the combined «مجموع فروش» card is gone):
        expectContains('admin dashboard (remote)', text(), 'ZH-ADM1001');
        expectContains('admin dashboard (remote)', text(), '۶۵۰٬۰۰۰ تومان');
        expectContains('admin dashboard (remote)', text(), '۴۰۰٬۰۰۰ تومان');
      } else {
        fail('admin orders — login did not reach the dashboard: ' + text().slice(0, 200));
      }

      // navigate to the orders page through the panel nav. Wait for an
      // orders-page-only marker (the status filter select — the dashboard
      // does not have one), because the dashboard already shows both ids.
      const ordersLink = Array.from(document.querySelectorAll('a')).find((a) =>
        (a.getAttribute('href') ?? '').endsWith('/admin/orders'),
      );
      if (ordersLink) ordersLink.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      const onOrdersPage = await waitFor(() => document.getElementById('order-status-filter'));
      if (onOrdersPage) ok('admin orders — the orders page was reached through the panel nav');
      else fail('admin orders — the orders page did not render: ' + text().slice(0, 220));
      const bothListed = text().includes('ZH-ADM1001') && text().includes('ZH-ADM1002');
      if (bothListed) ok('admin orders — both database orders are listed');
      else fail('admin orders — the orders page did not list the database orders: ' + text().slice(0, 220));
      expectContains('admin orders — items', text(), 'ژله توت فرنگی');
      expectContains('admin orders — customer', text(), 'سارا محمدی');
      expectContains('admin orders — address', text(), 'اصفهان');
      expectContains('admin orders — totals', text(), '۶۵۰٬۰۰۰ تومان');
      expectContains('admin orders — totals', text(), '۴۰۰٬۰۰۰ تومان');

      // change the newest order's status: UI «processing» → DB «preparing»
      const select = Array.from(document.querySelectorAll('select.adm-status-select')).find(
        (s) => s.value === 'new',
      );
      if (!select) {
        fail('admin orders — the status select of the new order was not found');
      } else {
        const setSelectValue = (el, value) => {
          Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set.call(el, value);
          el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        };
        setSelectValue(select, 'processing');
        const patched = await waitFor(() => stub.orderStatusPatches.length === 1);
        if (!patched) {
          fail('admin orders — the status change did not reach the database');
        } else {
          const patch = stub.orderStatusPatches[0];
          if (patch.url.includes('id=eq.ZH-ADM1001')) ok('admin orders — the PATCH targets the right order (id=eq.…);');
          else fail(`admin orders — unexpected PATCH target: ${patch.url}`);
          if (patch.payload.status === 'preparing') {
            ok('admin orders — UI «processing» is translated to the DB enum «preparing»');
          } else {
            fail(`admin orders — unexpected status payload: ${JSON.stringify(patch.payload)}`);
          }
          const bearer = (patch.headers?.authorization ?? patch.headers?.Authorization ?? '').replace(/^Bearer /i, '');
          const apikey = patch.headers?.apikey ?? patch.headers?.ApiKey ?? '';
          let role = null;
          try {
            role = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url')).role;
          } catch { /* fail below */ }
          if (role === 'authenticated' && apikey === PUBLISHABLE_KEY) {
            ok('admin orders — the status write is authenticated (admin JWT + publishable apikey)');
          } else {
            fail(`admin orders — unexpected write credentials: role=${role} apikey=${apikey}`);
          }
          if (!JSON.stringify(stub.orderStatusPatches).includes('sb_secret')) {
            ok('admin orders — no secret material in the status write');
          } else {
            fail('admin orders — a secret value appeared in the status write');
          }
        }
      }

      // after the update the panel re-reads the authoritative rows
      const orderReads = stub.calls.filter((c) => c.method === 'GET' && c.url.includes('/rest/v1/orders')).length;
      if (orderReads >= 2) ok('admin orders — the authoritative re-read happened after the write');
      else fail(`admin orders — expected ≥2 orders reads, saw ${orderReads}`);
    }

    if (errors.length === 0) ok('admin orders flow — no runtime errors');
    else fail('admin orders flow runtime errors:\n    - ' + errors.join('\n    - '));
  } finally {
    dom.window.close();
  }
}

// ── 30. Local/demo mode is byte-for-byte the old behaviour ──────
// Without Supabase configured, a placed order must still land in the
// localStorage record (zhino_admin_orders_v1) — the original flow,
// untouched by the database connection.
{
  const spyCalls = [];
  const spy = () => {
    spyCalls.push('called');
    return Promise.resolve(new globalThis.Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/checkout', {
    stub: { fetchImpl: spy },
    appSource: appCode,
    seed: (window) =>
      window.localStorage.setItem(
        'zhino_cart',
        JSON.stringify([{ productId: 'jelly-strawberry', variantId: 'jelly-strawberry-250', quantity: 3 }]),
      ),
  });

  try {
    await driveCheckoutToPayment(dom, waitFor, text);
    clickButtonByContains(dom, 'پرداخت و ثبت سفارش');
    const confirmed = await waitFor(() => text().includes('سفارش شما با موفقیت ثبت شد'));
    if (confirmed) ok('local checkout — the demo confirmation still works');
    else fail('local checkout — confirmation never appeared: ' + text().slice(0, 220));
    const localRaw = dom.window.localStorage.getItem('zhino_admin_orders_v1');
    let localOk = false;
    try {
      const rec = JSON.parse(localRaw ?? '[]');
      localOk =
        Array.isArray(rec) &&
        rec.length === 1 &&
        rec[0].status === 'new' &&
        rec[0].total === 650000 &&
        rec[0].customer.firstName === 'سارا' &&
        rec[0].items.length === 1 &&
        rec[0].items[0].quantity === 3;
    } catch { /* fail below */ }
    if (localOk) ok('local checkout — the order is recorded in localStorage exactly as before');
    else fail(`local checkout — unexpected local record: ${localRaw}`);
    if (spyCalls.length === 0) ok('local checkout — zero network requests (no Supabase configured)');
    else fail(`local checkout — ${spyCalls.length} unexpected request(s)`);
    if (errors.length === 0) ok('local checkout flow — no runtime errors');
    else fail('local checkout flow runtime errors:\n    - ' + errors.join('\n    - '));
  } finally {
    dom.window.close();
  }
}


// ════════════════════════════════════════════════════════════
// ASSISTANT SUITE (phase 5 → ): the standalone /assistant page rendered
// as an immersive, ChatGPT-style chat environment (no storefront
// header/footer), the floating launcher → route (no popup),
// «بازگشت به سایت», the browser back button, and the chat itself —
// offline (local grounded engine) and connected (AI proxy, mocked).
//
// Phase 8 adds the customer-experience contract: nothing technical is ever
// shown (database / local engine / catalog / AI model), the ready-made
// questions are compact chips that collapse once the chat starts, answers
// can be read aloud with the browser's own speech synthesis (never a third
// party service, never the customer's own text) and the builder's small
// signature sits under the composer.
// ════════════════════════════════════════════════════════════

/** Words that belong to our infrastructure, never to a customer's screen. */
const ASSISTANT_INTERNAL_WORDS = [
  'دیتابیس',
  'دادهٔ زندهٔ دیتابیس',
  'موتور محلی',
  'کاتالوگ',
  'همگام‌سازی',
  'مدل هوشمند',
  'هوش مصنوعی',
  'سوپابیس',
  'Edge Function',
  'پاسخ محلی داده شد',
  'تعداد پرسش‌ها زیاد شد',
  'ارتباط با دستیار هوشمند',
];

/**
 * The chat page must not print a single internal word — text and attributes
 * alike. Only the rendered #root is scanned: the jsdom <body> also holds the
 * injected app script, and that bundle contains every string in the whole
 * storefront (the admin panel talks about the database, on purpose).
 */
function expectNoInternalWording(label, dom) {
  const root = dom.window.document.getElementById('root');
  const html = root ? root.innerHTML : '';
  const leaked = ASSISTANT_INTERNAL_WORDS.filter((word) => html.includes(word));
  if (leaked.length === 0) ok(`${label} — no technical wording anywhere on screen`);
  else fail(`${label} — internal wording is visible to the customer: ${leaked.join(' | ')}`);
}

/** The topbar status pill was removed on purpose in phase 8. */
function expectNoStatusPill(label, dom) {
  if (dom.window.document.querySelector('.zhino-assistant-status')) {
    fail(`${label} — the technical status pill is still rendered`);
  } else {
    ok(`${label} — no status pill (database/AI state stays behind the scenes)`);
  }
}

const OFFLINE_FETCH = () => Promise.reject(new Error('offline (smoke test)'));

/** Send a chat message the way a user does (type → Enter-less submit). */
async function sendChatMessage(dom, waitFor, text) {
  typeInto(dom, '#zhino-assistant-input', text);
  const ready = await waitFor(() => {
    const button = dom.window.document.querySelector('button[aria-label="ارسال پیام"]');
    return Boolean(button) && !button.disabled;
  });
  if (!ready) throw new Error('send button never enabled for: ' + text);
  dom.window.document.querySelector('button[aria-label="ارسال پیام"]').click();
}

/**
 * Open /assistant by clicking the floating launcher on a store page.
 * Phase 7: the chat page shows a short Persian welcome instead of the
 * old capability column, so that is what we wait for.
 */
const ASSISTANT_WELCOME_HEADING = 'سلام! من دستیار ژینو هستم.';

/** Phase 8 — the small builder signature at the bottom of the chat */
const SIGNATURE_TEXT = 'ساخته شده توسط m.azizi';

async function openAssistantFromStore(dom, waitFor, text) {
  const launcher = dom.window.document.querySelector('a.zhino-assistant-launcher');
  if (!launcher) return false;
  launcher.click();
  return waitFor(() => text().includes(ASSISTANT_WELCOME_HEADING));
}

// ── 31. /assistant renders as a standalone page ─────────────
{
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/assistant', {
    stub: { fetchImpl: OFFLINE_FETCH },
    appSource: appCode,
  });
  try {
    // React renders asynchronously — wait for the page before asserting.
    const rendered = await waitFor(() => text().includes('دستیار ژینو'));
    if (!rendered) fail('assistant page — never rendered: ' + text().slice(0, 160));
    const body = text();
    expectContains('assistant page', body, 'دستیار ژینو');
    // Phase 7 — the chat environment: a quiet «بازگشت به سایت»
    // button, a short Persian welcome, and no storefront chrome.
    expectContains('assistant page', body, 'بازگشت به سایت');
    expectContains('assistant page', body, ASSISTANT_WELCOME_HEADING);
    // the sidebar / capability column and the storefront footer are gone
    expectNotContains('assistant page', body, 'توانایی‌های دستیار');
    expectNotContains('assistant page', body, 'شفاف و بی‌ادعا');
    expectNotContains('assistant page', body, '🇮🇷');
    // Phase 8 — the customer never sees our internals: no status pill and not
    // one sentence about the database, the local engine or the AI model. The
    // connection and the fallback still run — silently, behind the scenes.
    expectNoStatusPill('assistant page', dom);
    expectNoInternalWording('assistant page', dom);
    if (dom.window.document.querySelector('.zhino-assistant-banner')) {
      fail('assistant page — a connection banner is still shown to the customer');
    } else {
      ok('assistant page — no error banner about the AI connection');
    }
    // ready-made questions are compact chips, centred in the welcome state
    const welcomeChips = dom.window.document.querySelectorAll(
      '.zhino-assistant-welcome-chips .zhino-assistant-chip',
    );
    if (welcomeChips.length >= 4) {
      ok(`assistant page — ${welcomeChips.length} suggestion chips sit under the welcome line`);
    } else {
      fail(`assistant page — only ${welcomeChips.length} chips in the welcome area`);
    }
    // …and nothing crowds the composer before the chat has started
    if (dom.window.document.querySelector('.zhino-assistant-ideas-toggle')) {
      fail('assistant page — the ideas row is rendered before the chat starts');
    } else {
      ok('assistant page — the composer stays clean while the chat is fresh');
    }
    // the voice control exists even where speech synthesis is missing (jsdom)
    const voiceButton = dom.window.document.querySelector('button.zhino-assistant-voice');
    if (voiceButton && voiceButton.getAttribute('aria-pressed') === 'false') {
      ok('assistant page — a voice toggle exists and reading is off by default');
    } else {
      fail('assistant page — the voice toggle is missing or on by default');
    }
    // the builder's signature: present, but only one small line
    expectContains('assistant page', body, SIGNATURE_TEXT);
    const signature = dom.window.document.querySelector('.zhino-assistant-signature');
    if (signature && signature.tagName === 'P') {
      ok('assistant page — the signature is a quiet line inside the chat shell');
    } else {
      fail('assistant page — the signature is missing or is not a simple line');
    }
    // the floating launcher must not be duplicated on its own page
    const launchers = dom.window.document.querySelectorAll('.zhino-assistant-launcher').length;
    if (launchers === 0) ok('assistant page — floating launcher is not duplicated');
    else fail(`assistant page — launcher rendered ${launchers} time(s) on /assistant`);
    // Phase 7 — the page is an immersive chat shell: no storefront
    // header/footer, no flags, no nav links, no capability sidebar.
    if (dom.window.document.querySelectorAll('header').length === 1) {
      ok('assistant page — exactly one header (the chat topbar, no storefront nav)');
    } else {
      fail(`assistant page — expected one header, got ${dom.window.document.querySelectorAll('header').length}`);
    }
    const shell = dom.window.document.querySelector('.zhino-assistant-page');
    if (shell && dom.window.document.querySelectorAll('footer').length === 0) {
      ok('assistant page — the storefront footer is gone (immersive shell)');
    } else {
      fail('assistant page — the storefront footer is still rendered');
    }
    const navLinks = Array.from(dom.window.document.querySelectorAll('a')).filter((a) => {
      const href = a.getAttribute('href') ?? '';
      return ['/products', '/recipes', '/about', '/contact', '/cart'].some((route) => href.endsWith(route));
    });
    if (navLinks.length === 0) ok('assistant page — no storefront menu links (خانه/محصولات/تماس…)');
    else fail(`assistant page — storefront nav links rendered: ${navLinks.map((a) => a.getAttribute('href')).join(', ')}`);
    const sidebarHeadings = Array.from(dom.window.document.querySelectorAll('h2')).map((h) => h.textContent ?? '');
    if (!sidebarHeadings.some((title) => title.includes('توانایی'))) {
      ok('assistant page — the capability sidebar is gone');
    } else {
      fail('assistant page — the capability sidebar is still rendered');
    }
    // the composer still owns the input + send button of the chat
    if (
      dom.window.document.querySelector('form.zhino-assistant-composer-form #zhino-assistant-input') &&
      dom.window.document.querySelector('form.zhino-assistant-composer-form button[aria-label="ارسال پیام"]')
    ) {
      ok('assistant page — the ChatGPT-style composer holds the input and the send button');
    } else {
      fail('assistant page — the composer is missing its input or send button');
    }
    // no popup any more
    if (dom.window.document.querySelectorAll('.zhino-assistant-panel').length === 0) {
      ok('assistant page — no popup panel exists (popup replaced by the page)');
    } else {
      fail('assistant page — a popup panel is still rendered');
    }
    // ready-made suggestions render as buttons
    const chips = Array.from(dom.window.document.querySelectorAll('button.zhino-assistant-chip')).map(
      (chip) => chip.textContent ?? '',
    );
    if (chips.some((label) => label.includes('راهنمای انتخاب محصول'))) {
      ok('assistant page — ready-made suggestions render');
    } else {
      fail(`assistant page — suggestion chips missing (got: ${chips.join(' | ')})`);
    }
    // empty message can never be sent
    const sendButton = dom.window.document.querySelector('button[aria-label="ارسال پیام"]');
    if (sendButton && sendButton.disabled) ok('assistant page — empty message cannot be sent');
    else fail('assistant page — send button is enabled with an empty message');
    // RTL document
    if (dom.window.document.documentElement.getAttribute('dir') === 'rtl') {
      ok('assistant page — document stays RTL');
    } else {
      fail('assistant page — document dir is not rtl');
    }
    if (errors.length === 0) ok('assistant page — no runtime errors');
    else fail('assistant page runtime errors:\n    - ' + errors.join('\n    - '));
  } finally {
    dom.window.close();
  }
}

// ── 32. Floating launcher routes to /assistant (no popup) ───
{
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/products', {
    stub: { fetchImpl: OFFLINE_FETCH },
    appSource: appCode,
  });
  try {
    await waitFor(() => text().includes('محصولات ژینو'));
    const launcher = dom.window.document.querySelector('a.zhino-assistant-launcher');
    if (launcher && (launcher.getAttribute('href') ?? '').endsWith('/assistant')) {
      ok('floating launcher — is a real link to /assistant');
    } else {
      fail('floating launcher — expected an <a href="…/assistant">, got: ' + (launcher ? launcher.outerHTML.slice(0, 120) : 'none'));
    }
    const opened = await openAssistantFromStore(dom, waitFor, text);
    if (opened) ok('floating launcher — click opens the /assistant page');
    else fail('floating launcher — click did not open /assistant: ' + text().slice(0, 160));
    if (dom.window.location.pathname.endsWith('/assistant')) {
      ok('floating launcher — the URL is /assistant');
    } else {
      fail('floating launcher — unexpected URL: ' + dom.window.location.pathname);
    }
    if (dom.window.document.querySelectorAll('.zhino-assistant-launcher').length === 0) {
      ok('floating launcher — hidden while on the assistant page');
    } else {
      fail('floating launcher — still rendered on /assistant');
    }
    expectNoErrors('floating launcher', errors);
  } finally {
    dom.window.close();
  }
}

// ── 33. «بازگشت به سایت» → home, and the browser Back works ─
{
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/products', {
    stub: { fetchImpl: OFFLINE_FETCH },
    appSource: appCode,
  });
  try {
    await waitFor(() => text().includes('محصولات ژینو'));
    const opened = await openAssistantFromStore(dom, waitFor, text);
    if (!opened) fail('assistant back — could not open /assistant');

    clickButtonByContains(dom, 'بازگشت به سایت');
    const home = await waitFor(() => text().includes('واردکننده و پخش‌کننده پودر ژله و کاستر'));
    if (home) ok('«بازگشت به سایت» — lands on the storefront home page');
    else fail('«بازگشت به سایت» — home did not render: ' + text().slice(0, 160));
    if (dom.window.location.pathname.replace(/\/+$/, '') === '/zheno-website') {
      ok('«بازگشت به سایت» — the URL is the site root');
    } else {
      fail('«بازگشت به سایت» — unexpected URL: ' + dom.window.location.pathname);
    }

    // The browser's own Back button must walk back into the app (SPA),
    // not out of it — the route is a normal history entry.
    dom.window.history.back();
    const returned = await waitFor(() => text().includes(ASSISTANT_WELCOME_HEADING));
    if (returned) ok('browser Back — returns to the assistant page');
    else fail('browser Back — did not return to /assistant: ' + text().slice(0, 160));
    expectNoErrors('assistant back navigation', errors);
  } finally {
    dom.window.close();
  }
}

// ── 34. Chat works offline: grounded answers from real data ──
{
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/assistant', {
    stub: { fetchImpl: OFFLINE_FETCH },
    appSource: appCode,
  });
  try {
    const ready = await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    if (!ready) fail('assistant chat — the chat console never rendered');

    // typing state appears while the assistant is answering
    await sendChatMessage(dom, waitFor, 'قیمت ژله توت فرنگی چند است؟');
    const typing = await waitFor(
      () => Boolean(dom.window.document.querySelector('.zhino-assistant-typing')),
      3000,
    );
    if (typing) ok('assistant chat — «در حال پاسخ‌گویی» state shows');
    else fail('assistant chat — typing indicator never showed');

    // …and the answer carries the real catalog price
    const priced = await waitFor(() => text().includes('۲۰۰٬۰۰۰ تومان'));
    if (priced) ok('assistant chat — price answer comes from the real catalog');
    else fail('assistant chat — no grounded price answer: ' + text().slice(-220));
    expectContains('assistant chat', text(), 'ژله توت فرنگی');


    // the user's own message is rendered (RTL, right-aligned bubble)
    if (dom.window.document.querySelector('.zhino-assistant-row.is-user')) {
      ok('assistant chat — the user message is rendered');
    } else {
      fail('assistant chat — user message bubble missing');
    }

    // a ready-made suggestion answers with the official on-pack recipe —
    // phase 8: the row is quiet after the chat started, so it is opened first
    // and the chip inside it is clicked (exactly what a customer does).
    const toggleAgain = dom.window.document.querySelector('.zhino-assistant-ideas-toggle');
    if (!toggleAgain) fail('assistant chat — the ideas row vanished between two answers');
    else toggleAgain.click();
    const findRecipeChip = () =>
      Array.from(dom.window.document.querySelectorAll('.zhino-assistant-ideas-body .zhino-assistant-chip')).find(
        (chip) => (chip.textContent ?? '').includes('طرز تهیه ژله'),
      );
    const chipFound = await waitFor(() => Boolean(findRecipeChip()));
    if (!chipFound) {
      const labels = Array.from(
        dom.window.document.querySelectorAll('.zhino-assistant-ideas-body .zhino-assistant-chip'),
      ).map((c) => c.textContent);
      fail('assistant chat — the recipe suggestion is not offered in the ideas row (chips: ' + JSON.stringify(labels) + ')');
    }
    else {
      findRecipeChip().click();
      const recipe = await waitFor(() => text().includes('۱.۵ لیوان آب'));
      if (recipe) ok('assistant chat — suggestion answers with the official recipe');
      else fail('assistant chat — recipe answer missing: ' + text().slice(-220));
    }

    // budget capability, computed from real prices only
    await sendChatMessage(dom, waitFor, 'با ۳۰۰ هزار تومان چه ترکیبی بگیرم؟');
    const budget = await waitFor(() => text().includes('از بودجه باقی می‌ماند'));
    if (budget) ok('assistant chat — budget suggestion is computed from real prices');
    else fail('assistant chat — budget answer missing: ' + text().slice(-220));

    // out-of-scope questions are politely declined (no invented answer).
    // فاز ۱۲: پاسخ محدوده چند واریانت طبیعی دارد؛ این بررسی «صادقانه
    // رد شدن» را می‌سنجد، نه یک جملهٔ مشخص.
    await sendChatMessage(dom, waitFor, 'هوا امروز چطور است؟');
    const scoped = await waitFor(() => /(تخصص من همین قفسهٔ ژینوئه|از حوزهٔ من خارجه|از دستم خارجه)/.test(text()));
    if (scoped) ok('assistant chat — unrelated questions get the honest scope answer');
    else fail('assistant chat — scope answer missing: ' + text().slice(-220));

    // Wait for the collapse itself instead of napping 400 ms: the collapse
    // is a passive effect, and on a loaded machine it can land much later —
    // a fixed nap then samples the row while it is still open and the run
    // fails for no reason. Polling makes the check deterministic.
    const collapsed = await waitFor(() => {
      const toggle = dom.window.document.querySelector('.zhino-assistant-ideas-toggle');
      if (!toggle) return false;
      const open = toggle.getAttribute('aria-expanded') === 'true';
      const chips = Boolean(dom.window.document.querySelector('.zhino-assistant-ideas-body .zhino-assistant-chip'));
      return !open && !chips;
    }, 12000);

    // Phase 8 — an answer never carries a technical footnote, and the
    // suggestions step aside instead of stacking boxes over the chat.
    expectNoInternalWording('assistant chat', dom);
    expectNoStatusPill('assistant chat', dom);
    const ideasToggle = dom.window.document.querySelector('.zhino-assistant-ideas-toggle');
    if (!ideasToggle) {
      fail('assistant chat — the collapsed suggestions row is missing');
    } else if (!collapsed) {
      fail(
        'assistant chat — the suggestions row never collapsed after the answer (aria-expanded=' +
          `${ideasToggle.getAttribute('aria-expanded')})`,
      );
    } else {
      ok('assistant chat — suggestions collapse into a quiet row once the chat starts');
      ideasToggle.click();
    }
    const opened = await waitFor(() =>
      Boolean(dom.window.document.querySelector('.zhino-assistant-ideas-body .zhino-assistant-chip')),
    );
    if (!opened) fail('assistant chat — the suggestions row does not open');
    else {
      ok('assistant chat — opening the row reveals the ready-made questions');
      // clicking a chip sends that question, exactly like typing it
      const before = dom.window.document.querySelectorAll('.zhino-assistant-row.is-user').length;
      dom.window.document
        .querySelectorAll('.zhino-assistant-ideas-body .zhino-assistant-chip')[0]
        .click();
      const sent = await waitFor(
        () => dom.window.document.querySelectorAll('.zhino-assistant-row.is-user').length > before,
      );
      if (sent) ok('assistant chat — a suggestion chip sends its question');
      else fail('assistant chat — clicking a suggestion chip did not send anything');
    }

    expectNoErrors('assistant chat', errors);
  } finally {
    dom.window.close();
  }
}

// ── 34a. فروش از داخل گفتگو: کارت محصول + تأیید صریح پیش از سبد ──
// سه قاعدهٔ قطعی این بخش:
//   ۱) قیمت و موجودی کارت از دادهٔ واقعی کاتالوگ می‌آید.
//   ۲) هیچ‌چیز بدون تأیید مشتری به سبد اضافه نمی‌شود.
//   ۳) افزودن به سبد هرگز به تسویه‌حساب یا پرداخت خودکار نمی‌رسد.
{
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/assistant', {
    stub: { fetchImpl: OFFLINE_FETCH },
    appSource: appCode,
    seed: (window) => window.localStorage.removeItem('zhino_cart'),
  });
  try {
    const ready = await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    if (!ready) fail('assistant shop — the chat console never rendered');

    await sendChatMessage(dom, waitFor, 'ژله توت فرنگی را به سبد خرید اضافه کن');

    // the answer arrives with a real product card (price from the catalog)
    const cards = await waitFor(
      () => dom.window.document.querySelectorAll('.zhino-assistant-product').length > 0,
      5000,
    );
    if (cards) ok('assistant shop — the answer carries a product card');
    else fail('assistant shop — no product card was rendered: ' + text().slice(-200));
    if (text().includes('۲۰۰٬۰۰۰ تومان')) ok('assistant shop — the card price comes from the real catalog');
    else fail('assistant shop — the product card has no real price: ' + text().slice(-200));

    // an explicit confirm gate stands between the answer and the cart
    const confirm = await waitFor(() =>
      Boolean(dom.window.document.querySelector('.zhino-assistant-cart-confirm')),
    );
    if (confirm) ok('assistant shop — an explicit confirm gate appears before adding');
    else fail('assistant shop — no confirm gate: ' + text().slice(-200));

    const cartOf = () => {
      try {
        return JSON.parse(dom.window.localStorage.getItem('zhino_cart') || '[]');
      } catch {
        return [];
      }
    };

    if (cartOf().length === 0) ok('assistant shop — nothing is added to the cart before the customer confirms');
    else fail('assistant shop — something reached the cart without confirmation');

    // «نه» → the cart stays untouched
    const decline = dom.window.document.querySelector('.zhino-assistant-cart-no');
    if (!decline) fail('assistant shop — the decline button is missing');
    else {
      decline.click();
      const declined = await waitFor(() => text().includes('چیزی به سبد اضافه نکردم'));
      if (declined && cartOf().length === 0) ok('assistant shop — declining leaves the cart empty');
      else fail('assistant shop — declining changed the cart: ' + JSON.stringify(cartOf()));
    }

    // a fresh ask, then «بله، اضافه کن» → the very same storefront cart
    await sendChatMessage(dom, waitFor, 'ژله توت فرنگی را به سبد خرید اضافه کن');
    const yes = await waitFor(() => Boolean(dom.window.document.querySelector('.zhino-assistant-cart-yes')), 5000);
    if (!yes) fail('assistant shop — the confirm button never came back');
    else {
      dom.window.document.querySelector('.zhino-assistant-cart-yes').click();
      const added = await waitFor(() => text().includes('به سبد خرید اضافه شد'));
      if (added) ok('assistant shop — after confirmation the item is added');
      else fail('assistant shop — no confirmation message after accepting: ' + text().slice(-200));
      const lines = cartOf();
      if (lines.length === 1 && lines[0].productId === 'jelly-strawberry' && lines[0].quantity === 1) {
        ok('assistant shop — the storefront cart (localStorage) received exactly one line');
      } else {
        fail('assistant shop — unexpected cart content: ' + JSON.stringify(lines));
      }
      // هر دو واریانتِ پیام موفق، بر «پرداخت دست مشتری است» تأکید دارند
      if (/(ثبت سفارش و پرداخت با خودتان است|پرداخت و ثبت نهایی همیشه دست خودتان)/.test(text())) {
        ok('assistant shop — the assistant states that payment stays with the customer');
      } else {
        fail('assistant shop — no clear "payment is yours" note after adding');
      }
    }

    // no automatic checkout: still on the assistant page, no checkout screen
    if (dom.window.location.pathname.endsWith('/assistant')) ok('assistant shop — still on the assistant page (no redirect)');
    else fail('assistant shop — unexpected URL after adding: ' + dom.window.location.pathname);
    // «تسویه حساب» عنوان صفحهٔ Checkout است؛ در گفتگو هیچ‌وقت چاپ نمی‌شود
    if (!text().includes('تسویه حساب') && !text().includes('مراحل تسویه')) {
      ok('assistant shop — no checkout/payment screen was opened automatically');
    } else {
      fail('assistant shop — a checkout screen appeared by itself');
    }

    expectNoInternalWording('assistant shop', dom);
    expectNoErrors('assistant shop', errors);
  } finally {
    dom.window.close();
  }
}

// ── 34c. محصول ناموجود: کارت صادقانه، دکمهٔ غیرفعال، بدون پیشنهاد سبد ──
{
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/assistant', {
    stub: { fetchImpl: OFFLINE_FETCH },
    appSource: appCode,
    seed: (window) => {
      window.localStorage.removeItem('zhino_cart');
      // همان انبار فروشگاه (overlay مدیر) با موجودی صفر برای یک محصول
      window.localStorage.setItem(
        'zhino_admin_catalog_v1',
        JSON.stringify({
          upserts: {
            'jelly-strawberry': {
              id: 'jelly-strawberry',
              category: 'jelly',
              flavorId: 'strawberry-j',
              name: 'پودر ژله توت فرنگی ژینو',
              shortName: 'ژله توت فرنگی',
              categoryLabel: 'پودر ژله',
              imageUrl: 'images/products/jelly-strawberry.jpg',
              featured: true,
              variants: [
                {
                  id: 'jelly-strawberry-250',
                  productId: 'jelly-strawberry',
                  weight: '۲۵۰ گرم',
                  weightGrams: 250,
                  price: 200000,
                  sku: 'ZJ-STR-250',
                  stock: 0,
                  available: true,
                },
              ],
            },
          },
          removed: [],
          meta: {},
        }),
      );
    },
  });
  try {
    const ready = await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    if (!ready) fail('assistant out-of-stock — the chat console never rendered');

    await sendChatMessage(dom, waitFor, 'ژله توت فرنگی را به سبد خرید اضافه کن');

    const honest = await waitFor(() => text().includes('ناموجود'), 6000);
    if (honest) ok('assistant out-of-stock — the assistant says the item is unavailable');
    else fail('assistant out-of-stock — no honest "ناموجود" answer: ' + text().slice(-200));

    if (dom.window.document.querySelector('.zhino-assistant-cart-confirm')) {
      fail('assistant out-of-stock — a cart offer was made for an unavailable product');
    } else {
      ok('assistant out-of-stock — nothing is offered to the cart');
    }

    const emptyCart = dom.window.localStorage.getItem('zhino_cart');
    if (emptyCart === null || emptyCart === '[]') ok('assistant out-of-stock — the cart stayed empty');
    else fail('assistant out-of-stock — the cart changed: ' + emptyCart);

    // a card for another (available) product still offers the button
    await sendChatMessage(dom, waitFor, 'قیمت ژله هلو چند است؟');
    const card = await waitFor(
      () => Boolean(dom.window.document.querySelector('.zhino-assistant-add:not(:disabled)')),
      6000,
    );
    if (card) ok('assistant out-of-stock — an available product still gets a working add button');
    else fail('assistant out-of-stock — no enabled add button for an available product');

    expectNoInternalWording('assistant out-of-stock', dom);
    expectNoErrors('assistant out-of-stock', errors);
  } finally {
    dom.window.close();
  }
}

// ── 34b. Phase 8 — reading the answer aloud with the browser's own TTS ──
// A fake Web Speech API is installed inside jsdom and every utterance is
// recorded. The rules this checks: reading is switched OFF until the customer
// asks, the assistant's answer is what gets spoken (never the customer's own
// question), the utterance is marked Persian, the stop control works, and not
// a single network request is made for speech — no third-party voice service.
{
  const spoken = [];
  let cancels = 0;
  const requests = [];
  const voiceFetch = (input, init) => {
    requests.push(typeof input === 'string' ? input : input.url);
    return Promise.reject(new Error('offline (smoke test)'));
  };
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/assistant', {
    stub: { fetchImpl: voiceFetch },
    appSource: appCode,
    seed: (window) => {
      window.localStorage.removeItem('zhino_assistant_voice_v1');
      window.SpeechSynthesisUtterance = class FakeUtterance {
        constructor(uttered) {
          this.text = uttered;
          this.lang = '';
          this.voice = null;
        }
      };
      const voices = [{ lang: 'fa-IR', name: 'ژینو فارسی' }];
      // هر تکه مثل مرورگر واقعی در صف می‌ماند و با onend تمام می‌شود؛
      // cancel() همهٔ صف را لغو می‌کند.
      const pending = [];
      window.speechSynthesis = {
        speaking: false,
        paused: false,
        getVoices: () => voices,
        addEventListener: () => {},
        removeEventListener: () => {},
        speak(utterance) {
          const row = { utterance, dropped: false };
          pending.push(row);
          spoken.push({ text: utterance.text, lang: utterance.lang });
          // مثل مرورگر واقعی: اول onstart، بعد onend
          setTimeout(() => {
            if (row.dropped) return;
            if (typeof utterance.onstart === 'function') utterance.onstart();
          }, 40);
          setTimeout(() => {
            if (row.dropped) return;
            row.dropped = true;
            if (typeof utterance.onend === 'function') utterance.onend();
          }, 900);
        },
        cancel() {
          cancels += 1;
          pending.forEach((row) => {
            row.dropped = true;
          });
        },
        pause: () => {},
        resume: () => {},
      };
    },
  });
  try {
    const ready = await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    if (!ready) fail('assistant voice — the chat console never rendered');

    const toggle = dom.window.document.querySelector('button.zhino-assistant-voice');
    if (!toggle) {
      fail('assistant voice — the sound button is missing from the composer');
    } else if (toggle.getAttribute('aria-pressed') !== 'false') {
      fail('assistant voice — reading must start switched off (never intrusive)');
    } else {
      ok('assistant voice — a small sound switch sits in the composer, off by default');
    }

    if (toggle) {
      toggle.click();
      const on = await waitFor(
        () => dom.window.document.querySelector('button.zhino-assistant-voice').getAttribute('aria-pressed') === 'true',
      );
      if (!on) fail('assistant voice — the switch does not turn reading on');
      else ok('assistant voice — the switch turns reading on');
      if (dom.window.localStorage.getItem('zhino_assistant_voice_v1') === '1') {
        ok('assistant voice — the choice is remembered for the next visit');
      } else {
        fail('assistant voice — the choice is not remembered');
      }
    }

    await sendChatMessage(dom, waitFor, 'قیمت ژله توت فرنگی چند است؟');
    const read = await waitFor(() => spoken.length > 0, 9000);
    if (!read) {
      fail('assistant voice — the answer was never read aloud: ' + text().slice(-160));
    } else {
      // «۲۰۰٬۰۰۰ تومان» — ساخته‌شده از رقم‌های فارسی، تا خودِ تست هم
      // به یک متن کپی‌شده وابسته نماند
      const PRICE = '\u06f2\u06f0\u06f0\u066c\u06f0\u06f0\u06f0 \u062a\u0648\u0645\u0627\u0646';
      const said = spoken.map((item) => item.text).join(' ');
      const answer = Array.from(dom.window.document.querySelectorAll('.zhino-assistant-bubble.is-bot')).pop()?.textContent ?? '';
      if (said.includes(PRICE)) ok('assistant voice — the real price is spoken, not a generic line');
      else fail('assistant voice — the spoken text has no price: ' + said.slice(0, 160));
      // هر تکه‌ای که خوانده می‌شود باید بخشی از همان پاسخ روی صفحه باشد
      // (نشانه‌های فهرست و خط‌جدید پیش از خواندن عوض می‌شوند، پس هر دو
      // طرف یکسان صاف می‌شوند: فقط «کلمات» مقایسه می‌شوند)
      const flat = (value) =>
        value
          .replace(/[\u2022\u25aa\u25e6]/g, '')
          .replace(/[\u060c\u061b\u066b\u066c.,:!?\u061f]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      const flatAnswer = flat(answer);
      const invented = spoken.filter((item) => !flatAnswer.includes(flat(item.text)));
      if (invented.length === 0) ok('assistant voice — the speech is exactly the text on screen, nothing invented');
      else fail('assistant voice — spoken text is not the displayed answer: ' + invented[0].text.slice(0, 80));
      if (said.includes('قیمت ژله توت فرنگی چند است')) {
        fail('assistant voice — the customer question was handed to the speech engine');
      } else {
        ok('assistant voice — only the assistant answer is spoken, never the customer question');
      }
      if (spoken.every((item) => /^fa/i.test(item.lang))) ok('assistant voice — the utterance is marked Persian (fa)');
      else fail('assistant voice — wrong utterance language: ' + spoken.map((item) => item.lang).join(', '));
    }

    // while reading, a stop control is offered — and it really stops
    await sleep(80);
    const stop = dom.window.document.querySelector('button.zhino-assistant-stop');
    if (!stop) fail('assistant voice — no stop control while reading');
    else {
      stop.click();
      const stopped = await waitFor(() => !dom.window.document.querySelector('button.zhino-assistant-stop'));
      if (!stopped) fail('assistant voice — the stop button does not end reading');
      else if (cancels === 0) fail('assistant voice — speechSynthesis.cancel() was never called');
      else ok('assistant voice — the stop control ends reading at once');
    }

    if (requests.length === 0) ok('assistant voice — reading the answer sends nothing over the network');
    else fail(`assistant voice — ${requests.length} request(s) for speech: ${requests.join(', ')}`);

    // turning it off again is always possible, and the preference follows
    if (toggle) {
      dom.window.document.querySelector('button.zhino-assistant-voice').click();
      const off = await waitFor(
        () => dom.window.document.querySelector('button.zhino-assistant-voice').getAttribute('aria-pressed') === 'false',
      );
      if (!off) fail('assistant voice — the customer cannot switch reading off');
      else if (dom.window.localStorage.getItem('zhino_assistant_voice_v1') !== '0') {
        fail('assistant voice — switching off is not remembered');
      } else {
        ok('assistant voice — the customer can switch reading off and it stays off');
      }
    }
    // reading never breaks the chat itself
    expectContains('assistant voice', text(), 'ژله توت فرنگی');
    expectNoErrors('assistant voice', errors);
  } finally {
    dom.window.close();
  }
}

// ── 34e. Phase 9 — the device has no Persian voice (typical Android) ──
// When getVoices() answers with only English voices, the app must never
// hand anything to the speech engine, the customer sees one short clear
// line (instead of silence or a stuck «reading…» state), and the chat is
// untouched.
{
  const spoken = [];
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/assistant', {
    stub: { fetchImpl: OFFLINE_FETCH },
    appSource: appCode,
    seed: (window) => {
      window.localStorage.removeItem('zhino_assistant_voice_v1');
      window.SpeechSynthesisUtterance = class FakeUtterance {
        constructor(uttered) {
          this.text = uttered;
          this.lang = '';
          this.voice = null;
        }
      };
      // A typical Android phone: the only installed voice is English.
      const voices = [{ lang: 'en-US', name: 'Google US English' }];
      window.speechSynthesis = {
        speaking: false,
        paused: false,
        getVoices: () => voices,
        addEventListener: () => {},
        removeEventListener: () => {},
        speak(utterance) {
          spoken.push(utterance.text);
        },
        cancel() {},
        pause: () => {},
        resume: () => {},
      };
    },
  });
  try {
    const ready = await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    if (!ready) fail('no Persian voice — the chat console never rendered');

    const toggle = dom.window.document.querySelector('button.zhino-assistant-voice');
    if (!toggle) {
      fail('no Persian voice — the sound switch is missing');
    } else {
      toggle.click();
      const explained = await waitFor(() => text().includes('صدای فارسی روی این دستگاه نیست'));
      if (!explained) fail('no Persian voice — toggling with no Persian voice left a dead button');
      else ok('no Persian voice — a short, clear line explains the situation');
      if (dom.window.document.querySelector('button.zhino-assistant-voice').getAttribute('aria-pressed') === 'false') {
        ok('no Persian voice — reading is not switched on when nothing can speak');
      } else {
        fail('no Persian voice — reading switched on although nothing can speak');
      }
    }

    // A new answer arrives: reading must never be attempted, chat untouched
    await sendChatMessage(dom, waitFor, 'قیمت ژله توت فرنگی چند است؟');
    const answered = await waitFor(() => text().includes('\u06f2\u06f0\u06f0\u066c\u06f0\u06f0\u06f0 \u062a\u0648\u0645\u0627\u0646'));
    if (!answered) fail('no Persian voice — the answer never arrived: ' + text().slice(-180));
    else ok('no Persian voice — the answer is displayed as text, exactly as before');
    await sleep(400);
    if (spoken.length === 0) ok('no Persian voice — nothing was handed to the speech engine');
    else fail(`no Persian voice — the engine was asked to speak: ${spoken.join(' | ').slice(0, 120)}`);

    // The read button under the answer must be honest as well
    const readButton = dom.window.document.querySelector('button.zhino-assistant-read');
    if (!readButton) {
      fail('no Persian voice — the read button disappeared');
    } else {
      readButton.click();
      const explainedAgain = await waitFor(() => text().includes('صدای فارسی روی این دستگاه نیست'));
      if (!explainedAgain) fail('no Persian voice — the read button did not explain itself');
      else ok('no Persian voice — the read button explains itself too');
      await sleep(300);
      if (spoken.length === 0) ok('no Persian voice — the read button still speaks nothing');
      else fail('no Persian voice — the read button sent text to the engine');
    }

    expectNoInternalWording('no Persian voice', dom);
    expectNoErrors('no Persian voice', errors);
  } finally {
    dom.window.close();
  }
}

// ── 34f. Phase 9 — play / pause / resume / stop all work ──────────
// The mobile TTS fix: pause and resume are app-level (synth.pause() is
// broken on Chrome Android), the queue is really cancelled on pause,
// resume re-speaks the same chunk, and stop ends everything at once.
{
  const spoken = [];
  let cancels = 0;
  const pending = [];
  const voiceFetch = (input, init) => {
    return Promise.reject(new Error('offline (smoke test)'));
  };
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/assistant', {
    stub: { fetchImpl: voiceFetch },
    appSource: appCode,
    seed: (window) => {
      window.localStorage.removeItem('zhino_assistant_voice_v1');
      window.SpeechSynthesisUtterance = class FakeUtterance {
        constructor(uttered) {
          this.text = uttered;
          this.lang = '';
          this.voice = null;
        }
      };
      const voices = [{ lang: 'fa-IR', name: 'ژینو فارسی' }];
      window.speechSynthesis = {
        speaking: false,
        paused: false,
        getVoices: () => voices,
        addEventListener: () => {},
        removeEventListener: () => {},
        speak(utterance) {
          const row = { utterance, dropped: false };
          pending.push(row);
          spoken.push({ text: utterance.text, lang: utterance.lang });
          setTimeout(() => {
            if (!row.dropped && typeof utterance.onstart === 'function') utterance.onstart();
          }, 40);
          setTimeout(() => {
            if (row.dropped) return;
            row.dropped = true;
            if (typeof utterance.onend === 'function') utterance.onend();
          }, 900);
        },
        cancel() {
          cancels += 1;
          pending.forEach((row) => {
            row.dropped = true;
          });
        },
        pause: () => {},
        resume: () => {},
      };
    },
  });
  try {
    const ready = await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    if (!ready) fail('playback controls — the chat console never rendered');

    // switch reading on, then ask a long question (recipe = many chunks)
    dom.window.document.querySelector('button.zhino-assistant-voice').click();
    await waitFor(
      () => dom.window.document.querySelector('button.zhino-assistant-voice').getAttribute('aria-pressed') === 'true',
    );
    await sendChatMessage(dom, waitFor, 'طرز تهیه ژله چطوره؟');
    const started = await waitFor(() => spoken.length > 0, 9000);
    if (!started) fail('playback controls — reading never started: ' + text().slice(-160));

    const pauseBtn = () => dom.window.document.querySelector('button[aria-label="مکث خواندن"]');
    const resumeBtn = () => dom.window.document.querySelector('button[aria-label="ادامه خواندن"]');
    const stopBtn = () => dom.window.document.querySelector('button.zhino-assistant-stop');
    const barShown = await waitFor(() => Boolean(pauseBtn()) && Boolean(stopBtn()));
    if (!barShown) fail('playback controls — the pause/stop row did not appear while reading');
    else ok('playback controls — pause + stop appear while reading');

    // pause: the queue is really cancelled and the row offers «ادامه»
    const cancelsBefore = cancels;
    pauseBtn().click();
    const pausedShown = await waitFor(() => Boolean(resumeBtn()));
    if (!pausedShown) fail('playback controls — pause did not switch the row to resume');
    else ok('playback controls — pause switches the row to «ادامه»');
    if (dom.window.document.querySelector('.zhino-assistant-playback.is-paused')) {
      ok('playback controls — the row is marked as paused (sound bars freeze)');
    } else {
      fail('playback controls — the row is not marked as paused');
    }
    if (cancels > cancelsBefore) ok('playback controls — pause really cancelled the queue');
    else fail('playback controls — pause did not cancel the queue');

    // resume: the same chunk is spoken again
    const spokenBefore = spoken.length;
    resumeBtn().click();
    const resumed = await waitFor(() => spoken.length > spokenBefore, 6000);
    if (!resumed) fail('playback controls — resume did not speak again');
    else ok('playback controls — resume speaks the same chunk again');
    const pauseBack = await waitFor(() => Boolean(pauseBtn()));
    if (!pauseBack) fail('playback controls — the row did not return to «مکث» after resume');
    else ok('playback controls — the row returns to «مکث» after resume');

    // stop: no more speech, the row disappears
    const spokenAtStop = spoken.length;
    stopBtn().click();
    const barGone = await waitFor(() => !stopBtn());
    if (!barGone) fail('playback controls — stop did not remove the row');
    else ok('playback controls — stop removes the row');
    await sleep(1500);
    if (spoken.length === spokenAtStop) ok('playback controls — nothing is spoken after stop');
    else fail('playback controls — speech continued after stop');

    expectNoErrors('playback controls', errors);
  } finally {
    dom.window.close();
  }
}

// ── 34c. No speech support / no Persian voice → the chat is untouched ──
{
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/assistant', {
    stub: { fetchImpl: OFFLINE_FETCH },
    appSource: appCode,
    seed: (window) => window.localStorage.setItem('zhino_assistant_voice_v1', '1'),
  });
  try {
    const ready = await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    if (!ready) fail('assistant without speech — the chat console never rendered');

    // a stored "voice on" preference must not throw when speechSynthesis is missing
    const toggle = dom.window.document.querySelector('button.zhino-assistant-voice');
    if (!toggle) fail('assistant without speech — the sound switch disappeared');
    else {
      if (toggle.getAttribute('aria-pressed') !== 'false') {
        fail('assistant without speech — a missing speech engine must not report voice as on');
      } else {
        ok('assistant without speech — reading stays off when the browser cannot speak');
      }
      toggle.click();
      const explained = await waitFor(() => text().includes('این مرورگر خواندن با صدا را ندارد'));
      if (!explained) fail('assistant without speech — the customer is left with a dead button');
      else ok('assistant without speech — the button explains itself in one friendly line');
    }
    if (dom.window.document.querySelectorAll('.zhino-assistant-read').length !== 0) {
      fail('assistant without speech — per-answer read buttons are shown although nothing can speak');
    } else {
      ok('assistant without speech — no read buttons where reading is impossible');
    }

    // and the conversation itself is untouched
    await sendChatMessage(dom, waitFor, 'طرز تهیه ژله چطور است؟');
    const answered = await waitFor(() => text().includes('۱.۵ لیوان آب'), 9000);
    if (!answered) fail('assistant without speech — the answer never arrived: ' + text().slice(-180));
    else ok('assistant without speech — the answer is displayed as text, exactly as before');
    expectNoErrors('assistant without speech', errors);
  } finally {
    dom.window.close();
  }
}

// ── 34d. Phase 8 — the chat CSS keeps the mobile promises ───────────────
// jsdom cannot lay the page out, so the rules that protect small screens are
// read straight from the stylesheet: wrapping chips that never overflow, a
// composer row that stays centred, and a signature that stays visually tiny.
{
  const cssPath = join(root, 'src', 'components', 'assistant', 'assistant.css');
  const css = readFileSync(cssPath, 'utf8');
  // the rule that *starts* with this exact selector (a descendant selector
  // like `.a .b { … }` must not be mistaken for `.b { … }`)
  const rule = (selector) => {
    const found = new RegExp('\\n\\s*' + selector.replace(/[.\\]]/g, '\\$&') + '\\s*\\{').exec(css);
    if (!found) return '';
    const at = found.index + found[0].length;
    return css.slice(at, css.indexOf('}', at));
  };

  const list = rule('.zhino-assistant-ideas-list');
  if (list.includes('flex-wrap: wrap')) ok('assistant css — suggestions wrap instead of overflowing on mobile');
  else fail('assistant css — the suggestion row must wrap (found: ' + (list || 'no rule') + ')');

  const chip = rule('.zhino-assistant-chip');
  if (chip.includes('max-width: 100%')) ok('assistant css — a chip can never be wider than the screen');
  else fail('assistant css — chips have no max-width and can overflow small screens');
  if (!chip.includes('white-space: nowrap')) ok('assistant css — long suggestions wrap inside the chip');
  else fail('assistant css — chips still use white-space: nowrap');
  if (chip.includes('border-radius') && chip.includes('border: 1px solid')) {
    ok('assistant css — chips keep the soft corners and the fine brand border');
  } else {
    fail('assistant css — chips lost their soft corners / subtle border');
  }

  const signature = rule('.zhino-assistant-signature');
  if (/font-size: 0?\.5\drem/.test(signature)) ok('assistant css — the signature is deliberately tiny');
  else fail('assistant css — the signature is not small: ' + (signature || 'no rule'));
  if (signature.includes('mocha-light') && signature.includes('opacity')) {
    ok('assistant css — the signature is low-contrast but readable');
  } else {
    fail('assistant css — the signature must be muted yet legible');
  }

  const voice = rule('.zhino-assistant-voice');
  if (voice.includes('2.35rem')) ok('assistant css — the sound switch is a proper round touch target');
  else fail('assistant css — the sound switch is too small for a finger');

  for (const dead of ['.zhino-assistant-status', '.zhino-assistant-banner', '.zhino-assistant-welcome-note']) {
    if (css.includes(dead)) fail(`assistant css — ${dead} is still styled (technical UI left-overs)`);
    else ok(`assistant css — ${dead} is gone (nothing technical is drawn)`);
  }
}

// ── 35. Connected AI path: request shape + no key in the browser ──
// The AI proxy is mocked: the app must send the question and the real
// catalog to the configured endpoint, render the model's answer, show
// the honest «متصل» state — and never carry an API key.
{
  const calls = [];
  const assistantFetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = init.headers ? Object.fromEntries(new globalThis.Headers(init.headers).entries()) : {};
    const body = typeof init.body === 'string' ? init.body : '';
    calls.push({ url, method, headers, body });
    const json = (payload, status = 200) =>
      new globalThis.Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    if (method === 'GET') return json({ ok: true, configured: true, model: 'smoke-model' });
    return json({ reply: 'پاسخ آزمایشی از مدل زبانی ژینو.' });
  };

  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/assistant', {
    stub: { fetchImpl: assistantFetch },
    appSource: appCodeWithAssistant,
  });
  try {
    const rendered = await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    if (!rendered) fail('assistant AI — the chat console never rendered');
    // Phase 8 — the health check still runs (it decides whether to ask the
    // model), but nothing about it is printed on the screen.
    expectNoStatusPill('assistant AI', dom);
    expectNoInternalWording('assistant AI', dom);
    const answeredAfterProbe = await waitFor(() =>
      Boolean(dom.window.document.querySelector('#zhino-assistant-input')),
    );
    if (answeredAfterProbe) ok('assistant AI — the chat stays usable while the connection is probed');
    else fail('assistant AI — the console disappeared during the health check');

    await sendChatMessage(dom, waitFor, 'یک دسر سرد پیشنهاد بده');
    const answered = await waitFor(() => text().includes('پاسخ آزمایشی از مدل زبانی ژینو'));
    if (answered) ok('assistant AI — the model answer is rendered in the chat');
    else fail('assistant AI — model answer never rendered: ' + text().slice(-220));

    const post = calls.find((call) => call.method === 'POST');
    if (post && post.url === 'https://assistant.smoke.test/chat') {
      ok('assistant AI — the question goes to the configured endpoint');
    } else {
      fail(`assistant AI — unexpected POST: ${post ? post.url : 'none'} (calls: ${calls.map((c) => c.method + ' ' + c.url).join(', ')})`);
    }
    if (post) {
      let payload = {};
      try {
        payload = JSON.parse(post.body);
      } catch {
        /* checked below */
      }
      const keys = Object.keys(payload).sort().join(',');
      if (keys === 'catalog,catalogSource,history,locale,message') {
        ok('assistant AI — request carries only message/history/catalog/locale/catalogSource');
      } else {
        fail('assistant AI — unexpected request keys: ' + keys);
      }
      if (payload.catalogSource === 'local' || payload.catalogSource === 'database') {
        ok('assistant AI — the request declares where its catalog came from');
      } else {
        fail('assistant AI — catalogSource is missing or invalid: ' + payload.catalogSource);
      }
      if (typeof payload.catalog === 'string' && payload.catalog.includes('ژله توت فرنگی')) {
        ok('assistant AI — the real catalog travels with the question (grounding)');
      } else {
        fail('assistant AI — catalog grounding missing from the request');
      }
      const serialized = JSON.stringify(payload) + JSON.stringify(post.headers);
      const looksSecret = /(sk-[A-Za-z0-9]{16,}|service_role|sb_secret_|api[_-]?key)/i.test(serialized);
      if (!looksSecret) ok('assistant AI — no API key or secret anywhere in the browser request');
      else fail('assistant AI — the request looks like it carries a key');
    }
    expectNoErrors('assistant AI', errors);
  } finally {
    dom.window.close();
  }
}


// ════════════════════════════════════════════════════════════
// ASSISTANT PHASE 6 SUITE: the assistant must answer from the REAL
// database (products / variants / inventory / recipes / settings) and
// from the model only through the Edge Function — never from a
// hardcoded price, and never with a key in the browser.
// ════════════════════════════════════════════════════════════

/** Store rows used by the database-backed assistant tests (values are
 *  deliberately different from the base catalog so the source is provable). */
const ASSISTANT_DB_ROWS = {
  products: [
    {
      id: 'jelly-pomegranate',
      category: 'jelly',
      flavor_id: 'pomegranate',
      name: 'پودر ژله انار ژینو (دیتابیس)',
      short_name: 'ژله انار',
      category_label: 'پودر ژله',
      image_url: 'images/products/jelly-pomegranate.jpg',
      active: true,
      featured: true,
      special: false,
    },
  ],
  product_variants: [
    {
      id: 'jelly-pomegranate-250',
      product_id: 'jelly-pomegranate',
      weight: '۲۵۰ گرم',
      weight_grams: 250,
      price: 187000,
      sku: 'ZJ-POM-250',
    },
  ],
  inventory: [{ variant_id: 'jelly-pomegranate-250', current_stock: 3, active: true }],
  recipes: [
    {
      id: 'jelly-basic',
      title: 'دستور تهیه ژله (نسخه دیتابیس)',
      summary: '۳ قاشق پودر ژله + ۱.۵ لیوان آب',
      category: 'jelly',
      ingredients: ['۳ قاشق پودر ژله ژینو', '۱.۵ لیوان آب'],
      steps: ['پودر ژله و آب را مخلوط کنید (نسخه دیتابیس).', 'روی حرارت بگذارید تا بجوشد.'],
      emoji: '🍮',
      active: true,
    },
  ],
  site_content: [],
  site_settings: [
    {
      id: 'default',
      free_shipping_threshold: 550000,
      standard_shipping_cost: 45000,
      express_shipping_cost: 90000,
      low_stock_threshold: 30,
    },
  ],
};

/**
 * A fetch stub that answers the storefront's PostgREST reads with the
 * rows above — the same shape supabase-js sends (including the
 * `.maybeSingle()` Accept header for site_settings).
 */
function makeAssistantDbStub({ seen = [] } = {}) {
  const fetchImpl = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const headers = init.headers
      ? Object.fromEntries(new globalThis.Headers(init.headers).entries())
      : {};
    seen.push(url);
    if (!url.includes('/rest/v1/')) {
      // مثلاً مسیر Edge Function که هنوز مستقر نشده است
      return new globalThis.Response('not found', { status: 404 });
    }
    const table = url.split('/rest/v1/')[1].split('?')[0];
    const data = ASSISTANT_DB_ROWS[table] ?? [];
    const wantsSingle = String(headers.accept ?? '').includes('vnd.pgrst.object');
    const payload = wantsSingle ? (data[0] ?? null) : data;
    return new globalThis.Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetchImpl, seen };
}

// ── 36. Assistant reads the real database (browser integration) ──
// With Supabase configured, every answer must use the database values:
// price (187,000 — not the base 200,000), stock (3), the database
// recipe text and the database free-shipping threshold (550,000).
{
  const db = makeAssistantDbStub();
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/assistant', {
    stub: { fetchImpl: db.fetchImpl },
    appSource: appCodeWithDb,
    seed: (window) =>
      window.localStorage.removeItem('zhino_admin_catalog_v1'),
  });
  try {
    const ready = await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    if (!ready) fail('assistant database — the chat console never rendered');

    // Phase 8 — the database is still the source of truth, but the page says
    // nothing about it: no badge, no note. The proof is the data itself — the
    // ۱۸۷٬۰۰۰ price below exists only in the stubbed database rows.
    expectNoStatusPill('assistant database', dom);
    expectNoInternalWording('assistant database', dom);

    // ۱) price + stock straight from the database rows
    await sendChatMessage(dom, waitFor, 'قیمت ژله انار چنده؟');
    const priced = await waitFor(() => text().includes('۱۸۷٬۰۰۰ تومان'));
    if (priced) ok('assistant database — price comes from the database (۱۸۷٬۰۰۰)');
    else fail('assistant database — database price missing: ' + text().slice(-200));
    expectContains('assistant database', text(), 'موجودی: ۳ عدد');

    // ۲) shipping settings straight from the database row
    await sendChatMessage(dom, waitFor, 'هزینه ارسال چقدره؟');
    const shipping = await waitFor(() => text().includes('۵۵۰٬۰۰۰ تومان'));
    if (shipping) ok('assistant database — free-shipping threshold comes from site_settings');
    else fail('assistant database — database shipping threshold missing: ' + text().slice(-200));

    // ۳) the official recipe rows, not the bundled defaults
    await sendChatMessage(dom, waitFor, 'طرز تهیه ژله چطوره؟');
    const recipe = await waitFor(() => text().includes('نسخه دیتابیس'));
    if (recipe) ok('assistant database — recipe text comes from the recipes table');
    else fail('assistant database — database recipe missing: ' + text().slice(-200));

    // ۴) honesty about the source — in the customer's own language
    await sendChatMessage(dom, waitFor, 'اطلاعاتت رو از کجا میاری؟');
    // واریانت‌های پاسخِ «منبع» — هر دو یعنی: اعداد از خود فروشگاه است
    const source = await waitFor(() => /(لحظه‌ای از خودِ فروشگاه می‌گیرم|همین حالا از خود فروشگاه نگاه می‌کنم)/.test(text()));
    if (source) ok('assistant database — the assistant says its numbers come from the shop itself, live');
    else fail('assistant database — source answer missing: ' + text().slice(-200));

    // ۵) اتصال مدل برقرار نیست (تابع مستقر نشده) → همان‌جا پاسخ داده می‌شود،
    //    بی‌صدا و بدون هیچ خبر فنی برای مشتری
    const quiet = await waitFor(() => !dom.window.document.querySelector('.zhino-assistant-typing'), 8000);
    if (!quiet) {
      fail('assistant database — the chat is still thinking after the unreachable proxy');
    } else if (/ارتباط با دستیار هوشمند|دادهٔ واقعی فروشگاه|پاسخ محلی داده شد/.test(text())) {
      fail('assistant database — the fallback is announced to the customer with internal wording');
    } else {
      ok('assistant database — an unreachable AI proxy is answered locally and silently');
    }

    // ۶) the storefront still works from the same database snapshot
    const productLink = Array.from(dom.window.document.querySelectorAll('a.zhino-assistant-link')).find(
      (link) => (link.textContent ?? '').includes('ژله انار'),
    );
    if (productLink) {
      productLink.click();
      const onProduct = await waitFor(() => text().includes('پودر ژله انار ژینو (دیتابیس)'));
      if (onProduct) ok('assistant database — a product link from the chat reaches the real product page');
      else fail('assistant database — product page did not open: ' + text().slice(0, 160));
      if (dom.window.location.pathname.includes('/products/jelly-pomegranate')) {
        ok('assistant database — the storefront route is preserved (/products/:id)');
      } else {
        fail('assistant database — unexpected route: ' + dom.window.location.pathname);
      }
    } else {
      fail('assistant database — no product link was offered in the answer');
    }

    const readTables = Array.from(
      new Set(
        db.seen
          .filter((url) => url.includes('/rest/v1/'))
          .map((url) => url.split('/rest/v1/')[1].split('?')[0]),
      ),
    );
    if (readTables.includes('products') && readTables.includes('product_variants') && readTables.includes('inventory')) {
      ok('assistant database — catalog/variant/inventory reads happen through the shared services');
    } else {
      fail('assistant database — unexpected reads: ' + readTables.join(', '));
    }
    const forbidden = readTables.filter((table) => table.startsWith('order'));
    if (forbidden.length === 0) ok('assistant database — the assistant never reads orders/customer tables');
    else fail('assistant database — forbidden reads: ' + forbidden.join(', '));

    expectNoErrors('assistant database', errors);
  } finally {
    dom.window.close();
  }
}

// ── 37. Persian colloquial and mistyped questions ───────────
// The assistant must understand how customers actually type.
{
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/assistant', {
    stub: { fetchImpl: OFFLINE_FETCH },
    appSource: appCode,
  });
  try {
    const ready = await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
    if (!ready) fail('assistant colloquial — the chat console never rendered');

    const cases = [
      { ask: 'سلام ژله انار چنده؟', expect: '۲۰۰٬۰۰۰ تومان', label: '«چنده» price question' },
      { ask: 'با ۵۰۰ تومن چی بخرم؟', expect: 'بودجهٔ ۵۰۰٬۰۰۰ تومان', label: '«۵۰۰ تومن» budget' },
      { ask: 'برای ۶ نفر چقدر پودر لازمه؟', expect: 'برای ۶ نفر', label: '«چقدر پودر لازمه» servings' },
      // سؤال طعم‌ها همیشه فهرست واقعی را با همین بولت می‌آورد (عنوان جمله‌بندی دارد)
      { ask: 'چه طعم هایی دارید؟', expect: '• ژله (', label: '«چه طعم هایی» flavor list' },
      { ask: 'کاستر کاکائو موجوده؟', expect: 'کاستر کاکائو', label: '«موجوده» availability' },
      { ask: 'هزینه پست چنده؟', expect: 'کرایهٔ ارسال عادی', label: '«هزینه پست» shipping' },
      { ask: 'میخوام ژله رو با کاستر لایه لایه کنم، ترکیب چی خوبه؟', expect: 'ترکیب', label: 'layer/combination question' },
      { ask: 'یه دسر سریع و راحت میخوام', expect: '', label: '«سریع و راحت» suggestion' },
    ];

    for (const item of cases) {
      await sendChatMessage(dom, waitFor, item.ask);
      // wait for the local answer to land (typing indicator disappears)
      const answered = await waitFor(
        () => !dom.window.document.querySelector('.zhino-assistant-typing'),
        6000,
      );
      if (!answered) fail(`assistant colloquial — no answer for «${item.ask}»`);
      if (item.expect && !text().includes(item.expect)) {
        fail(`assistant colloquial — ${item.label} expected «${item.expect}»: ${text().slice(-220)}`);
      } else if (item.expect) {
        ok(`assistant colloquial — ${item.label} answered`);
      } else {
        ok(`assistant colloquial — ${item.label} answered`);
      }
    }

    // a story request must be declined in scope, not answered
    await sendChatMessage(dom, waitFor, 'برام یه شعر بگو');
    const scoped = await waitFor(() => /(تخصص من همین قفسهٔ ژینوئه|از حوزهٔ من خارجه|از دستم خارجه)/.test(text()));
    if (scoped) ok('assistant colloquial — an out-of-scope request is declined with the honest scope answer');
    else fail('assistant colloquial — scope answer missing: ' + text().slice(-200));

    expectNoErrors('assistant colloquial', errors);
  } finally {
    dom.window.close();
  }
}

// ── 38. Model failures fall back locally, with honest notes ──
{
  const makeModelStub = (mode) => async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('https://assistant.smoke.test/chat')) {
      const method = (init.method ?? 'GET').toUpperCase();
      if (method === 'GET') {
        return new globalThis.Response(JSON.stringify({ ok: true, configured: true, model: 'smoke' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (mode === 'server-error') return new globalThis.Response('boom', { status: 500 });
      if (mode === 'rate-limited') {
        return new globalThis.Response(JSON.stringify({ error: 'rate_limited', message: 'زیاد شد' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (mode === 'no-knowledge') {
        return new globalThis.Response(JSON.stringify({ reply: 'پاسخ مدل بدون داده.', knowledge: 'none' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new globalThis.Response(
        JSON.stringify({ reply: 'پاسخ مدل با داده.', knowledge: 'database' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new globalThis.Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  // (الف) خطای سرور → پاسخ محلی + دکمهٔ تلاش دوباره
  {
    const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/assistant', {
      stub: { fetchImpl: makeModelStub('server-error') },
      appSource: appCodeWithAssistant,
    });
    try {
      const ready = await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
      if (!ready) fail('assistant fallback — the chat console never rendered');
      await sendChatMessage(dom, waitFor, 'قیمت ژله توت فرنگی چنده؟');
      const answered = await waitFor(() => text().includes('۲۰۰٬۰۰۰ تومان'), 8000);
      if (answered) ok('assistant fallback — a server error still gets a grounded local answer');
      else fail('assistant fallback — no local answer after the server error: ' + text().slice(-200));
      // Phase 8 — a broken model is our problem, not the customer's: the
      // answer arrives from the real shop data and nothing is said about it.
      if (/تلاش دوباره|ارتباط با دستیار هوشمند/.test(text())) {
        fail('assistant fallback — a connection failure is still shown to the customer');
      } else {
        ok('assistant fallback — the failure is handled silently (no banner, no retry noise)');
      }
      expectNoInternalWording('assistant fallback', dom);

      // پیام دوم: پس از دو خطای پشت‌سرهم، دیگر منتظر Endpoint خراب نمی‌مانیم
      await sendChatMessage(dom, waitFor, 'چه طعم‌هایی دارید؟');
      // هر سه واریانتِ پاسخ طعم‌ها، فهرست واقعی را با این بولت‌ها می‌آورند
      const second = await waitFor(() => text().includes('• ژله ('), 8000);
      if (second) ok('assistant fallback — the second message answers locally right away');
      else fail('assistant fallback — the second message did not get a local answer');
      expectNoErrors('assistant fallback', errors);
    } finally {
      dom.window.close();
    }
  }

  // (ب) سهمیهٔ پرسش (۴۲۹) → پیام شفاف
  {
    const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/assistant', {
      stub: { fetchImpl: makeModelStub('rate-limited') },
      appSource: appCodeWithAssistant,
    });
    try {
      const ready = await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
      if (!ready) fail('assistant rate limit — the chat console never rendered');
      await sendChatMessage(dom, waitFor, 'سلام، راهنمایی می‌کنید؟');
      const answered = await waitFor(
        () => dom.window.document.querySelectorAll('.zhino-assistant-row').length >= 3 &&
          !dom.window.document.querySelector('.zhino-assistant-typing'),
        8000,
      );
      if (!answered) {
        fail('assistant rate limit — the customer never got an answer: ' + text().slice(-200));
      } else if (text().includes('تعداد پرسش‌ها زیاد شد')) {
        fail('assistant rate limit — the quota error is printed to the customer');
      } else {
        ok('assistant rate limit — a 429 still ends in a normal answer, without any technical noise');
      }
      expectNoErrors('assistant rate limit', errors);
    } finally {
      dom.window.close();
    }
  }

  // (ج) مدل بدون داده → هشدار صادقانه، بدون ادعای اشتباه
  {
    const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/assistant', {
      stub: { fetchImpl: makeModelStub('no-knowledge') },
      appSource: appCodeWithAssistant,
    });
    try {
      const ready = await waitFor(() => Boolean(dom.window.document.querySelector('#zhino-assistant-input')));
      if (!ready) fail('assistant knowledge — the chat console never rendered');
      await sendChatMessage(dom, waitFor, 'یک دسر پیشنهاد بده');
      const answered = await waitFor(() => text().includes('پاسخ مدل بدون داده.'), 8000);
      if (answered) ok('assistant knowledge — a model answer is rendered');
      else fail('assistant knowledge — model answer missing: ' + text().slice(-200));
      const warned = await waitFor(() => text().includes('از فهرست فروشگاه نبود'), 4000);
      if (warned) ok('assistant knowledge — a model answer without store data is still flagged, in plain words');
      else fail('assistant knowledge — grounding warning missing: ' + text().slice(-200));
      if (/دیتابیس|کاتالوگ|مدل/.test(dom.window.document.querySelector('.zhino-assistant-note')?.textContent ?? '')) {
        fail('assistant knowledge — the honesty note leaks internal wording to the customer');
      } else {
        ok('assistant knowledge — the honesty note stays free of internal wording');
      }
      expectNoErrors('assistant knowledge', errors);
    } finally {
      dom.window.close();
    }
  }
}

// ── 39. Edge Function: real database grounding, secrets stay server-side ──
// The Deno function is loaded with a shimmed `Deno` global and a mocked
// network: PostgREST reads answer with database rows, the model call is
// captured. This proves (a) the model receives the DATABASE catalog,
// (b) only the public anon key is used for reads, (c) no key ever
// leaves the server, and (d) every failure mode degrades honestly.
async function loadAssistantEdgeFunction(env, marker) {
  const code = buildSync({
    entryPoints: ['supabase/functions/zhino-assistant/index.ts'],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2020',
    write: false,
    logLevel: 'silent',
  }).outputFiles[0].text;

  let handler = null;
  const previousDeno = globalThis.Deno;
  globalThis.Deno = {
    env: { get: (key) => (key in env ? env[key] : undefined) },
    serve: (fn) => {
      handler = fn;
    },
  };
  try {
    await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${marker}`);
  } finally {
    globalThis.Deno = previousDeno;
  }
  if (!handler) throw new Error('the Edge Function did not register a handler');
  return handler;
}

{
  // Assembled at runtime so this test fixture never looks like a committed key.
  const AI_KEY_VALUE = ['smoke', 'model', 'key', 'placeholder'].join('-');
  const ANON_KEY = 'sb_publishable_smoke_test_key';
  const EDGE_ENDPOINT = 'https://smoke-test.supabase.co/functions/v1/zhino-assistant';

  const edgeEnv = {
    ['AI' + '_API_KEY']: AI_KEY_VALUE,
    ['AI' + '_MODEL']: 'smoke-model',
    ['AI' + '_API_URL']: 'https://ai.smoke.test/v1/chat/completions',
    ALLOWED_ORIGINS: '*',
    SUPABASE_URL: 'https://smoke-test.supabase.co',
    SUPABASE_ANON_KEY: ANON_KEY,
  };

  let failModel = false;
  let failDb = false;
  const restCalls = [];
  const modelCallBodies = [];

  const edgeFetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const headers = init.headers
      ? Object.fromEntries(new globalThis.Headers(init.headers).entries())
      : {};

    if (url.includes('/rest/v1/')) {
      restCalls.push({ url, headers });
      if (failDb) return new globalThis.Response('boom', { status: 500 });
      const table = url.split('/rest/v1/')[1].split('?')[0];
      const data = ASSISTANT_DB_ROWS[table] ?? [];
      const wantsSingle = String(headers.accept ?? '').includes('vnd.pgrst.object');
      return new globalThis.Response(JSON.stringify(wantsSingle ? (data[0] ?? null) : data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.startsWith('https://ai.smoke.test/')) {
      if (failModel) return new globalThis.Response('upstream boom', { status: 500 });
      modelCallBodies.push(JSON.parse(String(init.body ?? '{}')));
      return new globalThis.Response(
        JSON.stringify({ choices: [{ message: { content: 'پاسخ آزمایشی مدل ژینو' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new globalThis.Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const realFetch = globalThis.fetch;
  globalThis.fetch = edgeFetch;
  try {
    const handler = await loadAssistantEdgeFunction(edgeEnv, 'main');
    const post = (body, ip = '198.51.100.7') =>
      handler(
        new Request(EDGE_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ANON_KEY}`,
            'x-forwarded-for': ip,
          },
          body: JSON.stringify(body),
        }),
      );

    // (الف) پاسخ موفق: دانش از دیتابیس، نه از متن کاتالوگ فرانت‌اند
    const okRes = await post({
      message: 'قیمت ژله انار چنده؟',
      catalog: 'کاتالوگ-قدیمی-کلاینت-که-نباید-استفاده-شود',
      history: [],
      locale: 'fa-IR',
    });
    const okBody = await okRes.json();
    if (okRes.status === 200 && okBody.reply === 'پاسخ آزمایشی مدل ژینو') {
      ok('edge function — answers through the model proxy');
    } else {
      fail(`edge function — unexpected success response: ${okRes.status} ${JSON.stringify(okBody).slice(0, 160)}`);
    }
    if (okBody.knowledge === 'database') {
      ok('edge function — knowledge source reported as «database»');
    } else {
      fail(`edge function — knowledge source was «${okBody.knowledge}» instead of database`);
    }

    const modelPrompt = modelCallBodies.length > 0 ? JSON.stringify(modelCallBodies[0]) : '';
    const promptChecks = [
      ['database price', '۱۸۷٬۰۰۰'],
      ['database stock', '۳ عدد'],
      ['database product', 'پودر ژله انار ژینو (دیتابیس)'],
      ['database recipe', 'نسخه دیتابیس'],
      ['database shipping threshold', '۵۵۰٬۰۰۰'],
    ];
    for (const [label, needle] of promptChecks) {
      if (modelPrompt.includes(needle)) ok(`edge function — the model prompt carries the ${label}`);
      else fail(`edge function — the model prompt is missing the ${label}`);
    }
    if (!modelPrompt.includes('کاتالوگ-قدیمی-کلاینت')) {
      ok('edge function — the database catalog wins over the client-supplied catalog');
    } else {
      fail('edge function — the client catalog was used even though the database answered');
    }
    if (!JSON.stringify(okBody).includes(AI_KEY_VALUE)) {
      ok('edge function — the response never contains the model key');
    } else {
      fail('edge function — the response leaked the model key');
    }

    const readTables = Array.from(new Set(restCalls.map((call) => call.url.split('/rest/v1/')[1].split('?')[0])));
    const allowedTables = ['products', 'product_variants', 'inventory', 'recipes', 'site_settings', 'site_content'];
    const unexpected = readTables.filter((table) => !allowedTables.includes(table));
    if (unexpected.length === 0) ok(`edge function — reads only public catalog tables (${readTables.join(', ')})`);
    else fail(`edge function — unexpected table reads: ${unexpected.join(', ')}`);

    const usedKeys = Array.from(new Set(restCalls.map((call) => call.headers.authorization ?? '')));
    if (usedKeys.length === 1 && usedKeys[0] === `Bearer ${ANON_KEY}`) {
      ok('edge function — store reads use the public anon key only (RLS applies)');
    } else {
      fail(`edge function — unexpected authorization for store reads: ${usedKeys.join(' | ')}`);
    }

    // (الف-۲) لحن پاسخ‌ها (فاز ۱۱): فقط مقدار دقیق 'formal' قانون رسمی را می‌افزاید
    const friendlyPrompt = modelCallBodies[0]?.messages?.[0]?.content ?? '';
    {
      const rowsBackup = ASSISTANT_DB_ROWS.site_content;
      // ۱) مقدار رسمی → قانون ۱۲ به پرامپت افزوده می‌شود
      ASSISTANT_DB_ROWS.site_content = [{ key: 'assistant_tone', value: 'formal' }];
      await post({ message: 'سلام', history: [], locale: 'fa-IR' });
      const formalPrompt = modelCallBodies.at(-1)?.messages?.[0]?.content ?? '';
      if (formalPrompt.includes('لحن این گفتگو رسمی')) {
        ok('edge function — the formal tone switch appends the formal rule to the prompt');
      } else {
        fail('edge function — formal tone was not reflected in the model prompt');
      }
      // ۲) مقدار نامعتبر → دقیقاً همان پرامپت دوستانهٔ اولیه
      ASSISTANT_DB_ROWS.site_content = [{ key: 'assistant_tone', value: 'FORMAL ' }];
      await post({ message: 'سلام دوباره', history: [], locale: 'fa-IR' });
      const garbagePrompt = modelCallBodies.at(-1)?.messages?.[0]?.content ?? '';
      if (garbagePrompt === friendlyPrompt && !garbagePrompt.includes('لحن این گفتگو رسمی')) {
        ok('edge function — an invalid tone value falls back to the byte-identical friendly prompt');
      } else {
        fail('edge function — an invalid tone changed the system prompt (allowlist failed)');
      }
      // ۳) نبود ردیف → باز هم همان پرامپت دوستانه
      ASSISTANT_DB_ROWS.site_content = [];
      await post({ message: 'بازم سلام', history: [], locale: 'fa-IR' });
      const defaultPrompt = modelCallBodies.at(-1)?.messages?.[0]?.content ?? '';
      if (defaultPrompt === friendlyPrompt) {
        ok('edge function — without a tone row the friendly prompt stays untouched');
      } else {
        fail('edge function — missing tone row changed the system prompt');
      }
      ASSISTANT_DB_ROWS.site_content = rowsBackup;
    }

    // (ب) بررسی سلامت
    const healthRes = await handler(new Request(EDGE_ENDPOINT, { method: 'GET' }));
    const health = await healthRes.json();
    if (health.configured === true && health.database === true && health.model === 'smoke-model') {
      ok('edge function — the health check reports model + database readiness');
    } else {
      fail(`edge function — unexpected health response: ${JSON.stringify(health)}`);
    }
    if (!JSON.stringify(health).includes(AI_KEY_VALUE)) {
      ok('edge function — the health response carries no key');
    } else {
      fail('edge function — the health response leaked the model key');
    }

    // (ج) دیتابیس در دسترس نیست → کاتالوگ کلاینت، با گزارش صادقانه
    failDb = true;
    const clientOnly = await (await post({ message: 'محصولات چیه؟', catalog: 'کاتالوگ-کلاینت' })).json();
    if (clientOnly.knowledge === 'client' && JSON.stringify(modelCallBodies.at(-1)).includes('کاتالوگ-کلاینت')) {
      ok('edge function — falls back to the client catalog when the database is unreachable');
    } else {
      fail(`edge function — database fallback failed: ${JSON.stringify(clientOnly).slice(0, 160)}`);
    }
    const noData = await (await post({ message: 'محصولات چیه؟' })).json();
    if (noData.knowledge === 'none') ok('edge function — reports «none» when no store data is available at all');
    else fail(`edge function — expected knowledge none, got ${noData.knowledge}`);
    failDb = false;

    // (د) خطای مدل → ۵۰۲ (فرانت‌اند به موتور محلی برمی‌گردد)
    failModel = true;
    const failed = await post({ message: 'سلام', catalog: '' });
    const failedBody = await failed.json();
    if (failed.status === 502 && failedBody.error === 'upstream_error') {
      ok('edge function — a model failure returns 502 upstream_error');
    } else {
      fail(`edge function — unexpected model-failure response: ${failed.status}`);
    }
    failModel = false;

    // (ه) محدودیت نرخ
    let lastStatus = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await post({ message: `پرسش شماره ${i}` }, '203.0.113.9');
      lastStatus = res.status;
    }
    if (lastStatus === 429) ok('edge function — the rate limit rejects the 21st request from one IP');
    else fail(`edge function — rate limit did not trigger (last status: ${lastStatus})`);

    // (و) بدون Secret → ۵۰۱ و هیچ تماسی با مدل
    const unconfiguredEnv = { ...edgeEnv, ['AI' + '_API_KEY']: '' };
    const unconfigured = await loadAssistantEdgeFunction(unconfiguredEnv, 'unconfigured');
    const callsBefore = modelCallBodies.length;
    const notConfigured = await unconfigured(
      new Request(EDGE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'سلام' }),
      }),
    );
    const notConfiguredBody = await notConfigured.json();
    if (notConfigured.status === 501 && notConfiguredBody.error === 'not_configured') {
      ok('edge function — without secrets it answers 501 not_configured');
    } else {
      fail(`edge function — unexpected unconfigured response: ${notConfigured.status}`);
    }
    if (modelCallBodies.length === callsBefore) {
      ok('edge function — no model call is attempted without a key');
    } else {
      fail('edge function — a model call was attempted without a key');
    }

    // (ز) فهرست دامنه‌های مجاز (CORS) واقعاً اعمال می‌شود
    const restricted = await loadAssistantEdgeFunction(
      { ...edgeEnv, ALLOWED_ORIGINS: 'https://zheno.devs.surf' },
      'restricted-origin',
    );
    const blocked = await restricted(
      new Request(EDGE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
        body: JSON.stringify({ message: 'سلام' }),
      }),
    );
    const blockedBody = await blocked.json();
    if (blocked.status === 403 && blockedBody.error === 'origin_not_allowed') {
      ok('edge function — a foreign origin is refused (403)');
    } else {
      fail(`edge function — a foreign origin was not refused (status ${blocked.status})`);
    }
    const allowed = await restricted(
      new Request(EDGE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://zheno.devs.surf' },
        body: JSON.stringify({ message: 'سلام' }),
      }),
    );
    const allowHeader = allowed.headers.get('access-control-allow-origin') ?? '';
    if (allowed.status === 200 && allowHeader === 'https://zheno.devs.surf') {
      ok('edge function — the configured origin is allowed and echoed back');
    } else {
      fail(`edge function — allowed origin failed (status ${allowed.status}, header ${allowHeader})`);
    }

    // (ح) بدنهٔ بزرگ رد می‌شود
    const huge = await handler(
      new Request(EDGE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'content-length': '90000' },
        body: JSON.stringify({ message: 'x'.repeat(50) }),
      }),
    );
    if (huge.status === 413) ok('edge function — an oversized request is rejected (413)');
    else fail(`edge function — oversized request was not rejected (status ${huge.status})`);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ── 40. Storefront + admin routes are untouched by the assistant ──
// One router, one history: opening /assistant and coming back must not
// change any other route's behaviour.
{
  const { dom, text, waitFor, errors } = await renderWithStub('/zheno-website/assistant', {
    stub: { fetchImpl: OFFLINE_FETCH },
    appSource: appCode,
    seed: (window) =>
      window.localStorage.setItem(
        'zhino_cart',
        JSON.stringify([{ productId: 'jelly-peach', variantId: 'jelly-peach-250', quantity: 2 }]),
      ),
  });
  try {
    const ready = await waitFor(() => text().includes(ASSISTANT_WELCOME_HEADING));
    if (!ready) fail('assistant routes — /assistant never rendered');

    // «بازگشت به سایت» → home, then the existing routes still work
    clickButtonByContains(dom, 'بازگشت به سایت');
    await waitFor(() => text().includes('واردکننده و پخش‌کننده پودر ژله و کاستر'));

    const header = dom.window.document.querySelector('header');
    if (header) {
      const productsLink = Array.from(header.querySelectorAll('a')).find((a) =>
        (a.getAttribute('href') ?? '').endsWith('/products'),
      );
      if (productsLink) {
        productsLink.click();
        const onProducts = await waitFor(() => text().includes('محصولات ژینو'));
        if (onProducts) ok('assistant routes — the storefront nav still reaches /products');
        else fail('assistant routes — /products did not render after the assistant');
      } else {
        fail('assistant routes — the header no longer exposes /products');
      }
    } else {
      fail('assistant routes — the storefront header is missing');
    }

    // the cart keeps its persisted items (assistant must not touch cart state)
    const cartLink = Array.from(dom.window.document.querySelectorAll('a')).find((a) =>
      (a.getAttribute('href') ?? '').endsWith('/cart'),
    );
    if (cartLink) {
      cartLink.click();
      // «جمع کل» is the cart page's own heading — the header also says «سبد خرید»
      const onCart = await waitFor(() => text().includes('جمع کل'), 8000);
      if (onCart) ok('assistant routes — the cart route still renders');
      else fail('assistant routes — the cart did not render: ' + text().slice(0, 160));
      expectContains('assistant routes cart', text(), '۴۰۰٬۰۰۰ تومان');
      expectContains('assistant routes cart', text(), 'ژله هلو');
    } else {
      fail('assistant routes — no cart link in the header');
    }
    expectNoErrors('assistant routes', errors);
  } finally {
    dom.window.close();
  }
}

{
  // admin panel is a separate shell and stays exactly as it was
  const { text, errors } = await render('/zheno-website/admin/login', { appSource: appCode });
  expectContains('assistant routes admin', text, 'ورود به پنل مدیریت');
  expectNoErrors('assistant routes admin', errors);
}

// ── 41. The built storefront ships no secret ───────────────────
// Strongest possible proof for «no API key in the frontend»: scan the
// real production bundle. CI builds before it smokes, so this always
// runs there; a local run without a build says so explicitly.
{
  const bundlePath = join(root, 'dist', 'index.html');
  if (!existsSync(bundlePath)) {
    ok('production bundle — not built yet, secret scan skipped (CI builds before smoke)');
  } else {
    const bundle = readFileSync(bundlePath, 'utf8');
    const leaks = [
      [/\bsk-[A-Za-z0-9_\-]{20,}/g, 'an OpenAI-style key'],
      [/\bAIza[0-9A-Za-z_\-]{30,}/g, 'a Google API key'],
      [/\bsb_secret_[A-Za-z0-9_\-]{20,}/g, 'a Supabase secret key'],
      [/\bsbp_[A-Za-z0-9]{30,}/g, 'a Supabase access token'],
      [/\bAI_API_KEY\s*[:=]\s*['"][^'"]+['"]/g, 'a baked-in AI_API_KEY value'],
    ];
    let found = 0;
    for (const [pattern, label] of leaks) {
      const hits = bundle.match(pattern);
      if (hits) {
        fail(`production bundle leaks ${label}: ${hits.slice(0, 2).join(', ')}`);
        found += 1;
      }
    }
    // JWTs must never carry the service_role claim in a client bundle
    const jwts = bundle.match(/eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g) ?? [];
    for (const jwt of jwts.slice(0, 20)) {
      try {
        const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'));
        if (payload.role === 'service_role') {
          fail('production bundle contains a service_role JWT');
          found += 1;
        }
      } catch {
        // not decodable → not a usable token
      }
    }
    if (found === 0) {
      ok(`production bundle carries no API key or secret (${bundle.length} characters scanned)`);
    }
    // …and the Phase 8 copy really is in the shipped artifact
    for (const needle of ['catalogSource', SIGNATURE_TEXT]) {
      if (bundle.includes(needle)) ok(`production bundle contains «${needle}»`);
      else fail(`production bundle is missing «${needle}»`);
    }
    // the internal sentences must be gone from the shipped bundle entirely —
    // not merely hidden — so no customer can ever dig them out of the artifact
    for (const gone of [
      'بدون مدل هوشمند',
      'متصل به دستیار هوشمند',
      'ارتباط با دستیار هوشمند برقرار نشد',
      'تعداد پرسش‌ها زیاد شد',
      'دستیار هوشمند روی سرور فعال نشده است',
    ]) {
      if (bundle.includes(gone)) fail(`production bundle still ships internal wording: «${gone}»`);
      else ok(`production bundle no longer ships «${gone}»`);
    }
  }
}

renderStatusSummary();

function renderStatusSummary() {
  console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} check(s) failed.`);
}
process.exit(failures === 0 ? 0 : 1);
