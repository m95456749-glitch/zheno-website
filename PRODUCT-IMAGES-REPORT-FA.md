# گزارش تحویل مدیریت تصاویر محصولات ژینو

تاریخ: ۲۰ سپتامبر ۲۰۲۶ · شاخه: `arena/01a0bbb3-zheno-website`

## وضعیت تحویل

کد، رابط Premium، SQL نهایی و تست‌ها آمادهٔ بررسی هستند. پیش‌نمایش خروجی production روی پورت ۴۱۷۳ فعال است؛ مسیر صفحه `/admin/product-images` است. پیش‌نمایش عمداً Demo است و به Supabase واقعی متصل نیست.

**هیچ commit، push، merge، اجرای workflow، migration روی Remote یا انتشار سایت انجام نشده است.** تمام تغییرات در working tree همین شاخه باقی مانده‌اند. فایل تصویر/فونت ساختگی اضافه نشده و تصاویر واقعی موجود مخزن برای تست استفاده شده‌اند.

## تکمیل ممیزی نهایی SQL — ۲۰ سپتامبر ۲۰۲۶

**حکم: آمادهٔ اجرای کنترل‌شده روی schema منطبق با مخزن؛ نه تأیید بدون شرط production ناشناخته.** قبل از اجرا backup قابل بازیابی و هماهنگی با پنل نسخهٔ ۲ لازم است. نوشتن مستقیم پنل قدیمی عمداً مسدود می‌شود؛ بنابراین تا آماده‌بودن زمان انتشار تأییدشده و توقف موقت writerها روی سرور اجرا نکنید.

گزارش تفصیلی، **تمام ۶۰۴ خط SQL بدون حذف** و SHA-256 در [گزارش ممیزی migration](supabase/PRODUCT-IMAGE-MIGRATION-AUDIT-FA.md) آمده‌اند. [diff دقیق قبل/بعد ممیزی](supabase/product-image-safety-final-audit.diff) نیز آماده است؛ مبدأ آن نسخهٔ تحویل قبلی همین migration است، نه فایل v1.

اصلاحات این مرحله: حذف UPDATE بی‌اثر محصولات و حفظ کامل timestamp/URLهای قبلی؛ توقف در bucket خصوصی؛ کنترل دقیق‌تر schema/index/FK/PK؛ revoke کامل مجوزهای جدول/ستون و کنترل مجوز ارثی؛ محدودکردن ACL و search_path توابع؛ policyهای restrictive بدون اختلال bucketهای دیگر؛ منع نسبت‌دادن مالکیت upload از روی انتهای URL خارجی؛ بررسی محافظه‌کارانهٔ ارجاع encoded و قفل مشترک؛ assertionهای واقعی **قبل از COMMIT**. هیچ سرویس یا ظاهر برنامه در این مرحلهٔ ممیزی تغییر نکرد.

۲۱ تست جدید migration نیز پاس شدند: ثبات داده و timestamp در اجرای دوم/سوم، عدم اجرای trigger سفارشی محصولات، rollback در bucket خصوصی/schema خراب/index هم‌نام غلط/مجوز ارثی/PK یا default ناقص، محافظت از داده در uniqueness ناسازگار، مجوزهای PUBLIC/ستونی/default/RPC، عدم افشای metadata محصول غیرفعال با policy گسترده، دسترسی bucket دیگر و مقاوم‌بودن در برابر shadow موقت. SQL در مجموع **۸۴ بررسی محلی** دارد: ۶۳ قبلی + ۲۱ جدید؛ این عدد شامل Remote نیست.

## تکمیل مسیر اجرای Actions — ۲۱ سپتامبر ۲۰۲۶

اجرای SQL بدون کپی دستی، با workflow فقط دستی و CLI نسخهٔ ثابت آماده شد. SQL نهایی و migrationهای تاریخی تغییر نکردند. قبل از تغییرات این مرحله ۱۳ تست سرویس، ۸۴ تست SQL محلی و بررسی ساختار/اسکن secrets اجرا و پاس شدند. ۳۴ تست runner آفلاین و ۱۱ بررسی با CLI واقعی روی PostgreSQL محلی نیز برای مسیر جدید پاس شدند؛ این اجراها Remote Supabase یا اجرای GitHub Actions نیستند.

