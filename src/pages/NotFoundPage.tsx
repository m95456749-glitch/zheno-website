// ============================================================
// ZHINO — 404 page
// ============================================================

import { Link } from 'react-router-dom';
import { soundService } from '../services/soundService';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 pt-20 text-center sm:px-6">
      <p className="text-7xl font-black text-amber-300" dir="ltr">404</p>
      <h1 className="mt-4 text-xl font-black text-slate-800">صفحه یافت نشد</h1>
      <p className="mt-2 text-sm leading-7 text-slate-500">
        نشانی وارد شده اشتباه است یا این صفحه به مکان دیگری منتقل شده است.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          to="/"
          onClick={() => soundService.play('primaryButton')}
          className="rounded-2xl bg-amber-500 px-7 py-3 text-sm font-extrabold text-white transition hover:bg-amber-600"
        >
          بازگشت به خانه
        </Link>
        <Link
          to="/products"
          onClick={() => soundService.play('primaryButton')}
          className="rounded-2xl bg-stone-100 px-7 py-3 text-sm font-extrabold text-slate-700 transition hover:bg-stone-200"
        >
          مشاهده محصولات
        </Link>
      </div>
    </div>
  );
}
