# اجرای migration تصاویر از GitHub Actions — بدون کپی دستی SQL

## وضعیت تحویل و مرز اجرا

مسیر جدید **آماده شده، نه روی GitHub یا Supabase اجرا شده** است. هیچ commit، push، merge، dispatch، تغییر Secret یا انتشار انجام نشده است. تغییرات هنوز working tree شاخهٔ `arena/01a0bbb3-zheno-website` هستند؛ تا زمانی که با اجازهٔ شما روی همین شاخه ثبت و push نشوند، GitHub نسخهٔ جدید workflow را ندارد. نسخهٔ قدیمی روی `main` را برای این کار اجرا نکنید.

این workflow مخصوص **ارتقای کاتالوگ موجود به مدیریت تصاویر v2** است؛ ابزار bootstrap دیتابیس خالی یا ترمیم خودکار تاریخچه نیست. frontend، Edge Function یا GitHub Pages را منتشر نمی‌کند.

## ۱. SQLهای کامل؛ بدون تکه‌تکه‌کردن

تمام SQL اصلی قبلاً در مسیر درست قرار داشت و همان فایل‌های کامل حفظ شده‌اند:

| فایل در `supabase/migrations/` | نقش در مسیر جدید |
|---|---|
| `20260912000000_initial_schema.sql` | baseline؛ باید قبلاً در تاریخچه ثبت شده باشد؛ دوباره اجرا نمی‌شود |
| `20260912000001_seed_catalog.sql` | baseline؛ باید قبلاً ثبت شده باشد؛ دوباره اجرا نمی‌شود |
| `20260919000000_product_images.sql` | v1 قدیمی؛ فقط اگر قبلاً ثبت شده باشد برای تطبیق تاریخچه در اختیار CLI قرار می‌گیرد؛ هرگز pending این مسیر نیست |
| `20260920000000_product_image_safety.sql` | migration کامل v2، ۶۰۴ خط؛ تنها فایل قابل اعمال در این workflow |

هیچ فایل تاریخی تغییر نام نداده، بازنویسی یا ادغام نشده است. متن SQL نهایی هم تغییر نکرده؛ SHA-256 آن:

```text
dc372b82145033114db5e30d80cfa9eae4531f21fcb47b03ea6f89525fe8081c
```

manifest شامل hash هر چهار فایل است. فایل اضافی یا تغییر SQL بدون بازبینی manifest باعث توقف می‌شود. runner در یک پوشهٔ موقت، **فایل‌های کامل و عیناً یکسان** را برای CLI کپی می‌کند؛ SQL را slice نمی‌کند و فایل baseline خالی/جعلی نمی‌سازد.

`supabase/check-product-image-upgrade.sql` فقط SELECTهای بررسی پس از اجراست، نه migration؛ به همین دلیل داخل پوشهٔ migrations قرار نگرفته است. هیچ DDL برنامه داخل YAML قرار ندارد.

## ۲. دقیقاً چه Secret و Variable لازم است؟

در مخزن GitHub بروید به:

**Settings → Environments → New environment → `supabase-production`**

قبل از اولین اجرا، برای این Environment:

- Required reviewers را فعال کنید؛ در صورت پشتیبانی، self-review و bypass را هم محدود کنید.
- Deployment branches/tags را به شاخهٔ مورد بازبینی محدود کنید؛ برای این جلسه، همین `arena/01a0bbb3-zheno-website`.
- امکان ویرایش workflow/این شاخه را فقط به افراد مورد اعتماد بدهید. کد شاخهٔ تأییدشده به رمز DB دسترسی خواهد داشت.
- فایل workflow سیاست محیط را از طریق API ایجاد یا تأیید نمی‌کند؛ این تنظیم امنیتی واقعاً باید توسط شما انجام شود. اگر پلن GitHub شما reviewer محیط را پشتیبانی نمی‌کند، قبل از apply کنترل دسترسی/بازبینی معادل را تعیین کنید. صرف ساختن Environment به‌معنی داشتن approval protection نیست.

### تنها Secret لازم برای مسیر جدید

در **Environment secrets** همان محیط:

