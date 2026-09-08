// ============================================================
// ZHINO — 404 page (full wine plate)
// ============================================================

import { Link } from 'react-router-dom';
import { soundService } from '../services/soundService';

export default function NotFoundPage() {
  return (
    <div className="page-plate dark-surface grain relative flex min-h-[74svh] items-center justify-center overflow-hidden px-4 py-16 text-center text-cream-50 sm:px-6">
      <p className="ghost-mark pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 select-none text-[9rem] leading-none sm:text-[16rem]" aria-hidden="true">
        404
      </p>
      <div className="relative">
        <p className="kicker kicker-dark font-display">Lost in the Kitchen</p>
        <h1 className="mt-5 text-2xl font-light sm:text-3xl">صفحه یافت نشد</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-8 text-cream-200/70">
          نشانی وارد شده اشتباه است یا این صفحه به مکان دیگری منتقل شده است.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
          <Link to="/" onClick={() => soundService.play('primaryButton')} className="btn-lux btn-gold sheen">
            بازگشت به خانه
          </Link>
          <Link
            to="/products"
            onClick={() => soundService.play('primaryButton')}
            className="group inline-flex items-center gap-2.5 border-b border-cream-50/30 pb-1.5 text-sm font-medium text-cream-100 transition hover:border-cream-50/70 hover:text-cream-50"
          >
            مشاهده محصولات
            <span className="transition-transform duration-300 group-hover:-translate-x-1.5" aria-hidden="true">←</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
