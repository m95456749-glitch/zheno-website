// ============================================================
// ZHINO — product detail page
// Visual hierarchy: image → identity → flavor → weight →
// price → availability → quantity → add to cart.
// ============================================================

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FREE_SHIPPING_THRESHOLD, PRODUCTS, getFlavor, getProductById } from '../data/products';
import { formatNumber, formatPrice } from '../utils/format';
import { useCartContext } from '../context/CartContext';
import { cn } from '../utils/cn';
import ProductVisual from '../components/ProductVisual';
import ProductCard from '../components/ProductCard';
import QuantitySelector from '../components/QuantitySelector';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { addItemWithToast } = useCartContext();

  const product = id ? getProductById(id) : undefined;

  const [selectedVariantId, setSelectedVariantId] = useState(
    () => product?.variants[0]?.id ?? '',
  );
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Reset local selection when navigating between products.
  useEffect(() => {
    setSelectedVariantId(product?.variants[0]?.id ?? '');
    setQty(1);
    setError(null);
  }, [id, product?.variants]);

  if (!product) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-24 text-center sm:px-6">
        <p className="font-display text-7xl text-gold-500/70">۴۰۴</p>
        <h1 className="mt-4 text-xl font-bold text-wine-950">محصول یافت نشد</h1>
        <p className="mt-2 text-sm leading-7 text-mocha">این محصول وجود ندارد یا از فروشگاه حذف شده است.</p>
        <Link
          to="/products"
          className="btn-lux btn-wine mt-8 inline-flex"
        >
          بازگشت به محصولات
        </Link>
      </div>
    );
  }

  const flavor = getFlavor(product.flavorId);
  const selected = product.variants.find((v) => v.id === selectedVariantId) ?? product.variants[0];
  if (!selected) return null;

  const related = PRODUCTS.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4);
  const lowStock = selected.stock <= 30;

  const handleAdd = () => {
    const result = addItemWithToast(product.id, selected.id, qty);
    if (!result.success) {
      setError(result.error ?? 'خطا در افزودن به سبد');
    } else {
      setError(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-6 pt-10 sm:px-6">
      <nav aria-label="مسیر صفحه" className="mb-8 text-xs font-medium text-mocha-light">
        <Link to="/" className="transition hover:text-wine-800">خانه</Link>
        <span className="mx-2 text-gold-500/70">/</span>
        <Link to="/products" className="transition hover:text-wine-800">محصولات</Link>
        <span className="mx-2 text-gold-500/70">/</span>
        <span className="text-wine-900">{product.shortName}</span>
      </nav>

      <div className="grid items-start gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14">
        {/* ── image ─────────────────────────────────────── */}
        <div className="animate-fade-up">
          <div className="frame-lux rounded-2xl">
            <ProductVisual
              color={flavor.color}
              emoji={flavor.emoji}
              name={product.name}
              className="aspect-square w-full rounded-2xl shadow-[0_45px_90px_-45px_rgba(32,10,16,0.55)] sm:aspect-[4/3.4] lg:aspect-square"
              emojiClassName="text-8xl sm:text-9xl"
            />
          </div>
          <dl className="mt-6 grid grid-cols-3 gap-2.5 text-center">
            <div className="panel-lux rounded-xl px-2 py-3.5">
              <dt className="text-[0.65rem] text-mocha">طعم</dt>
              <dd className="mt-1 flex items-center justify-center gap-1.5 text-[0.8rem] font-bold text-wine-950">
                <span className="h-2 w-2 rounded-full ring-1 ring-espresso/10" style={{ backgroundColor: flavor.color }} aria-hidden="true" />
                {flavor.name}
              </dd>
            </div>
            <div className="panel-lux rounded-xl px-2 py-3.5">
              <dt className="text-[0.65rem] text-mocha">بسته‌بندی</dt>
              <dd className="mt-1 text-[0.8rem] font-bold text-wine-950">{selected.weight}</dd>
            </div>
            <div className="panel-lux rounded-xl px-2 py-3.5">
              <dt className="text-[0.65rem] text-mocha">موجودی</dt>
              <dd className={cn('mt-1 text-[0.8rem] font-bold', selected.available ? 'text-emerald-700' : 'text-red-700')}>
                {selected.available ? 'موجود' : 'ناموجود'}
              </dd>
            </div>
          </dl>
        </div>

        {/* ── purchase panel ────────────────────────────── */}
        <div className="animate-fade-up" style={{ animationDelay: '0.08s' }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[0.62rem] uppercase tracking-[0.4em] text-gold-700">
              {product.category === 'jelly' ? 'Jelly' : 'Custard'}
            </span>
            <span className="h-3 w-px bg-espresso/15" aria-hidden="true" />
            <span className="rounded-full bg-cream-100 px-3 py-1 text-[0.68rem] font-semibold text-wine-900 ring-1 ring-gold-500/25">
              {product.categoryLabel}
            </span>
            {product.featured && (
              <span className="rounded-full bg-gradient-to-l from-gold-400 to-gold-500 px-3 py-1 text-[0.68rem] font-bold text-wine-950">
                پیشنهاد ژینو
              </span>
            )}
            {product.special && (
              <span className="rounded-full bg-wine-900 px-3 py-1 text-[0.68rem] font-semibold text-gold-300 ring-1 ring-gold-400/40">
                محصول ویژه
              </span>
            )}
          </div>

          <h1 className="mt-4 text-[1.7rem] font-bold leading-[1.5] text-wine-950 sm:text-4xl sm:leading-[1.5]">
            {product.name}
          </h1>
          <p className="mt-3 text-sm leading-8 text-mocha">
            طعم <span className="font-bold text-espresso">{flavor.name}</span> — در بسته‌بندی {selected.weight}؛
            آماده‌ی یک دسر مجلسی با دست‌پخت خودتان.
          </p>

          {/* price plate */}
          <div className="grain relative mt-7 overflow-hidden rounded-2xl bg-gradient-to-bl from-wine-800 via-wine-900 to-noir p-6 text-cream-50 ring-1 ring-gold-400/25">
            <div className="pointer-events-none absolute -top-16 -left-10 h-44 w-44 rounded-full bg-gold-500/10 blur-3xl" aria-hidden="true" />
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[0.68rem] text-cream-200/70">قیمت هر عدد</p>
                <p className="mt-1.5 text-3xl font-extrabold tracking-tight text-gold-300">
                  {formatPrice(selected.price)}
                </p>
              </div>
              <div className="text-left">
                <p className="text-[0.68rem] text-cream-200/70">کد کالا (SKU)</p>
                <p className="mt-1.5 font-display text-sm tracking-[0.18em] text-cream-100" dir="ltr">{selected.sku}</p>
              </div>
            </div>
            <p className="mt-4 border-t border-cream-50/10 pt-3.5 text-[0.72rem] leading-6 text-cream-200/65">
              ارسال رایگان برای سبد بالای {formatPrice(FREE_SHIPPING_THRESHOLD)}
              {lowStock && selected.available ? (
                <span className="mr-2 font-bold text-gold-300">
                  · تنها {formatNumber(selected.stock)} عدد باقی مانده
                </span>
              ) : null}
            </p>
          </div>

          {/* packaging selector */}
          <div className="mt-6">
            <p className="mb-2.5 text-[0.72rem] font-bold text-espresso">بسته‌بندی:</p>
            <div className="flex flex-wrap gap-2">
              {product.variants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => {
                    setSelectedVariantId(variant.id);
                    setQty(1);
                    setError(null);
                  }}
                  aria-pressed={variant.id === selected.id}
                  className={cn(
                    'rounded-xl border-2 px-5 py-2.5 text-sm font-bold transition active:scale-95',
                    variant.id === selected.id
                      ? 'border-gold-500 bg-gold-400/15 text-wine-950'
                      : 'border-espresso/12 bg-transparent text-mocha hover:border-gold-500/60 hover:text-wine-900',
                  )}
                >
                  {variant.weight}
                  <span className="block text-[0.68rem] font-semibold opacity-70">{formatPrice(variant.price)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* qty + add */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <QuantitySelector
              quantity={qty}
              onIncrease={() => setQty((q) => Math.min(q + 1, selected.stock))}
              onDecrease={() => setQty((q) => Math.max(q - 1, 1))}
              label="تعداد"
            />
            <div className="sm:mr-auto sm:text-left">
              <p className="text-[0.65rem] text-mocha">جمع این بخش: {formatPrice(selected.price * qty)}</p>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!selected.available}
              className="btn-lux btn-wine w-full flex-1 rounded-xl text-base disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
            >
              {selected.available ? 'افزودن به سبد خرید' : 'ناموجود'}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-center text-xs font-bold text-red-700 ring-1 ring-red-200">
              {error}
            </p>
          )}

          <div className="mt-6 grid gap-2 text-[0.75rem] text-mocha sm:grid-cols-2">
            <p className="flex items-center gap-2 rounded-lg bg-cream-100 px-4 py-3 ring-1 ring-espresso/8">
              <span aria-hidden="true" className="text-gold-700">✦</span>
              کیفیت واقعی، انتخاب ژینو
            </p>
            <p className="flex items-center gap-2 rounded-lg bg-cream-100 px-4 py-3 ring-1 ring-espresso/8">
              <span aria-hidden="true" className="text-gold-700">✦</span>
              دستور تهیه اختصاصی برای هر طعم
            </p>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20" aria-label="محصولات مرتبط">
          <div className="mb-7 text-center">
            <p className="kicker font-display">You may also like</p>
            <h2 className="mt-2.5 text-xl font-bold text-wine-950 sm:text-2xl">طعم‌های مرتبط</h2>
          </div>
          <div className="grid grid-cols-2 gap-3.5 sm:gap-5 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