| نام دقیق | مقدار | از کجا |
|---|---|---|
| `SUPABASE_DB_PASSWORD` | رمز فعلی دیتابیس PostgreSQL همین پروژه، بدون کوتیشن اضافی یا newline | رمز DB پروژه؛ تنظیم/مدیریت آن در Supabase Dashboard → Project Settings → Database، یا بخش Database Settings/Connect در نسخهٔ فعلی داشبورد |

این **رمز ورود GitHub، رمز حساب Supabase، anon key یا service_role نیست**. اگر رمز فعلی را نمی‌دانید، مدیریت/reset آن باید با توجه به اتصال‌های دیگر پروژه انجام شود؛ workflow رمز را عوض نمی‌کند. مقدار را فقط در Secret ذخیره کنید؛ در چت، فایل، log یا workflow input وارد نکنید. بهتر است این رمز environment-scoped باشد، نه repository-wide.

### دو Environment Variable — محرمانه نیستند

در **Environment variables** همان محیط:

| نام دقیق | مقدار | از کجا |
|---|---|---|
| `SUPABASE_PROJECT_REF` | Reference ID بیست‌حرفی پروژه، نه نام پروژه و نه URL | Project Settings → General / Reference ID؛ همچنین بخش ref در URL داشبورد پروژه |
| `SUPABASE_DB_HOST` | فقط hostname دقیق **Shared Session Pooler**؛ بدون `postgresql://`، username یا port | Supabase Dashboard → **Connect → Session pooler**؛ مقدار Host را عیناً بردارید |

runner از port ثابت **5432**، database برابر `postgres` و username برابر `postgres.<project-ref>` استفاده می‌کند. host را از region حدس نمی‌زند. Connection mode **Transaction/6543** یا direct endpoint IPv6 برای این مسیر انتخاب نشده‌اند.

TLS با `verify-full` و CA سیستم اجباری است. اگر host/certificate یا شبکه اجازهٔ اتصال ندهد، اجرا متوقف می‌شود؛ SSL verification را برای عبور از خطا خاموش نکنید. محدودیت شبکهٔ پروژه نیز باید طبق سیاست شما به runner اجازهٔ اتصال بدهد؛ این workflow IP allowlist را خودکار باز نمی‌کند.

### چه چیزهایی لازم نیست؟

- **`SUPABASE_ACCESS_TOKEN` لازم نیست.** مسیر انتخابی CLI، اتصال مستقیم PostgreSQL با `--db-url` است؛ login/link یا Management API استفاده نمی‌شود.
- `SUPABASE_SERVICE_ROLE_KEY`، `sb_secret_...`، کلید publishable/anon، `VITE_*` یا رمز در input لازم نیست.
- `SUPABASE_DB_URL` هم لازم نیست؛ URL به‌صورت موقت و percent-encoded از مقادیر بالا ساخته و mask می‌شود.
- ممکن است workflowهای قدیمیِ مربوط به Functionها هنوز Access Token بخواهند؛ این راهنما فقط دربارهٔ workflow جدید migration تصاویر است.

## ۳. از کجا و چگونه اجرا کنم؟

### شرط اول: نسخهٔ جدید واقعاً روی GitHub باشد

پس از بازبینی و اجازهٔ شما، فایل‌ها باید **روی همین شاخه** commit/push شوند. merge به main لازم نیست و در این تحویل انجام نشده است. workflow فعلی `supabase-migrate.yml` از قبل در default branch وجود دارد؛ بنابراین بعد از push شاخه، می‌توان نسخهٔ همان شاخه را با GitHub CLI و `--ref` dispatch کرد.

**احتیاط:** workflow مستقل `deploy.yml` موجود در مخزن با push به main سایت را deploy می‌کند. آن فایل تغییر نکرده است؛ برای فعال‌کردن این مسیر، بی‌دلیل به main merge نکنید.

### مرحلهٔ اول: Plan

در GitHub:

**Actions → Supabase product images (manual) → Run workflow**

شاخهٔ بازبینی‌شده را انتخاب کنید؛ `mode = plan` و checkbox تأیید apply را خاموش بگذارید. اگر فرم Actions هنوز تعریف قدیمی default branch را نشان می‌دهد یا نام قدیمی «Supabase migrate (manual)» دیده می‌شود، از این فرمان روی سیستم خودتان با GitHub CLI احراز هویت‌شده استفاده کنید؛ مجبور نیستید برای تغییر فرم به main merge کنید:

