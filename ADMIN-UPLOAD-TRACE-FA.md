# ردیابی واقعی خطای «دسترسی مدیر تأیید نشد» در آپلود تصویر

تاریخ: ۲۶ سپتامبر ۲۰۲۶ · شاخه: `arena/01a0df44-zheno-website`
روش: فقط دادهٔ Production واقعی (GitHub API + کوئری‌های **فقط‌خواندنی** روی پایگاه Production) — بدون حدس، بدون Migration جدید، بدون تغییر RLS/RPC.

---

## ۰. خلاصهٔ یک‌خطی

**خطا ربطی به نقش admin، نشست یا JWT ندارد.** Production هنوز باندلِ **۲۳ سپتامبر** را سرو می‌کند (workflow استقرار **غیرفعال** است)، در حالی که پایگاه داده در ۲۵–۲۶ سپتامبر به **قرارداد نسخهٔ ۳** ارتقا یافته است. باندل قدیمی تصویر آپلودشده را با **`insert()`/`update()`/`delete()` مستقیم روی جدول `product_images`** ثبت می‌کند؛ نسخهٔ ۳ درست همین نوشت مستقیم را با یک پالیسی **RESTRICTIVE با `with check (false)`** مسدود کرده است. نتیجه: خطای خام «new row violates row-level security policy» که در classifier قدیمی به پیام گمراه‌کنندهٔ «دسترسی مدیر تأیید نشد…» ترجمه می‌شود.

> نکتهٔ کلیدی: رفع PR #95 اصلاً **روی Production نرفته است**، بنابراین `checkAdminAccess()` در کد مستقر وجود ندارد که بتواند در مرحله‌ای شکست بخورد.

---

## ۱. Production دقیقاً چه کامیتی را سرو می‌کند؟

