// ============================================================
// ZHINO — product card (data-driven, no hard-coded products)
// Premium food-editorial treatment: image first, quiet chrome.
// ============================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../types';
import { getFlavor } from '../data/products';
import { formatPrice } from '../utils/format';
import { useCartContext } from '../context/CartContext';
import ProductVisual from './ProductVisual';
import { cn } from '../utils/cn';

export default function ProductCard({ product }: { product: Product }) {
  const { addItemWithToast } = useCartContext();
  const [error, setError] = useState<string | null>(null);

  const flavor = getFlavor(product.flavorId);
  const defaultVariant = product.variants[0];
  if (!defaultVariant) return null;

  const priceBody = formatPrice(defaultVariant.price).replace(' تومان', '');

  const handleAdd = () => {
    const result = addItemWithToast(product.id, defaultVariant.id, 1);
    if (!result.success) {
      setError(result.error ?? 'خطا در افزودن به سبد');
      window.setTimeout(() => setError(null), 2500);
    }
  };

  return (
    <article className="card-lux group flex flex-col overflow-hidden rounded-2xl">
      <Link to={`/products/${product.id}`} className="block" aria-label={`مشاهده ${product.name}`}>
        <div className="relative overflow-hidden">
          <ProductVisual
            color={flavor.color}
            emoji={flavor.emoji}
            name={product.name}
            className="aspect-[4/5] w-full transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
          <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
            {product.featured && (
              <span className="rounded-full bg-gradient-to-l from-gold-400 to-gold-500 px-3 py-1 text-[0.62rem] font-bold text-wine-950 shadow-md shadow-wine-950/20">
                پیشنهاد ژینو
              </span>
            )}
            {product.special && (
              <span className="rounded-full bg-wine-900/90 px-3 py-1 text-[0.62rem] font-semibold text-gold-300 ring-1 ring-gold-400/40 backdrop-blur-sm">
                ویژه
              </span>
            )}
          </div>
          {/* availability — derived from catalog data, presentation only */}
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-noir/55 px-2.5 py-1 backdrop-blur-sm">
            <span
              className={cn('h-1.5 w-1.5 rounded-full', defaultVariant.available ? 'bg-emerald-400' : 'bg-red-400')}
              aria-hidden="true"
            />
            <span className="text-[0.62rem] font-medium text-cream-100">
              {defaultVariant.available ? 'موجود' : 'ناموجود'}
            </span>
          </div>
        </div>
      </Link>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5 sm:px-5 sm:pb-5">
        <span className="text-[0.68rem] font-semibold text-gold-700">
          {product.categoryLabel}
        </span>
        <Link
          to={`/products/${product.id}`}
          className="mt-1.5 font-bold leading-8 text-wine-950 transition hover:text-wine-700"
        >
          {product.shortName}
        </Link>
        <p className="mt-1 flex items-center gap-1.5 text-[0.72rem] text-mocha">
          <span className="h-2 w-2 rounded-full ring-1 ring-espresso/10" style={{ backgroundColor: flavor.color }} aria-hidden="true" />
          {flavor.name}
          <span className="text-mocha-light">·</span>
          {defaultVariant.weight}
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-espresso/8 pt-4">
          <span className="whitespace-nowrap text-[0.95rem] font-extrabold text-wine-950 sm:text-base">
            {priceBody}
            <span className="mr-1 align-middle text-[0.62rem] font-semibold text-mocha">تومان</span>
          </span>
          <button
            type="button"
            onClick={handleAdd}
            aria-label={`افزودن ${product.shortName} به سبد خرید`}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-cream-100 text-wine-900 ring-1 ring-wine-900/15 transition duration-300 hover:bg-wine-900 hover:text-gold-300 hover:ring-gold-400/40 active:scale-95"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
              <path
                d="M3 4h2l2.4 9.2a1 1 0 0 0 1 .8h6.9a1 1 0 0 0 1-.8L17.5 7H6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="9.5" cy="17" r="1.2" fill="currentColor" />
              <circle cx="15" cy="17" r="1.2" fill="currentColor" />
            </svg>
          </button>
        </div>
        {error && <p className="pt-2 text-[0.72rem] font-semibold text-red-700">{error}</p>}
      </div>
    </article>
  );
}
