# انتقال مرحله‌ای ژینو به Worker موجود `zheno`

## وضعیت و شواهد (۲۰۲۶-۱۰-۲۵)

- پروژه React 19، React Router 7، Vite 7 است. build شامل TypeScript check و Vite است؛ خروجی `dist` است.
- `vite-plugin-singlefile` از قبل JS و CSS را داخل `index.html` قرار می‌دهد. این رفتار، `base: '/'` و target مرورگر `es2019` بدون تغییر مانده‌اند. نیازی به افزونه Cloudflare Vite، SSR یا Worker script جدید نیست.
- روش رسمی assets-only: `assets.directory: './dist'` و `assets.not_found_handling: 'single-page-application'` در `wrangler.jsonc`، سپس `npx wrangler deploy`.
- `BrowserRouter` و `siteBase.ts` ریشه و مسیر قدیمی مخزن را پشتیبانی می‌کنند. Router مسیر ناشناخته را با `NotFoundPage` نمایش می‌دهد. در Workers پاسخ shell مسیر ناشناخته HTTP 200 است (soft 404 در SPA)، نه 404 سمت سرور.
- فایل `dist/404.html` برای سازگاری موقت Pages باقی است؛ روی Workers تنظیم صریح SPA مسئول fallback است، نه ترفند 404 Pages. `public/CNAME` روی Workers دامنه ایجاد نمی‌کند.
- تصاویر کاتالوگ پایه و فونت‌ها محلی هستند. تصاویر بارگذاری‌شده پنل همچنان از Supabase Storage و URL ثبت‌شده دیتابیس می‌آیند؛ انتقال فرانت‌اند آن‌ها را به Cloudflare منتقل یا پروکسی نمی‌کند.
- انتشار فعلی `.github/workflows/deploy.yml` روی push به main به Pages ادامه می‌دهد تا هنگام آزمون میزبان قبلی از دسترس خارج نشود. بعد از انتقال موفق، متغیر مخزن `DISABLE_GITHUB_PAGES=true` اجرای build/deploy Pages را متوقف می‌کند.
- هیچ route دامنه‌ای در Wrangler تعریف نشده و هیچ DNS تغییر نکرده است. هیچ منطق سفارش، Auth، RLS، migration یا محتوای فروشگاه تغییر نکرده است.

## ۱. اتصال GitHub از داخل Worker موجود

**Worker جدید یا پروژه Pages جدید نسازید.** ابتدا این تغییرات را از PR در `main` ادغام کنید؛ ادغام به‌تنهایی Cloudflare را deploy نمی‌کند چون هنوز اتصال آن انجام نشده است.

1. Cloudflare Dashboard → **Workers & Pages** → Worker موجود **zheno**.
2. **Settings → Builds → Connect** (در بعضی نسخه‌های UI نام بخش Build است).
3. GitHub را انتخاب و نصب **Cloudflare Workers and Pages** را فقط برای مخزن `m95456749-glitch/zheno-website` مجاز کنید.
4. همان مخزن و production branch برابر `main` را انتخاب کنید. نام Worker باید دقیقاً `zheno` باشد و با `wrangler.jsonc` یکسان بماند.
5. تنظیمات:

| گزینه | مقدار |
|---|---|
| Root directory | ریشه مخزن، `/` یا مقدار خالی پیش‌فرض |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| خروجی استاتیک | `dist`، از طریق `assets.directory` در Wrangler |
| Node build variable | `NODE_VERSION=22.22.3` |

Workers برخلاف Pages الزاماً فیلد Output directory ندارد؛ مسیر خروجی از Wrangler خوانده می‌شود. از `wrangler pages deploy` یا `vite deploy` استفاده نکنید. Wrangler نسخه ثابت در devDependencies و lockfile دارد؛ وابستگی‌های توسعه را هنگام نصب حذف نکنید. `npm run deploy` معادل deploy command بالاست، اما خودش Vite build انجام نمی‌دهد.

