# ZHINO — پودر ژله و کاستر

وبسایت فروشگاهی ژینو — ساخته شده با React + TypeScript + Vite + Tailwind CSS

## راه‌اندازی

```bash
# نصب وابستگی‌ها
npm install

# اجرای محیط توسعه
npm run dev

# ساخت نسخه نهایی
npm run build

# پیش‌نمایش نسخه نهایی
npm run preview
```

## ساختار پروژه

```
src/
  components/    # کامپوننت‌های مشترک
  pages/         # صفحات اصلی
  layouts/       # لایه‌های صفحه
  data/          # داده‌های محصولات و دستورها (داده‌های پایه، دست‌نخورده)
  services/      # سرویس‌ها (صدا، پرداخت و...) + لایه داده مشترک فروشگاه/پنل
  hooks/         # هوک‌های سفارشی
  context/       # کانتکست‌های React
  utils/         # توابع کمکی
  types/         # تایپ‌های TypeScript
  admin/         # پنل مدیریت (رابط، ناوبری، احراز هویت)
```

## محصولات

### پودر ژله
- انار، توت فرنگی، هلو، تمشک، بلوبری، پرتقال، آناناس، آلبالو

### پودر کاستر
- موز، طالبی، توت فرنگی، کاکائو، هفت میوه، پرتقال، محلبی وانیلی

## پنل مدیریت (Admin)

- **ورودی:** سه پرچم کوچک و بی‌برچسب (🇮🇷 🇹🇷 🇮🇶) در انتهای نوار لینک‌های پایین فوتر؛
  کلیک روی آن‌ها صفحه ورود پنل را می‌گشاید.
- **مسیرها:** `/admin/login` (ورود) و `/admin/dashboard`، `/admin/products`،
  `/admin/orders`، `/admin/inventory`، `/admin/recipes`، `/admin/site-content`،
  `/admin/settings`.
- **احراز هویت:** در این فاز احراز هویت واقعی وجود ندارد — هیچ گذرواژه‌ای در
  فرانت‌اند ذخیره یا بررسی نمی‌شود و نشست فقط در حافظه تب جاری است؛ رابط ورود
  «نمایشی» است و همین را صریح نشان می‌دهد. برای اتصال به بکند:
  `src/admin/auth/authService.ts` (providerهای demo/api) و تنظیم
  `VITE_ADMIN_AUTH_MODE=api` همراه با `VITE_API_BASE_URL`.
- **داده‌های پنل:** overlay روی داده‌های پایه در localStorage همین مرورگر
  (کلیدها با پیشوند `zhino_admin_`):
  - `zhino_admin_catalog_v1` — ویرایش/افزودن/حذف/غیرفعال‌کردن محصولات + موجودی
  - `zhino_admin_orders_v1` — سفارش‌های ثبت‌شده از تسویه‌حساب (حالت بدون بکند)
  - `zhino_admin_recipes_v1` — ویرایش دستورها
  - `zhino_admin_content_v1` — متن‌های قابل‌ویرایش سایت
  - `zhino_admin_settings_v1` — آستانه ارسال رایگان، هزینه‌های ارسال، آستانه کم‌موجودی
- **معماری:** فروشگاه فقط از `src/services/` (catalog, settings, content, recipes,
  orders) می‌خواند؛ داده‌های پایه در `src/data/` دست‌نخورده‌اند. اتصال بکند فقط
  تعویض بدنه توابع سرویس‌ها (fetch) است و نه بازسازی پنل یا فروشگاه.
  تا زمانی که مدیری تغییری ذخیره نکند، خروجی سایت دقیقاً مثل قبل است.

## آماده‌سازی برای بکند

- مدل داده در `src/types/index.ts`
- لایه سرویس در `src/services/`
- برای اتصال به بکند، API calls را در `src/services/` اضافه کنید
- متغیرهای محیطی را از `.env.example` کپی کنید

## اتصال Supabase

**وضعیت فعلی:** در این شاخه هنوز هیچ کد Supabase اجرا نمی‌شود — نه وابستگی
`@supabase/supabase-js`، نه `src/services/supabase/`، نه `supabase/migrations/`.
فروشگاه و پنل دقیقاً مثل قبل از `src/data/` (دادهٔ پایه) به‌علاوهٔ overlay در
localStorage می‌خوانند و تا وقتی متغیر محیطی تنظیم نشده باشد **هیچ درخواست
شبکه‌ای** ارسال نمی‌کنند.

لایهٔ اتصال (کلاینت مرورگر، repository، RLS، migrationها و seed، ورود پنل با
Supabase Auth) در **PR #31** («Prepare ZHINO for Supabase backend and
PostgreSQL») آماده و **ادغام‌نشده** است. تا زمانی که آن PR ادغام نشود، حتی با
دیتابیس پرشده هم سایت تغییری نمی‌بیند: هیچ کدی در `main` وجود متغیرهای
`VITE_SUPABASE_*` را نمی‌خواند.

**چک‌لیست فعال‌سازی روی پروژهٔ خالی (به همین ترتیب):**

1. **schema** — در Dashboard ← SQL Editor یک query جدید، تمام محتوای
   `supabase/migrations/20260912000000_initial_schema.sql` را اجرا کنید
   (یا `supabase link --project-ref <ref> && supabase db push`).
   باید ۹ جدول `public` بسازد: `flavors`, `products`, `product_variants`,
   `inventory`, `recipes`, `site_content`, `site_settings`, `orders`,
   `order_items` + RLS با ۱۷ سیاست + چهار تابع `is_admin`,
   `set_inventory_stock`, `adjust_inventory`, `create_order` + سه enum
   (`product_category`, `order_status`, `shipping_method`).