راهنمای فعلی اجرای پیشنهادی، Secret/Variable، محدودیت تاریخچه و شرط push مجاز فایل‌ها در [راهنمای Actions](supabase/RUN-PRODUCT-IMAGES-ACTIONS-FA.md) است. روش SQL Editor پایین این گزارش، فقط جایگزین دستیِ تحویل قبلی است. workflow قبلیِ عمومی در working tree با مسیر محافظت‌شدهٔ مخصوص v2 جایگزین شده؛ seed/v1 ثبت‌نشده را اجرا نمی‌کند، تاریخچهٔ مبهم را repair نمی‌کند و تعداد ثابت ۲۲ محصول را شرط موفقیت نمی‌داند. `pg` فقط devDependency تست CLI اضافه شده است.

هیچ commit، push، dispatch، merge، تغییر Secret، اجرای Remote یا انتشار انجام نشده است.

## علت اصلی و حدود تشخیص

نقص قطعی کد، چندمرحله‌ای و ناهماهنگ بودن تغییر تصویر اصلی، metadata و حذف فایل بود. گزینهٔ حذف قبلی می‌توانست پس از خاموش‌کردن انتخاب اصلی روشن بماند؛ `pending` به UI منتقل نمی‌شد؛ خطای مبهم شبکه با رد قطعی ثبت اشتباه گرفته می‌شد؛ بعضی UPDATE/DELETEها بدون بررسی نتیجه موفق فرض می‌شدند. cache و وضعیت خطای نمایش تصویر نیز می‌توانستند قدیمی بمانند.

نبودن bucket یا ناسازگاری schema **روی سرور واقعی** تأیید نشده است. دسترسی مدیریتی SQL/Remote در این محیط موجود نبود. نوع‌های تأییدشده در migrationها و PostgreSQL محلی: `products.id = text`، `product_images.product_id = text` و `product_images.id = uuid`. فایل نهایی این نوع‌ها را روی سرور پیش از تغییر بررسی می‌کند و در صورت تفاوت متوقف می‌شود؛ نوع واقعی Remote را از روی TypeScript حدس نمی‌زند.

## اصلاحات فنی

- RPC تراکنشی `manage_product_image`: ثبت، انتخاب اصلی، جایگزینی، ویرایش توضیح و حذف؛ کنترل نقش مدیر، تعلق تصویر به محصول، URL مورد انتظار و قفل ردیف محصول.
- trigger برای هماهنگ‌ماندن `products.image_url` با تصویر اصلی، حتی در ویرایش از فرم محصول؛ index یکتا برای حداکثر یک تصویر اصلی.
- مسیر UUID یکتا و منع overwrite؛ ثبت دوبارهٔ همان عملیات پاسخ‌گم‌شده، تصویر تکراری ایجاد نمی‌کند.
- حفظ پیش‌نمایش و شناسهٔ عملیات هنگام نتیجهٔ نامعلوم شبکه؛ read-back و بازنشستگی کنترل‌شده، به‌جای حذف حدسی فایل.
- صف پایدار `product_image_cleanup`؛ حذف فایل فقط پس از بازنشستگی و نبود ارجاع زنده. RLS مسیرهای زنده را محافظت می‌کند و پاک‌سازی ناموفق قابل تکرار است.
- policyهای restrictive برای همین bucket، برای جلوگیری از دورزدن محدودیت‌ها توسط policyهای permissive گسترده؛ bucketهای دیگر دست‌نخورده‌اند.
- نتیجهٔ mutation از RPC بررسی می‌شود؛ ردیف ناموجود یا پاسخ ناقص موفق تلقی نمی‌شود. نوشتن مستقیم جدول از مرورگر مجاز نیست.
- `pending` واقعی، قفل عملیات هم‌زمان، نمایش خطا/هشدار فارسی، محدودیت زمان انتظار و بازخوانی پس از عملیات.
- کنترل نسخهٔ درخواست‌های بازخوانی کاتالوگ/گالری و اصلاح وابستگی memo؛ پاسخ قدیمی جای snapshot جدید را نمی‌گیرد.
- خطای نمایش تصویر به URL مربوط است؛ پس از تغییر URL، تصویر جدید دوباره امتحان می‌شود. شکست دریافت عکس در گالری صریح نمایش داده می‌شود.
- بررسی signature باینری، MIME، فایل خالی، سقف ۸ MiB، decode واقعی مرورگر، سقف ۴۰ مگاپیکسل و حجم خروجی آماده‌شده. GIF خراب از اعتبارسنجی عبور نمی‌کند؛ GIF معتبر انیمیشن خود را حفظ می‌کند.
- حفظ تصاویر legacy و URLهای خارجی؛ حذف فیزیکی آن‌ها انجام نمی‌شود.
- Demo با ذخیرهٔ strict و بازگردانی در شکست ذخیرهٔ کاتالوگ؛ تصاویر legacy پس از انتخاب عکس جدید در گالری می‌مانند.
- محصول بدون variant در مدیریت تصاویر دیده می‌شود؛ رفتار قبلی فروشگاه عمومی برای محصول غیرقابل‌فروش حفظ شده است.
- محافظ build پیش از جایگذاری environment در bundle، کلید privileged را رد می‌کند؛ مقدار کلید در خروجی نوشته نمی‌شود.