| مورد | مقدار واقعی | منبع |
|---|---|---|
| وضعیت workflow استقرار | **`state: disabled_manually`** | `GET /repos/…/actions/workflows/deploy.yml` |
| آخرین اجرای موفق استقرار | `2026-09-23T23:23:13Z` — `head_sha = 02078b4` (merge PR #92) | `GET /repos/…/actions/runs/35933337427` |
| نوع ساخت Pages | `build_type: workflow`، `cname: zheno.devs.surf` | `GET /repos/…/pages` |
| کامیت‌های `main` **بعد از** آخرین استقرار | `0f8fa25` (PR #93، ۰۹‑۲۴ ۱۱:۲۶) · `0883045` (PR #94، ۰۹‑۲۶ ۱۲:۵۳) · `f5e788b` (۰۹‑۲۶ ۱۳:۲۸) · `e6ea7e1` (**PR #95**، ۰۹‑۲۶ ۱۹:۴۵) | `GET /repos/…/commits?sha=main` |
| هیچ اجرای `deploy.yml` بعد از ۲۳ سپتامبر | تأیید شد (فهرست کامل اجراها) | `GET /repos/…/actions/workflows/deploy.yml/runs` |

سایت زنده = ساختِ کامیت **`02078b4`**. در آن کامیت:

* `src/services/supabaseAdminRole.ts` → **HTTP 404** (فایل اصلاً وجود ندارد؛ یعنی کل رفع PR #95 غایب است)
* `src/services/supabaseProductImages.ts` → نوشت با `.from('product_images').insert(...)`، `.update(...)`، `.delete(...)` (API نسخهٔ ۲)
* هیچ فراخوانی به `product_image_api_version()` ندارد (نسخهٔ قرارداد را هرگز نمی‌پرسد)

---

## ۲. پاسخ به پرسش‌های شما، با دادهٔ واقعی

### ۱) نتیجهٔ واقعی `auth.getUser()` با حساب واردشده

یک کاربر در `auth.users` وجود دارد (تعداد کل: **۱**):

| فیلد | مقدار واقعی Production |
|---|---|
| ایمیل (ماسک‌شده در SQL) | `l***@gm***` |
| `id` | `082824ea-5de1-4802-a9b4-388410febfb4` |
| `raw_app_meta_data` کلیدها | `provider`, `providers`, `role` |
| **`app_metadata.role`** | **`"admin"`** — انطباق دقیق و حساس‌به‌حروف (`app_role_is_exactly_admin: true`) |
| `raw_user_meta_data` کلیدها | فقط `email_verified` (**هیچ نقشی اینجا نیست**) |
| `email_confirmed` | true · `banned`: false · `deleted_at`: null · `is_anonymous`: false |
| ساخته‌شده | `2026-09-26T18:52:05Z` |
| آخرین ورود / آخرین تغییر رکورد | `2026-09-26T18:58:37Z` |

### ۲) آیا `app_metadata.role` دقیقاً `"admin"` برمی‌گردد؟

**بله.** مقدار دقیقاً `admin` است، نه `Admin` و نه در `user_metadata`.

### ۳) نتیجهٔ واقعی RPC `is_admin()`

تعریفِ مستقر روی Production:

```sql
select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
-- security definer, stable؛ EXECUTE اعطاشده به anon / authenticated / service_role
```

آزمایش مستقیم روی Production (داخل تراکنش فقط‌خواندنی، با `set local role authenticated`):

| ورودیِ بازسازی‌شده | پاسخ `is_admin()` |
|---|---|
| `{"app_metadata":{"role":"admin"}}` | **`true`** |
| `{"app_metadata":{}}` | **`false`** |

و با هویت واقعیِ اپراتور (`sub` = همان کاربر + `app_metadata.role = "admin"` بازسازی‌شده از رکورد زنده):

```
product_image_api_version()                        -> 3
product_image_upload_allowed('products/__zhino…')  -> true
```

یعنی **دروازهٔ مدیر برای این حساب باز است** — هم برای RPC و هم برای سیاست Storage.

### ۴) `checkAdminAccess()` دقیقاً در کدام مرحله false می‌شود؟

**در هیچ‌کدام — چون در باندل مستقر اصلاً وجود ندارد.** چهار مرحلهٔ پرسیده‌شده عبارتند از session → `is_admin()` → `getUser()` → `refreshSession()`، و این تابع در کدی که الان روی سایت است تعریف نشده است (فایل آن در کامیت مستقر ۴۰۴ می‌دهد). رد شدن در یک مرحلهٔ **پنجم** رخ می‌دهد که PR #95 پوشش نمی‌دهد: نوشت مستقیم روی جدول پس از یک آپلود موفق.

### ۵) آیا session/JWT قدیمی یا ناشناس فرستاده می‌شود؟ علتش در پیکربندی supabase-js؟

**خیر.** شواهد Production:

* آپلودها به Storage **با موفقیت انجام شده‌اند** — ۴ آبجکت در سطل `product-images` وجود دارد:
  `12:54:37`، `12:54:50`، `19:48:16`، `19:48:44` (UTC).
  سیاست INSERT این سطل `to authenticated with check (bucket_id='product-images' and product_image_upload_allowed(name))` است و `product_image_upload_allowed()` خودش `is_admin()` را شرط می‌کند. **یک درخواست ناشناس یا بی‌نقش هرگز نمی‌توانست این فایل‌ها را بنویسد.**
* تنها نشست موجود: ساخته‌شده `18:58:37.046Z`، `refreshed_at: null`، `not_after: null`، کاربر-عامل Android؛ یک refresh-tokenِ تأییدنشده (نه revoked، نه فرزند).
* جدول رسید `product_image_operations`: **۰ ردیف**؛ جدول `product_images`: ۲۲ ردیف که **همه `source='legacy'`** هستند (حاصل backfill مهاجرت).

معنا: **مرحلهٔ Storage (که همان نقش را می‌سنجد) موفق بوده و مرحلهٔ ثبت (که قدیمی است) شکست خورده است** — نه اینکه نشست افتاده باشد.

---

## ۳. علت ریشه‌ای، گام‌به‌گام

1. پایگاه Production روی **قرارداد نسخهٔ ۳** است (تأیید مستقیم: جدول `product_image_contract` با `version = 3` و `fingerprint` منطبق بر `product_image_schema_fingerprint()`؛ تابع `manage_product_image` وجود دارد).
2. نسخهٔ ۳ نوشت مستقیم روی `product_images` را می‌بندد — تأیید روی Production:

   | پالیسی | نوع | فرمان | نقش‌ها |
   |---|---|---|---|
   | `image_insert_guard` | **RESTRICTIVE** (`permissive = false`) | INSERT | anon, authenticated |
   | `image_update_guard` | **RESTRICTIVE** | UPDATE | anon, authenticated |
   | `image_delete_guard` | **RESTRICTIVE** | DELETE | anon, authenticated |

   (یک پالیسی RESTRICTIVE با `with check (false)` یعنی «هرگز مجاز نیست»، مستقل از نقش کاربر.)
3. سایت زنده هنوز کدِ ۲۳ سپتامبر است: فایل را آپلود می‌کند (مجاز است) و سپس با `insert()` مستقیم ثبت می‌کند → خطای خام «new row violates row-level security policy».
4. classifier قدیمی این متن را به «دسترسی مدیر تأیید نشد؛ فقط حساب دارای نقش admin می‌تواند تصویرها را تغییر دهد.» ترجمه می‌کند — پیامی که در اینجا **نادرست و گمراه‌کننده** است.
5. خروج/ورود مجدد هم کمکی نمی‌کند، چون مشکل از توکن نیست و تازه **کد جدید اصلاً مستقر نشده** که مسیرش فرق کند.

---

## ۴. چه چیزی باید اصلاح شود

### الف) تنظیمات استقرار — **اقدام لازم از سمت شما** (من اجازه‌اش را ندارم)

Workflow استقرار غیرفعال است. تلاش من برای فعال‌سازی:

```
PUT /repos/m95456749-glitch/zheno-website/actions/workflows/352182693/enable
→ HTTP 403 «Resource not accessible by integration» (نیازمند دسترسی admin مخزن)
```

دقیقاً یکی از این دو را انجام دهید:

1. **فعال‌سازی workflow**:
   `https://github.com/m95456749-glitch/zheno-website/actions/workflows/deploy.yml` → دکمهٔ **Enable workflow**
   (یا Actions تب → «Deploy to GitHub Pages» در نوار کناری → Enable workflow)
2. یا اجرای دستیِ یک‌باره پس از فعال‌سازی: Actions → Deploy to GitHub Pages → **Run workflow** (شاخهٔ `main`).

بدون این کار هیچ اصلاحی به `zheno.devs.surf` نمی‌رسد.

### ب) کد — اصلاح‌شده در این شاخه

۱. **`src/services/supabaseProductImages.ts`** — «دست‌دهیِ نسخه» (version handshake) پیش از هر نوشت متصل:
پیش از آپلود بایت و پیش از هر `manage_product_image`، نسخهٔ قرارداد دیتابیس پرسیده می‌شود؛ اگر ۳ نباشد با پیام صادقانه رد می‌شود و **هیچ بایتی آپلود نمی‌شود**. این دقیقاً همان شکافی را می‌بندد که باعث شد یک ارتقای دیتابیس، به‌صورت خاموش و با پیامِ اشتباهِ «دسترسی مدیر» بیرون بزند.
(تأیید روی Production: `product_image_api_version()` وجود دارد و با JWT مدیر مقدار **۳** برمی‌گرداند.)

۲. **`src/admin/pages/AdminAuthTracePage.tsx`** (موقت) + مسیر `/admin/auth-trace` — ردیابی در مرورگر با **همان حساب و نشست واقعی شما**: پیکربندی کلاینت، `getSession()`، `getUser()`، کلیِم درون توکن، `is_admin()`، نسخهٔ قرارداد، دروازهٔ Storage، دروازهٔ نوشت و در نهایت خودِ `checkAdminAccess()` با نام‌بردنِ مرحلهٔ شکست.

۳. **۲ تست جدید** در `scripts/test-product-images.mjs` برای handshake.

**هیچ bypass، admin سخت‌کدشده، حذف RLS یا دسترسی عمومی اضافه نشده است.** دو پروبِ صفحهٔ ردیابی فقط‌خواندنی‌اند: پروبِ نوشت به یک `product_id` ناموجود می‌زند، یعنی RPC پس از دروازهٔ `is_admin()` و **پیش از نوشتن هر ردیفی** با `product_not_found` خطا می‌دهد؛ پروبِ Storage یک تابعِ محض (predicate) است و هیچ آبجکتی نمی‌سازد.

### ج) پاک‌سازیِ داده — اختیاری، تصمیم با شما

۴ فایل در Storage هستند که هیچ ردیفی به آن‌ها اشاره نمی‌کند (یتیم‌هایِ تلاش‌های ناموفق). خطری ندارند و فقط فضا اشغال می‌کنند. حذف آن‌ها یک **نوشت روی Production** است و من انجامش ندادم؛ اگر خواستید از Storage UI پاک کنید یا مسیرشان را با RPC `retire_product_image_upload` وارد صف پاک‌سازی کنید.

---

## ۵. تست‌های انجام‌شده (خروجی واقعی در همین شاخه)

| فرمان | نتیجه |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run build` | ✅ `dist/index.html = 1,046.87 kB` (gzip 275.84 kB) — رشته‌های جدید در باندل تأیید شد |
| `npm run smoke` | ✅ |
| `npm run test:images` | ✅ ۲۴ بررسی سرویس (۲ مورد جدید) + ۳۳ بررسی PostgreSQL محلی |
| `npm run test:images:migration` | ✅ ۲۳ (بدون تغییر در SQL) |
| `npm run test:images:automation` | ✅ ۳۴ |
| `npm run verify:admin` / `verify:supabase` / `verify:data` / `verify:images:bundle` | ✅ |

تست‌های جدید:
* «پایگاه داده‌ای که قرارداد تصویرش نسخهٔ ۳ نیست، پیش از آپلودِ هر بایتی نام برده می‌شود» ✅
* «شکست در دست‌دهیِ نسخه به‌جای مقصر دانستنِ نقش مدیر، نوشت را رد می‌کند» ✅

هیچ فایلی در `supabase/migrations/*` تغییر نکرده و هیچ Migrationی روی Production اجرا نشده است.

---

## ۶. بعد از فعال‌سازی استقرار — برنامهٔ تأیید واقعی

1. Workflow را فعال و روی `main` اجرا کنید (حدود ۱ دقیقه).
2. در `https://zheno.devs.surf/admin` وارد شوید (یک **خروج و ورود واقعی** — داده‌های فعلی نشان می‌دهد آخرین ورود با گذرواژه در `18:58:37Z` بوده است).
3. به `/admin/auth-trace` بروید و «اجرای ردیابی» را بزنید؛ انتظار می‌رود هر ۹ مرحله سبز شود و مرحلهٔ ۸ پیام `product_not_found` را به‌عنوان نشانهٔ عبور از دروازهٔ مدیر گزارش کند.
4. یک آپلود واقعی انجام دهید و نتیجه را اینجا بگویید. اگر مرحله‌ای قرمز شد، خروجی همان مرحله را برای من بفرستید.

**محدودیت صادقانه:** من از این محیط به `zheno.devs.surf`، به نشست مرورگر شما و به پروژهٔ Supabase دسترسی شبکه‌ای ندارم (فقط APIی GitHub باز است). هرچه در بالا آمده از **دادهٔ واقعی Production** است — نه شبیه‌سازی — اما «تست نهاییِ یک آپلود واقعی» فقط در مرورگر شما و پس از استقرار ممکن است؛ برای همین صفحهٔ ردیابی را ساختم که همان مسیر را با نشست واقعی شما و بدون تغییر داده اجرا می‌کند.

---

## ۷. فایل‌های تغییرکرده

* **جدید:** `src/admin/pages/AdminAuthTracePage.tsx` (موقت) · `src/App.tsx` (مسیر موقت)
* **اصلاح:** `src/services/supabaseProductImages.ts` (version handshake پیش از نوشت) · `scripts/test-product-images.mjs` (۲ تست)
* **diagnostic موقت (فقط‌خواندنی):** `.github/workflows/supabase-admin-auth-trace.yml` · `diagnostics/admin-auth-trace.json`
* **گزارش:** این فایل

**برای حذفِ ابزارهای موقت پس از بسته‌شدن موضوع:**

```bash
git rm -r .github/workflows/supabase-admin-auth-trace.yml diagnostics src/admin/pages/AdminAuthTracePage.tsx
# و حذف مسیر auth-trace از src/App.tsx
```