```bash
gh workflow run supabase-migrate.yml \
  --repo m95456749-glitch/zheno-website \
  --ref arena/01a0bbb3-zheno-website \
  -f mode=plan
```

این فرمان فقط **پس از push نسخهٔ جدید به شاخه** معتبر است. اینجا اجرا نشده است.

ابتدا job تست آفلاین، بدون Secret دیتابیس، اجرا می‌شود؛ شامل تست SQL محلی و CLI واقعی روی PostgreSQL موقت همان runner است. سپس job اتصال به پروژه، پشت Environment approval تنظیم‌شدهٔ شما قرار می‌گیرد.

Plan:

1. hash فایل‌های کامل را کنترل می‌کند.
2. با SELECTهای read-only، وجود تاریخچه و baseline و وضعیت اولیهٔ catalog/RLS/bucket را می‌خواند.
3. فایل‌های ثبت‌شده به‌اضافهٔ v2 را برای CLI آماده می‌کند؛ v1 ثبت‌نشده را وارد مسیر اجرا نمی‌کند.
4. `supabase migration list` و `supabase db push --dry-run --skip-vault` را با اتصال دارای `default_transaction_read_only=on` اجرا می‌کند.
5. در **Summary**، ref پروژهٔ مقصد، SHA کامل commit، hash SQL و تنها migration pending را نشان می‌دهد؛ هیچ migration روی پروژه اعمال نمی‌کند.

**dry-run خودِ SQL migration را اجرا نمی‌کند**؛ بنابراین تضمین نمی‌کند که همهٔ preflight/assertionهای فایل در schema سفارشی سرور پاس خواهند شد. نبود خطا در Plan جای backup یا تست Hosted Auth/Storage را نمی‌گیرد.

### مرحلهٔ دوم: Apply صریح

فقط پس از Plan موفق همان commit، backup قابل بازیابی دیتابیس و فایل‌های مهم Storage، توقف موقت نویسنده‌های محصول/گالری و migrationهای موازی بیرون GitHub، و هماهنگی انتشار مورد تأیید پنل v2:

- `mode = apply`
- `reviewed_commit =` **تمام SHA چهل‌کاراکتری commit از Summary همان Plan**
- `reviewed_project_ref =` ref پروژهٔ مقصد از Summary همان Plan؛ باید با Variable محیط برابر باشد.
- `confirm_apply = APPLY_PRODUCT_IMAGES_V2`
- `backup_and_writers_ready = true`
- Environment approval را طبق سیاست تنظیم‌شده تأیید کنید.

یا در GitHub CLI؛ عبارت `REPLACE_WITH_FULL_40_CHARACTER_SHA_FROM_PLAN` را با SHA واقعی و `REPLACE_WITH_PROJECT_REF_FROM_PLAN` را با ref واقعی همان Plan جایگزین کنید:

```bash
gh workflow run supabase-migrate.yml \
  --repo m95456749-glitch/zheno-website \
  --ref arena/01a0bbb3-zheno-website \
  -f mode=apply \
  -f reviewed_commit=REPLACE_WITH_FULL_40_CHARACTER_SHA_FROM_PLAN \
  -f reviewed_project_ref=REPLACE_WITH_PROJECT_REF_FROM_PLAN \
  -f confirm_apply=APPLY_PRODUCT_IMAGES_V2 \
  -f backup_and_writers_ready=true
```

Apply همهٔ تست‌ها، بررسی تاریخچه و dry-run را دوباره انجام می‌دهد. SHA ورودی باید دقیقاً همان commit checkoutشده باشد؛ با تغییر شاخه به commit جدید، SHA قدیمی پذیرفته نمی‌شود. ref واردشده هم باید با مقصد فعلی برابر باشد؛ تغییر Variable پروژه بعد از Plan نمی‌تواند بی‌صدا مقصد apply را عوض کند. از صداقت اپراتور دربارهٔ Plan/backup استفاده می‌شود؛ workflow وجود backup یا اجرای قبلی Plan را از API اثبات نمی‌کند، اما پیش از هر apply خودش dry-run تازه دارد.

