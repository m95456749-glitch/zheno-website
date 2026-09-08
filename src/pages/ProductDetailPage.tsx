// ============================================================
// ZHINO — product detail page (editorial v2)
// Visual hierarchy: arched plate → identity → flavor/weight →
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
      <div className="mx-auto max-w-xl px-4 pt-28 text-center sm:px-6">
        <p className="font-display text-7xl text-gold-500/70">۴۰۴</p>
        <h1 className="mt-4 text-xl font-bold text-wine-950">محصول یافت نشد</h1>
        <p className="mt-2 text-sm leading-7 text-mocha">این محصول وجود ندارد یا از فروشگاه حذف شده است.</p>
        <Link to="/products" className="btn-lux btn-wine mt-8 inline-flex">
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
    <div className="pb-8">
      {/* wine seam carrying the page header language */}
      <div className="page-plate dark-surface relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-gold-400/40 to-transparent" aria-hidden="true" />
        <nav aria-label="مسیر صفحه" className="relative mx-auto max-w-6xl px-4 pb-3 pt-5 text-[0.72rem] font-medium text-cream-200/60 sm:px-6">
          <Link to="/" className="transition hover:text-gold-300">خانه</Link>
          <span className="mx-2 text-gold-500/60">/</span>
          <Link to="/products" className="transition hover:text-gold-300">محصولات</Link>
          <span className="mx-2 text-gold-500/60">/</span>
          <span className="text-cream-100">{product.shortName}</span>
        </nav>
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 pb-2 pt-2 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14">
          {/* arched plate visual */}
          <div className="arch-unveil mx-auto w-full max-w-[24rem] lg:max-w-[26rem]">
            <figure className="frame-lux arch overflow-hidden shadow-[0_55px_100px_-45px_rgba(0,0,0,0.85)]">
              <ProductVisual
                color={flavor.color}
                emoji={flavor.emoji}
                name={product.name}
                imageUrl={product.imageUrl}
                className="aspect-[4/5] w-full"
                emojiClassName="text-7xl sm:text-8xl"
              />
              <figcaption className="sr-only">{product.name} — تصویر محصول</figcaption>
            </figure>
          </div>

          {/* identity */}
          <div className="pb-10 lg:pb-14 lg:text-right">
            <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
              <span className="font-display text-[0.62rem] uppercase tracking-[0.4em] text-gold-400">
                {product.category === 'jelly' ? 'Jelly' : 'Custard'}
              </span>
              {product.featured && (
                <span className="rounded-full bg-gold-400/15 px-3 py-1 text-[0.66rem] font-semibold text-gold-300 ring-1 ring-gold-400/40">
                  ◆ پیشنهاد ژینو
                </span>
              )}
              {product.special && (
                <span className="rounded-full bg-cream-50/10 px-3 py-1 text-[0.66rem] font-semibold text-cream-100 ring-1 ring-cream-50/25">
                  ✦ محصول ویژه
                </span>
              )}
            </div>
            <h1 className="mt-4 text-[1.9rem] font-light leading-[1.55] text-cream-50 sm:text-[2.5rem] sm:leading-[1.55]">
              {product.name}
            </h1>
            <p className="mt-3.5 max-w-xl text-sm font-light leading-8 text-cream-200/70 lg:mr-0 lg:ml-auto">
              طعم <span className="font-medium text-gold-300">{flavor.name}</span> — در بسته‌بندی {selected.weight}؛
              آماده‌ی یک دسر مجلسی با دست‌پخت خودتان.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[0.78rem] text-cream-200/70 lg:justify-end">
              <span className="flex items-center gap-2">
                <span className={cn('h-1.5 w-1.5 rounded-full', selected.available ? 'bg-emerald-400' : 'bg-red-400')} aria-hidden="true" />
                {selected.available ? 'موجود' : 'ناموجود'}
                {lowStock && selected.available && (
                  <span className="text-gold-300">· تنها {formatNumber(selected.stock)} عدد</span>
                )}
              </span>
              <span dir="ltr" className="font-display tracking-[0.22em] text-cream-200/60">{selected.sku}</span>
            </div>
          </div>
        </div>
      </div>

      {/* purchase desk on cream */}
      <div className="mx-auto -mt-8 max-w-6xl px-4 sm:px-6">
        <div className="panel-lux grid gap-6 rounded-2xl p-5 sm:p-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            {/* packaging selector */}
            <p className="mb-2.5 text-[0.72rem] font-bold text-espresso">بسته‌بندی</p>
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
                    'rounded-xl border-2 px-5 py-2.5 text-start text-sm font-bold transition duration-300 active:scale-95',
                    variant.id === selected.id
                      ? 'border-gold-500 bg-gold-400/15 text-wine-950'
                      : 'border-espresso/12 text-mocha hover:border-gold-500/60 hover:text-wine-900',
                  )}
                >
                  {variant.weight}
                  <span className="block text-[0.68rem] font-semibold opacity-70">{formatPrice(variant.price)}</span>
                </button>
              ))}
            </div>

            {/* flavor + weight facts */}
            <dl className="mt-6 grid grid-cols-3 gap-x-4 border-t border-espresso/8 pt-5 text-center sm:text-start">
              <div>
                <dt className="text-[0.64rem] text-mocha">طعم</dt>
                <dd className="mt-1 flex items-center justify-center gap-1.5 text-[0.84rem] font-bold text-wine-950 sm:justify-start">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: flavor.color }} aria-hidden="true" />
                  {flavor.name}
                </dd>
              </div>
              <div>
                <dt className="text-[0.64rem] text-mocha">وزن</dt>
                <dd className="mt-1 text-[0.84rem] font-bold text-wine-950">{selected.weight}</dd>
              </div>
              <div>
                <dt className="text-[0.64rem] text-mocha">دسته</dt>
                <dd className="mt-1 text-[0.84rem] font-bold text-wine-950">{product.categoryLabel}</dd>
              </div>
            </dl>

            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-center text-xs font-bold text-red-700 ring-1 ring-red-200">
                {error}
              </p>
            )}
          </div>

          {/* price + action column */}
          <div className="flex flex-col gap-4 border-t border-espresso/8 pt-5 lg:border-e lg:border-t-0 lg:ps-8 lg:pt-0">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[0.68rem] text-mocha">قیمت هر عدد</p>
                <p className="mt-1 text-2xl font-extrabold text-wine-900">{formatPrice(selected.price)}</p>
              </div>
              <QuantitySelector
                quantity={qty}
                onIncrease={() => setQty((q) => Math.min(q + 1, selected.stock))}
                onDecrease={() => setQty((q) => Math.max(q - 1, 1))}
                label="تعداد"
              />
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!selected.available}
              className="btn-lux btn-wine sheen rounded-xl py-4 text-base disabled:cursor-not-allowed disabled:opacity-45"
            >
              {selected.available ? 'افزودن به سبد خرید' : 'ناموجود'}
            </button>
            <p className="text-center text-[0.7rem] leading-6 text-mocha lg:text-start">
              جمع این بخش: {formatPrice(selected.price * qty)}
              <span className="mx-2 text-gold-500">·</span>
              ارسال رایگان برای سبد بالای {formatPrice(FREE_SHIPPING_THRESHOLD)}
            </p>
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-20" aria-label="محصولات مرتبط">
            <div className="mb-8 flex items-end justify-between gap-6">
              <div>
                <p className="kicker font-display">You may also like</p>
                <h2 className="mt-3 text-2xl font-light text-wine-950 sm:text-[1.8rem]">طعم‌های مرتبط</h2>
              </div>
              <Link
                to="/products"
                className="group hidden shrink-0 items-center gap-2 text-sm font-medium text-wine-900 transition hover:text-wine-700 sm:inline-flex"
              >
                همه محصولات
                <span className="transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true">←</span>
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3.5 sm:gap-5 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
