// ============================================================
// ZHINO — site footer (deep wine, editorial columns)
// ============================================================

import { Link } from 'react-router-dom';
import { toPersianDigits } from '../utils/format';

export default function Footer() {
  const year = toPersianDigits(new Date().getFullYear());

  return (
    <footer className="grain relative mt-24 overflow-hidden bg-noir text-cream-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-gold-500/60 to-transparent" aria-hidden="true" />
      <div className="pointer-events-none absolute -top-40 right-1/4 h-80 w-80 rounded-full bg-wine-800/40 blur-[110px]" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-wine-900 text-xl font-extrabold text-gold-300 ring-1 ring-gold-500/30">
              ژ
            </span>
            <span className="leading-tight">
              <span className="block text-xl font-bold text-cream-50">ژینو</span>
              <span className="block font-display text-[0.62rem] uppercase tracking-[0.42em] text-gold-400">Zhino</span>
            </span>
          </div>
          <p className="max-w-sm text-sm leading-8 text-cream-200/70">
            پودر ژله و پودر کاستارد ژینو با ۱۵ طعم اصیل در بسته‌بندی ۲۵۰ گرمی؛
            طعمِ اصیل، انتخابِ متفاوت.
          </p>
          <span className="mt-6 rule-lux" aria-hidden="true" />
        </div>

        <nav aria-label="دسترسی سریع">
          <h2 className="kicker kicker-dark mb-5 font-display">Collection</h2>
          <ul className="space-y-3 text-sm">
            <li><Link to="/" className="text-cream-200/80 transition hover:text-gold-300">خانه</Link></li>
            <li><Link to="/products" className="text-cream-200/80 transition hover:text-gold-300">همه محصولات</Link></li>
            <li><Link to="/products?category=jelly" className="text-cream-200/80 transition hover:text-gold-300">پودر ژله</Link></li>
            <li><Link to="/products?category=custard" className="text-cream-200/80 transition hover:text-gold-300">پودر کاستارد</Link></li>
            <li><Link to="/recipes" className="text-cream-200/80 transition hover:text-gold-300">دستورهای خوشمزه</Link></li>
            <li><Link to="/cart" className="text-cream-200/80 transition hover:text-gold-300">سبد خرید</Link></li>
          </ul>
        </nav>

        <div>
          <h2 className="kicker kicker-dark mb-5 font-display">Contact</h2>
          <ul className="space-y-3 text-sm">
            <li><Link to="/about" className="text-cream-200/80 transition hover:text-gold-300">درباره ما</Link></li>
            <li><Link to="/contact" className="text-cream-200/80 transition hover:text-gold-300">تماس با ما</Link></li>
            <li className="pt-1 leading-8 text-cream-200/60">پاسخ‌گویی در ساعات کاری از طریق فرم تماس</li>
          </ul>
        </div>
      </div>

      <div className="relative border-t border-cream-50/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2.5 px-4 py-6 text-xs text-cream-200/50 sm:flex-row sm:px-6">
          <span>© {year} ژینو — تمامی حقوق محفوظ است.</span>
          <span className="font-display tracking-[0.25em]">Quality, The ZHINO Way</span>
        </div>
      </div>
    </footer>
  );
}
