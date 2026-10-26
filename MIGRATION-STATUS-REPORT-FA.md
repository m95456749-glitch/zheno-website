# ZHENO — گزارش وضعیت مهاجرت و اتصال (۲۰۲۶-۱۰-۲۶)

**دامنهٔ اصلی:** `zheno.devs.surf` (بدون تغییر) · **Worker:** `zheno` (حساب `45513bc67fccfe5c4f3b3e0b7ce33428`) · **آدرس واقعی Worker:** `https://zheno.m95456749.workers.dev`

هر مورد با یکی از سه وضعیت **PASS** (با شاهد)، **FAIL** (نقص واقعی) یا **BLOCKED** (دسترسی/اقدام لازم) مشخص شده است. هیچ موفقیتی بدون شاهد ادعا نشده و هیچ دادهٔ واقعی نوشته یا تغییر داده نشده است.

---

## ۱. PR #99

| مورد | وضعیت | شاهد |
|---|---|---|
| بازبینی و merge | **PASS** | `state=MERGED`, `mergedAt=2026-10-26T18:35:04Z` |
| merge commit | **PASS** | `78a4324a8e95e4343fd4577c186e26320d92345d` |
| روش merge | **PASS** | `gh pr merge 99 --merge` (merge commit معمولی، بدون force، بدون دور زدن بررسی‌ها) |
| محدودهٔ تغییر | **PASS** | ۹ فایل: `vite.config.ts`، دو اسکریپت، یک workflow، چهار سند. **صفر** تغییر زیر `src/` یا `public/` |

پیش از merge، متغیر `DISABLE_GITHUB_PAGES` قابل خواندن نبود (API با ۴۰۳ رد می‌شد). برای همین با یک workflow موقت، فقط‌خواندنی و یک‌بارمصرف، وضعیت واقعی سنجیده شد و نتیجه به‌صورت annotation ثبت شد:

```
DISABLE_GITHUB_PAGES=true (deploy.yml build job will be SKIPPED)
```
(run `40377931595`، commit `d804766`، annotation با عنوان `killswitch`؛ فایل پروب در commit بعدی حذف شد)

## ۲. CI و انتشار پس از merge

| بررسی (روی `78a4324`) | وضعیت | شاهد |
|---|---|---|
| GitHub Actions `build` | **skipped** | کلید قطع Pages فعال است |
| GitHub Actions `deploy` (Pages) | **skipped** | run `40379021917` = `completed/skipped`؛ هر دو job = `skipped` |
| `Workers Builds: zheno` | **PASS** | Build `0015f3a9-9c7b-4fc8-b723-320a2e059817`، Version `3ea897a7-b881-4d41-9cfb-ad869dd99203` |
| `Cloudflare Pages` (`zheno-website`) | **PASS** (انتشار مستقل) | deployment `38f82935-30a9-48b4-abef-9cb666525383` → `38f82935.zheno-website.pages.dev` |
| CI شاخهٔ PR (۳m06s) | **PASS** | Typecheck، verify:supabase/admin/data، catalog ۹/۹، images، preview isolation، build، deploy:check، smoke |

**نتیجهٔ مهم:** شرط محافظت برقرار بود و **هیچ انتشار جدیدی روی دامنهٔ اصلی رخ نداد**. پروژهٔ Cloudflare Pages مستقل از کلید قطع، یک deployment جدید ساخت (همان‌طور که پیش‌بینی شده بود) — روی `*.pages.dev`، بدون اثر روی دامنه.

## ۳. استقرار Cloudflare

| مورد | وضعیت | شاهد |
|---|---|---|
| اتصال Worker به مخزن/شاخهٔ `main` | **PASS** | build روی `78a4324` با trigger push به `main` |
| آدرس واقعی محیط تست | **PASS** | `https://zheno.m95456749.workers.dev` — از DNS کشف شد (`zheno.m95456749.workers.dev` → `104.21.64.174`, `172.67.187.51`) و بعد با درخواست واقعی تأیید شد |
| سرو شدن اپ روی همان آدرس | **PASS** | `GET /` → 200، shell با ۱٬۰۰۶٬۷۸۲ کاراکتر؛ ۴ deep link → **200** و بایت‌به‌بایت همان shell |
| تصویر و فونت | **PASS** | `/images/products/jelly-pomegranate.jpg` → MIME `image/*`؛ `/fonts/vazirmatn-arabic-wght-normal.woff2` → MIME فونت |
| نبود کلید privileged در بسته | **PASS** | «bundle carries no privileged/service key» |
| دو مسیر انتشار هم‌زمان | **PASS** (کنترل‌شده) | merge فقط Workers Build + Pages-by-CF را فعال کرد؛ مسیر GitHub Pages با کلید قطع مسدود بود |
| DNS/Custom Domain دست‌نخورده | **PASS** | `zheno.devs.surf` → `185.199.108.153` (GitHub Pages/Fastly)؛ `wrangler.jsonc` همچنان بدون `routes` |

## ۴. Supabase — **FAIL** (نقص واقعی در پیکربندی)

