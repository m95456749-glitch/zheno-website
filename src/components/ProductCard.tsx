// ============================================================
// ZHINO — product card (data-driven, no hard-coded products)
// ============================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../types';
import { getFlavor } from '../data/products';
import { formatPrice } from '../utils/format';
import { useCartContext } from '../context/CartContext';
import ProductVisual from './ProductVisual';

export default function ProductCard({ product }: { product: Product }) {
  const { addItemWithToast } = useCartContext();
  const [error, setError] = useState<string | null>(null);

  const flavor = getFlavor(product.flavorId);
  const defaultVariant = product.variants[0];
  if (!defaultVariant) return null;

  const handleAdd = () => {
    const result = addItemWithToast(product.id, defaultVariant.id, 1);
    if (!result.success) {
      setError(result.error ?? 'خطا در افزودن به سبد');
      window.setTimeout(() => setError(null), 2500);
    }
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-3xl bg-white shadow-md shadow-stone-200/60 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-amber-100">
      <Link to={`/products/${product.id}`} className="block" aria-label={`مشاهده ${product.name}`}>
        <div className="relative">
          <ProductVisual
            color={flavor.color}
            emoji={flavor.emoji}
            name={product.name}
            className="aspect-[4/3] w-full"
          />
          <div className="absolute left-3 top-3 flex flex-col gap-1.5">
            {product.featured && (
              <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-extrabold text-amber-950 shadow">
                پیشنهاد ژینو
              </span>
            )}
            {product.special && (
              <span className="rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-extrabold text-white shadow">
                ویژه
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-[11px] font-bold text-amber-700">{product.categoryLabel}</span>
        <Link to={`/products/${product.id}`} className="font-extrabold text-slate-800 transition hover:text-amber-700">
          {product.shortName}
        </Link>
        <span className="text-xs text-slate-400">{defaultVariant.weight}</span>

        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-sm font-extrabold text-slate-800">{formatPrice(defaultVariant.price)}</span>
          <button
            type="button"
            onClick={handleAdd}
            aria-label={`افزودن ${product.shortName} به سبد خرید`}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-white shadow-md shadow-amber-200 transition hover:bg-amber-600 active:scale-95"
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
        {error && <p className="pt-1 text-xs font-semibold text-red-600">{error}</p>}
      </div>
    </div>
  );
}
