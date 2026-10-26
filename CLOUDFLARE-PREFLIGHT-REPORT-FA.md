# گزارش پیش‌پرواز: آماده‌سازی آزمایش نهایی Cloudflare Workers

**تاریخ بررسی:** ۲۰۲۶-۱۰-۲۶ · **شاخهٔ کاری:** `arena/81ab77fc-zheno-website` (از `main` در `b69a8b8`) · **محیط بررسی:** Node 22.22.3، wrangler 4.152.0، Vite 7.3.7

---

## خلاصهٔ اجرایی

| پرسش | پاسخ |
|---|---|
| وضعیت `main` و آخرین commit | `b69a8b8` = commit ادغام PR #98؛ `main` و `origin/main` هم‌تراز؛ هیچ commit بعد از merge نیست. |
| آیا Worker تولیدی کلادفلر از همین commit ساخته شده؟ | **بله.** check run «Workers Builds: zheno» روی `b69a8b8` موفق است (Build `10e095d9…`، Version `62394c1e…`). |
| آیا نسخهٔ آزمایشی به Supabase واقعی متصل است؟ | **از این محیط اثبات‌پذیر نبود** (دلیل و روش اثبات در بخش ۲.۲ و ۲.۳). |
| تنظیمات احراز هویت/محصول/موجودی/سفارش در کد درست است؟ | بله؛ مسیرها، گاردها و RLS سازگارند و همهٔ تست‌های آفلاین سبز شدند (بخش ۳ و ۵). |
| آزمون نوشتن انجام شد؟ | **خیر.** هیچ داده‌ای نوشته/تغییر داده نشد؛ روش امن در بخش ۷ پیشنهاد شده است. |
| آیا برای «آزمایش نهایی» آماده است؟ | **برای آزمایش خواندنی: بله.** برای اثبات نوشتن و انتشار نهایی: **هنوز نه** — سه شرط در بخش ۸. |

یک یافتهٔ جدید و مهم: **همین مخزن به دو مقصد کلادفلر وصل است** (Worker `zheno` و پروژهٔ Pages `zheno-website`). این وضعیت هم ابهام میزبان تولید ایجاد می‌کند و هم یک شکاف ایزوله‌سازی در Previewها داشت که در همین شاخه بسته شد (بخش ۴).

---

## ۱. وضعیت واقعی `main`

```
$ git rev-parse HEAD main origin/main
b69a8b8aaee541a79c755571e6801c3205b0623f   (هر سه یکسان)
$ git rev-list --left-right --count main...origin/main
0	0
```

- `b69a8b8` دقیقاً `mergeCommit` گزارش PR #98 است که در `2026-10-26T16:30:02Z` merge شد.
- بعد از merge، دو انتشار خودکار رخ داده است (کار من نبود؛ نتیجهٔ merge):

| انتشار | نتیجه | شاهد |
|---|---|---|
| GitHub Pages → `zheno.devs.surf` | موفق | run `40359720902` («Deploy to GitHub Pages»، push روی main) |
| Cloudflare Worker `zheno` (production) | موفق | check run «Workers Builds: zheno» روی `b69a8b8` |
| Cloudflare Pages `zheno-website` | موفق | check run «Cloudflare Pages»، Preview URL `7528c400.zheno-website.pages.dev` |

- دامنهٔ اصلی هنوز روی GitHub Pages است: API مخزن مقدار `url: https://zheno.devs.surf/`، `cname: zheno.devs.surf`، `status: built`، گواهی TLS `approved` تا ۲۰۲۶-۱۲-۱۰.
- متغیر `DISABLE_GITHUB_PAGES` تنظیم نشده است (ورک‌فلو برای هر push روی main منتشر می‌کند) — این همان رفتار طراحی‌شده برای rollback است، اما یعنی هر merge به‌طور خودکار روی دامنهٔ اصلی منتشر می‌شود.

---

## ۲. پیکربندی Worker و متغیرهای محیطی

### ۲.۱ آنچه در مخزن است (قابل بازبینی)

`wrangler.jsonc`:

