// ============================================================
// ZHINO — products listing (filterable, data-driven)
// ============================================================

import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PRODUCTS } from '../data/products';
import type { ProductCategory } from '../types';
import { formatNumber } from '../utils/format';
import { cn } from '../utils/cn';
import ProductCard from '../components/ProductCard';

type Filter = 'all' | ProductCategory;

const TABS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'همه محصولات' },
  { id: 'jelly', label: 'پودر ژله' },
  { id: 'custard', label: 'پودر کاستارد' },
];

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get('category');
  const active: Filter = param === 'jelly' || param === 'custard' ? param : 'all';

  const counts = useMemo(
    () => ({
      all: PRODUCTS.length,
      jelly: PRODUCTS.filter((p) => p.category === 'jelly').length,
      custard: PRODUCTS.filter((p) => p.category === 'custard').length,
    }),
    [],
  );

  const filtered = useMemo(
    () => (active === 'all' ? PRODUCTS : PRODUCTS.filter((p) => p.category === active)),
    [active],
  );

  const setFilter = (filter: Filter) => {
    if (filter === 'all') {
      searchParams.delete('category');
    } else {
      searchParams.set('category', filter);
    }
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <div className="animate-fade-up text-center">
        <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">محصولات ژینو</h1>
        <p className="mt-2 text-sm text-slate-500">
          {formatNumber(filtered.length)} محصول · بسته‌بندی {formatNumber(250)} گرمی
        </p>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2" role="tablist" aria-label="فیلتر دسته‌بندی">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setFilter(tab.id)}
            className={cn(
              'rounded-full px-5 py-2.5 text-sm font-bold transition active:scale-95',
              active === tab.id
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-white text-slate-600 shadow-sm hover:bg-amber-50 hover:text-amber-800',
            )}
          >
            {tab.label}
            <span className={cn('mr-1.5 text-xs', active === tab.id ? 'text-amber-300' : 'text-slate-400')}>
              {formatNumber(counts[tab.id])}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-16 text-center text-sm text-slate-500">محصولی در این دسته یافت نشد.</p>
      )}
    </div>
  );
}
