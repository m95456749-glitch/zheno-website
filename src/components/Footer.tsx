// ============================================================
// ZHINO — site footer
// ============================================================

import { Link } from 'react-router-dom';
import { toPersianDigits } from '../utils/format';

export default function Footer() {
  const year = toPersianDigits(new Date().getFullYear());

  return (
    <footer className="mt-16 bg-slate-900 text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 text-xl font-black text-white">
              ژ
            </span>
            <span className="text-lg font-black text-white">ژینو</span>
          </div>
          <p className="text-sm leading-7 text-slate-400">
            پودر ژله و پودر کاستارد ژینو با ۱۵ طعم اصیل؛ کیفیت واقعی، انتخاب ژینو.
          </p>
        </div>

        <nav aria-label="دسترسی سریع">
          <h2 className="mb-4 text-sm font-extrabold text-white">دسترسی سریع</h2>
          <ul className="space-y-2.5 text-sm font-semibold">
            <li><Link to="/" className="transition hover:text-amber-400">خانه</Link></li>
            <li><Link to="/products" className="transition hover:text-amber-400">همه محصولات</Link></li>
            <li><Link to="/products?category=jelly" className="transition hover:text-amber-400">پودر ژله</Link></li>
            <li><Link to="/products?category=custard" className="transition hover:text-amber-400">پودر کاستارد</Link></li>
            <li><Link to="/recipes" className="transition hover:text-amber-400">دستورهای خوشمزه</Link></li>
            <li><Link to="/cart" className="transition hover:text-amber-400">سبد خرید</Link></li>
          </ul>
        </nav>

        <div>
          <h2 className="mb-4 text-sm font-extrabold text-white">ارتباط با ژینو</h2>
          <ul className="space-y-2.5 text-sm font-semibold">
            <li><Link to="/about" className="transition hover:text-amber-400">درباره ما</Link></li>
            <li><Link to="/contact" className="transition hover:text-amber-400">تماس با ما</Link></li>
            <li className="leading-7 text-slate-400">پاسخ‌گویی در ساعات کاری از طریق فرم تماس</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:px-6">
          <span>© {year} ژینو — تمامی حقوق محفوظ است.</span>
          <span>کیفیت واقعی، انتخاب ژینو</span>
        </div>
      </div>
    </footer>
  );
}