## رابط کاربری

کارت‌های بزرگ‌تر، تصویر اصلی با `object-fit: contain`، پس‌زمینهٔ کرم گرم، جزئیات شرابی/طلایی مات، حاشیه و سایهٔ ظریف، نمایش شناسه/حجم/ابعاد، badge اصلی و تعداد عکس‌ها، دکمه‌های لمسی با حداقل اندازهٔ مناسب، جست‌وجو و فیلتر فعلی، پیش‌نمایش، ویرایش توضیح، جایگزینی و حذف حفظ شده‌اند.

حذف آخرین عکس به **تأیید جداگانه** نیاز دارد؛ حذف تمام عکس‌ها به‌طور مطلق ممنوع نشده تا مدیر بتواند آگاهانه عکس نامعتبر را بردارد. پنجرهٔ upload اسکرول عمودی دارد و در موبایل از عرض صفحه بیرون نمی‌زند. CSS جدید به صفحهٔ تصاویر محدود است.

## خروجی واقعی تست‌های نهایی

| فرمان / بررسی | نتیجه | نوع تست |
|---|---|---|
| `npm run typecheck` | exit 0؛ بدون خطای TypeScript | کامپایل استاتیک |
| `npm run build` | exit 0؛ build در ۳٫۸۴ ثانیه | Vite production |
| `npm run smoke` | ۴۹۹ PASS؛ `All smoke checks passed.` | jsdom؛ شبکهٔ connected شبیه‌سازی‌شده |
| `npm run verify:data` | ۸۱ PASS؛ `All data checks passed.` | mapping و فایل‌ها |
| `npm run verify:admin` | ۸۱ PASS؛ `All admin contract checks passed.` | قراردادهای استاتیک |
| `npm run verify:supabase` | ۴۴ PASS؛ `All Supabase structure checks passed.` | ساختار SQL و اسکن الگویی secrets، نه Remote |
| `npm run test:images` | ۷۶ PASS = ۱۳ سرویس + ۶۳ دیتابیس | شبکهٔ mock + PostgreSQL محلی |
| `npm run test:images:migration` | ۲۱ PASS | ممیزی امنیت/حفظ داده/اجرای مجدد در PostgreSQL محلی |
| `npm run verify:images:bundle` | ۲ PASS | اسکن bundle و رد دو نوع credential privileged قبل از build |
| `npm run test:images:browser` | ۱۲ PASS؛ بدون خطای runtime مرورگر | Chromium واقعی روی build، در Demo |
| `git diff --check` | بدون خروجی/خطا | صحت patch |

خروجی production: `dist/index.html = 1,034.68 kB`؛ gzip برابر `272.20 kB`. وابستگی runtime اضافه نشده است. `@electric-sql/pglite` و `playwright` فقط devDependency برای تست‌اند و در bundle یافت نشدند. اسکن secrets الگویی است، نه ادعای تضمین جامع امنیت.

در اجرای موازی این ممیزی، smoke سه خطای زمان‌بندی در بارگذاری موجودی/پیشنهاد دستور داشت. اجرای مستقل بعدی هر ۴۹۹ بررسی را پاس کرد. بخش‌های مربوط برنامه برای عبور از این خطاها تغییر نکردند؛ این رفتار ناپایدار تست تحت بار، پنهان نشده است.

### دامنهٔ تست اختصاصی تصاویر

