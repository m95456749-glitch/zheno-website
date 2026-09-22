# ممیزی نهایی migration تصاویر — ۲۰ سپتامبر ۲۰۲۶

## نتیجهٔ روشن

**برای schema منطبق با migrationهای این مخزن: آمادهٔ اجرای کنترل‌شده؛ نیازمند اصلاح شناخته‌شدهٔ دیگری در مسیر آزموده‌شده نیست. برای production ناشناخته: تأیید بی‌قیدوشرط نمی‌دهم.** دسترسی اجرای Remote در این محیط وجود نداشت. preflight روی خود سرور ناسازگاری‌های بررسی‌شده را رد می‌کند؛ جای backup، بازبینی تغییرات اختصاصی سرور یا تست واقعی Auth/Storage را نمی‌گیرد.

**الان بدون backup قابل بازیابی و هماهنگی با انتشار مورد تأیید پنل جدید اجرا نکنید.** پنل قدیمی که مستقیم در جدول می‌نویسد بعد از migration محدود می‌شود. هیچ انتشار، SQL روی Remote، commit، push یا merge انجام نشده است؛ تمام تغییرات روی همان شاخه و در working tree مانده‌اند.

## یافته‌ها و اصلاحات قبل از توصیهٔ اجرا

| موضوع | خطر نسخهٔ پیش از این ممیزی | وضعیت SQL نهایی |
|---|---|---|
| حفظ محصول | UPDATE ظاهراً بی‌اثر، timestamp و triggerهای تمام محصولات را اجرا می‌کرد | reconciliation بدون UPDATE محصول؛ snapshot کل ردیف‌ها و assertion برابری قبل از COMMIT |
| حفظ گالری | ادعای کلی حفظ داده کافی نبود | هیچ حذف ردیفی؛ فقط primary و timestamp وابسته به تغییر واقعی آن مجاز به تغییرند؛ بقیهٔ فیلدهای قبلی assert می‌شوند |
| schema واقعی | صرفاً بررسی نوع ID و IF NOT EXISTS برای drift کافی نبود | کنترل ستون‌ها، FK، PK، NOT NULL لازم، default UUID، index هم‌نام، helperهای قبلی، RLS، trigger/rule ناشناخته؛ توقف به‌جای cast/حذف/تعمیر حدسی |
| bucket خصوصی | UPSERT می‌توانست bucket قبلی را عمومی کند | bucket خصوصی باعث توقف می‌شود؛ bucket ناموجود عمداً عمومی ساخته می‌شود |
| دسترسی جدول | لغو فقط DML، TRUNCATE یا مجوز ستونی/ارثی را پوشش نمی‌داد | REVOKE ALL و revoke ستونی؛ بررسی effective privileges قبل از commit؛ مجوز ارثی خطرناک باعث rollback |
| RPC و helper | revocation فقط از PUBLIC برای grant قبلی anon/auth کافی نبود | ACL صریح؛ helper خصوصی برای مرورگر غیرقابل اجرا؛ RPC جهش‌دهنده authenticated + کنترل admin |
| search_path | امکان resolve ناامن نام‌ها | pg_catalog سپس pg_temp؛ روابط و helperهای برنامه schema-qualified؛ آزمون shadow موقت |
| سایر bucketها | predicate محدودکننده ممکن بود در شاخهٔ دیگر OR خطای permission بدهد | predicateهای boolean قابل اجرای policy، با false فوری برای غیرمدیر؛ تست واقعی RLS برای anon در bucket دیگر |
| مالکیت URL | شباهت suffix URL خارجی با مسیر محلی، اثبات مالکیت نیست | URL واردشده legacy است؛ فقط مسیر ثبت upload صریح، upload جدید ایجاد می‌کند؛ uploadهای قبلی حفظ می‌شوند |
| هماهنگی و حذف | ثبت ارجاع از فرم محصول و retirement باید هماهنگ باشند | قفل ردیف محصول، قفل advisory مشترک و tombstone؛ بررسی محافظه‌کارانهٔ ارجاع encoded/signed/render در محصولات و گالری |
| تأیید نهایی | SELECT بعد از COMMIT نمی‌تواند خرابی را rollback کند | assertionهای داده/primary/ACL قبل از COMMIT؛ SELECTهای بعدی فقط رسید خواندنی‌اند |

## دامنهٔ تضمین حفظ داده و idempotence

- migration هیچ ردیف محصول یا Storage object را UPDATE/DELETE نمی‌کند. URL خام فعلی محصول، حتی فاصله‌های قبلی، و تمام timestampهای محصولات حفظ می‌شوند. قواعد normalize/اعتبارسنجی جدید برای نوشتن‌های آینده‌اند.
- برای محصول دارای URL غیرخالی، دقیقاً یک primary با همان URL لازم است؛ برای NULL/فاصله‌ای، صفر primary. ردیف legacy لازم اضافه می‌شود؛ ردیف قبلی حذف یا از legacy به upload تبدیل نمی‌شود.
- `is_primary` و فقط در صورت تغییر واقعی، `updated_at` گالری می‌توانند عوض شوند. نگهداری URL قدیمی به معنی تضمین قابل‌دریافت‌بودن فایل آن نیست.
- فایل فیزیکی در migration حذف نمی‌شود. فقط تنظیم سقف/MIME bucket موردنظر می‌تواند تغییر کند؛ فایل‌های قدیمی با تغییر این تنظیم حذف نمی‌شوند.
- تکرار دوم/سوم برابری کامل محصولات، گالری، bucket، object metadata، صف cleanup و timestampهایشان را حفظ کرد؛ تعریف policy/index/constraint هم ثابت بود. تعدادها تکثیر نمی‌شوند. policyهای هم‌نام drop/create می‌شوند؛ بنابراین منظور idempotence معنایی است، نه ثابت‌ماندن OID داخلی catalog.
- تعریف نادرست index هم‌نام، دادهٔ تکراری نامعتبر، schema ناقص یا مجوز ارثی ناامن باعث توقف می‌شود. idempotent بودن به معنی قبول هر drift یا حذف داده برای عبور از آن نیست.

## بررسی همهٔ migrationهای قبلی