اگر v2 pending باشد فقط همان فایل کامل با CLI اجرا می‌شود و CLI تاریخچهٔ آن را ثبت می‌کند. اگر قبلاً ثبت شده باشد، نوشتن CLI انجام نمی‌شود و بررسی نهایی read-only اجرا می‌شود. پس از اعمال، تاریخچه و ۱۰ شرط schema/primary/RLS/ACL/bucket/trigger بررسی می‌شوند؛ تعداد ثابت ۲۲ محصول شرط موفقیت نیست.

## ۴. رفتار تاریخچه و جلوگیری از بازپخش خطرناک

| وضعیت پروژه | رفتار |
|---|---|
| initial + seed ثبت‌شده، v1 ثبت‌نشده | v2 مستقیماً اجرا می‌شود؛ v1 اجرا یا به‌دروغ applied علامت‌گذاری نمی‌شود |
| initial + seed + v1 ثبت‌شده | ارتقای v2؛ فایل v1 فقط برای تطبیق تاریخچهٔ CLI حاضر است |
| v2 هم ثبت‌شده | no-op در نوشتن؛ بررسی نهایی read-only |
| تاریخچه موجود نیست یا initial/seed ثبت نشده‌اند | توقف؛ حتی اگر جدول‌ها موجود باشند، applied بودن حدس زده نمی‌شود |
| migration ناشناخته در Remote یا SQL/hash جدید محلی | توقف و نیاز به بازبینی |
| bucket خصوصی، RLS خاموش یا نوع محصول ناسازگار | توقف، نه public کردن یا تبدیل نوع |

`--include-all`، `--include-seed`، `migration repair`، `db reset` یا fallback به SQL Editor/Management API در runner وجود ندارد. توجه: خاموش‌کردن `[db.seed]` به‌تنهایی مانع اجرای فایل تاریخی seed در migrations نیست؛ حفاظت آن فایل از **بررسی تاریخچه و مجموعهٔ کنترل‌شدهٔ فایل‌ها** می‌آید.

اگر قبلاً SQL را دستی اجرا کرده‌اید ولی تاریخچهٔ CLI ثبت نشده، **این workflow خودسرانه آن را اصلاح نمی‌کند**. ابتدا schema و تاریخچهٔ واقعی باید بازبینی شوند. این پیش‌شرط ممکن است در پروژهٔ شما هنوز لازم باشد؛ Remote در این محیط بررسی اجرایی نشده است.

چون v1 ثبت‌نشده عمداً کنار گذاشته می‌شود، پس از نصب مستقیم v2 اجرای عمومی `supabase db push --include-all` از ریشهٔ مخزن می‌تواند v1 را بازپخش کند؛ **از این دستور برای تعمیر استفاده نکنید**. مسیر آینده نیز باید از همین برنامه‌ریز یا یک برنامهٔ migration بازبینی‌شده استفاده کند.

## ۵. خطا، محرمانگی و rollback

- مقدار Secret، hash/طول رمز، URL اتصال، پاسخ خام psql و خروجی خام CLI در Summary/artifact نوشته نمی‌شود. URL/passwordهای تبدیل‌شده پیش از استفاده mask می‌شوند. هیچ artifact حاوی dump دیتابیس ساخته نمی‌شود.
- خطای زیرساخت یا CLI عمداً خروجی خام ندارد، چون ممکن است credential یا دادهٔ واقعی در آن باشد. پیام ثابتِ مرحله را بررسی کنید؛ debug یا echo کردن رمز راه تشخیص مجاز نیست.
- خطای preflight قبل از اجرای CLI مانع نوشتن می‌شود. خطای داخل SQL تا قبل از COMMIT باعث rollback همان transaction است.
- خطای شبکه، timeout، قطع job یا شکست تأیید بعدی **اثبات نمی‌کند چیزی ثبت نشده**؛ SQL ممکن است COMMIT شده ولی ثبت تاریخچه/رسید ناموفق باشد. خودکار retry/repair یا rollback انجام نمی‌شود؛ تاریخچه و schema باید بررسی شوند.
- بعد از COMMIT، بازگشت نیازمند restore هماهنگ با نسخهٔ برنامه است. DB backup به‌تنهایی بایت‌های Storage را برنمی‌گرداند.
- bucket عمومی همچنان فایل را برای دارندهٔ URL قابل خواندن می‌گذارد. پنل قدیمیِ direct-write بعد از v2 محدود می‌شود؛ انتشار پنل جدید بخشی از این workflow نیست.
- GitHub concurrency اجراهای این workflow را سری می‌کند و job جاری را خودکار cancel نمی‌کند؛ جلوی اجرای CLI توسط اشخاص/ابزارهای خارج از GitHub را نمی‌گیرد.

