// ============================================================
// ZHINO — cart page
// Presentation layer only; quantity/remove/totals logic is the
// untouched cart context.
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
import PagePlate from '../components/PagePlate';

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
      <div>
        <PagePlate
          kicker="Your Basket"
          title="سبد خرید"
          ghost="Cart"
        />
        <div className="mx-auto max-w-xl px-4 pb-10 pt-8 text-center sm:px-6">
          <div className="animate-fade-up panel-lux -mt-14 rounded-2xl p-10 sm:p-12">
          <span className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-cream-100 text-wine-900 ring-1 ring-wine-900/10">
            <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10" aria-hidden="true">
              <path
                d="M4 5h2l2.4 9.2a1 1 0 0 0 1 .8h6.9a1 1 0 0 0 1-.8L19.5 8H7"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="10.5" cy="19" r="1.3" fill="currentColor" />
              <circle cx="16" cy="19" r="1.3" fill="currentColor" />
            </svg>
          </span>
          <h1 className="text-xl font-bold text-wine-950">سبد خرید شما خالی است</h1>
          <p className="mt-2.5 text-sm leading-8 text-mocha">
            هنوز محصولی انتخاب نکرده‌اید؛ طعم‌های ژینو منتظر شما هستند.
          </p>
          <Link
            to="/products"
            onClick={() => soundService.play('primaryButton')}
            className="btn-lux btn-wine mt-8 inline-flex"
          >
            مشاهده محصولات
          </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PagePlate
        kicker="Your Selection"
        title={
          <>
            سبد خرید{' '}
            <span className="text-base font-medium text-cream-200/70">({formatNumber(totalItems)} کالا)</span>
          </>
        }
        ghost="Cart"
      />

      <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6">

      {lineError && (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-center text-xs font-bold text-red-700 ring-1 ring-red-200"
        >
          {lineError}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
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
                  className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50/70 p-4"
                >
                  <p className="text-xs font-semibold leading-6 text-red-700">
                    این کالا دیگر در فروشگاه موجود نیست و در جمع مبلغ لحاظ نشده است.
                  </p>
                  <button
                    type="button"
                    onClick={() => removeItem(item.productId, item.variantId)}
                    className="shrink-0 rounded-lg bg-white px-4 py-2 text-xs font-bold text-red-700 ring-1 ring-red-200 transition hover:bg-red-100"
                  >
                    حذف
                  </button>
                </li>
              );
            }

            const flavor = getFlavor(product.flavorId);
            return (
              <li key={`${item.productId}__${item.variantId}`} className="card-lux flex gap-3.5 rounded-xl p-3.5 sm:gap-5 sm:p-4">
                <Link to={`/products/${product.id}`} className="shrink-0" aria-label={`مشاهده ${product.name}`}>
                  <ProductVisual
                    color={flavor.color}
                    emoji={flavor.emoji}
                    name={product.name}
                    imageUrl={product.imageUrl}
                    className="h-24 w-24 rounded-lg sm:h-28 sm:w-28"
                    emojiClassName="text-4xl sm:text-5xl"
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to={`/products/${product.id}`}
                        className="block truncate text-sm font-bold text-wine-950 transition hover:text-wine-700 sm:text-base"
                      >
                        {product.name}
                      </Link>
                      <p className="mt-1 text-[0.7rem] text-mocha">
                        {variant.weight} · واحد: {formatPrice(variant.price)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.productId, item.variantId)}
                      aria-label={`حذف ${product.shortName} از سبد`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-mocha-light transition hover:bg-red-50 hover:text-red-600"
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
                    <p className="whitespace-nowrap text-sm font-extrabold text-wine-950 sm:text-base">
                      {formatPrice(variant.price * item.quantity)}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* summary */}
        <aside className="panel-lux h-fit space-y-4 rounded-2xl p-5 lg:sticky lg:top-24 lg:p-6">
          <h2 className="flex items-center justify-between text-base font-bold text-wine-950">
            خلاصه سفارش
            <span className="rule-lux !w-10" aria-hidden="true" />
          </h2>
          <FreeShippingProgress subtotal={subtotal} />
          <dl className="space-y-3 border-t border-espresso/10 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-mocha">جمع اقلام</dt>
              <dd className="font-bold text-espresso">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mocha">هزینه ارسال</dt>
              <dd className="font-bold text-espresso">
                {shippingCost === 0 ? <span className="text-emerald-700">رایگان</span> : formatPrice(shippingCost)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-espresso/10 pt-4">
              <dt className="font-bold text-wine-950">جمع کل</dt>
              <dd className="text-xl font-extrabold text-wine-900">{formatPrice(total)}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={goToCheckout}
            className="btn-lux btn-gold sheen w-full rounded-xl text-base"
          >
            ادامه و تسویه حساب
          </button>
          <Link
            to="/products"
            className="block text-center text-xs font-semibold text-mocha transition hover:text-wine-800"
          >
            ادامه خرید ←
          </Link>
        </aside>
      </div>
      </div>
    </div>
  );
}