- upload موفق، upload ردشده، رد ثبت metadata، پاسخ گم‌شدهٔ Storage، پاسخ گم‌شده پس از commit و نتیجهٔ کاملاً نامعلوم شبکه.
- حفظ فایل زنده، تلاش مجدد بدون تکرار آپلود، صف پاک‌سازی ناموفق و تلاش مجدد موفق.
- قفل عملیات تکراری و بازنشانی pending؛ جایگزینی بدون انتخاب اصلی؛ پاسخ صفر/نامعتبر mutation؛ حذف ردیف ناموجود.
- فایل خالی، spoofed، unsupported و بزرگ‌تر از سقف؛ MIME خالی با محتوای معتبر؛ reset خطای نمایش بعد از تغییر URL.
- اجرای SQL هم بدون migration قدیمی گالری و هم پس از آن؛ در هر حالت ۳۱ بررسی. اجرای دوم و سوم پس از تغییرات مدیر نیز انجام شد.
- بررسی FK/نوع شناسه، mapping صحیح، حفظ اصلی هنگام افزودن، جایگزینی اتمی، کنترل URL قدیمی، عدم اتصال به محصول دیگر، منع حذف آخرین تصویر بدون تأیید، همگامی فرم محصول، دسترسی anon/non-admin و policy permissive گسترده.
- یک بررسی مستقل drift: `products.id` از نوع UUID باعث توقف پیش از تغییر و حفظ ردیف قبلی شد. این مجموعه ۶۳ بررسی دارد؛ با مجموعهٔ جدید ممیزی، مجموع بررسی SQL به ۸۴ رسید.

**PGlite موتور واقعی PostgreSQL تعبیه‌شده است؛ Auth و Storage در تست schemaهای harness هستند. تست HTTP واقعی Supabase، سرویس Storage ابری یا رقابت چند connection واقعی انجام نشده است.** قفل محصول و optimistic concurrency در SQL پیاده‌سازی شده‌اند؛ این محدودیت تست پنهان نشده است.

### مرورگر واقعی و موبایل

Chromium روی خروجی build: decode و preview، upload در Demo، حفظ legacy، خاموش‌کردن make-primary بدون حذف قبلی، ماندگاری پس از Refresh و ورود مجدد، رد GIF خراب، خطای quota حافظه بدون خرابی گالری و نبود خطای runtime.

عرض‌های بررسی‌شده: **۳۲۰، ۳۷۵، ۳۹۰، ۷۶۸، ۱۰۲۴ و ۱۴۴۰ پیکسل**. `scrollWidth` صفحه و modal از عرض قابل نمایش بیشتر نبود. این شبیه‌سازی viewport در Chromium واقعی است، نه ادعای تست روی گوشی فیزیکی یا Safari.

mapping پایهٔ مخزن: ۲۲ شناسه/مسیر با SQL seed تطبیق دارند؛ هر ۲۲ فایل اصلی موجود است؛ مسیر تکراری یا عدم تطابق پیدا نشد. این نتیجه وضعیت زندهٔ دیتابیس را ثابت نمی‌کند.

## تنها اقدام دستی ضروری در Supabase

پس از backup قابل بازیابی، توقف موقت ویرایش مدیران و هماهنگی با زمان انتشار تأییدشدهٔ پنل v2، در **SQL Editor پروژهٔ متصل به سایت**، کل فایل زیر را در یک Query قرار دهید و **Run** کنید:

`supabase/migrations/20260920000000_product_image_safety.sql`

همین فایل جدول، bucket، RLS، RPC و صحت‌سنجی انتهایی را پوشش می‌دهد. خروجی باید نوع‌های `text/text/uuid`، bucket عمومی با سقف `8388608` و `inconsistent_primary_products = 0` را نشان دهد. نیازی به ارسال رمز/توکن یا اجرای جداگانهٔ verify نیست.

راهنمای کامل: `supabase/APPLY-PRODUCT-IMAGES.md`.

فایل قدیمی تصاویر یا seed را برای ترمیم نسخهٔ ۲ دوباره اجرا نکنید. migration جدید داده/فایل را حذف نمی‌کند و **هیچ ستون یا timestamp محصولی را تغییر نمی‌دهد؛ حتی URL فاصله‌ای قبلی حفظ می‌شود**. فقط flag اصلی و timestamp ردیف‌های گالری که واقعاً هماهنگ می‌شوند ممکن است تغییر کنند. URL فاقد ردیف با source=legacy ثبت می‌شود. bucket خصوصی و schema ناسازگار باعث توقف می‌شوند؛ چک‌ها برای عبور از خطا نباید حذف شوند.