- `assets.directory: ./dist`، `assets.not_found_handling: single-page-application` — Worker صرفاً Assets، **بدون entrypoint و بدون binding**.
- `workers_dev: true`؛ **هیچ `routes` یا Custom Domain تعریف نشده** → DNS دست‌نخورده.
- `previews: {}` برای Preview رسمی شاخه‌ها؛ `compatibility_date: 2026-10-25`.
- تأیید عملی: `npm run deploy:check` → «Read 125 files from the assets directory», «No bindings found», بدون انتشار.

نکتهٔ کلیدی معماری: **همهٔ متغیرهای `.env.example` از نوع `VITE_*` هستند، یعنی زمانِ build.** هیچ‌کدام متغیر runtime نیستند و Worker هیچ کد اجرایی ندارد که آن‌ها را در زمان درخواست بخواند. پس:

- «اتصال به Supabase» فقط به **Build variables داشبورد Cloudflare** بستگی دارد، نه به `wrangler.jsonc`.
- تغییر آن متغیرها بدون **build مجدد** هیچ اثری ندارد.
- هر `VITE_*` در بستهٔ عمومی مرورگر inline می‌شود؛ guard موجود در `vite.config.ts` کلیدهای `sb_secret_…` و JWT با `role: service_role` را پیش از bundling رد می‌کند (تأییدشده با `verify:images:bundle`).

### ۲.۲ حالت‌های اجرا (از کد، تأییدشده)

| حالت | شرط | نتیجه در فروشگاه/پنل |
|---|---|---|
| `remote` | `VITE_SUPABASE_URL` + کلید publishable/anon معتبر و https | خواندن/نوشتن واقعی؛ RLS تعیین‌کننده؛ نشان وضعیت دیتابیس در پنل |
| `local` | متغیرها خالی یا دیتابیس در دسترس نیست | کاتالوگ ثابت + overlay در `localStorage`؛ پنل «نمایشی» |
| `demo` | `VITE_ADMIN_AUTH_MODE=demo` یا Supabase پیکربندی‌نشده | ورود بدون اعتبارسنجی، فقط Preview (برچسب «نمایشی» در هدر پنل) |

مسیرهای کد: `src/services/supabaseClient.ts` (تشخیص/رد کلید)، `src/services/catalogSync.ts` و `orderSync.ts` (منبع `remote`/`local`)، `src/admin/auth/authService.ts` (انتخاب provider).

### ۲.۳ آیا این نسخه به Supabase واقعی وصل است؟ — **اثبات نشد، و از این محیط اثبات‌پذیر نیست**

شواهد و دلیل:

1. `GET /repos/.../actions/variables` و `/actions/secrets` → **HTTP 403** («Resource not accessible by integration»). مقدار متغیرهای GitHub از این محیط خوانده نمی‌شود.
2. دانلود artifact انتشار Pages (`github-pages.zip`) و لاگ workflow → **redirect به `*.blob.core.windows.net` و `results-receiver.actions.githubusercontent.com`** که از این محیط بسته‌اند (`exit 35` / `EOF`). بنابراین حتی نمی‌توان بستهٔ منتشرشدهٔ فعلی را برای وجود URL پروژه بررسی کرد.
3. دسترسی خروجی به `*.workers.dev`، `*.pages.dev` و `*.supabase.co` بسته است (`curl` → `000`). هیچ درخواست زنده‌ای به استقرار کلادفلر ممکن نشد.
4. تنظیمات Build variables داشبورد Cloudflare هیچ معادل API-قابل‌خواندن در مخزن ندارد.

پس نمی‌توان گفت Worker تولیدی «متصل» یا «آفلاین» است؛ تنها چیزی که تأیید شد، **موفقیت build و انتشار** آن است.

### ۲.۴ روش قطعی اثبات اتصال، بدون نوشتن (اجرا نشده، آمادهٔ استفاده)

سه سطح مستقل که همدیگر را تأیید می‌کنند:

1. **اسکریپت فقط‌خواندنی (امروز اضافه شد):**
   ```sh
   npm ci
   npm run build
   npm run verify:live -- https://zheno.<ACCOUNT-SUBDOMAIN>.workers.dev
   ```
   خروجی می‌گوید بستهٔ منتشرشده به پروژهٔ Supabase وصل است یا در حالت آفلاین/نمایشی؛ همچنین سرو شدن SPA، bytes/MIME تصویر و فونت و نبود کلید privileged را می‌سنجد. **هیچ کلیدی چاپ نمی‌شود** (فقط بولین و شناسهٔ پروژهٔ ماسک‌شده) و **هیچ نوشتنی** (login/save/order/upload/RPC) انجام نمی‌دهد. علاوه بر آن یک preflight `OPTIONS` به دو Edge Function می‌زند تا معلوم شود `ALLOWED_ORIGINS` این origin را می‌پذیرد یا نه — بدون هیچ اثر جانبی.
