// ============================================================
// ZHINO — site footer (short, elegant closing band)
// ============================================================

import { Link } from 'react-router-dom';
import { toPersianDigits } from '../utils/format';

const FOOT_LINKS = [
  { to: '/', label: 'خانه' },
  { to: '/products', label: 'محصولات' },
  { to: '/recipes', label: 'دستور تهیه' },
  { to: '/about', label: 'درباره' },
  { to: '/contact', label: 'تماس' },
];

export default function Footer() {
  const year = toPersianDigits(new Date().getFullYear());

  return (
    <footer className="grain relative mt-14 overflow-hidden bg-noir text-cream-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-cream-50/35 to-transparent" aria-hidden="true" />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-9 sm:px-6 md:flex-row md:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-wine-900 text-lg font-extrabold text-gold-300 ring-1 ring-cream-50/15">
            ژ
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-bold text-cream-50">ژینو</span>
            <span className="block font-display text-[0.6rem] uppercase tracking-[0.42em] text-gold-400">Zhino</span>
          </span>
        </div>

        <nav aria-label="دسترسی سریع">
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 text-sm">
            {FOOT_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-cream-200/75 transition hover:text-cream-50">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="relative border-t border-cream-50/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-1.5 px-4 py-4 text-[0.72rem] text-cream-200/50 sm:flex-row sm:px-6">
          <span>© {year} ژینو — تمامی حقوق محفوظ است.</span>
          <span className="font-display tracking-[0.25em]">Quality, The ZHINO Way</span>
        </div>
      </div>
    </footer>
  );
}
