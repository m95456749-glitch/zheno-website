# چک‌لیست تأیید پیش از انتقال (Cutover) — Zheno → Cloudflare

**تاریخ:** ۲۰۲۶-۱۰-۲۶ · **شاخه:** `arena/81ab77fc-zheno-website` (PR #99) · **مبنا:** `main` = `b69a8b8`

این سند فقط چیزهایی را فهرست می‌کند که **از داخل مخزن قابل بررسی یا ساخت است**. هر موردی که به داشبورد Cloudflare، Supabase یا شبکهٔ بیرونی نیاز دارد با برچسب «نیازمند اقدام شما» مشخص شده و **انجام نشده است**. هیچ کلید، رمز یا توکنی در این سند چاپ نمی‌شود.

---

> **به‌روزرسانی ۲۰۲۶-۱۰-۲۶ (پس از merge) — نتیجهٔ سنجش زنده:** Worker روی `https://zheno.m95456749.workers.dev` سرو می‌شود و سالم است، اما آدرس Supabase داخل بستهٔ منتشرشده (`kijh…ggeb`) **در DNS وجود ندارد** (NXDOMAIN در سه شبکهٔ مستقل). بنابراین اتصال واقعی برقرار نیست؛ جزئیات و اقدام لازم: `MIGRATION-STATUS-REPORT-FA.md` بخش‌های ۴ و ۸.

## ۰. نقشهٔ مسیرهای انتشار: Worker `zheno` و پروژهٔ Pages `zheno-website`

هر سه مسیر زیر با یک push روی `main` فعال می‌شوند و **مستقل** از هم‌اند:

| مسیر | محرک | مقصد انتشار | تأثیر بر دامنهٔ اصلی `zheno.devs.surf` | شاهد |
|---|---|---|---|---|
| **GitHub Pages** (`.github/workflows/deploy.yml`) | push روی `main` یا اجرای دستی | GitHub Pages؛ دامنهٔ `zheno.devs.surf` (TLS تأییدشده) | **تنها مسیری که دامنهٔ اصلی را تغییر می‌دهد** | `gh api …/pages` → `cname: zheno.devs.surf`, `build_type: workflow`؛ run `40359720902` پس از merge #98 |
| **Cloudflare Worker `zheno`** (Workers Builds) | push روی `main` (production branch) و هر شاخه (Preview) | `*.workers.dev` (چون `workers_dev: true` و **هیچ** `routes`/Custom Domain در `wrangler.jsonc` نیست) | **هیچ** — DNS و دامنه دست نمی‌خورد | check run «Workers Builds: zheno» روی `b69a8b8`؛ Preview شاخه: `…/production/previews/arena-81ab77fc-…` |
| **Cloudflare Pages `zheno-website`** | همان push (اتصال از قبل موجود است) | `*.pages.dev` (URL هر deployment در check run گزارش می‌شود) | **هیچ** | check run «Cloudflare Pages» روی `b69a8b8`، `7528c400.zheno-website.pages.dev` |

### وضعیت تأییدشدهٔ کلید قطع GitHub Pages (۲۰۲۶-۱۰-۲۶)

`DISABLE_GITHUB_PAGES=true` **واقعاً تنظیم شده است** — نه بر اساس حدس، بلکه با اجرای یک workflow موقت فقط‌خواندنی روی همین شاخه که نتیجه را به‌صورت annotation منتشر کرد:

```
DISABLE_GITHUB_PAGES=true (deploy.yml build job will be SKIPPED)
```
(run `40377931595` روی `d804766`، check annotation با عنوان `killswitch`)

منطق `deploy.yml` نیز تأیید شد: `if: ${{ vars.DISABLE_GITHUB_PAGES != 'true' }}` روی job `build`؛ پس با مقدار `true` کل مسیر انتشار Pages (build + deploy) رد می‌شود.

**استثنای مهم:** این کلید فقط انتشار **GitHub Actions → GitHub Pages** را متوقف می‌کند. پروژهٔ **Cloudflare Pages** (`zheno-website`) اتصال مستقل خودش را دارد و روی هر push به `main` مستقل از این متغیر build می‌شود؛ یعنی تا وقتی آن پروژه به مخزن وصل است، یک کپی عمومی روی `*.pages.dev` ساخته می‌شود (بدون اثر روی `zheno.devs.surf`).

### اثر دقیق merge شدن PR #99

1. push روی `main` → **GitHub Pages یک انتشار جدید روی `zheno.devs.surf` انجام می‌دهد**. محتوای این انتشار از نظر کد عملاً با وضعیت فعلی یکسان است (PR #99 هیچ فایلی زیر `src/` یا `public/` را تغییر نمی‌دهد؛ فقط `vite.config.ts`، دو اسکریپت تست و دو سند)، اما از نظر فرایند **یک انتشار روی دامنهٔ اصلی است**. اگر نمی‌خواهید این اتفاق بیفتد، پیش از merge باید متغیر مخزن `DISABLE_GITHUB_PAGES=true` تنظیم شود — **این کار انجام نشده و نیازمند تصمیم شماست**.
2. **Worker `zheno`** نسخهٔ جدید می‌گیرد؛ فقط روی `*.workers.dev` قابل مشاهده است.
3. **Pages `zheno-website`** هم یک deployment جدید می‌سازد؛ روی `*.pages.dev`.
4. هیچ‌کدام از این سه، رکورد DNS یا Custom Domain ایجاد/تغییر نمی‌دهد.

### آیا این دو مقصد تداخل دارند؟

- **تداخل فنی: خیر.** سه build مستقل، سه مقصد مستقل، سه مجموعهٔ متغیر مستقل (GitHub Variables برای Pages، Cloudflare Build variables برای Worker/Pages). هیچ‌کدام فایل‌های دیگری را بازنویسی نمی‌کند.
- **تداخل عملیاتی: بله، سه ریسک:**
  1. **ابهام «کدام نسخه آزمایشی؟»** — دو نسخهٔ عمومی موازی وجود دارد؛ آزمایش باید همیشه با URL کامل و commit مشخص ثبت شود.
  2. **ارث‌بری متغیرها در Previewها** — تا پیش از PR #99، Previewهای پروژهٔ Pages می‌توانستند متغیرهای تولید را در بسته بریزند (اصلاح‌شده و تست‌شده؛ بخش ۱).
  3. **انتشار ناخواستهٔ یک کپی متصل** — اگر پروژهٔ Pages متغیرهای `VITE_SUPABASE_*` را داشته باشد، یک نسخهٔ کامل و متصل از سایت روی `*.pages.dev` عمومی می‌ماند. **وضعیت متغیرهای آن پروژه ناشناخته است** و از این محیط خوانده نمی‌شود.
- **توصیه:** پروژهٔ Pages `zheno-website` از مخزن جدا (Disconnect) یا حذف شود، مگر آنکه بخواهید به‌عنوان host دوم نگه دارید. این کار در داشبورد و **فقط با تأیید شما** انجام می‌شود.

---

## ۱. چک‌لیست A — Build variables کلادفلر (Worker `zheno`)

محل: Cloudflare Dashboard → Workers & Pages → **zheno** → Settings → Builds → *Build variables and secrets*.

> چرا مهم است: تنها چیزی که تعیین می‌کند پنل مدیریت واقعی است یا نمایشی، همین متغیرها هستند. همه از نوع **build-time** هستند؛ بدون build مجدد هیچ اثری ندارند. هر `VITE_*` در بستهٔ مرورگر inline می‌شود.

| # | متغیر | لازم؟ | مقدار مورد انتظار | معیار قبولی | اگر غلط باشد |
|---|---|---|---|---|---|
| A1 | `VITE_SUPABASE_URL` | **الزامی** | `https://<project-ref>.supabase.co` و **https** | در `verify:live` به‌صورت «۱ URL پروژهٔ میزبان» دیده شود | سایت در حالت آفلاین/نمایشی؛ پنل بدون دیتابیس |
| A2 | `VITE_SUPABASE_PUBLISHABLE_KEY` (یا نام قدیمی `VITE_SUPABASE_ANON_KEY`) | **الزامی** | `sb_publishable_…` یا anon JWT | `verify:live` بگوید «publishable key present» | همان بالا؛ کلید نامعتبر → آفلاین |
| A3 | `VITE_ADMIN_AUTH_MODE` | اختیاری | خالی یا `supabase` | با تنظیم بودن A1/A2 خودکار `supabase` می‌شود | `demo` ⇒ پنل بدون احراز هویت واقعی (برچسب «نمایشی») |
| A4 | `VITE_API_BASE_URL` | اختیاری | **خالی** | نبودِ آدرس سفارشی | آدرس اشتباه ⇒ خطای شبکه در دکمهٔ پرداخت/ورود api |
| A5 | `VITE_ASSISTANT_API_URL` | اختیاری | خالی (پیش‌فرض = Edge Function) | خالی باشد | آدرس اشتباه ⇒ دستیار از کار می‌افتد |
| A6 | `NODE_VERSION` | توصیه‌شده | `22.22.3` | لاگ build نسخهٔ Node را نشان دهد | نسخهٔ دیگر Node ممکن است build را تغییر دهد |
| A7 | هر متغیر `VITE_*` دیگر | — | **نباید وجود داشته باشد** | فقط A1/A2 (+ اختیاری‌ها) | هر `VITE_*` اضافی در بستهٔ عمومی افشا می‌شود |

**ممنوع مطلق:** `sb_secret_…`، JWT با `role: service_role`، کلید Azure/AI، رمز دیتابیس به‌عنوان Build variable. (گارد `vite.config.ts` build را متوقف می‌کند — تأییدشده با `verify:images:bundle`.)

اثر merge: PR #99 روی این جدول اثری ندارد، ولی اگر پروژهٔ **Pages** هم متغیر دارد، آنها را جدا بررسی کنید (بخش ۰، ریسک ۳).

---

## ۲. چک‌لیست B — اثبات اتصال واقعی به Supabase

سه سطح مستقل؛ هر سه باید هم‌خوان باشند. **هیچ‌کدام نوشتن انجام نمی‌دهد.**

| # | اقدام | دستور/محل | معیار قبولی (شاهد) | وضعیت امروز |
|---|---|---|---|---|
| B1 | بررسی بستهٔ منتشرشده (از GitHub، بدون نیاز به دسترسی محلی) | Actions → **Live verify (read-only)** → Run workflow؛ `url` = آدرس واقعی Worker (یا تنظیم یک‌بارهٔ Variable عمومی `CLOUDFLARE_WORKER_URL`) | خروجی `RESULT: this deployment ships a CONNECTED build` + «۱ URL پروژه (ماسک‌شده)» + «publishable key present» | **آماده، اجرا نشده** — شبکهٔ خروجی محیط عامل به `workers.dev` بسته است؛ runner گیت‌هاب این محدودیت را ندارد |
| B1b | همین بررسی روی ماشین خودتان | `npm run verify:live -- https://<worker>.workers.dev` | همان خروجی | **اجرا نشده** |
| B2 | بررسی Build variables | داشبورد (بخش ۱) | A1 و A2 موجود؛ A7 برقرار | **انجام نشده** (داشبوردی) |
| B3 | ورود مدیر روی همان URL | مرورگر → `/admin/login` با حساب مدیر Supabase | برچسب «نمایشی» دیده نشود؛ نشان وضعیت همگام‌سازی ظاهر شود؛ در Network درخواست‌های `https://<project>.supabase.co/auth/v1/…` و `/rest/v1/…` موفق (۲۰۰) | **انجام نشده** |

**آنچه `verify:live` اثبات می‌کند:** وجود URL پروژه و کلید عمومی در بسته، و سرو شدن درست SPA/تصویر/فونت از همان میزبان — یعنی «build متصل است».
**آنچه اثبات نمی‌کند:** دسترسی واقعی به دیتابیس، صحت RLS، صحت حساب مدیر، و دسترسی از شبکهٔ ایران. این‌ها فقط با B3 و بخش ۴ تأیید می‌شوند.
**آنچه در این محیط اثبات شد:** هر دو شاخهٔ منطقی اسکریپت با داده‌های ساختگی (build آفلاین ⇒ پیام OFFLINE؛ build با URL ساختگی ⇒ پیام CONNECTED با شناسهٔ ماسک‌شده) — یعنی ابزار درست کار می‌کند؛ نه اینکه استقرار شما متصل است.

نکتهٔ مهم دربارهٔ هدف اصلی (لود تصاویر بدون VPN): کاتالوگ پایه، تصاویر محصول و فونت‌ها **مسیر نسبی** (`images/…`) دارند و از همان میزبان سرو می‌شوند؛ پس انتقال به Cloudflare آن‌ها را از مسیر GitHub Pages/Fastly خارج می‌کند. اما تصاویری که از پنل آپلود می‌شوند آدرس مطلق `https://<project>.supabase.co/storage/v1/object/public/product-images/…` دارند و **همچنان از دامنهٔ supabase.co** می‌آیند. اگر مشکل دسترسی از ایران مربوط به همان دامنه باشد، کات‌اور استاتیک آن را حل نمی‌کند.

---

## ۳. چک‌لیست C — وضعیت migration v3 (مدیریت تصاویر محصول)

**وضعیت امروز:** از این محیط **ناشناخته** است (دیتابیس میزبان قابل دسترسی نیست؛ `verify:supabase` و `test:images:*` همه آفلاین‌اند).

روش تأیید فقط‌خواندنی (بدون نوشتن؛ از قبل در مخزن موجود است):

`.github/workflows/supabase-product-images-readonly.yml` → Actions → *Supabase product images read-only state* → **Run workflow**.

- پیش‌نیاز (Variables): `SUPABASE_PROJECT_REF` (۲۰ حرف)، `SUPABASE_DB_HOST` (`…pooler.supabase.com`)؛ Secret محیط `supabase-production`: `SUPABASE_DB_PASSWORD`؛ **هیچ توکن یا service_role لازم نیست**.
- اجرا با `default_transaction_read_only=on`؛ هیچ `db push`، DDL، DML یا تغییر Storage ندارد.

| # | شاخص در خروجی | معیار قبولی |
|---|---|---|
| C1 | `v3_applied` | `true` |
| C2 | `api_version` | `3` |
| C3 | `product_images_table` / `manage_rpc` / `contract_v3` | همه `true` |
| C4 | `bucket_public` | `true` (bucket `product-images`؛ عمومی بودن عمدی است) |
| C5 | `fingerprint_ok` | `true` (contract با schema فعلی می‌خواند) |
| C6 | `bucket_file_size_limit_ok` | `true` (۸ MiB) |

اگر C1..C6 کامل نبود: **گالری و آپلود تصویر پنل کار نمی‌کند** و باید پیش از آزمون staging/cutover با مسیر کنترل‌شدهٔ `supabase-migrate.yml` (plan → apply با تأییدیهٔ متنی) اجرا شود — بعد از backup قابل بازیابی دیتابیس **و بایت‌های Storage** (backup دیتابیس، فایل‌ها را پوشش نمی‌دهد).

---

## ۴. چک‌لیست D — `ALLOWED_ORIGINS` توابع لبه

| # | موضوع | چگونه بدون افشای مقدار بررسی کنیم |
|---|---|---|
| D1 | آیا محدود شده یا `*` است؟ | `npm run verify:live -- <host>` بخش preflight: پیام «origin … is allowed (HTTP 204 …)» یعنی `*` یا شامل این origin؛ پیام «REFUSED (HTTP 403)» یعنی لیست محدود است و این host در آن نیست. |
| D2 | افزودن origin آزمایشی | در Supabase → Edge Functions → Secrets، مقدار `ALLOWED_ORIGINS` را **فقط بخوانید و دقیقاً یکی اضافه کنید** (مثلاً `https://zheno.devs.surf,https://<worker>.workers.dev`)؛ هرگز با `*` جایگزین نشود. مقدار را در چت یا commit نگذارید. |
| D3 | توابع مربوطه | `zhino-assistant` و `zhino-voice` (هر دو پیش‌فرض `*` دارند؛ `OPTIONS` با ۲۰۴ و هدر CORS پاسخ می‌دهد — از کد تأیید شد). |
| D4 | معیار قبولی | در مرورگر: صفحهٔ `/assistant` پاسخ می‌دهد و پنل صدا وضعیت متصل نشان می‌دهد؛ در Network هیچ خطای CORS نیست. |

**وضعیت امروز:** مقدار واقعی ناشناخته است (Secret است و از این محیط خوانده نمی‌شود). تغییر آن یک اقدام تولیدی است و **انجام نشده**.

---

## ۵. تأییدهای نهایی پیش از تغییر DNS (همه نیازمند تصمیم شما)

| # | مورد | وضعیت فعلی |
|---|---|---|
| E1 | `zheno.devs.surf` هنوز روی GitHub Pages است؛ DNS و Custom Domain تغییر نکرده | ✅ تغییری داده نشده |
| E2 | Worker هیچ `routes`/Custom Domain ندارد | ✅ تأییدشده در `wrangler.jsonc` + `deploy:check` |
| E3 | rollback: متغیر `DISABLE_GITHUB_PAGES` و رکورد قبلی DNS تا پایان دورهٔ اطمینان حفظ شود | ⏳ تصمیم شما |
| E4 | پروژهٔ Pages `zheno-website`: جدا کردن/حذف یا پذیرش صریح | ⏳ تصمیم شما |
| E5 | آزمون بدون VPN روی شبکهٔ ایران (موبایل + ثابت) | ⏳ انجام نشده |
| E6 | آزمون پنل روی staging (سند `STAGING-ADMIN-TEST-PLAN-FA.md`) | ⏳ انجام نشده |

---

## ۶. جمع‌بندی وضعیت

| مورد | وضعیت امروز |
|---|---|
| پیکربندی Worker (assets-only، SPA، بدون binding/DNS) | ✅ تأییدشده و تست‌شده |
| ایزوله‌سازی Preview برای هر دو سیستم کلادفلر | ✅ اصلاح‌شده در PR #99 + تست با ۴ سناریو |
| وجود/درستی Build variables | ❓ نامعلوم — نیازمند داشبورد (بخش ۱) |
| اتصال واقعی به Supabase | ❓ اثبات‌نشده — ابزار آماده است (بخش ۲) |
| migration v3 | ❓ نامعلوم — workflow فقط‌خواندنی موجود (بخش ۳) |
| `ALLOWED_ORIGINS` | ❓ نامعلوم — سنجش با preflight (بخش ۴) |
| دادهٔ تولید | ✅ هیچ نوشتنی انجام نشده |
| دامنه/DNS | ✅ بدون تغییر |