6. **Build variables and secrets** را پیش از build مطابق محیط تولید فعلی تنظیم کنید:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` (یا نام قدیمی `VITE_SUPABASE_ANON_KEY`، اگر تولید فعلی از آن استفاده می‌کند)
   - هر متغیر فعال دیگر از `.env.example`، از جمله API، حالت احراز هویت و endpoint دستیار، با همان مقدار محیط فعلی.
   این مقادیر خودکار از GitHub Actions به Cloudflare منتقل نمی‌شوند. دسترسی عامل به فهرست متغیرهای GitHub با HTTP 403 رد شد، بنابراین مقادیر فعلی تأیید نشده‌اند. آن‌ها را در داشبوردها مقایسه کنید، نه در چت یا commit.
   **هشدار:** هر `VITE_*` در کد عمومی مرورگر قرار می‌گیرد، حتی اگر در داشبورد Secret نامیده شود. فقط URL و publishable/anon key مجازند؛ service_role، sb_secret، کلید Azure/AI و رمز دیتابیس هرگز نباید build variable مرورگر باشند. build guard قبلی حفظ شده است.
   متغیرهای صرفاً runtime Worker برای Vite کافی نیستند؛ تغییر build variable نیاز به build مجدد دارد. بدون دو متغیر Supabase برنامه وارد حالت محلی/نمایشی می‌شود؛ آن را به‌اشتباه اتصال سالم پنل تلقی نکنید.
7. Save/Deploy یا اجرای build از داشبورد؛ اگر اتصال فقط منتظر push بود، یک commit بعدی روی main باید build را فعال کند. لاگ باید نصب، `npm run build` و `wrangler deploy` موفق را نشان دهد. توکن لازم برای Workers Builds را خود Cloudflare در حساب مدیریت می‌کند؛ نیازی به ارسال توکن در گفتگو نیست.
8. **Settings → Domains & Routes**: آدرس دقیق workers.dev را از داشبورد بردارید و در صورت غیرفعال‌بودن آن، فعال کنید. نام account subdomain قابل حدس نیست. هیچ Custom Domain اضافه نکنید تا مرحله بعد موفق شود.

اگر نمی‌خواهید قبل از آزمون PR را merge کنید، همین شاخه PR را با preview builds آزمایش کنید؛ این با تغییر production branch به شاخه‌ای دیگر متفاوت است. برای آزمون نهایی همچنان deployment خود `zheno` روی workers.dev و همان تنظیمات production لازم است.

## ۲. آزمون قبل از تغییر DNS

آزمون محلی تکرارپذیر:

```sh
npm ci
npm run build
npm run deploy:check
npm run dev:worker
# در ترمینال دوم
npm run test:worker
npm run smoke
```

پس از deployment واقعی، روی ماشینی با دسترسی به Cloudflare و با **همان commit و build variables تولید**:

```sh
npm ci
npm run build
npm run test:worker -- https://zheno.ACCOUNT-SUBDOMAIN.workers.dev
```

`ACCOUNT-SUBDOMAIN` را از URL واقعی داشبورد جایگزین کنید. تست HTTP هیچ داده‌ای نمی‌نویسد؛ shell چهارده مسیر، بایت‌های تصاویر/فونت‌ها، MIME و عدم redirect به میزبان دیگر را بررسی می‌کند. چون خروجی تک‌فایلی است، JS/CSS مجزا انتظار نمی‌رود؛ کد و style داخل HTML بررسی‌شده‌اند. اگر build محلی متغیرهای متفاوت داشته باشد، مقایسه hash عمداً رد می‌شود.

**چک‌لیست مرورگر واقعی، به‌خصوص بدون VPN در ایران:**

- `/`، `/products` و جزئیات محصول: نمایش واقعی تصاویر، فونت و رابط، نه فقط HTTP 200.
- refresh مستقیم `/products/jelly-pomegranate`، `/cart`، `/checkout`، `/admin/login` و `/admin/product-images`؛ مسیر ناشناخته باید صفحه 404 خود React را نشان دهد.
- Network/Console: خطای بارگذاری، MIME اشتباه، CORS، خطای JS، درخواست ناخواسته به GitHub Pages/Fastly و تصویر خراب وجود نداشته باشد.
- سبد و نمایش مبلغ checkout را بدون ثبت سفارش واقعی بررسی کنید. هر آزمون نوشتنی فقط با محصول/حساب آزمایشی و اجازه مدیر انجام شود.
- پنل با حساب موجود Supabase وارد شود و نقش مدیر با همان RLS قبلی تأیید شود. نمایش حالت demo کافی نیست. گالری و تصاویر **واقعی بارگذاری‌شده روی Storage** نیز باز شوند.
- اگر Edge Functionهای `zhino-assistant` و `zhino-voice` دارای allowlist محدود `ALLOWED_ORIGINS` هستند، فقط origin دقیق آزمایشی را کنار دامنه اصلی در تنظیمات Supabase اضافه کنید؛ allowlist را به `*` تبدیل نکنید. برای بکند سفارشی هم CORS را دقیق تنظیم کنید. هیچ محدودیت امنیتی برای مهاجرت حذف نشود.
- در صورت استفاده از OAuth، لینک جادویی یا بازیابی رمز، URL آزمایشی دقیق را به Supabase Auth → URL Configuration → Redirect URLs اضافه کنید؛ Site URL اصلی را تا cutover تغییر ندهید. نشست localStorage دامنه فعلی به workers.dev منتقل نمی‌شود؛ ورود مجدد در دامنه آزمایشی طبیعی است.
- تست بدون VPN روی حداقل اینترنت موبایل و اینترنت ثابت ایران. دسترسی این محیط از ایران نیست و هیچ تضمینی برای رفع فیلترینگ تمام اپراتورها وجود ندارد. اگر Storage یا API Supabase از ایران مسدود باشد، انتقال استاتیک به‌تنهایی مشکل آن را حل نمی‌کند؛ منشأ خطای شبکه باید جداگانه مشخص شود.

## ۳. اتصال `zheno.devs.surf` ــ فقط پس از موفقیت مرحله ۲

1. مشخص کنید مدیریت DNS و zone این نام در اختیار چه کسی است. داشتن یک زیردامنه رایگان به معنی کنترل zone `devs.surf` نیست.
2. اگر این hostname زیر zone فعال و قابل مدیریت حساب Cloudflare شماست: Worker **zheno → Settings → Domains & Routes → Add → Custom Domain** و نام `zheno.devs.surf`. Cloudflare را برای ساخت رکورد لازم و صدور TLS دنبال کنید. اگر رکورد قدیمی تداخل دارد، فقط پس از تأیید تست و ثبت مقادیر قبلی آن را تغییر دهید.
3. اگر zone/واگذاری DNS در اختیار شما نیست، از مالک/ارائه‌دهنده `devs.surf` بخواهید روش اتصال سازگار با Workers Custom Domains یا واگذاری DNS قابل استفاده را فراهم کند. صرف تنظیم CNAME به workers.dev را اتصال تأییدشده تلقی نکنید؛ routing hostname و TLS باید واقعاً برقرار باشند. بدون این امکان، از دامنه تحت کنترل خود استفاده کنید و workers.dev را به‌عنوان موقت نگه دارید.
4. پس از Active شدن دامنه و گواهی، صفحه اصلی، assetها، refresh مسیرها، پنل و Supabase را روی دامنه اصلی و بدون VPN دوباره تست کنید. اگر Auth Site URL نیازمند اصلاح است، اکنون آن را تنظیم کنید.
5. فقط بعد از این تأیید: GitHub → Repository Settings → Secrets and variables → Actions → **Variables** → `DISABLE_GITHUB_PAGES=true`؛ workflow قدیمی دیگر deploy نمی‌کند. سپس Custom Domain مربوط به GitHub Pages و رکورد قدیمی را در تنظیمات مربوط پاک کنید. `public/CNAME` و `.nojekyll` را در cleanup بعدی می‌توان حذف کرد؛ در این مرحله برای rollback حفظ شده‌اند. در صورت نیاز Pages publication را نیز غیرفعال کنید.
6. برای rollback مقدار DNS قبلی و میزبان Pages را تا پایان دوره اطمینان نگه دارید. تا وقتی Pages دوباره لازم است متغیر توقف را به false برگردانید. هیچ migration یا تغییر داده‌ای برای rollback لازم نیست.

## نتایج اجرا در محیط عامل

- `npm ci`: موفق؛ Node 22.22.3.
- `npm run build`: موفق؛ TypeScript و Vite 7.3.7، HTML حدود ۱٫۰۵ مگابایت (gzip حدود ۲۷۶ کیلوبایت).
- `npm run deploy:check`: موفق؛ ۱۲۵ asset خوانده شد، بدون انتشار واقعی.
- `npm run test:worker` علیه Wrangler محلی: موفق؛ ۱۴ مسیر و ۱۰۹ فایل تصویر/فونت با hash و MIME صحیح. JS/CSS درون HTML تأیید شد. هشدار دریافت Request.cf در شبیه‌ساز به‌علت محدودیت شبکه بود و مانع سرو محلی نشد.
- `verify:supabase`، `verify:data`، `verify:admin`، `smoke` و `verify:images:bundle`: موفق. اسکن bundle و رد کلیدهای privileged هم موفق بود.
- `test:images`: موفق؛ ۲۴ تست سرویس با شبکه mock و ۳۳ بررسی PostgreSQL محلی، به‌علاوه بررسی rollback نوع ستون ناسازگار.
- `test:images:migration`: ۲۳ تست ایمنی محلی موفق؛ `test:images:automation`: ۳۴ تست موفق.
- audit اولیه سه high شامل Vite، source-map-js و undici داشت؛ به‌روزرسانی سازگار lockfile و override محدود `undici@7.29.1 → 7.30.1` برای وابستگی ابزار Miniflare اعمال شد. نسخه major عوض نشده و وابستگی‌های آزمون وارد bundle نمی‌شوند. audit نهایی صفر است.
- CI علاوه بر build و smoke قبلی، اکنون dry-run پیکربندی Workers را نیز اجرا می‌کند.
- **انجام نشده:** اتصال داشبورد Cloudflare، deploy واقعی، آزمون URL واقعی workers.dev، اتصال زنده Supabase، تست اپراتورهای ایران و تغییر DNS. این محیط اعتبارنامه Cloudflare ندارد و دسترسی خروجی آن فقط به GitHub و registryهای بسته محدود است. موفقیت شبیه‌ساز یا dry-run اثبات انتشار نیست.

## منابع رسمی انتخاب روش

- https://developers.cloudflare.com/workers/static-assets/get-started/
- https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
- https://developers.cloudflare.com/workers/ci-cd/builds/#connect-an-existing-worker
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/

متن فعلی این مستندات از مخزن رسمی `cloudflare/cloudflare-docs` شاخه production بررسی شد؛ روش مورد استفاده Workers Static Assets است، نه Cloudflare Pages.

## مسیر نهایی Preview رسمی PR (بدون انتشار تولید)

برای رفع خطای واقعی `wrangler preview`، بلوک `previews: {}` در Wrangler اضافه شده است. طبق مستندات رسمی برای Worker صرفاً استاتیک، assets و compatibility در سطح بالا می‌مانند و وقتی binding جداگانه نداریم، بلوک خالی صحیح است. Wrangler فعلی 4.152.0 از حداقل نسخه موردنیاز 4.135.0 جدیدتر است.

- دستور خودکار شاخه PR همان `npx wrangler preview` باقی می‌ماند؛ هیچ تغییر داشبوردی لازم نیست.
- Production branch همان `main` و دستور تولید همان `npx wrangler deploy` است؛ اجرا یا merge آن همچنان نیازمند تأیید مالک است.
- commit محلی منتشرنشده dc17454 از مسیر نهایی حذف شده؛ scriptهای versions upload و راهنمای وابسته به Preview command مخفی وارد PR نمی‌شوند.
- در Workers Builds، اگر `WORKERS_CI=1` و `WORKERS_CI_BRANCH` غیر از main باشد، Vite اتصال‌های Supabase، API سفارشی و endpoint دستیار را از build حذف و حالت admin را demo می‌کند. Preview عمداً به دیتابیس واقعی متصل نیست. این رفتار Production را تغییر نمی‌دهد.
- `previews` به‌تنهایی متغیرهای Vite مرورگر را جدا نمی‌کند؛ برای همین محدودسازی build اضافه شده است. `npm run test:preview:isolation` با endpointهای ساختگی ثابت می‌کند این مقادیر وارد HTML نمی‌شوند. هیچ کلید واقعی در این تست نیست.
- تست محلی `npm run smoke` رفتار مسیرها، cart و guardهای پنل را می‌سنجد؛ HTTP assets با `npm run test:worker` در شبیه‌ساز بررسی می‌شود. این‌ها اثبات دسترسی زنده از ایران یا اتصال Supabase نیستند.
- با push فقط به شاخه PR، Workers Builds باید Preview رسمی را بسازد؛ URL واقعی را باید از Check یا کامنت Cloudflare دریافت و سپس مشاهده کرد. تا قبل از آن هیچ موفقیت آنلاینی ادعا نمی‌شود.
- اتصال Supabase و تصاویر آپلودشده روی Storage در این Preview آفلاین عمداً تأیید نمی‌شوند. آزمایش بعدی آن‌ها باید با پروژه staging یا برنامه جداگانه read-only باشد؛ روی داده واقعی هیچ سفارش/آپلود/حذفی اجرا نشود.

منابع رسمی بررسی‌شده:
- https://developers.cloudflare.com/workers/previews/get-started/
- https://developers.cloudflare.com/workers/previews/configuration/
- https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
