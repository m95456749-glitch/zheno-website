// ============================================================
// ZHINO — cart page
// ============================================================

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCartContext } from '../context/CartContext';
import {
  SHIPPING_COST_STANDARD,
  getFlavor,
  getProductById,
  getVariantById,
} from '../data/products';
import { formatNumber, formatPrice } from '../utils/format';
import { soundService } from '../services/soundService';
import FreeShippingProgress from '../components/FreeShippingProgress';
import QuantitySelector from '../components/QuantitySelector';
import ProductVisual from '../components/ProductVisual';

export default function CartPage() {
  const { items, totalItems, subtotal, isShippingFree, updateQuantity, removeItem } = useCartContext();
  const [lineError, setLineError] = useState<string | null>(null);
  const navigate = useNavigate();

  const shippingCost = items.length === 0 || isShippingFree ? 0 : SHIPPING_COST_STANDARD;
  const total = subtotal + shippingCost;

  const flashError = (message: string) => {
    setLineError(message);
    window.setTimeout(() => setLineError(null), 2500);
  };

  const goToCheckout = () => {
    soundService.play('primaryButton');
    navigate('/checkout');
  };

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-16 text-center sm:px-6">
        <div className="animate-fade-up rounded-3xl bg-white p-10 shadow-md shadow-stone-200/60">
          <span className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10" aria-hidden="true">
              <path
                d="M4 5h2l2.4 9.2a1 1 0 0 0 1 .8h6.9a1 1 0 0 0 1-.8L19.5 8H7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="10.5" cy="19" r="1.3" fill="currentColor" />
              <circle cx="16" cy="19" r="1.3" fill="currentColor" />
            </svg>
          </span>
          <h1 className="text-xl font-black text-slate-800">سبد خرید شما خالی است</h1>
          <p className="mt-2 text-sm leading-7 text-slate-500">
            هنوز محصولی انتخاب نکرده‌اید؛ طعم‌های ژینو منتظر شما هستند.
          </p>
          <Link
            to="/products"
            onClick={() => soundService.play('primaryButton')}
            className="mt-6 inline-block rounded-2xl bg-amber-500 px-8 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-amber-200 transition hover:bg-amber-600 active:scale-95"
          >
            مشاهده محصولات
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <h1 className="text-2xl font-black text-slate-900">
        سبد خرید <span className="text-base font-bold text-slate-400">({formatNumber(totalItems)} کالا)</span>
      </h1>

      {lineError && (
        <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-center text-xs font-bold text-red-600">
          {lineError}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* lines */}
        <ul className="space-y-3">
          {items.map((item) => {
            const product = getProductById(item.productId);
            const variant = getVariantById(item.productId, item.variantId);

            // Defensive: an entry that no longer matches the catalog renders
            // as a removable warning row instead of crashing the page.
            if (!product || !variant) {
              return (
                <li
                  key={`${item.productId}__${item.variantId}`}
                  className="flex items-center justify-between gap-3 rounded-3xl border border-red-200 bg-red-50 p-4"
                >
                  <p className="text-xs font-bold leading-6 text-red-700">
                    این کالا دیگر در فروشگاه موجود نیست و در جمع مبلغ لحاظ نشده است.
                  </p>
                  <button
                    type="button"
                    onClick={() => removeItem(item.productId, item.variantId)}
                    className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-bold text-red-600 shadow-sm transition hover:bg-red-100"
                  >
                    حذف
                  </button>
                </li>
              );
            }

            const flavor = getFlavor(product.flavorId);
            return (
              <li
                key={`${item.productId}__${item.variantId}`}
                className="flex gap-3 rounded-3xl bg-white p-3 shadow-md shadow-stone-200/60 sm:gap-4 sm:p-4"
              >
                <Link to={`/products/${product.id}`} className="shrink-0" aria-label={`مشاهده ${product.name}`}>
                  <ProductVisual
                    color={flavor.color}
                    emoji={flavor.emoji}
                    name={product.name}
                    className="h-24 w-24 rounded-2xl sm:h-28 sm:w-28"
                    emojiClassName="text-4xl sm:text-5xl"
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to={`/products/${product.id}`}
                        className="block truncate text-sm font-extrabold text-slate-800 transition hover:text-amber-700 sm:text-base"
                      >
                        {product.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {variant.weight} · واحد: {formatPrice(variant.price)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.productId, item.variantId)}
                      aria-label={`حذف ${product.shortName} از سبد`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                    >
                      <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                        <path
                          d="M2.5 4h11M6.5 4V2.8A.8.8 0 0 1 7.3 2h1.4a.8.8 0 0 1 .8.8V4M4 4l.7 9.2a1 1 0 0 0 1 .8h2.6a1 1 0 0 0 1-.8L12 4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <QuantitySelector
                      quantity={item.quantity}
                      onIncrease={() => {
                        const r = updateQuantity(item.productId, item.variantId, item.quantity + 1);
                        if (!r.success && r.error) flashError(r.error);
                      }}
                      onDecrease={() => {
                        const r = updateQuantity(item.productId, item.variantId, item.quantity - 1);
                        if (!r.success && r.error) flashError(r.error);
                      }}
                      label={`تعداد ${product.shortName}`}
                    />
                    <p className="text-sm font-black text-slate-900 sm:text-base">
                      {formatPrice(variant.price * item.quantity)}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* summary */}
        <aside className="h-fit space-y-4 rounded-3xl bg-white p-5 shadow-md shadow-stone-200/60 lg:sticky lg:top-24">
          <h2 className="font-extrabold text-slate-800">خلاصه سفارش</h2>
          <FreeShippingProgress subtotal={subtotal} />
          <dl className="space-y-2.5 border-t border-stone-100 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="font-semibold text-slate-500">جمع اقلام</dt>
              <dd className="font-bold text-slate-800">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="font-semibold text-slate-500">هزینه ارسال</dt>
              <dd className="font-bold text-slate-800">
                {shippingCost === 0 ? <span className="text-emerald-600">رایگان</span> : formatPrice(shippingCost)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-stone-100 pt-3 text-base">
              <dt className="font-extrabold text-slate-800">جمع کل</dt>
              <dd className="font-black text-amber-700">{formatPrice(total)}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={goToCheckout}
            className="w-full rounded-2xl bg-amber-500 px-6 py-4 text-sm font-extrabold text-white shadow-lg shadow-amber-200 transition hover:bg-amber-600 active:scale-[0.99]"
          >
            ادامه و تسویه حساب
          </button>
          <Link
            to="/products"
            className="block text-center text-xs font-bold text-slate-500 transition hover:text-amber-700"
          >
            ادامه خرید ←
          </Link>
        </aside>
      </div>
    </div>
  );
}