Rollback خودکار فقط تا قبل از COMMIT است؛ خطای رسید خواندنی بعد از COMMIT تغییرات ثبت‌شده را برنمی‌گرداند. بازگشت پس از commit به backup/restore هماهنگ با نسخهٔ برنامه نیاز دارد. حذف فیزیکی آیندهٔ Storage از SQL قابل بازیابی نیست. اجرای SQL Editor تاریخچهٔ CLI را ثبت نمی‌کند؛ قبل از هر db push بعدی باید از اجرا نشدن مجدد v1/seed اطمینان حاصل شود.

انتشار کد طبق خواستهٔ شما انجام نشده است؛ سایت زنده تا انتشار مورد تأیید شما از working tree جدید استفاده نمی‌کند. اجرای SQL روی Remote نیز جعل نشده است.

## محدودیت‌های عملیاتی روشن

- فایل bucket عمومی است؛ دانستن URL عکس محصول غیرفعال همچنان امکان دیدن خود فایل را می‌دهد. محدودیت محصول فعال روی metadata عمومی اعمال می‌شود.
- بستن مرورگر در میانهٔ upload، پیش از ثبت/بازنشستگی سرور، ممکن است فایل بی‌ارجاع باقی بگذارد. عمداً برای پاک‌سازی حدسی به عکس زنده دست نمی‌زنیم؛ در نتیجهٔ نامعلوم بهتر است همان پیش‌نمایش حفظ و retry شود.
- ماندگاری Remote پس از logout/login و Refresh هنوز نیازمند آزمون روی پروژهٔ واقعی پس از اعمال SQL است؛ ماندگاری Demo و مسیرهای connected شبیه‌سازی‌شده آزموده شده‌اند.

## فایل‌های تغییرکرده و جدید

### رابط و نمایش
- `src/admin/pages/AdminProductImagesPage.tsx`
- `src/admin/admin.css`
- `src/components/ProductVisual.tsx`

### سرویس و اعتبارسنجی
- `src/services/productImages.ts`
- `src/services/supabaseProductImages.ts`
- `src/utils/imageFile.ts`
- `src/services/catalog.ts`
- `src/services/catalogSync.ts`
- `src/services/supabaseCatalog.ts`
- `src/services/localStore.ts`

### SQL و مستندات
- **جدید:** `supabase/migrations/20260920000000_product_image_safety.sql`
- `supabase/verify.sql`
- `supabase/APPLY-PRODUCT-IMAGES.md`
- `README.md` — فقط بخش مدیریت تصاویر
- **جدید:** `PRODUCT-IMAGES-REPORT-FA.md`
- **جدید:** `supabase/PRODUCT-IMAGE-MIGRATION-AUDIT-FA.md` — بررسی و متن کامل SQL
- **جدید:** `supabase/product-image-safety-final-audit.diff` — diff دقیق ممیزی

### تست و محافظ build
- **جدید:** `scripts/test-product-images.mjs`
- **جدید:** `scripts/test-product-images-db.mjs`
- **جدید:** `scripts/test-product-image-migration-safety.mjs`
- **جدید:** `scripts/test-product-images-browser.mjs`
- **جدید:** `scripts/verify-image-bundle.mjs`
- `scripts/smoke.mjs`
- `scripts/verify-admin.mjs`
- `scripts/verify-supabase.mjs`
- `vite.config.ts`
- `package.json`
- `package-lock.json`

برای تکرار تست مرورگر در محیط معمول: `npx playwright install chromium`، اجرای preview/dev و `npm run test:images:browser`. می‌توان `IMAGE_TEST_BASE_URL` و `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` را برای سرور/Chromium از قبل نصب‌شده تنظیم کرد. در این محیط دانلود مستقیم Playwright با خطای TLS روبه‌رو شد؛ Chromium از بستهٔ تست موقت خارج از Git اجرا شد. هیچ ابزار موقت یا screenshot به فایل‌های محصول اضافه نشده است.

## وضعیت Git

شاخه تغییر نکرده است. تغییرات فقط unstaged working tree هستند؛ commit/push/merge/deploy انجام نشده است. خروجی build، وابستگی‌ها، screenshotها و logهای بررسی در مسیرهای ignored باقی می‌مانند و جزو patch محصول نیستند.