2. **داشبورد Cloudflare:** Worker `zheno` → Settings → Builds → فهرست Build variables و secrets (فقط **نام‌ها** را ببینید؛ `VITE_SUPABASE_URL` و `VITE_SUPABASE_PUBLISHABLE_KEY` باید موجود باشند و هیچ `VITE_*` دیگری نباید کلید محرمانه داشته باشد).
3. **پنل مدیریت روی همان URL:** ورود با حساب مدیر Supabase؛ اگر برچسب «نمایشی» دیده شود یعنی build آفلاین است. در حالت متصل، `SyncStatusBadge` و آدرس پروژه در پنل نمایش داده می‌شود و Network باید درخواست‌های `https://<project>.supabase.co/rest/v1/...` را نشان دهد.

---

## ۳. احراز هویت، محصولات، موجودی، سفارش‌ها — بررسی تنظیمات

| قابلیت | مسیر | مکانیزم و نتیجهٔ بررسی |
|---|---|---|
| ورود مدیر | `src/admin/auth/supabaseAuth.ts` | `signInWithPassword` + سه لایهٔ بررسی: `is_admin()` دیتابیس، `app_metadata.role === 'admin'` در رکورد زنده، و refresh توکن قدیمی. در هر شکست `signOut` و fail-closed. |
| انتخاب حالت | `authService.ts` | `supabase` (پیش‌فرض وقتی Supabase تنظیم شده) / `api` / `demo`؛ نبودِ لازمه‌ها → `demo` + هشدار کنسول؛ بدون رمز هاردکد و بدون ذخیرهٔ اعتبار. |
| خواندن محصول | `supabaseCatalog.fetchRemoteCatalog` | PostgREST روی `products`/`product_variants`/`inventory`؛ anon فقط ردیف‌های `active`، مدیر همه (policy `products_public_read`). |
| نوشتن محصول | `pushProductRow` / `pushVariantRow` / `pushProductActive` | policy `products_admin_write` / `variants_admin_write` = `is_admin()`؛ حذف = `active=false` (بدون DELETE). |
| موجودی | `set_inventory_stock` و `adjust_inventory` | RPC `security definer` با بررسی داخلی `is_admin`؛ policy `inventory_admin_write`؛ `integer` و بازهٔ دیتابیس در فرم اعتبارسنجی می‌شود. |
| سفارش (ثبت مهمان) | `create_order` | RPC با `grant execute … to anon`؛ قیمت/کرایه/جمع در دیتابیس محاسبه و موجودی در همان تراکنش کم می‌شود. **این مسیر دادهٔ واقعی می‌نویسد.** |
| سفارش (پنل) | `orders_admin_read` / `orders_admin_update` | فقط `is_admin()`؛ تغییر وضعیت با تأیید دیتابیس و rollback بصری در شکست. |
| تصاویر محصول | RPCهای `manage_product_image` و … | وابسته به migration v3 + bucket و policyهای Storage. وضعیت دیتابیس میزبان **تأیید نشده**؛ برای همین workflow فقط‌خواندنی `supabase-product-images-readonly` وجود دارد. |
| توابع لبه (دستیار/صدا) | `supabase/functions/*` | `ALLOWED_ORIGINS` پیش‌فرض `*`؛ اگر محدود شده باشد و origin آزمایشی در آن نباشد، دستیار/صدای ابری روی `workers.dev` با CORS رد می‌شوند (بدون شکستن بقیهٔ سایت). |

نتیجه: تنظیمات کد برای محیط Cloudflare تغییری لازم ندارد (چون فقط استاتیک است). وابستگی‌های واقعی، همه **بیرون از مخزن** هستند: Build variables کلادفلر، وضعیت Auth/RLS و migrationهای دیتابیس میزبان، و `ALLOWED_ORIGINS`.

---

## ۴. یافتهٔ جدید: دو مقصد انتشار کلادفلر + شکاف ایزوله‌سازی Preview

