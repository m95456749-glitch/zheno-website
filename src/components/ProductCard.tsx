// ============================================================
// ZHINO — product card (editorial, compact, image-first)
// The plated product visual is the star; below it only the
// essentials: name, weight, availability, price, one action.
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
  const available = defaultVariant.available;

  const handleAdd = () => {
    const result = addItemWithToast(product.id, defaultVariant.id, 1);
    if (!result.success) {
      setError(result.error ?? 'خطا در افزودن به سبد');
      window.setTimeout(() => setError(null), 2500);
    }
  };

  return (
    <article className="card-product group flex h-full flex-col">
      <Link
        to={`/products/${product.id}`}
        className="relative block"
        aria-label={`مشاهده ${product.name}`}
      >
        <ProductVisual
          color={flavor.color}
          emoji={flavor.emoji}
          name={product.name}
          className="aspect-square w-full sm:aspect-[5/4.6]"
        />
        {(product.featured || product.special) && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-cream-50/92 px-2.5 py-1 text-[0.58rem] font-bold text-wine-900 shadow-sm ring-1 ring-gold-500/30 backdrop-blur-sm sm:right-3 sm:top-3 sm:text-[0.62rem]">
            <span className="ml-1 text-gold-600" aria-hidden="true">
              {product.special ? '✦' : '◆'}
            </span>
            {product.special ? 'ویژه' : 'پیشنهاد ژینو'}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5 sm:px-4 sm:pb-5 sm:pt-4">
        <Link
          to={`/products/${product.id}`}
          className="truncate text-[0.92rem] font-semibold leading-7 text-wine-950 transition-colors hover:text-wine-700 sm:text-[0.98rem]"
        >
          {product.shortName}
        </Link>

        <p className="mt-1 flex items-center gap-1.5 text-[0.66rem] leading-6 text-mocha">
          <span>{defaultVariant.weight}</span>
          <span className="text-gold-500" aria-hidden="true">
            ·
          </span>
          <span className="flex items-center gap-1">
            <span
              className={cn('h-1.5 w-1.5 rounded-full', available ? 'bg-emerald-600' : 'bg-red-500')}
              aria-hidden="true"
            />
            {available ? 'موجود' : 'ناموجود'}
          </span>
        </p>

        <p className="mt-2 whitespace-nowrap text-[0.92rem] font-extrabold text-wine-900 sm:text-[1rem]">
          {priceBody}
          <span className="mr-1 text-[0.6rem] font-medium text-mocha">تومان</span>
        </p>

        <button
          type="button"
          onClick={handleAdd}
          disabled={!available}
          aria-label={`افزودن ${product.shortName} به سبد خرید`}
          className="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-lg bg-wine-900 text-[0.72rem] font-bold text-cream-50 shadow-sm shadow-wine-900/25 transition duration-300 hover:bg-wine-800 hover:shadow-md active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 sm:h-11 sm:rounded-xl sm:text-[0.78rem]"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
            <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          افزودن به سبد
        </button>

        {error && <p className="pt-1.5 text-[0.66rem] font-semibold text-red-700">{error}</p>}
      </div>
    </article>
  );
}