## ۶. شواهد تست این تحویل

**قبل از تغییر کد:** ۱۳ تست سرویس، ۶۳ تست PostgreSQL اصلی، ۲۱ تست امنیت migration و ۴۴ بررسی ساختار/اسکن secrets پاس شدند.

**برای مسیر جدید:**

- ۳۴ تست Python آفلاین برای تأیید دستی/SHA/پروژهٔ مقصد/backup، تاریخچه، منع replay، hash، TLS/host، محرمانگی خطا، شکست dry-run، تغییر تاریخچه و no-op.
- ۱۱ بررسی با **Supabase CLI واقعی 2.117.0 و PostgreSQL محلی 17.10 و 18.4**: نصب مستقل، ارتقا از v1، ثبت تاریخچه، اجرای دوم بدون تغییر داده، dry-run read-only، رد تلاش واقعی برای نوشتن از اتصال read-only و rollback bucket خصوصی. این ۱۱ بررسی روی هر دو نسخهٔ PostgreSQL پاس شد. Auth و Storage schemaهای آزمایشی‌اند؛ سرویس‌های ابری نیستند.
- typecheck، build، ۴۹۹ smoke، ۸۱ data، ۸۱ admin، ۴۴ بررسی Supabase/اسکن secrets و ۲ بررسی bundle نیز بعد از تغییرات پاس شدند.
- YAML parse و بررسی گیت‌های event/job انجام شد. خود GitHub Actions روی سرور GitHub هنوز اجرا نشده است. در workflow برای تست disposable از PostgreSQL 17 استفاده شده؛ این job روی GitHub باید هنگام اجرای دستی شما نیز پاس شود.
- `pg` فقط devDependency تست CLI است؛ وارد کد runtime سایت نشده است. ابزار PostgreSQL محلیِ موقت و logها خارج از فایل‌های محصول/مسیرهای قابل commit نگه داشته شده‌اند.

تکرار تست‌های آفلاین:

```bash
npm ci --ignore-scripts
npm run test:images
npm run test:images:migration
npm run test:images:automation
```

تست CLI واقعی فقط روی PostgreSQL **محلی و دورریختنی** با trust-auth محدود به loopback، CLI نسخهٔ 2.117.0 در PATH، و بدون رمز واقعی:

```bash
TEST_POSTGRES_URL='postgresql://postgres@127.0.0.1:54322/postgres?sslmode=disable' \
  npm run test:images:cli
```

`sslmode=disable` بالا فقط متعلق به fixture محلیِ تست است؛ runner تولیدی فقط Session Pooler با `verify-full` را می‌پذیرد.

## فایل‌های این مرحله

- `.github/workflows/supabase-migrate.yml`: جایگزین نسخهٔ قبلی در working tree؛ manual-only، تست قبل از اتصال، محیط محافظت‌شده، plan/apply.
- `.github/workflows/ci.yml`: تست آفلاین امنیت migration/runner، بدون Secret یا اتصال Remote.
- `scripts/product-image-migrate.py`: برنامه‌ریز محدود و اجرای امن CLI.
- `supabase/product-image-migration-manifest.json`: نسخهٔ CLI، baseline، target و hash فایل‌های کامل.
- `supabase/config.toml`: تنظیم حداقلی CLI با seed غیرفعال؛ هیچ پروژهٔ Remote به آن link نشده است.
- `supabase/check-product-image-upgrade.sql`: تأیید خواندنی پس از اجرا، بدون دادهٔ شخصی.
- `scripts/test-product-image-automation.py` و `scripts/test-product-image-cli.mjs`: تست‌های جدید.
- `package.json` / lock، اسکن bundle و راهنماهای مرتبط به‌روزرسانی شدند.

**هیچ migration تاریخی یا SQL نهایی، UI، سرویس تصویر، workflow انتشار سایت یا workflow Function در این مرحله تغییر نکرده است.**
