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
import { useReveal } from '../hooks/useReveal';

type Filter = 'all' | ProductCategory;

const TABS: { id: Filter; label: string; en: string }[] = [
  { id: 'all', label: 'همه محصولات', en: 'Collection' },
  { id: 'jelly', label: 'پودر ژله', en: 'Jelly' },
  { id: 'custard', label: 'پودر کاستارد', en: 'Custard' },
];

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get('category');
  const active: Filter = param === 'jelly' || param === 'custard' ? param : 'all';

  const gridReveal = useReveal<HTMLDivElement>();

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
    <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
      {/* page head */}
      <div className="animate-fade-up text-center">
        <p className="kicker font-display">The Zhino Collection</p>
        <h1 className="mt-4 text-3xl font-bold text-wine-950 sm:text-4xl">محصولات ژینو</h1>
        <p className="mt-3 text-sm text-mocha">
          {formatNumber(filtered.length)} محصول · بسته‌بندی {formatNumber(250)} گرمی
        </p>
        <span className="rule-lux mt-6" aria-hidden="true" />
      </div>

      {/* filters */}
      <div
        className="mt-9 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 border-b border-espresso/10"
        role="tablist"
        aria-label="فیلتر دسته‌بندی"
      >
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilter(tab.id)}
              className={cn(
                'relative -mb-px flex items-baseline gap-2 px-1 py-3 text-sm font-semibold transition-colors',
                'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-center after:transition-transform after:duration-300',
                isActive
                  ? 'text-wine-900 after:scale-x-100 after:bg-gold-500'
                  : 'text-mocha after:scale-x-0 after:bg-gold-500/60 hover:text-wine-800 hover:after:scale-x-100',
              )}
            >
              {tab.label}
              <span className={cn('text-[0.7rem] font-medium', isActive ? 'text-gold-700' : 'text-mocha-light')}>
                {formatNumber(counts[tab.id])}
              </span>
            </button>
          );
        })}
      </div>

      <div ref={gridReveal} className="mt-9 grid grid-cols-2 gap-3.5 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-16 text-center text-sm text-mocha">محصولی در این دسته یافت نشد.</p>
      )}
    </div>
  );
}
