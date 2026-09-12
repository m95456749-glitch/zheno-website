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
      'import.meta.env.BASE_URL': '"/"',
      'import.meta.env.MODE': '"production"',
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env.VITE_API_BASE_URL': '""',
      'import.meta.env.VITE_ENABLE_CHECKOUT': '"true"',
      'import.meta.env.VITE_ENABLE_ACCOUNT': '"false"',
      'import.meta.env.VITE_ADMIN_AUTH_MODE': '"demo"',
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
async function render(path, { seed, clickAddToCart = false, settleMs = 0 } = {}) {
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
  expectContains('home', text, 'طعم‌های جذاب');
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
  expectContains('root home', text, 'طعم‌های جذاب');
  expectContains('root home', text, 'در یک مجموعه');
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

console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
