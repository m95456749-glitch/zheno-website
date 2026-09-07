# ZHINO — پودر ژله و کاستارد

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
  data/          # داده‌های محصولات و دستورها
  services/      # سرویس‌ها (صدا، پرداخت و...)
  hooks/         # هوک‌های سفارشی
  context/       # کانتکست‌های React
  utils/         # توابع کمکی
  types/         # تایپ‌های TypeScript
```

## محصولات

### پودر ژله
- انار، توت فرنگی، هلو، تمشک، بلوبری، پرتقال، آناناس، آلبالو

### پودر کاستارد
- موز، طالبی، توت فرنگی، کاکائو، هفت میوه، پرتقال، محلبی وانیلی

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