### ۴.۱ دو مقصد

`gh api .../commits/b69a8b8/check-runs` دو نتیجهٔ مستقل نشان می‌دهد:

```
Cloudflare Pages       | success | cloudflare-workers-and-pages
Workers Builds: zheno  | success | cloudflare-workers-and-pages
```

و همین دو روی commitهای PR (مثلاً `c654f1d`) هم اجرا می‌شوند. یعنی علاوه بر Worker هدف، یک پروژهٔ Pages با نام `zheno-website` هم به مخزن وصل است و برای هر شاخه Preview می‌سازد. مستند `CLOUDFLARE-WORKERS-FA.md` می‌گوید «پروژهٔ Pages جدید نسازید»؛ اما یکی از قبل وجود دارد و حذف/جدا نشده است.

پیامدها: ابهام اینکه «نسخهٔ آزمایشی» کدام میزبان است، یک نسخهٔ عمومی اضافی روی `pages.dev`، و احتمال دور شدن تنظیمات دو سیستم از هم.

### ۴.۲ شکاف ایزوله‌سازی (اصلاح شد)

guard در `vite.config.ts` فقط `WORKERS_CI` را می‌شناخت. Pages نام شاخه را در `CF_PAGES_BRANCH` می‌گذارد، پس Previewهای Pages ایزوله نمی‌شدند. شاهد عملی (build محلی با متغیرهای ساختگی، بدون هیچ کلید واقعی):

```
# قبل از اصلاح
CF_PAGES=1 CF_PAGES_BRANCH=arena/... VITE_SUPABASE_URL=https://sentinel-pages.supabase.co … npm run build
→ grep sentinel-pages.supabase.co dist/index.html  ⇒  1   (نشت کرد)
```

یعنی اگر پروژهٔ Pages متغیرهای `VITE_*` تولید را داشته باشد، هر Preview شاخه‌ای یک نسخهٔ **متصل به دیتابیس واقعی** روی `*.pages.dev` منتشر می‌کند و ورود مدیر در آن هم به Supabase واقعی می‌رود.

اصلاح در همین شاخه: تشخیص خودکار سیستم build (Workers یا Pages) و ایزوله‌سازی هر شاخهٔ غیر از `main` در هر دو سیستم؛ `main` دست‌نخورده می‌ماند. تست `test:preview:isolation` به چهار سناریو گسترش یافت (شاخهٔ Workers، شاخهٔ Pages، `main` در هر دو) و سبز است:

```
PASS: branch previews (Workers Builds and Pages) exclude inherited backend endpoints and public key
PASS: the production branch keeps its configured backend endpoints in both systems
```

این اصلاح تا **merge نشود** روی buildهای کلادفلر اثر ندارد.

---

## ۵. تست‌های اجراشده (همه در همین محیط، بدون شبکه به Supabase/Cloudflare)

| تست | نتیجه |
|---|---|
| `npm ci` | موفق — ۱۹۸ بسته، `npm audit` = **۰ آسیب‌پذیری** |
| `npm run typecheck` | موفق |
| `npm run verify:supabase` | همهٔ بررسی‌ها موفق (شامل اسکن سکرت در مخزن) |
| `npm run verify:admin` | همهٔ قراردادهای پنل موفق (نوشتن با تأیید دیتابیس، retry با شناسهٔ ثابت، dirty guard فرم‌ها) |
| `npm run test:catalog-validation` | ۹/۹ موفق |
| `npm run verify:data` | موفق (فایل تصاویر، تطابق کاتالوگ) |
| `npm run build` | موفق — `dist/index.html` ≈ ۱٫۰۴۵ MB (gzip ≈ ۲۷۵ KB) + ۱۰۹ فایل تصویر/فونت، مجموعاً ۹٫۸ MB |
| `npm run deploy:check` | موفق — ۱۲۵ asset، بدون binding، بدون انتشار |
| `npm run dev:worker` + `npm run test:worker` | موفق — ۱۴ مسیر SPA + ۱۰۹ فایل با hash و MIME درست |
| `npm run verify:live -- http://127.0.0.1:8787` (اسکریپت جدید) | هر دو شاخهٔ منطقی آزمایش شد: build آفلاین → «OFFLINE/DEMO»؛ build با URL ساختگی → «CONNECTED» با شناسهٔ ماسک‌شده و هشدار preflight (شبکه بسته) |
| `npm run smoke` | همه موفق (مسیرها، سبد، guard پنل، Edge Functionها با شبکهٔ mock، اسکن بسته) |
| `npm run test:preview:isolation` | ۴ سناریوی بالا موفق |
| `npm run test:images` (+ `test:images:db`) | ۲۴ تست سرویس + ۳۳ بررسی PostgreSQL محلی (PGlite) + rollback ستون ناسازگار — موفق |
| `npm run test:images:migration` | ۲۳ بررسی ایمنی محلی — موفق |
| `npm run test:images:automation` | ۳۴ تست Python — موفق |
| `npm run verify:images:bundle` / `verify:voice` / `verify:voice-settings` / `verify:assistant-scene` | موفق |

