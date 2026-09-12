# ZHINO — پودر ژله و کاستر

وبسایت فروشگاهی ژینو — React + TypeScript + Vite + Tailwind CSS، با لایه داده آماده برای Supabase/PostgreSQL.

## راه‌اندازی محلی

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run verify:data
npm run smoke
```

کپی `.env.example` به `.env.local` اختیاری است. بدون متغیرهای Supabase، storefront با داده‌های رسمی داخل `src/data/`، تصاویر واقعی `public/images/`، سبد خرید و checkout فعلی کار می‌کند و هیچ درخواست backend ارسال نمی‌کند.

## اتصال Supabase

۱. در Supabase یک پروژه بسازید و متغیرهای زیر را فقط در محیط build/deployment تنظیم کنید:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
VITE_ADMIN_AUTH_MODE=supabase
```

`VITE_SUPABASE_ANON_KEY` کلید عمومی مرورگر است؛ با RLS محدود می‌شود. **Service-role key را هرگز در `.env` قابل انتشار، Vite، frontend یا Git قرار ندهید.**

۲. migrationها را با Supabase CLI اجرا کنید:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

- `supabase/migrations/20260912000000_initial_schema.sql` جداول، triggerها، RPCها و RLS را می‌سازد.
- `supabase/migrations/20260912000001_seed_catalog.sql` ۲۲ محصول رسمی، ۲۲ تصویر/مسیر واقعی، variantها، موجودی اولیه، دستورها و محتوای فعلی سایت را seed می‌کند.

۳. برای ورود مدیریت، یک کاربر را در Supabase Auth بسازید و در `app_metadata` آن نقش زیر را از Dashboard یا یک ابزار trusted server-side تنظیم کنید:

```json
{"role":"admin"}
```

این مقدار از frontend قابل جعل نیست؛ policyهای PostgreSQL تابع `public.is_admin()` را روی JWT بررسی می‌کنند. رمز عبور توسط Supabase Auth مدیریت می‌شود و این پروژه آن را ذخیره نمی‌کند.

## ساختار لایه داده

- `src/` — UI و routeها؛ هیچ component مستقیماً query Supabase نمی‌زند.
- `src/services/` — API/service layer موجود storefront و admin: `catalog`, `orderStore`, `recipeStore`, `settings`, `siteContent`, `api`.
- `src/services/supabase/client.ts` — تنها محل ساخت browser client با URL و publishable/anon key.
- `src/services/supabase/repository.ts` — تمام queryها، RPCها، mapperهای PostgreSQL و عملیات admin.
- `src/services/supabase/database.types.ts` — قرارداد TypeScript جداول و functionهای migration.
- `src/services/supabase/hydration.tsx` — bootstrap اختیاری و best-effort؛ نبودن project/migration باعث white-screen نمی‌شود.
- `supabase/migrations/` — schema/RLS/seed قابل version-control.

با credentials معتبر، catalog، موجودی، orders، recipes، site content و site settings از Supabase hydrate می‌شوند؛ admin writeها نیز از همان service layer به PostgreSQL می‌روند. بدون credentials، fallback محلی فقط برای حفظ storefront و preview موجود پروژه فعال است؛ این fallback احراز هویت یا امنیت production نیست.

## مدل داده و امنیت

- `products` + `flavors` + `product_variants` — نام، category، flavor، وزن، قیمت، SKU، تصویر، active و timestampها.
- `inventory` — `current_stock`، `low_stock_threshold`، active و timestamp؛ تغییر موجودی admin از RPC اتمیک استفاده می‌کند.
- `orders` + `order_items` — customer/shipping، snapshot نام و قیمت، quantity، unit price، total price، status و timestampها.
- `recipes` — مواد و مراحل رسمی، category، active و timestampها.
- `site_content` + `site_settings` — متن‌های فعلی سایت، هزینه/آستانه ارسال و low-stock threshold.
- statusهای سفارش دقیقاً: `new`, `confirmed`, `preparing`, `shipped`, `completed`, `cancelled`.
- storefront فقط رکوردهای public/active را می‌خواند؛ داده سفارش و مشتری فقط برای admin دارای JWT نقش `admin` قابل خواندن است.
- checkout عمومی فقط RPC `create_order` را صدا می‌زند. RPC قیمت‌ها و هزینه ارسال را از DB محاسبه می‌کند، موجودی را lock/decrement می‌کند و از oversell/total جعلی جلوگیری می‌کند.
- هیچ policy عمومی برای read سفارش‌ها و هیچ service-role key در client وجود ندارد.

## ویژگی‌های فعلی که حفظ شده‌اند

Cart، checkout، routing، localStorage سبد خرید، منطق موجودی/ارسال رایگان، صداها، داده و تصاویر واقعی محصولات، رفتار responsive، ورود مخفی `/admin/login` و تمام صفحات فعلی admin حفظ شده‌اند. storefront قبل از تنظیم credentials نیز load می‌شود.

### Admin

مسیرها: `/admin/login`، `/admin/dashboard`، `/admin/products`، `/admin/orders`، `/admin/inventory`، `/admin/recipes`، `/admin/site-content` و `/admin/settings`.

حالت پیش‌نمایش `VITE_ADMIN_AUTH_MODE=demo` عمداً غیرامن است و فقط برای تست بدون backend نگه داشته شده؛ UI آن را با «نمایشی» اعلام می‌کند. برای production از `supabase` و Supabase Auth استفاده کنید. در حالت Supabase، admin UI همان UI فعلی را نگه می‌دارد اما خواندن/نوشتن از repository و RLS انجام می‌شود، نه از mock API یا credential جعلی.

### تصاویر

مسیرهای `image_url` seed همان فایل‌های واقعی موجود در `public/images/products/` هستند. هیچ تصویر محصولی حذف، تولید یا با تصویر جدید جایگزین نشده است.

## استقرار

برای دامنه production یعنی `https://zheno.devs.surf`، متغیرهای Supabase را در تنظیمات provider/build secret تنظیم کنید، نه در Git. `vite.config.ts` همچنان base ریشه را نگه می‌دارد و fallback `404.html` برای routeهای deep-link فعلی حفظ شده است.
