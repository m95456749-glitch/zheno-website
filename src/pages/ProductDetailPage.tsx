// ============================================================
// ZHINO — product detail page
// ============================================================

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PRODUCTS, getFlavor, getProductById } from '../data/products';
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
      <div className="mx-auto max-w-xl px-4 pt-20 text-center sm:px-6">
        <p className="text-6xl font-black text-amber-300">۴۰۴</p>
        <h1 className="mt-4 text-xl font-black text-slate-800">محصول یافت نشد</h1>
        <p className="mt-2 text-sm text-slate-500">این محصول وجود ندارد یا از فروشگاه حذف شده است.</p>
        <Link
          to="/products"
          className="mt-6 inline-block rounded-2xl bg-amber-500 px-7 py-3 text-sm font-extrabold text-white transition hover:bg-amber-600"
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
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
      <nav aria-label="مسیر صفحه" className="mb-6 text-xs font-semibold text-slate-400">
        <Link to="/" className="transition hover:text-amber-700">خانه</Link>
        <span className="mx-1.5">/</span>
        <Link to="/products" className="transition hover:text-amber-700">محصولات</Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-600">{product.shortName}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="animate-fade-up">
          <ProductVisual
            color={flavor.color}
            emoji={flavor.emoji}
            name={product.name}
            className="aspect-square w-full rounded-3xl shadow-xl sm:aspect-[4/3] lg:aspect-square"
            emojiClassName="text-8xl sm:text-9xl"
          />
        </div>

        <div className="animate-fade-up">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-800">
              {product.categoryLabel}
            </span>
            {product.featured && (
              <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold text-amber-950">
                پیشنهاد ژینو
              </span>
            )}
            {product.special && (
              <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-extrabold text-white">
                محصول ویژه
              </span>
            )}
          </div>

          <h1 className="mt-3 text-2xl font-black text-slate-900 sm:text-3xl">{product.name}</h1>
          <p className="mt-2 text-sm text-slate-500">
            طعم <span className="font-bold text-slate-700">{flavor.name}</span>
          </p>

          <div className="mt-5 rounded-2xl bg-white p-4 shadow-md shadow-stone-200/60">
            <p className="mb-3 text-xs font-extrabold text-slate-500">انتخاب وزن:</p>
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
                    'rounded-2xl border-2 px-4 py-2.5 text-sm font-bold transition active:scale-95',
                    variant.id === selected.id
                      ? 'border-amber-500 bg-amber-50 text-amber-900'
                      : 'border-stone-200 bg-white text-slate-600 hover:border-amber-300',
                  )}
                >
                  {variant.weight}
                  <span className="block text-[11px] font-semibold opacity-70">{formatPrice(variant.price)}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
              <QuantitySelector
                quantity={qty}
                onIncrease={() => setQty((q) => Math.min(q + 1, selected.stock))}
                onDecrease={() => setQty((q) => Math.max(q - 1, 1))}
                label="تعداد"
              />
              <div className="text-left">
                <p className="text-[11px] font-semibold text-slate-400">قیمت واحد: {formatPrice(selected.price)}</p>
                <p className="text-lg font-black text-slate-900">{formatPrice(selected.price * qty)}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAdd}
              disabled={!selected.available}
              className="mt-4 w-full rounded-2xl bg-amber-500 px-6 py-4 text-sm font-extrabold text-white shadow-lg shadow-amber-200 transition hover:bg-amber-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none"
            >
              {selected.available ? 'افزودن به سبد خرید' : 'ناموجود'}
            </button>
            {error && <p className="mt-2 text-center text-xs font-bold text-red-600">{error}</p>}
          </div>

          <dl className="mt-4 space-y-2 rounded-2xl bg-white p-4 text-xs shadow-sm">
            <div className="flex justify-between">
              <dt className="font-semibold text-slate-400">کد کالا (SKU)</dt>
              <dd className="font-bold text-slate-700" dir="ltr">{selected.sku}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="font-semibold text-slate-400">وضعیت موجودی</dt>
              <dd className={cn('font-bold', selected.available ? 'text-emerald-600' : 'text-red-600')}>
                {selected.available ? 'موجود' : 'ناموجود'}
              </dd>
            </div>
            {selected.available && lowStock && (
              <div className="flex justify-between">
                <dt className="font-semibold text-slate-400">هشدار موجودی</dt>
                <dd className="font-bold text-orange-600">تنها {formatNumber(selected.stock)} عدد باقی مانده</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-14" aria-label="محصولات مرتبط">
          <h2 className="mb-5 text-lg font-black text-slate-900 sm:text-xl">طعم‌های مرتبط</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