در مخزن سه migration مقدم بر این فایل وجود دارد؛ هر سه بررسی شدند و تغییر داده نشدند:

1. **`20260912000000_initial_schema.sql`**: محصولات با ID از نوع **TEXT**، تصویر با ID از نوع UUID و FK از نوع TEXT است. helper مدیر از `app_metadata.role` و تابع touch قبلی مبنا هستند. نصب مستقیم v2 روی schema اولیه آزموده شد؛ نوع UUID متفاوتِ محصولات در تست مستقل پیش از تغییر رد شد.
2. **`20260912000001_seed_catalog.sql`**: seed جزو اجرای جدید نیست. برای ترمیم دوباره اجرا نشود؛ UPSERT آن URL و دادهٔ ویرایش‌شدهٔ محصول را بازنویسی می‌کند. ثبت legacy جدید بر اساس دادهٔ موجود سرور است، نه بازنشانی ۲۲ محصول نمونه.
3. **`20260919000000_product_images.sql`**: ارتقای رو به جلو آزموده شد. قید سراسری مسیر آن عمداً با قید per-product و قید upload-only جایگزین می‌شود؛ اشتراک URL legacy نباید با مالکیت upload یکی دانسته شود. اجرای معکوس/مجدد v1 **سازگار نیست**: ON CONFLICT آن به قید حذف‌شده وابسته است و مجوز/تابع قدیمی را بازمی‌گرداند. حفظ wrapper انتخاب اصلی به معنی پشتیبانی از تمام نوشتن‌های مستقیم پنل قدیمی نیست.

SQL Editor تاریخچهٔ migration CLI را ثبت نمی‌کند. قبل از `db push` آتی، تاریخچه باید بررسی شود تا v1 یا seed ثبت‌نشده دوباره اجرا نشوند. هیچ repair خودکار تاریخچه انجام نشده است.

## مرزهای امنیت و rollback

- browserهای anon/authenticated امکان mutation مستقیم metadata ندارند؛ policy restrictive حتی policy permissive گسترده را محدود می‌کند. دو predicate Storage قابل فراخوانی‌اند اما برای غیرمدیر همیشه false برمی‌گردانند؛ helperهای داخلی خصوصی‌اند.
- نوشتن عادی از مرورگر نیازمند admin است. superuser، owner و roleهای privileged سرویس مرز اعتماد دیتابیس‌اند؛ این SQL جلوی یک مدیر دیتابیس که بعداً عمداً ACL/functionها را تغییر می‌دهد نمی‌ایستد.
- bucket عمومی فایل محصول غیرفعال را از کسی که URL آن را دارد پنهان نمی‌کند. RLS metadata و دسترسی بایت‌های public bucket یک چیز نیستند.
- قفل مهاجرت writerها و SELECT FOR UPDATE را متوقف می‌کند، ولی خواندن معمول فروشگاه را نه. برای جلوگیری از تعارض با پنل قدیمی، هنگام اجرای migration نوشتن مدیران متوقف شود. timeout/بن‌بست احتمالی باید rollback بدهد، نه «نادیده گرفته» شود. تست هم‌زمان چند connection و HTTP واقعی Storage انجام نشده است.
- تطبیق محافظه‌کارانهٔ مسیر ممکن است فایل اضافی را نگه دارد. ارجاع‌های بررسی‌شده در `products` و `product_images` هستند؛ استفادهٔ دستی از فایل در سامانه‌های بیرونی در دامنهٔ این مدل داده نیست.
- قبل از **COMMIT**، خطا تغییرات همان تراکنش را برمی‌گرداند. خطای رسید خواندنیِ بعد از COMMIT آن تغییرات را برنمی‌گرداند. بعد از commit راه بازگشت خودکار بی‌خطر نداریم: restore باید ACL/policy/constraint/trigger/data و نسخهٔ برنامه را هماهنگ برگرداند. اجرای v1 یا drop جدول‌ها rollback نیست.
- حذف فیزیکی فایل در عملیات آتی پنل از SQL قابل بازگشت نیست؛ backup دیتابیس جای backup Storage را نمی‌گیرد. قطع کامل شبکه/بستن مرورگر ممکن است orphan باقی بگذارد؛ حذف حدسی جایگزین حفاظت از عکس زنده نشده است.

## خروجی واقعی اعتبارسنجی این ممیزی

| فرمان | نتیجهٔ اجرای نهایی | دامنه |
|---|---|---|
| `npm run typecheck` | exit 0 | TypeScript |
| `npm run build` | exit 0؛ ۳٫۸۴ ثانیه؛ 1,034.68 kB، gzip 272.20 kB | production build |
| `npm run smoke` | ۴۹۹ PASS در اجرای مستقل نهایی | jsdom / شبکهٔ شبیه‌سازی‌شده |
| `npm run verify:data` | ۸۱ PASS | فایل‌ها و mapping |
| `npm run verify:admin` | ۸۱ PASS | قراردادهای استاتیک |
| `npm run verify:supabase` | ۴۴ PASS | ساختار و اسکن الگویی؛ نه Remote |
| `npm run test:images` | ۱۳ سرویس + ۶۳ PostgreSQL | شبکهٔ mock؛ PGlite با Auth/Storage harness |
| `npm run test:images:migration` | ۲۱ PASS | ممیزی جدید حفظ داده/ACL/اجرای مجدد/rollback |
| `npm run verify:images:bundle` | ۲ PASS | نبود کلید privileged/ابزار تست در bundle و رد credential پیش از build |
| `npm run test:images:browser` | ۱۲ PASS | Chromium واقعی روی Demo production؛ بدون runtime error |

در اجرای موازی زیر بار، smoke سه خطای زمان‌بندی موجودی/پیشنهاد دستور داشت؛ اجرای مستقل بعدی هر ۴۹۹ مورد را پاس کرد. برای عبور از این خطاها بخش دیگری از برنامه تغییر نکرد. checker استاتیک SQL نیز اصلاح شد تا نام مجوز `TRUNCATE` در `has_table_privilege` را به اشتباه دستور حذف داده محسوب نکند؛ تشخیص دستور واقعی TRUNCATE باقی است.

