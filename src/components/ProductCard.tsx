// ============================================================
// ZHINO — product card (data-driven, editorial v2)
// Menu-card language: tinted plate, hairline top rule that
// ignites on hover, quiet chrome, one clear action.
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
    <article className="card-lux group flex h-full flex-col overflow-hidden rounded-xl">
      <Link to={`/products/${product.id}`} className="block" aria-label={`مشاهده ${product.name}`}>
        <div className="relative">
          <ProductVisual
            color={flavor.color}
            emoji={flavor.emoji}
            name={product.name}
            className="aspect-[5/4.4] w-full sm:aspect-[5/5]"
          />
          {(product.featured || product.special) && (
            <div className="absolute right-3.5 top-3.5 flex flex-col items-end gap-1">
              {product.featured && (
                <span className="text-[0.62rem] font-bold text-wine-950/70">
                  <span className="ml-1 text-gold-600" aria-hidden="true">◆</span>
                  پیشنهاد ژینو
                </span>
              )}
              {product.special && (
                <span className="text-[0.62rem] font-semibold text-wine-800/80">
                  <span className="ml-1 text-gold-600" aria-hidden="true">✦</span>
                  ویژه
                </span>
              )}
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5 sm:px-5 sm:pb-5">
        <p className="flex items-center justify-between text-[0.68rem] font-medium text-mocha-light">
          <span className="text-gold-700">{product.categoryLabel}</span>
          <span className="flex items-center gap-1.5">
            <span
              className={cn('h-1.5 w-1.5 rounded-full', defaultVariant.available ? 'bg-emerald-600' : 'bg-red-500')}
              aria-hidden="true"
            />
            {defaultVariant.available ? 'موجود' : 'ناموجود'}
          </span>
        </p>
        <Link
          to={`/products/${product.id}`}
          className="mt-2 text-[1.02rem] font-medium leading-8 text-wine-950 transition-colors hover:text-wine-700"
        >
          {product.shortName}
        </Link>
        <p className="mt-1 text-[0.72rem] text-mocha">
          {flavor.name} <span className="mx-1 text-mocha-light">·</span> {defaultVariant.weight}
        </p>

        <div className="mt-auto flex items-end justify-between gap-2 border-t border-espresso/8 pt-3.5">
          <span className="whitespace-nowrap text-[0.98rem] font-bold text-wine-900">
            {priceBody}
            <span className="mr-1 text-[0.62rem] font-medium text-mocha">تومان</span>
          </span>
          <button
            type="button"
            onClick={handleAdd}
            aria-label={`افزودن ${product.shortName} به سبد خرید`}
            className="flex h-10 items-center gap-2 rounded-full px-3 text-[0.72rem] font-semibold text-wine-900 ring-1 ring-wine-900/20 transition duration-300 hover:bg-wine-900 hover:text-gold-300 hover:ring-gold-400/50 active:scale-95"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4.5 w-4.5" aria-hidden="true">
              <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">افزودن</span>
          </button>
        </div>
        {error && <p className="pt-2 text-[0.72rem] font-semibold text-red-700">{error}</p>}
      </div>
    </article>
  );
}