2. **seed** — در یک query جداگانه و **بعد از** مرحلهٔ ۱، تمام محتوای
   `supabase/migrations/20260912000001_seed_catalog.sql`. ترتیب دو فایل را
   عوض نکنید.
3. **راستی‌آزمی داده** — تمام queryهای read-only `supabase/verify.sql`.
   countهای مورد انتظار به همان ترتیب ستون‌های پرسش ۷: `flavors=22`,
   `products=22`, `variants=22`, `inventory=22`, `recipes=2`,
   `content_rows=5`, `settings_rows=1`, و ۲۲ مسیر تصویر با پیشوند
   `images/products/%`. هر عددِ دیگری یعنی seed ناقص اجرا شده.
4. **کاربر پنل** — Authentication ← Users ← Add user (ایمیل + گذرواژه)، سپس
   روی همان کاربر `{"role":"admin"}` را در **Raw App Metadata** بگذارید؛
   سیاست‌های RLS نوشتن را بر همین اساس مجاز می‌کنند. گذرواژه هیچ‌گاه در این
   مخزن یا در لاگ CI قرار نمی‌گیرد.
5. **متغیرهای محیطی build** — طبق جدول پایین در تنظیمات مخزن؛ مقدارها هرگز
   commit نمی‌شوند. تا قبل از مرحلهٔ ۶ مقدار `VITE_ADMIN_AUTH_MODE` روی
   `demo` بماند تا ورود پنل مثل امروز کار کند.
6. **ادغام لایهٔ اتصال (PR #31)** پس از بازبینی انسانی، و بعد از آن یک
   راستی‌آزمی نهاده روی سایت استقرار‌یافته (خروجی `npm run check:bundle` در
   run لاگ GitHub Actions باید `reached the bundle` را نشان دهد).

| متغیر | محل تنظیم | مقدار |
|-------|-----------|-------|
| `VITE_SUPABASE_URL` | Settings ← Secrets and variables ← Actions ← **Variables** | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | همان‌جا ← **Secrets** | کلید anon / publishable مرورگر |
| `VITE_ADMIN_AUTH_MODE` | **Variables** (اختیاری) | `demo` (پیش‌فرض) تا زمان فعال‌شدن اتصال |

**قاعدهٔ امنیتی:** Vite هر مقدار `VITE_*` را داخل باندل عمومی قرار می‌دهد؛ پس
کلید `service_role`/`secret` هرگز نباید در این متغیرها، در `src/`، یا در خروجی
`dist/` ظاهر شود. دسترسی سروری فقط در Edge Functions / بکند می‌ماند و از
فرانت‌اند خوانده نمی‌شود. این قاعده با دو گارد مکانیکی شده است:

```bash
npm run check:env     # قبل از build: env + سورس فرانت‌اند (خودکار با npm run build)
npm run check:bundle  # بعد از build: ممیزی dist/ + تأیید رسیدن URL به باندل
```

هر دو در CI (`deploy.yml`) اجرا می‌شوند. `check:bundle` علاوه بر ممیزی
خروجی، پیکربندی را هم تأیید می‌کند: اگر شاخه‌ای کد اتصال داشته باشد و
`VITE_SUPABASE_URL` تنظیم شده ولی مقدارش به باندل نرسیده باشد، build رد
می‌شود (نشانهٔ تنظیم‌نشدن var/secret در محیط deployment)؛ تا وقتی کد اتصال وجود
نداشته باشد، همین حالت به‌صورت WARN گزارش و build رد نمی‌شود. مقدار کلیدها
هیچ‌گاه در لاگ چاپ نمی‌شود (فقط طول آن‌ها).

## تکنولوژی

- **React 19** + TypeScript
- **Vite 7** — build tool سریع
- **Tailwind CSS v4** — استایل
- **React Router v7** — مسیریابی
- Web Audio API — فیدبک صوتی
- localStorage — ذخیره‌سازی سبد خرید

## زبان و جهت

- RTL (راست به چپ)
- فارسی / Persian
- فونت Vazirmatn

## استقرار در GitHub Pages

- آدرس انتشار: `https://<user>.github.io/zheno-website/`
- در `vite.config.ts` مقدار `base` برابر `/zheno-website/` تنظیم شده است.
- استقرار با GitHub Actions انجام می‌شود (`.github/workflows/deploy.yml`):
  `npm ci` ← `npm run build` ← انتشار پوشه `dist`.
- در تنظیمات مخزن: Settings ← Pages ← Source باید روی **GitHub Actions** باشد.
- فایل `dist/404.html` به‌صورت خودکار از `index.html` ساخته می‌شود تا رفرش
  صفحه‌های داخلی (مثل `/products/...` یا `/cart`) صفحه خالی برنگرداند.
- فایل `public/.nojekyll` از پردازش Jekyll روی خروجی جلوگیری می‌کند.
- حالت بدون بکند: اگر `VITE_API_BASE_URL` خالی باشد، تسویه‌حساب به‌صورت
  محلی ثبت و تأیید می‌شود؛ با اتصال بکند، کاربر به درگاه پرداخت هدایت می‌شود.