| مورد | وضعیت | شاهد |
|---|---|---|
| وجود Build variables | **PASS** | بستهٔ منتشرشدهٔ Worker هم URL پروژه و هم کلید publishable را دارد (وگرنه `verify:live` شکست می‌خورد) |
| **زنده بودن پروژهٔ Supabase** | **FAIL** | `kijhqsyftzufydonggeb.supabase.co` در **سه شبکهٔ مستقل** پاسخ DNS ندارد: (۱) sandbox: NXDOMAIN، (۲) resolver runner گیت‌هاب: `ENOTFOUND`، (۳) Cloudflare DoH: `DNS-Status=3 (NXDOMAIN)` — در حالی که `supabase.co` سالم (`76.76.21.21`) |
| مسیر REST/Auth/Functions | **FAIL** | هر سه probe با `ENOTFOUND` شکست خوردند؛ هیچ ۲۰۰/۴۰۱/۴۰۴ دریافتی نشد |
| نتیجهٔ ابزار | **FAIL** | `RESULT: CONFIGURED BUT DEAD — the bundle points at a Supabase project whose host does not resolve.` |
| Management API (`/v1/projects`) | **BLOCKED** | `HTTP 401` — توکن `SUPABASE_ACCESS_TOKEN` در Secrets منقضی/نامعتبر است؛ نمی‌توان «حذف‌شده» را از «ref اشتباه» تفکیک کرد |
| Edge Function / `ALLOWED_ORIGINS` | **BLOCKED** | با NXDOMAIN بودن میزبان، preflight قابل سنجش نیست |

**تفسیر دقیق:** استقرار Cloudflare «متصل» فقط از نظر *وجود متغیرها* است؛ اما مقصد آن وجود ندارد. در نتیجه **پنل مدیریت روی این استقرار نمی‌تواند وارد شود** و فروشگاه به کاتالوگ ثابت/`localStorage` برمی‌گردد. این «حالت نمایشی» است، نه اتصال واقعی.

**دامنهٔ اصلی هم همین وضعیت را دارد:** بستهٔ `https://zheno.devs.surf` **بایت‌به‌بایت همان طول shell** (۱٬۰۰۶٬۷۸۲) و **همان ref ماسک‌شده** (`kijh…ggeb`) را دارد؛ یعنی همان مقصد مرده در GitHub Pages Variables هم تنظیم شده است. این یک **نقص موجود قبلی** است، نه خروجی مهاجرت.

## ۵. پنل مدیریت

| مورد | وضعیت | شاهد |
|---|---|---|
| مسیرهای auth/RLS/نوشتن در کد | **PASS** (بازبینی + تست آفلاین) | `verify:admin`، `smoke`، `test:images` (۳۳ بررسی PGlite)، `test:images:migration` (۲۳) |
| ورود واقعی مدیر | **BLOCKED** | نیازمند پروژهٔ Supabase زنده + حساب مدیر واقعی؛ و طبق دستور، credential در چت درخواست نشده است |
| خواندن/نوشتن واقعی داده | **BLOCKED** | مرحلهٔ ۵: نوشتن روی production ممنوع؛ staging وجود ندارد (سند `STAGING-ADMIN-TEST-PLAN-FA.md`) |
| اتکای پنل به mock/fallback به‌عنوان منبع اصلی | **PASS** (منفی) | بستهٔ زنده مطابق کد در حالت remote است، ولی چون میزبان مقصد مرده است عملاً به fallback می‌افتد — همان FAIL بخش ۴ |

## ۶. Migration، RLS و CORS

| مورد | وضعیت | شاهد |
|---|---|---|
| فایل‌های migration در مخزن (شامل v3) | **PASS** | ۵ فایل، از جمله `20260922000000_product_images_reliable_bootstrap.sql` |
| اجرای واقعی migrationها روی پروژه | **BLOCKED** | workflow فقط‌خواندنی نیاز به `SUPABASE_DB_PASSWORD`/`SUPABASE_DB_HOST` دارد و runner dispatch در دسترس این محیط نیست (`actions: write` = ۴۰۳) |
| RLS | **PASS** (آفلاین) | سیاست‌ها در migration تعریف و در PGlite آزموده شده‌اند؛ روی پروژهٔ میزبان قابل آزمون نیست (میزبان وجود ندارد) |
| CORS / `ALLOWED_ORIGINS` | **BLOCKED** | میزبان functions در دسترس نیست |

## ۷. GitHub Pages و DNS

| مورد | وضعیت | شاهد |
|---|---|---|
| DNS دامنهٔ اصلی | **PASS** (بدون تغییر) | `zheno.devs.surf` → `185.199.108.153` / `185.199.109.153` (GitHub Pages)؛ Custom Domain و TLS در API: `cname=zheno.devs.surf`, `https_enforced=true` |
| انتشار روی دامنهٔ اصلی | **PASS** (رخ نداد) | jobهای Pages = `skipped` |
| حذف/تغییر Pages، Custom Domain یا nameserver | **PASS** (انجام نشد) | هیچ عملیات تغییری روی دامنه/Pages اجرا نشد |
| Secret چاپ/commit شده | **PASS** (هیچ) | همهٔ بررسی‌ها فقط boolean و ref ماسک‌شده چاپ کردند |

