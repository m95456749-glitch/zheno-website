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