مجموع SQL: **۸۴ بررسی محلی**. تست‌های جدید، bucket خصوصی، index هم‌نام غلط، ستون/PK/default ناقص، ستون خصوصی ناشناخته، trigger/rule ناشناخته، grantهای PUBLIC/ستونی/default/ارثی، ACL قبلی RPC، policy گسترده، URL خارجی و encoded، shadow موقت و برابری اجرای مجدد را پوشش می‌دهند. عرض‌های مرورگر: ۳۲۰، ۳۷۵، ۳۹۰، ۷۶۸، ۱۰۲۴ و ۱۴۴۰؛ بدون overflow صفحه/modal. این تست گوشی فیزیکی، Safari یا Supabase ابری نیست.

## دستور دستی کوتاه

پس از backup قابل بازیابی و هماهنگی با پنل جدید، هنگام توقف موقت نوشتن مدیران، **کل فایل `supabase/migrations/20260920000000_product_image_safety.sql` را در یک Query از SQL Editor پروژهٔ موجود Run کنید**. بخش‌ها را جدا نکنید و هیچ credential وارد نکنید. خروجی باید نوع‌های text/text/uuid، bucket عمومی با سقف 8388608 و `inconsistent_primary_products = 0` را نشان دهد. verify جداگانه لازم نیست. اگر preflight/assertion خطا داد، متوقف شوید و چک را حذف نکنید. توضیح خطا و راهنمای کامل در `APPLY-PRODUCT-IMAGES.md` است.

این دستور به معنی اجرای انجام‌شده یا توصیهٔ انتشار خودکار نیست؛ Remote و انتشار هنوز انجام نشده‌اند.

## فایل‌های مخصوص همین ممیزی

- SQL نهایی: `supabase/migrations/20260920000000_product_image_safety.sql`.
- diff دقیق: `supabase/product-image-safety-final-audit.diff`؛ مقایسه با نسخهٔ پیش از ممیزی نهاییِ همین فایل، **نه** با v1 و نه ادعای git diff یک فایل tracked. این migration در working tree جدید بود.
- تست جدید: `scripts/test-product-image-migration-safety.mjs`؛ فرمان آن در `package.json` اضافه شد.
- راهنمای اجرا، `supabase/verify.sql`، گزارش کلی و checker استاتیک SQL به‌روزرسانی شدند. کد UI/سرویس‌ها در این مرحله دست نخورده است.

## متن کامل و بدون حذف SQL

نسخهٔ اجرایی همان فایل `.sql` است. بخش‌های آن با ۰ تا ۵ مشخص‌اند: preflight، تغییر جدول‌ها، RPC/helper/trigger، policy/ACL، Storage، assertion قبل از COMMIT و سپس رسید خواندنی. متن زیر عیناً از فایل نهایی گرفته شده است، نه شبه‌کد یا خلاصه.

تعداد خطوط SQL: **604**.

SHA-256 فایل نهایی:

```text
dc372b82145033114db5e30d80cfa9eae4531f21fcb47b03ea6f89525fe8081c
```

SHA-256 مبدأ diff (نسخهٔ پیش از این ممیزی):

```text
52ce006be953cf5e3ce2cdf29afc5f5e64d304f841a6c67d1987e30c97bda695
```

