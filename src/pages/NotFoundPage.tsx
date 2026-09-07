// ============================================================
// ZHINO — 404 page
// ============================================================

import { Link } from 'react-router-dom';
import { soundService } from '../services/soundService';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 pt-24 text-center sm:px-6">
      <p className="font-display text-8xl leading-none text-gold-500/70" dir="ltr">
        404
      </p>
      <span className="rule-lux mt-6" aria-hidden="true" />
      <h1 className="mt-6 text-xl font-bold text-wine-950 sm:text-2xl">صفحه یافت نشد</h1>
      <p className="mt-3 text-sm leading-8 text-mocha">
        نشانی وارد شده اشتباه است یا این صفحه به مکان دیگری منتقل شده است.
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          to="/"
          onClick={() => soundService.play('primaryButton')}
          className="btn-lux btn-wine"
        >
          بازگشت به خانه
        </Link>
        <Link
          to="/products"
          onClick={() => soundService.play('primaryButton')}
          className="btn-lux btn-line-dark"
        >
          مشاهده محصولات
        </Link>
      </div>
    </div>
  );
}
