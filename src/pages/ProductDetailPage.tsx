// ============================================================
// ZHINO — product detail page (editorial v2)
// Visual hierarchy: arched plate → identity → flavor/weight →
// price → availability → quantity → add to cart.
// ============================================================

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getFlavor } from '../data/products';
// lookups + list come from the shared catalog service (admin
// overlay aware); thresholds come from site settings (defaults =
// the original constants, so the page renders identically).
import { getCatalogMeta, getProductById, getVisibleProducts } from '../services/catalog';
import { getSettings } from '../services/settings';
import { formatNumber, formatPrice } from '../utils/format';
import { useCartContext } from '../context/CartContext';
import { cn } from '../utils/cn';
import ProductVisual from '../components/ProductVisual';
import { PRODUCT_DETAIL_SIZES } from '../utils/responsiveImages';
import ProductCard from '../components/ProductCard';
import QuantitySelector from '../components/QuantitySelector';
import BackButton from '../components/BackButton';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { addItemWithToast } = useCartContext();

  const product = id ? getProductById(id) : undefined;
  // a product deactivated in the admin panel is not sellable —
  // it renders exactly like a removed product (same 404 state).
  const productActive = product ? getCatalogMeta(product.id).active !== false : false;

  const [selectedVariantId, setSelectedVariantId] = useState(
    () => product?.variants[0]?.id ?? '',
  );
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  // Reset local selection when navigating between products.
  useEffect(() => {
    setSelectedVariantId(product?.variants[0]?.id ?? '');
    setQty(1);
    setError(null);
  }, [id, product?.variants]);

  if (!product || !productActive) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-28 text-center sm:px-6">
        <p className="font-display text-7xl text-wine-900/15">۴۰۴</p>
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

  const related = getVisibleProducts().filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4);
  const lowStock = selected.stock <= getSettings().lowStockThreshold;

  const handleAdd = () => {
    const result = addItemWithToast(product.id, selected.id, qty);
    if (!result.success) {
      setError(result.error ?? 'خطا در افزودن به سبد');
    } else {
      setError(null);
      setJustAdded(true);
      window.setTimeout(() => setJustAdded(false), 560);
    }
  };

  return (
    <div className="pb-6 sm:pb-8">
      {/* wine seam carrying the page header language */}
      <div className="page-plate dark-surface burgundy-ambient relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-cream-50/30 to-transparent" aria-hidden="true" />
        <div className="relative mx-auto max-w-4xl px-4 pt-5 sm:px-6">
          <div className="flex justify-start">
            <BackButton fallback="/products" />
          </div>
        </div>
        <nav aria-label="مسیر صفحه" className="relative mx-auto max-w-4xl px-4 pb-3 pt-3 text-[0.72rem] font-medium text-cream-200/60 sm:px-6">
          <Link to="/" className="transition hover:text-cream-50">خانه</Link>
          <span className="mx-2 text-cream-200/35">/</span>
          <Link to="/products" className="transition hover:text-cream-50">محصولات</Link>
          <span className="mx-2 text-cream-200/35">/</span>
          <span className="text-cream-100">{product.shortName}</span>
        </nav>
        <div className="relative mx-auto grid max-w-4xl grid-cols-1 items-center gap-5 px-4 pb-1 pt-2 sm:px-6 lg:grid-cols-[0.88fr_1fr] lg:gap-8">
          {/* arched plate visual */}
          <div className="arch-unveil mx-auto w-full max-w-[18rem] sm:max-w-[19.5rem] lg:max-w-[20.5rem]">
            <figure className="frame-lux arch overflow-hidden shadow-[0_55px_100px_-45px_rgba(0,0,0,0.85)]">
              <ProductVisual
                color={flavor.color}
                emoji={flavor.emoji}
                name={product.name}
                imageUrl={product.imageUrl}
                sizes={PRODUCT_DETAIL_SIZES}
                eager
                className="aspect-[4/5] w-full"
                emojiClassName="text-7xl sm:text-8xl"
              />
              <figcaption className="sr-only">{product.name} — تصویر محصول</figcaption>
            </figure>
          </div>

          {/* identity */}
          <div className="pb-6 lg:pb-8 lg:text-right">
            <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
              <span className="font-display text-[0.62rem] uppercase tracking-[0.4em] text-cream-200/70">
                {product.category === 'jelly' ? 'Jelly' : 'Custard'}
              </span>
              {product.featured && (
                <span className="rounded-full bg-cream-50/10 px-3 py-1 text-[0.66rem] font-semibold text-cream-50 ring-1 ring-cream-50/20">
                  ◆ پیشنهاد ژینو
                </span>
              )}
              {product.special && (
                <span className="rounded-full bg-cream-50/10 px-3 py-1 text-[0.66rem] font-semibold text-cream-100 ring-1 ring-cream-50/25">
                  ✦ محصول ویژه
                </span>
              )}
            </div>
            <h1 className="mt-3 text-[1.6rem] font-light leading-[1.5] text-cream-50 sm:text-[2rem] sm:leading-[1.48] lg:text-[2.1rem]">
              {product.name}
            </h1>
            <p className="mt-2.5 max-w-lg text-[0.9rem] font-light leading-7 text-cream-200/72 lg:mr-0 lg:ml-auto">
              طعم <span className="font-semibold text-cream-50">{flavor.name}</span> — در بسته‌بندی {selected.weight}؛
              آماده‌ی یک دسر مجلسی با دست‌پخت خودتان.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[0.75rem] text-cream-200/72 lg:justify-end">
              <span className="flex items-center gap-2">
                <span className={cn('h-1.5 w-1.5 rounded-full', selected.available ? 'bg-emerald-400' : 'bg-red-400')} aria-hidden="true" />
                {selected.available ? 'موجود' : 'ناموجود'}
                {lowStock && selected.available && (
                  <span className="text-cream-200">· تنها {formatNumber(selected.stock)} عدد</span>
                )}
              </span>
              <span dir="ltr" className="font-display tracking-[0.22em] text-cream-200/60">{selected.sku}</span>
            </div>
          </div>
        </div>
      </div>

      {/* purchase desk on cream */}
      <div className="mx-auto -mt-6 max-w-4xl px-4 sm:px-6">
        <div className="panel-lux grid gap-4 rounded-[1.35rem] p-4 sm:p-5 lg:grid-cols-[1.08fr_0.92fr] lg:gap-5">
          <div>
            {/* packaging selector */}
            <p className="mb-2 text-[0.72rem] font-bold text-espresso">بسته‌بندی</p>
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
                    'rounded-xl border-2 px-4.5 py-2 text-start text-[0.92rem] font-bold transition duration-300 active:scale-95',
                    variant.id === selected.id
                      ? 'border-wine-800 bg-wine-800/8 text-wine-900'
                      : 'border-espresso/12 text-mocha hover:border-wine-700/60 hover:text-wine-900',
                  )}
                >
                  {variant.weight}
                  <span className="block text-[0.68rem] font-semibold opacity-70">{formatPrice(variant.price)}</span>
                </button>
              ))}
            </div>

            {/* flavor + weight facts */}
            <dl className="mt-5 grid grid-cols-3 gap-x-3 border-t border-espresso/8 pt-4 text-center sm:text-start">
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
              <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-center text-xs font-bold text-red-700 ring-1 ring-red-200">
                {error}
              </p>
            )}
          </div>

          {/* price + action column */}
          <div className="flex flex-col gap-3.5 border-t border-espresso/8 pt-4 lg:border-e lg:border-t-0 lg:ps-6 lg:pt-0">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[0.68rem] text-mocha">قیمت هر عدد</p>
                <p className="mt-1 text-[1.7rem] font-extrabold text-wine-900 sm:text-[1.8rem]">{formatPrice(selected.price)}</p>
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
              className={cn(
                'btn-lux btn-wine btn-add sheen rounded-xl py-3.5 text-[0.98rem] disabled:cursor-not-allowed disabled:opacity-45',
                justAdded && 'is-added',
              )}
            >
              {selected.available ? 'افزودن به سبد خرید' : 'ناموجود'}
            </button>
            <p className="text-center text-[0.68rem] leading-6 text-mocha lg:text-start">
              جمع این بخش: {formatPrice(selected.price * qty)}
              <span className="mx-2 text-mocha-light">·</span>
              ارسال رایگان برای سبد بالای {formatPrice(getSettings().freeShippingThreshold)}
            </p>
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-12" aria-label="محصولات مرتبط">
            <div className="mb-6 flex items-end justify-between gap-6">
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