**آنچه این تست‌ها اثبات نمی‌کنند:** اتصال به Supabase میزبان، وضعیت migrationهای دیتابیس واقعی، `ALLOWED_ORIGINS` توابع لبه، دسترسی از شبکهٔ ایران، و هیچ رفتار خاص Cloudflare (چون همه آفلاین/شبیه‌ساز هستند).

---

## ۶. موانع باقی‌مانده (با شاهد)

| # | مانع | شاهد | شدت |
|---|---|---|---|
| M1 | اتصال Worker تولیدی به Supabase **تأییدنشده** | ۴۰۳ روی API متغیرهای GitHub؛ بسته‌شدن blob storage و شبکهٔ خروجی | بالا — بدون آن «آزمایش نهایی» بی‌معناست |
| M2 | پروژهٔ Pages تکراری روی همین مخزن | دو check run مستقل کلادفلر روی `b69a8b8` و روی commitهای PR | متوسط |
| M3 | Previewهای Pages متغیرهای تولید را ارث می‌بردند | build با `CF_PAGES=1` + sentinel → نشت در HTML | بالا — **اصلاح شد، منتظر merge** |
| M4 | محیط staging وجود ندارد؛ آزمون نوشتن ناچار روی دادهٔ واقعی است | `create_order` با `grant … to anon` موجودی واقعی را کم می‌کند | بالا |
| M5 | وضعیت migration v3 (تصاویر محصول) در دیتابیس میزبان نامعلوم | `verify:supabase` آفلاین است؛ بررسی زنده فقط با workflow فقط‌خواندنی | متوسط |
| M6 | `ALLOWED_ORIGINS` توابع لبه برای origin آزمایشی نامعلوم | پیش‌فرض `*`، ولی مقدار واقعی Secret است | متوسط |
| M7 | هر merge روی `main` خودکار روی دامنهٔ اصلی منتشر می‌شود | `DISABLE_GITHUB_PAGES` تنظیم نشده؛ run پوش پس از merge | اطلاعاتی/ریسک پذیرش |
| M8 | مسیر ناشناخته در Worker پاسخ ۲۰۰ (soft 404) می‌دهد | رفتار `single-page-application` در `test:worker` | پایین (هم‌ارز Pages) |

---

## ۷. پیشنهاد روش امن برای اثبات نوشتن (اجرا **نشده**)

**گزینهٔ A — توصیه‌شده: پروژهٔ staging جدا**
1. یک پروژهٔ رایگان Supabase برای staging بسازید و migrationهای `supabase/migrations` را روی آن اجرا کنید (workflow دستی موجود).
2. یک کاربر آزمایشی بسازید و `app_metadata: {"role":"admin"}` بگذارید؛ یک محصول و یک variant آزمایشی با SKU مشخص (`TEST-PREFLIGHT-1`) و موجودی ۵.
3. یک Worker دوم (مثلاً `zheno-staging` یا `env.staging` با نام مستقل) با Build variables همان پروژهٔ staging بسازید — **بدون هیچ دامنه و بدون رکورد DNS**.
4. شش سناریوی نوشتن را اجرا کنید و هر بار بازخوانی را تأیید کنید: ویرایش نام محصول، تغییر قیمت variant، افزودن variant جدید، تغییر موجودی با RPC، تغییر وضعیت یک سفارش آزمایشی، و یک `create_order` آزمایشی.
5. در پایان پروژه/Worker آزمایشی حذف می‌شود. هیچ دادهٔ واقعی لمس نشده است.