```sql
-- ZHINO image safety v2 — FINAL SECURITY REVIEW.
-- Run this WHOLE file once in the SQL Editor of the existing catalog project.
-- No remote execution is claimed. Tested with local PostgreSQL (PGlite).
-- Order: preflight -> tables -> RPCs/triggers -> RLS -> Storage -> assertions.
-- No DELETE/TRUNCATE runs during migration; runtime deletes require admin RPCs.
-- Existing products (including image_url and timestamps) are not updated.
-- Existing gallery rows retain all fields except deliberately reconciled primary
-- flags/updated_at. New legacy registrations can be added; none are removed.
-- A pre-existing PRIVATE bucket is NOT made public: preflight aborts instead.
-- Post-COMMIT rollback requires a verified backup; do not replay older migrations.
-- The v1 admin writer is intentionally incompatible; coordinate with the v2 UI.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local search_path = pg_catalog, pg_temp;

-- 0. PREFLIGHT — reject unknown schema instead of guessing or converting data.
do $$
declare c record; t regclass; k text[]; p text;
begin
  if not exists (select 1 from pg_attribute where attrelid = to_regclass('public.products')
      and attname = 'id' and atttypid = 'text'::regtype and not attisdropped) then
    raise exception 'ZHINO: products.id must be text; nothing changed';
  end if;
  for c in select * from (values
    ('public.products','image_url','text'), ('public.products','short_name','text'),
    ('public.products','active','boolean'),
    ('storage.buckets','id','text'), ('storage.buckets','name','text'),
    ('storage.buckets','public','boolean'), ('storage.buckets','file_size_limit','bigint'),
    ('storage.buckets','allowed_mime_types','text[]'),
    ('storage.objects','bucket_id','text'), ('storage.objects','name','text'),
    ('storage.objects','metadata','jsonb'),
    ('public.product_images','id','uuid'), ('public.product_images','product_id','text'),
    ('public.product_images','storage_bucket','text'), ('public.product_images','storage_path','text'),
    ('public.product_images','storefront_url','text'), ('public.product_images','alt_text','text'),
    ('public.product_images','is_primary','boolean'), ('public.product_images','sort_order','integer'),
    ('public.product_images','width','integer'), ('public.product_images','height','integer'),
    ('public.product_images','mime_type','text'), ('public.product_images','size_bytes','bigint'),
    ('public.product_images','source','text'), ('public.product_images','uploaded_by','uuid'),
    ('public.product_images','created_at','timestamp with time zone'),
    ('public.product_images','updated_at','timestamp with time zone'),
    ('public.product_image_cleanup','storage_path','text'),
    ('public.product_image_cleanup','created_at','timestamp with time zone'),
    ('public.product_image_cleanup','completed_at','timestamp with time zone')
  ) expected(tbl,col,typ) loop
    t := to_regclass(c.tbl);
    if t is null and c.tbl in ('public.product_images','public.product_image_cleanup') then continue; end if;
    if t is null or not exists (select 1 from pg_attribute where attrelid=t
        and attname=c.col and atttypid=to_regtype(c.typ) and not attisdropped) then
      raise exception 'ZHINO: incompatible column %.%; expected %; nothing changed', c.tbl,c.col,c.typ;
    end if;
  end loop;
  if to_regprocedure('public.is_admin()') is null or to_regprocedure('public.touch_updated_at()') is null
    or to_regprocedure('auth.jwt()') is null or to_regprocedure('auth.uid()') is null then
    raise exception 'ZHINO: initial catalog/Auth functions missing; nothing changed';
  end if;
  -- Do not silently trust a remotely redefined authorization helper.
  select regexp_replace(prosrc,'[[:space:]]','','g') into p from pg_proc where oid='public.is_admin()'::regprocedure;
  if p <> $expected$selectcoalesce((auth.jwt()->'app_metadata'->>'role')='admin',false);$expected$ then
    raise exception 'ZHINO: is_admin differs from the audited catalog schema; review required';
  end if;
  select regexp_replace(prosrc,'[[:space:]]','','g') into p from pg_proc where oid='public.touch_updated_at()'::regprocedure;
  if p is distinct from 'beginnew.updated_at=now();returnnew;end;' then
    raise exception 'ZHINO: timestamp trigger differs from audited schema; review required';
  end if;
  if exists (select 1 from pg_class where oid in ('public.products'::regclass,'storage.objects'::regclass)
    and not relrowsecurity) then raise exception 'ZHINO: prerequisite RLS is disabled'; end if;
  if exists (select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) then
    raise exception 'ZHINO: browser role bypasses RLS; review required';
  end if;
  if exists (select 1 from storage.buckets where id='product-images' and public is distinct from true) then
    raise exception 'ZHINO: existing product-images bucket is private; refusing public exposure';
  end if;
  if to_regclass('public.product_images') is not null then
    -- SELECT grants must not accidentally expose a server-specific private column.
    if exists(select 1 from pg_attribute where attrelid='public.product_images'::regclass
      and attnum>0 and not attisdropped and attname not in
      ('id','product_id','storage_bucket','storage_path','storefront_url','alt_text',
       'is_primary','sort_order','width','height','mime_type','size_bytes','source',
       'uploaded_by','created_at','updated_at')) then
      raise exception 'ZHINO: unreviewed gallery column; refusing to expose unknown data';
    end if;
    if exists (select 1 from pg_trigger where tgrelid='public.product_images'::regclass
      and not tgisinternal and tgname <> 'product_images_touch_updated_at') then
      raise exception 'ZHINO: unreviewed gallery trigger; refusing migration-time side effects';
    end if;
    if exists(select 1 from pg_rewrite where ev_class='public.product_images'::regclass and rulename<>'_RETURN') then
      raise exception 'ZHINO: unreviewed gallery rule; refusing migration-time side effects';
    end if;
    if exists (select 1 from pg_constraint con where con.conrelid='public.product_images'::regclass
      and con.conname='product_images_unique_path' and
        (con.contype <> 'u' or con.conkey <> array[
          (select attnum from pg_attribute where attrelid=con.conrelid and attname='storage_bucket'),
          (select attnum from pg_attribute where attrelid=con.conrelid and attname='storage_path')])) then
      raise exception 'ZHINO: legacy unique constraint has an unexpected definition';
    end if;
  end if;
  -- IF NOT EXISTS must not accept a wrongly defined same-name index.
  for c in select * from (values
    ('product_images_product_idx',array['product_id','is_primary','sort_order','created_at'],false,''),
    ('product_images_one_primary',array['product_id'],true,'is_primary'),
    ('product_images_product_path',array['product_id','storage_bucket','storage_path'],true,''),
    ('product_images_upload_path',array['storage_bucket','storage_path'],true,$pred$source='upload'::text$pred$)
  ) expected(nm,cols,unq,pred) loop
    t := to_regclass('public.'||c.nm);
    if t is null then continue; end if;
    select array(select a.attname::text from pg_index i,
      unnest(i.indkey::smallint[]) with ordinality n(attnum,ord)
      join pg_attribute a on a.attrelid=to_regclass('public.product_images') and a.attnum=n.attnum
      where i.indexrelid=t order by n.ord) into k;
    if not exists (select 1 from pg_index i where i.indexrelid=t and i.indrelid=to_regclass('public.product_images')
      and i.indisunique=c.unq and i.indisvalid and i.indisready and i.indexprs is null
      and regexp_replace(coalesce(pg_get_expr(i.indpred,i.indrelid),''),'[()[:space:]]','','g')=c.pred)
      or k is distinct from c.cols then raise exception 'ZHINO: incompatible index %', c.nm; end if;
  end loop;
end $$;

-- Bound lock wait; serialize maintenance with product/gallery writers.
-- EXCLUSIVE also waits for SELECT ... FOR UPDATE (ROW SHARE), preventing a
-- writer from holding a product tuple while waiting for our advisory lock.
-- Ordinary storefront SELECTs remain allowed. Run while admin writes are paused.
lock table public.products in exclusive mode;
-- Same ordering as runtime: product lock, shared reference lock, gallery/queue.
do $$ begin perform pg_advisory_xact_lock(hashtextextended('zhino-image-references',0)); end $$;
lock table storage.buckets, storage.objects in share row exclusive mode;

-- 1. TABLES / CONSTRAINTS — no row deletion, no ID casts, no CASCADE DDL.
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,

  -- Where the bytes live:
  --   'product-images' → this project's Supabase Storage bucket
  --   'site-public'    → a file already committed in public/images/
  --                      (registered, never deleted by the panel)
  storage_bucket text not null default 'product-images',
  storage_path text not null,

  -- The URL written into public.products.image_url when this row
  -- becomes the primary image: a site-root-relative path for legacy
  -- files, an absolute https:// Storage URL for uploads.
  storefront_url text not null,

  alt_text text not null default '',
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  mime_type text not null default 'image/jpeg',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  -- 'legacy' = a preserved site/external URL, 'upload' = owned Storage object
  source text not null default 'upload' check (source in ('upload', 'legacy')),
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

lock table public.product_images in share row exclusive mode;
create table if not exists public.product_image_cleanup (
  storage_path text primary key,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
lock table public.product_image_cleanup in share row exclusive mode;

-- Reject partial tables that would fail only on a future admin operation.
do $$ declare t text; col text; typ text;
begin
  foreach t in array array['product_images','product_image_cleanup'] loop
    col := case when t='product_images' then 'id' else 'storage_path' end;
    if not exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.'||t)
      and c.contype='p' and c.conkey=array[(select attnum from pg_attribute where attrelid=c.conrelid and attname=col)]) then
      raise exception 'ZHINO: missing or incompatible primary key on %',t;
    end if;
  end loop;
  foreach col in array array['id','product_id','storage_bucket','storage_path','storefront_url',
    'alt_text','is_primary','sort_order','mime_type','size_bytes','source','created_at','updated_at'] loop
    if not exists(select 1 from pg_attribute where attrelid='public.product_images'::regclass and attname=col and attnotnull) then
      raise exception 'ZHINO: required NOT NULL constraint missing on product_images.%',col;
    end if;
  end loop;
  select pg_get_expr(d.adbin,d.adrelid) into typ from pg_attrdef d join pg_attribute a
    on a.attrelid=d.adrelid and a.attnum=d.adnum where d.adrelid='public.product_images'::regclass and a.attname='id';
  if typ is null or typ !~ '^(pg_catalog\.|public\.|extensions\.)?gen_random_uuid\(\)$' then
    raise exception 'ZHINO: unsupported image UUID default';
  end if;
end $$;

-- Snapshot for in-transaction assertions; automatically discarded at COMMIT.
create temporary table zhino_products_before on commit drop as select to_jsonb(p) as row_data from public.products p;
create temporary table zhino_images_before on commit drop as select to_jsonb(i) as row_data from public.product_images i;

-- Existing FK must have the correct target. Do not pile a second FK onto drift.
do $$
declare k smallint; target smallint;
begin
  select attnum into k from pg_attribute where attrelid='public.product_images'::regclass and attname='product_id';
  select attnum into target from pg_attribute where attrelid='public.products'::regclass and attname='id';
  if exists (select 1 from pg_constraint where conrelid='public.product_images'::regclass and contype='f'
      and k=any(conkey) and (conkey <> array[k] or confrelid <> 'public.products'::regclass or confkey <> array[target]
        or not convalidated or confdeltype <> 'c')) then raise exception 'ZHINO: incompatible product image FK'; end if;
  if not exists (select 1 from pg_constraint where conrelid='public.product_images'::regclass and contype='f' and conkey=array[k]) then
    alter table public.product_images add constraint product_images_product_fk
      foreign key(product_id) references public.products(id) on delete cascade;
  end if;
  if exists (select 1 from public.product_images where id is null or product_id is null or storage_bucket is null
      or storage_path is null or storefront_url is null or is_primary is null or source not in ('upload','legacy') or source is null) then
    raise exception 'ZHINO: invalid existing gallery row; refusing lossy repair';
  end if;
end $$;

-- Replace ONLY the audited v1 cross-product path constraint.
-- Existing rows are preserved. Duplicate upload ownership aborts, never deduplicates.
alter table public.product_images drop constraint if exists product_images_unique_path;
create index if not exists product_images_product_idx on public.product_images(product_id,is_primary desc,sort_order,created_at);
create unique index if not exists product_images_one_primary on public.product_images(product_id) where is_primary;
create unique index if not exists product_images_product_path on public.product_images(product_id,storage_bucket,storage_path);
create unique index if not exists product_images_upload_path on public.product_images(storage_bucket,storage_path) where source='upload';
drop trigger if exists product_images_touch_updated_at on public.product_images;
create trigger product_images_touch_updated_at before update on public.product_images
  for each row execute function public.touch_updated_at();

-- 2. RPCs / INTERNAL HELPERS / TRIGGERS.
-- pg_catalog first, pg_temp last; application relations/functions explicitly qualified.
-- Helper ACLs are assigned in section 3, still within this same transaction.

-- Conservative reference check, including signed/render URLs and percent escapes.
-- False positives keep an extra file; false negatives could destroy a live photo.
create or replace function public.product_image_url_references(p_url text,p_path text)
returns boolean language plpgsql immutable set search_path = pg_catalog, pg_temp
as $$ declare u text := lower(p_url); m text[]; n integer;
begin
  if p_url is null then return false; end if;
  if p_path is null or p_path='' then return true; end if;
  loop
    m := regexp_match(u,'(%[0-9a-f]{2})'); exit when m is null;
    n := get_byte(decode(substr(m[1],2),'hex'),0);
    if n=0 then return true; end if;
    u := replace(u,m[1],chr(n));
  end loop;
  return strpos(lower(u),lower(p_path)) > 0;
end $$;

create or replace function public.product_image_path_referenced(p_path text)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select exists(select 1 from public.product_images where
      (storage_bucket='product-images' and storage_path=p_path)
      or public.product_image_url_references(storefront_url,p_path))
    or exists(select 1 from public.products where public.product_image_url_references(image_url,p_path));
$$;

-- These two boolean policy predicates are callable by anon, but reveal no queue
-- state to non-admins. This avoids permission errors on OTHER buckets under OR.
create or replace function public.product_image_upload_allowed(p_path text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$ begin
  if not public.is_admin() then return false; end if;
  return not exists(select 1 from public.product_image_cleanup where storage_path=p_path);
end $$;

create or replace function public.product_image_deletion_allowed(p_path text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$ begin
  if not public.is_admin() then return false; end if;
  return exists(select 1 from public.product_image_cleanup where storage_path=p_path)
    and not public.product_image_path_referenced(p_path);
end $$;

-- Internal only. Does not update products, invoke product triggers or delete rows.
-- Unknown existing URLs remain legacy/external; matching a Storage suffix is NOT
-- proof that our project owns that URL's file. Only the register RPC creates uploads.
create or replace function public.reconcile_product_image(p_id text,p_url text,p_label text)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$ declare v_id uuid; v_bucket text;
begin
  perform pg_advisory_xact_lock(hashtextextended('zhino-image-references',0));
  if p_url is not null and btrim(p_url)<>'' then
    if exists(select 1 from public.product_image_cleanup c where public.product_image_url_references(p_url,c.storage_path)) then
      raise exception 'image_retired';
    end if;
    if exists(select 1 from public.product_images where source='upload' and product_id<>p_id
      and public.product_image_url_references(p_url,storage_path)) then raise exception 'image_product_mismatch'; end if;
    select id into v_id from public.product_images where product_id=p_id and storefront_url=p_url
      order by is_primary desc,created_at,id limit 1;
  end if;
  update public.product_images set is_primary=false where product_id=p_id and is_primary and id is distinct from v_id;
  if p_url is not null and btrim(p_url)<>'' and v_id is null then
    v_bucket := case when p_url ~ '^(images/|/images/)' then 'site-public' else 'external' end;
    insert into public.product_images(product_id,storage_bucket,storage_path,storefront_url,alt_text,source,is_primary)
      values(p_id,v_bucket,p_url,p_url,coalesce(p_label,''),'legacy',true);
  elsif v_id is not null then
    update public.product_images set is_primary=true where id=v_id and not is_primary;
  end if;
end $$;

create or replace function public.normalize_product_image_url()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp
as $$ begin
  -- Defense-in-depth if a broad products policy was added on the server.
  if current_user in ('anon','authenticated') and not public.is_admin() then raise exception 'admin_required'; end if;
  new.image_url := nullif(btrim(new.image_url),''); return new;
end $$;
drop trigger if exists products_normalize_image_url on public.products;
create trigger products_normalize_image_url before insert or update of image_url on public.products
  for each row execute function public.normalize_product_image_url();

create or replace function public.sync_product_primary_image()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$ begin
  if new.image_url is not null and not (new.image_url like 'images/%' or new.image_url like '/images/%'
    or new.image_url ~ '^https://[^[:space:]]+$') then raise exception 'invalid_image_url'; end if;
  perform public.reconcile_product_image(new.id,new.image_url,new.short_name);
  return new;
end $$;
drop trigger if exists products_sync_primary_image on public.products;
create trigger products_sync_primary_image after insert or update of image_url on public.products
  for each row execute function public.sync_product_primary_image();

create or replace function public.manage_product_image(
  p_action text, p_product_id text, p_image_id uuid,
  p_expected_url text, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare p public.products; i public.product_images; previous public.product_images;
  next_image public.product_images; v_path text; v_url text; v_primary boolean;
  v_replace uuid; v_size bigint; v_mime text;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  select * into p from public.products where id = p_product_id for update;
  if not found then raise exception 'product_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('zhino-image-references',0));
  if p_action is null or p_action not in ('register', 'primary', 'delete', 'alt') then raise exception 'invalid_image_action'; end if;

  if p_image_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'invalid_image_file'; end if;

  -- Idempotent retry after a lost registration response: never re-promote or
  -- re-delete on replay. Verify identity before returning the existing row.
  select * into i from public.product_images where id = p_image_id;
  if found and i.product_id <> p_product_id then raise exception 'image_product_mismatch'; end if;
  if p_action = 'register' and i.id is not null then
    if i.storage_path is distinct from p_payload->>'storage_path' or i.storefront_url is distinct from p_payload->>'storefront_url'
      then raise exception 'image_product_mismatch'; end if;
    return to_jsonb(i);
  end if;
  if p_action <> 'register' and i.id is null then raise exception 'image_not_found'; end if;
  if p.image_url is distinct from p_expected_url then raise exception 'image_conflict'; end if;

  if p_action = 'register' then
    v_path := p_payload->>'storage_path'; v_url := p_payload->>'storefront_url';
    v_mime := p_payload->>'mime_type'; v_size := (p_payload->>'size_bytes')::bigint;
    v_primary := coalesce((p_payload->>'make_primary')::boolean, false) or p.image_url is null;
    v_replace := nullif(p_payload->>'replace_id', '')::uuid;
    if v_replace is not null and not v_primary then raise exception 'replacement_requires_primary'; end if;
    if v_path is null or v_path !~ '^products/[a-zA-Z0-9-]+/[0-9a-f-]{36}\.(jpg|png|webp|gif|avif)$'
      or v_url is null or v_url !~ '^https://[^/[:space:]]+/'
      or not (right(v_url, length('/storage/v1/object/public/product-images/' || v_path)) = '/storage/v1/object/public/product-images/' || v_path)
      or v_mime is null or v_mime not in ('image/jpeg','image/png','image/webp','image/gif','image/avif')
      or v_size is null or v_size < 1 or v_size > 8388608
      or coalesce((p_payload->>'width')::integer,0) <= 0
      or coalesce((p_payload->>'height')::integer,0) <= 0 then raise exception 'invalid_image_file'; end if;
    perform pg_advisory_xact_lock(hashtextextended('zhino-image:' || v_path, 0));
    if exists (select 1 from public.product_image_cleanup where storage_path = v_path) then raise exception 'image_retired'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'product-images' and name = v_path)
      then raise exception 'image_object_missing'; end if;
    if exists (select 1 from storage.objects where bucket_id = 'product-images' and name = v_path
      and ((metadata->>'size')::bigint is distinct from v_size
        or metadata->>'mimetype' is distinct from v_mime)) then raise exception 'invalid_image_file'; end if;
    if v_replace is not null then
      select * into previous from public.product_images where id = v_replace and product_id = p.id;
      if not found or previous.storefront_url is distinct from p.image_url then raise exception 'image_conflict'; end if;
    end if;
    insert into public.product_images(id, product_id, storage_bucket, storage_path, storefront_url,
      alt_text, width, height, mime_type, size_bytes, source, is_primary)
    values(p_image_id, p.id, 'product-images', v_path, v_url,
      left(coalesce(p_payload->>'alt_text',p.short_name),200),
      (p_payload->>'width')::integer,(p_payload->>'height')::integer,v_mime,v_size,'upload',false)
    returning * into i;
    if v_primary then update public.products set image_url = v_url where id = p.id; end if;
    if previous.id is not null and previous.source = 'upload' and previous.storage_bucket = 'product-images' then
      insert into public.product_image_cleanup(storage_path) values(previous.storage_path) on conflict do nothing;
      delete from public.product_images where id = previous.id;
    end if;
  elsif p_action = 'primary' then
    update public.products set image_url = i.storefront_url where id = p.id;
  elsif p_action = 'alt' then
    update public.product_images set alt_text = left(coalesce(p_payload->>'alt_text',''),200)
      where id = i.id returning * into i;
  elsif p_action = 'delete' then
    if i.storefront_url = p.image_url or i.is_primary then
      select * into next_image from public.product_images
        where product_id = p.id and id <> i.id order by sort_order, created_at, id limit 1;
      -- A manager may still remove the last photo, but only by explicit consent.
      if next_image.id is null and not coalesce((p_payload->>'allow_empty')::boolean,false)
        then raise exception 'last_product_image'; end if;
      update public.products set image_url = next_image.storefront_url where id = p.id;
    end if;
    if i.source = 'upload' and i.storage_bucket = 'product-images' then
      insert into public.product_image_cleanup(storage_path) values(i.storage_path) on conflict do nothing;
    end if;
    delete from public.product_images where id = i.id;
    return jsonb_build_object('id', i.id, 'deleted', true);
  end if;
  select * into i from public.product_images where id = p_image_id;
  return to_jsonb(i);
end $$;

-- Older clients also acquire the product lock FIRST; no lock inversion.
create or replace function public.set_primary_product_image(p_image_id uuid)
returns setof public.products language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$ declare v_product text; v_url text;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  select product_id into v_product from public.product_images where id = p_image_id;
  if not found then raise exception 'image_not_found'; end if;
  select image_url into v_url from public.products where id = v_product for update;
  perform public.manage_product_image('primary',v_product,p_image_id,v_url);
  return query select * from public.products where id = v_product;
end $$;

-- Orphans from a failed/ambiguous registration are retired only after the
-- register transaction has resolved (same advisory path lock).
create or replace function public.retire_product_image_upload(p_path text)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('zhino-image-references',0));
  if p_path is null or p_path !~ '^products/[a-zA-Z0-9-]+/[0-9a-f-]{36}\.(jpg|png|webp|gif|avif)$' then raise exception 'invalid_image_file'; end if;
  perform pg_advisory_xact_lock(hashtextextended('zhino-image:' || p_path, 0));
  if public.product_image_path_referenced(p_path) then return false; end if;
  insert into public.product_image_cleanup(storage_path) values(p_path) on conflict do nothing;
  return true;
end $$;

create or replace function public.complete_product_image_cleanup(p_path text)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  if not public.product_image_deletion_allowed(p_path) then raise exception 'image_conflict'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'product-images' and name = p_path)
    then raise exception 'image_cleanup_pending'; end if;
  update public.product_image_cleanup set completed_at = coalesce(completed_at,now()) where storage_path = p_path;
  return found;
end $$;


create or replace function public.product_image_api_version()
returns integer language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$ begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  return 2;
end $$;

-- Reconciliation ONLY. Never UPDATE public.products during migration.
do $$ declare p public.products;
begin
  for p in select * from public.products order by id loop
    perform public.reconcile_product_image(p.id,p.image_url,p.short_name);
  end loop;
end $$;

-- 3. TABLE RLS / ACLs / RPC ACLs.
-- Revoke ALL includes TRUNCATE (which bypasses RLS), TRIGGER and REFERENCES.
-- Also remove old column-level grants; table-level REVOKE alone misses them.
alter table public.product_images enable row level security;
alter table public.product_image_cleanup enable row level security;
revoke all on public.product_images,public.product_image_cleanup from public,anon,authenticated;
do $$ declare t text; cols text;
begin
  foreach t in array array['product_images','product_image_cleanup'] loop
    select string_agg(quote_ident(attname),',') into cols from pg_attribute
      where attrelid=to_regclass('public.'||t) and attnum>0 and not attisdropped;
    execute format('revoke select (%s), insert (%s), update (%s), references (%s) on public.%I from public, anon, authenticated',cols,cols,cols,cols,t);
  end loop;
end $$;
grant select on public.product_images to anon,authenticated;
grant select on public.product_image_cleanup to authenticated;
drop policy if exists product_images_public_read on public.product_images;
create policy product_images_public_read on public.product_images for select to anon,authenticated using (
  public.is_admin() or exists(select 1 from public.products p where p.id=product_id and p.active));
drop policy if exists product_images_admin_write on public.product_images;
-- Restrictive SELECT also protects against an unknown broad permissive policy.
drop policy if exists product_images_read_guard on public.product_images;
create policy product_images_read_guard on public.product_images as restrictive for select to anon,authenticated using (
  public.is_admin() or exists(select 1 from public.products p where p.id=product_id and p.active));
drop policy if exists image_cleanup_admin_read on public.product_image_cleanup;
create policy image_cleanup_admin_read on public.product_image_cleanup for select to authenticated using(public.is_admin());
drop policy if exists image_cleanup_read_guard on public.product_image_cleanup;
create policy image_cleanup_read_guard on public.product_image_cleanup as restrictive for select to anon,authenticated using(public.is_admin());
-- RPC owners bypass RLS; browser roles cannot directly mutate these two tables,
-- even if some future permissive policy/table grant is accidentally broadened.
do $$ declare t text;
begin
  foreach t in array array['product_images','product_image_cleanup'] loop
    execute format('drop policy if exists image_insert_guard on public.%I',t);
    execute format('create policy image_insert_guard on public.%I as restrictive for insert to anon,authenticated with check(false)',t);
    execute format('drop policy if exists image_update_guard on public.%I',t);
    execute format('create policy image_update_guard on public.%I as restrictive for update to anon,authenticated using(false) with check(false)',t);
    execute format('drop policy if exists image_delete_guard on public.%I',t);
    execute format('create policy image_delete_guard on public.%I as restrictive for delete to anon,authenticated using(false)',t);
  end loop;
end $$;

revoke all on function public.product_image_url_references(text,text) from public,anon,authenticated;
revoke all on function public.product_image_path_referenced(text) from public,anon,authenticated;
revoke all on function public.reconcile_product_image(text,text,text) from public,anon,authenticated;
revoke all on function public.normalize_product_image_url() from public,anon,authenticated;
revoke all on function public.sync_product_primary_image() from public,anon,authenticated;
revoke all on function public.product_image_upload_allowed(text) from public,anon,authenticated;
grant execute on function public.product_image_upload_allowed(text) to anon,authenticated;
revoke all on function public.product_image_deletion_allowed(text) from public,anon,authenticated;
grant execute on function public.product_image_deletion_allowed(text) to anon,authenticated;
revoke all on function public.manage_product_image(text,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_product_image(text,text,uuid,text,jsonb) to authenticated;
revoke all on function public.set_primary_product_image(uuid) from public,anon,authenticated;
grant execute on function public.set_primary_product_image(uuid) to authenticated;
revoke all on function public.retire_product_image_upload(text) from public,anon,authenticated;
grant execute on function public.retire_product_image_upload(text) to authenticated;
revoke all on function public.complete_product_image_cleanup(text) from public,anon,authenticated;
grant execute on function public.complete_product_image_cleanup(text) to authenticated;
revoke all on function public.product_image_api_version() from public,anon,authenticated;
grant execute on function public.product_image_api_version() to authenticated;

-- 4. STORAGE — only this bucket; no storage.objects row is deleted/updated here.
-- Existing private bucket was rejected above, not silently exposed to the world.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,8388608,
  array['image/jpeg','image/png','image/webp','image/avif','image/gif'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types
where storage.buckets.file_size_limit is distinct from excluded.file_size_limit
  or storage.buckets.allowed_mime_types is distinct from excluded.allowed_mime_types;
drop policy if exists product_images_storage_read on storage.objects;
create policy product_images_storage_read on storage.objects for select to anon,authenticated using(bucket_id='product-images');
drop policy if exists product_images_storage_insert on storage.objects;
create policy product_images_storage_insert on storage.objects for insert to authenticated
  with check(bucket_id='product-images' and public.product_image_upload_allowed(name));
drop policy if exists product_images_storage_update on storage.objects;
drop policy if exists product_images_storage_delete on storage.objects;
create policy product_images_storage_delete on storage.objects for delete to authenticated
  using(bucket_id='product-images' and public.product_image_deletion_allowed(name));
drop policy if exists product_images_storage_insert_guard on storage.objects;
create policy product_images_storage_insert_guard on storage.objects as restrictive for insert to anon,authenticated
  with check(bucket_id<>'product-images' or public.product_image_upload_allowed(name));
drop policy if exists product_images_storage_update_guard on storage.objects;
create policy product_images_storage_update_guard on storage.objects as restrictive for update to anon,authenticated
  using(bucket_id<>'product-images') with check(bucket_id<>'product-images');
drop policy if exists product_images_storage_delete_guard on storage.objects;
create policy product_images_storage_delete_guard on storage.objects as restrictive for delete to anon,authenticated
  using(bucket_id<>'product-images' or public.product_image_deletion_allowed(name));

-- 5. FINAL ASSERTIONS — failure aborts the transaction BEFORE commit.
do $$ declare r text; t text; f text;
begin
  if exists ((select row_data from pg_temp.zhino_products_before except select to_jsonb(p) from public.products p)
    union all (select to_jsonb(p) from public.products p except select row_data from pg_temp.zhino_products_before)) then
    raise exception 'ZHINO: product data changed unexpectedly; rolling back';
  end if;
  if exists(select 1 from pg_temp.zhino_images_before b left join public.product_images i on i.id=(b.row_data->>'id')::uuid
    where i.id is null or (to_jsonb(i)-'is_primary'-'updated_at') is distinct from (b.row_data-'is_primary'-'updated_at')) then
    raise exception 'ZHINO: previous gallery data changed unexpectedly; rolling back';
  end if;
  if exists(select 1 from public.products p where
    (select count(*) from public.product_images i where i.product_id=p.id and i.is_primary)
      <> case when p.image_url is null or btrim(p.image_url)='' then 0 else 1 end
    or exists(select 1 from public.product_images i where i.product_id=p.id and i.is_primary and i.storefront_url is distinct from p.image_url)) then
    raise exception 'ZHINO: primary invariant failed; rolling back';
  end if;
  foreach r in array array['anon','authenticated'] loop
    foreach t in array array['public.product_images','public.product_image_cleanup'] loop
      if has_table_privilege(r,t,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
        or has_any_column_privilege(r,t,'INSERT,UPDATE,REFERENCES') then
        raise exception 'ZHINO: inherited/remaining write privileges for % on %; rolling back',r,t;
      end if;
    end loop;
    foreach f in array array['public.reconcile_product_image(text,text,text)','public.product_image_path_referenced(text)',
      'public.product_image_url_references(text,text)','public.normalize_product_image_url()','public.sync_product_primary_image()'] loop
      if has_function_privilege(r,f,'EXECUTE') then raise exception 'ZHINO: helper RPC privilege leak; rolling back'; end if;
    end loop;
  end loop;
  foreach f in array array['public.manage_product_image(text,text,uuid,text,jsonb)',
    'public.set_primary_product_image(uuid)','public.retire_product_image_upload(text)',
    'public.complete_product_image_cleanup(text)','public.product_image_api_version()'] loop
    if has_function_privilege('anon',f,'EXECUTE') then raise exception 'ZHINO: anonymous mutation RPC privilege; rolling back'; end if;
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;

-- Read-only receipt. These SELECTs do not replace the pre-commit assertions.
select c.table_name,c.column_name,c.data_type from information_schema.columns c
where c.table_schema='public' and (c.table_name='products' and c.column_name='id'
  or c.table_name='product_images' and c.column_name in ('id','product_id'));
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='product-images';
select count(*) as inconsistent_primary_products from public.products p where
  (select count(*) from public.product_images i where i.product_id=p.id and i.is_primary)
    <> case when p.image_url is null or btrim(p.image_url)='' then 0 else 1 end
  or exists(select 1 from public.product_images i where i.product_id=p.id and i.is_primary and i.storefront_url is distinct from p.image_url);
select policyname,permissive,cmd,roles from pg_policies
where (schemaname='storage' and tablename='objects' and policyname like 'product_images_%')
   or (schemaname='public' and tablename in ('product_images','product_image_cleanup'))
order by schemaname,tablename,policyname;
```
