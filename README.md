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