**نکتهٔ جانبی مفید برای مهاجرت:** روی GitHub Pages، deep linkها با **HTTP 404** و بدنهٔ اپ پاسخ می‌دهند (محدودیت SPA در Pages)؛ روی Worker همان مسیرها **200** می‌دهند. این یکی از سود واقعی جابه‌جایی است.

---

## ۸. موارد باقی‌مانده و اقدام لازم

| # | مورد | وضعیت | اقدام مشخص |
|---|---|---|---|
| R1 | **میزبان Supabase وجود ندارد** | FAIL | در داشبورد Supabase مطمئن شوید پروژه زنده است و ref واقعی آن را با `kijh…ggeb` (`kijhqsyftzufydonggeb`) مقایسه کنید. اگر پروژه حذف شده: پروژهٔ جدید بسازید یا پروژهٔ موجود را بازیابی کنید؛ سپس در Cloudflare → Worker `zheno` → Settings → Builds مقدار `VITE_SUPABASE_URL` و `VITE_SUPABASE_PUBLISHABLE_KEY` را با مقدار پروژهٔ زنده به‌روز کنید و **Rebuild** بزنید (بدون build مجدد اثر ندارد). سپس `Workflow → Live verify (read-only)` با `url=https://zheno.m95456749.workers.dev`. |
| R2 | همین مقدار مرده در GitHub Variables | FAIL | اگر می‌خواهید سایت فعلی هم سالم بماند: `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` را در Actions Variables همان مخزن به پروژهٔ زنده تغییر دهید (با کلید قطع فعال، انتشار Pages خودکار نیست؛ باید دستی `Deploy to GitHub Pages` را اجرا کنید یا کلید را موقتاً بردارید — این یک انتشار تولیدی است و **نیازمند تأیید صریح شماست**). |
| R3 | توکن Management API منقضی | BLOCKED | `SUPABASE_ACCESS_TOKEN` را با یک personal access token تازه (`sbp_…`) جایگزین کنید تا وضعیت پروژه و migrationها از API قابل تأیید شود. |
| R4 | وضعیت migration v3 | BLOCKED | پس از R1/R3: workflow `Supabase product images read-only state` را اجرا کنید و شش شاخص (`v3_applied`, `api_version=3`, `contract_v3`, `bucket_public`, `fingerprint_ok`, `bucket_file_size_limit_ok`) را ثبت کنید. |
| R5 | `ALLOWED_ORIGINS` | BLOCKED | پس از R1: `npm run verify:live -- https://zheno.m95456749.workers.dev` (یا workflow) و اگر ۴۰۳ دیدید، فقط origin دقیق را به لیست اضافه کنید (هرگز `*` نکنید). |
| R6 | آزمون پنل (ورود/محصول/تصویر/موجودی/سفارش) | BLOCKED | با staging مستقل طبق `STAGING-ADMIN-TEST-PLAN-FA.md`. روی production چیزی نوشته نشود. |
| R7 | پروژهٔ تکراری Pages | نیازمند تصمیم | با کلید قطع فعلی، Pages-by-CF همچنان روی `*.pages.dev` منتشر می‌شود. تصمیم بگیرید: Disconnect یا پذیرش صریح. |
| R8 | آزمون از شبکهٔ ایران بدون VPN | BLOCKED | از این محیط قابل انجام نیست؛ پس از R1 و با مرورگر واقعی. |

---

## ۹. ابزارها و شواهد قابل تکرار

- `npm run verify:live -- <url>` — اسکریپت فقط‌خواندنی (اکنون **غیرقاطع**: همهٔ بررسی‌ها را انجام می‌دهد، `FAIL:` جمع می‌کند و با کد خروج ۱ تمام می‌شود؛ تفاوت soft-404 را هم گزارش می‌کند).
- `.github/workflows/live-verify.yml` — اجرای دستی همان اسکریپت از runner گیت‌هاب (که به `workers.dev` و `supabase.co` دسترسی دارد)، با چک DNS مستقل (DoH)، annotation فشرده و job summary.
- شواهد اجراهای این گزارش: runهای `40377931595` (پروب کلید قطع)، `40378454412` (CI)، `40379021917` (Pages skipped)، `40380052483`/`40380302418`/`40380673169` (پروب‌های live)، check-run `Workers Builds: zheno` روی `78a4324`.

## ۱۰. جمع‌بندی یک‌خطی

**استقرار واقعی روی Cloudflare انجام شد و از بیرون قابل تأیید است (Worker + build + deep linkهای ۲۰۰ + DNS دست‌نخورده)، اما «اتصال واقعی به Supabase» برقرار نیست: پروژهٔ تنظیم‌شده در بسته وجود ندارد. تا اصلاح متغیرها (R1) و ساخت staging برای آزمون پنل (R6)، معیار اتمام محقق نشده است.**
