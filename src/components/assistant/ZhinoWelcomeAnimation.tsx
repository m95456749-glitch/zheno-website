// ============================================================
// ZHINO — «انیمیشن جذاب ربات ژینو با محصولات واقعی» (بخش دوم)
//
// مراحل انیمیشن:
//   ۱) ورود ربات از بالا با سلام و حرکت خوشامدگویی
//   ۲) خروج بازیگوشانهٔ ربات از کادر اصلی به سمت کنار
//   ۳) ورود مجدد ربات از سمت دیگر، همراه با محصولات واقعی ژینو
//   ۴) ظاهر شدن کارتونی و جذاب پودر ژله و کاستر واقعی در دو طرف
//   ۵) استقرار آرام و دلنشین ربات و محصولات در مرکز صحنه
//
// ویژگی‌ها:
//   • فقط از تصاویر واقعی موجود در پروژه استفاده می‌کند (بدون تصویر AI یا جدید)
//   • نرم، سبک، بر پایهٔ GPU transform و بدون ایجاد لرزش چیدمان (CLS = 0)
//   • کاملاً واکنش‌گرا و مناسب موبایل (از ۳۲۰px تا دسکتاپ)
//   • بدون مزاحمت برای تایپ پیام یا ارسال
//   • قابلیت پخش مجدد با کلیک روی ربات
//   • پشتیبانی از prefers-reduced-motion
// ============================================================

import { useState } from 'react';
import { ASSISTANT_BOT_IMAGE } from './assistantData';
import { withSiteBase } from '../../utils/siteBase';
import { cn } from '../../utils/cn';

interface Props {
  className?: string;
}

export default function ZhinoWelcomeAnimation({ className }: Props) {
  const [animKey, setAnimKey] = useState(0);
  const [isSettled, setIsSettled] = useState(false);

  const restartAnimation = () => {
    setIsSettled(false);
    setAnimKey((prev) => prev + 1);
  };

  return (
    <div
      key={animKey}
      className={cn('zhino-welcome-stage', isSettled && 'is-settled', className)}
      role="region"
      aria-label="خوشامدگویی دستیار ژینو با محصولات"
    >
      {/* حباب کوتاه سلام در شروع ورود */}
      <div className="zhino-anim-speech-bubble" aria-hidden="true">
        <span>سلام! 👋</span>
      </div>

      {/* محصول سمت راست (RTL: شروع) — پودر ژله توت‌فرنگی واقعی ژینو */}
      <div
        className="zhino-anim-product is-jelly"
        title="پودر ژله توت‌فرنگی ژینو"
      >
        <div className="zhino-anim-product-frame">
          <img
            src={withSiteBase('images/products/jelly-strawberry.jpg')}
            alt="پودر ژله توت‌فرنگی ژینو"
            width={64}
            height={64}
            className="zhino-anim-product-img"
            loading="eager"
            decoding="async"
          />
        </div>
        <span className="zhino-anim-product-tag">ژله توت‌فرنگی</span>
      </div>

      {/* ربات دستیار ژینو در مرکز صحنه */}
      <div
        className="zhino-anim-bot-wrap"
        onClick={restartAnimation}
        title="برای اجرای مجدد انیمیشن کلیک کنید"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            restartAnimation();
          }
        }}
        onAnimationEnd={() => setIsSettled(true)}
      >
        <div className="zhino-anim-bot-halo" />
        <div className="zhino-anim-bot-medallion">
          <img
            src={ASSISTANT_BOT_IMAGE}
            alt="دستیار ژینو"
            width={84}
            height={84}
            className="zhino-anim-bot-img"
            loading="eager"
            decoding="async"
          />
        </div>
      </div>

      {/* محصول سمت چپ (RTL: پایان) — پودر کاستر موزی واقعی ژینو */}
      <div
        className="zhino-anim-product is-custard"
        title="پودر کاستر موزی ژینو"
      >
        <div className="zhino-anim-product-frame">
          <img
            src={withSiteBase('images/products/custard-banana.jpg')}
            alt="پودر کاستر موزی ژینو"
            width={64}
            height={64}
            className="zhino-anim-product-img"
            loading="eager"
            decoding="async"
          />
        </div>
        <span className="zhino-anim-product-tag">کاستر موزی</span>
      </div>
    </div>
  );
}