**گزینهٔ B — بدون شبکهٔ Supabase: پشتهٔ محلی**
`supabase start` (Docker) + `npm run dev:worker` با متغیرهای همان پشتهٔ محلی. مسیرهای auth/RLS/write را کامل می‌سنجد و هیچ‌چیز به بیرون نمی‌رود؛ اما محیط میزبان را اثبات نمی‌کند.

**گزینهٔ C — فقط با تأیید صریح شما روی تولید (توصیه نمی‌شود)**
ساخت محصول آزمایشی با SKU `TEST-PREFLIGHT-…`، موجودی ۰، غیرفعال‌سازی فوری و حذف نهایی؛ بدون سفارش و بدون آپلود. ریسک: ردیف واقعی در دیتابیس تولید و اثر در گزارش‌های فروش.

**قواعد آزمون زنده (در هر حالت):**
- روی میزبان متصل به تولید، دکمهٔ «ثبت سفارش» را نزنید (سفارش واقعی + کاهش موجودی واقعی).
- هیچ آپلود تصویر آزمایشی روی Storage تولید انجام نشود.
- «ذخیره» در پنل تولید فقط پس از گزینهٔ A.
- ورود، خواندن لیست‌ها، بازکردن جزئیات و مشاهدهٔ نشان وضعیت، بی‌خطر و کافی برای اثبات اتصال است.

---

## ۸. حکم نهایی

> **نسخهٔ Cloudflare برای «آزمایش نهایی خواندنی» آماده است؛ برای اثبات نوشتن و انتشار روی دامنهٔ اصلی هنوز مانع دارد.**

- **آماده:** Worker به‌صورت assets-only درست پیکربندی شده، از `main` ساخته و منتشر شده، ۱۲۵ asset را با MIME و hash درست سرو می‌کند، deep linkها را برمی‌گرداند و هیچ binding/DNS/Custom Domain ندارد. همهٔ تست‌های آفلاین سبزند.
- **مانع (به‌ترتیب اولویت):**
  1. **M1** — تا زمانی که وجود `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` در Build variables داشبورد یا خروجی `npm run verify:live` تأیید نشود، نمی‌توان گفت نسخهٔ آزمایشی به دیتابیس واقعی وصل است.
  2. **M3/M2** — اصلاح ایزوله‌سازی Preview باید merge شود، و پروژهٔ Pages تکراری یا حذف/جدا شود یا صریحاً بی‌خطر اعلام شود.
  3. **M4** — برای اثبات نوشتن، staging لازم است؛ روی تولید انجام نشود.
- **تأییدهای کوچک باقی‌مانده:** وضعیت migration v3 (M5) با workflow فقط‌خواندنی، و افزودن origin آزمایشی به `ALLOWED_ORIGINS` (M6) اگر مقدارش محدود است.

**هیچ‌چیز روی دامنهٔ اصلی منتشر نشد، هیچ DNS/دامنه‌ای تغییر نکرد، هیچ دادهٔ واقعی خوانده یا نوشته نشد و هیچ کلیدی نمایش داده نشد.** تغییرات این شاخه فقط: `vite.config.ts` (پوشش Pages در ایزوله‌سازی Preview)، `scripts/test-preview-isolation.mjs` (۴ سناریو)، `scripts/verify-live-readonly.mjs` + اسکریپت `verify:live` (اثبات فقط‌خواندنی اتصال)، و به‌روزرسانی همین مستند/`CLOUDFLARE-WORKERS-FA.md`. این تغییرات با push روی شاخه، فقط Previewهای همان شاخه را می‌سازند — نه تولید.

### گام بعدی پیشنهادی (به‌ترتیب)
1. merge این PR (اصلاح ایزوله‌سازی + ابزار تأیید).
2. اجرای `npm run verify:live -- https://zheno.<subdomain>.workers.dev` و بررسی Build variables در داشبورد.
3. تصمیم دربارهٔ پروژهٔ Pages تکراری در داشبورد.
4. ساخت staging (گزینهٔ A) برای اثبات نوشتن.
5. فقط پس از ۱–۴: تصمیم دربارهٔ `zheno.devs.surf` و `DISABLE_GITHUB_PAGES` (نیازمند تأیید صریح شما).
