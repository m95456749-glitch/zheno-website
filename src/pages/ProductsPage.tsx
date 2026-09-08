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
import PagePlate from '../components/PagePlate';
import { useReveal } from '../hooks/useReveal';

type Filter = 'all' | ProductCategory;

const TABS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'همه محصولات' },
  { id: 'jelly', label: 'پودر ژله' },
  { id: 'custard', label: 'پودر کاستر' },
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
    <div>
      <PagePlate
        kicker="The Zhino Collection"
        title="محصولات ژینو"
        lead={`${formatNumber(filtered.length)} محصول در بسته‌بندی ${formatNumber(250)} گرمی؛ همه طعم‌ها، یک کیفیت.`}
        ghost="Collection"
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* filters — a floating pill bar overlapping the plate seam */}
        <div
          className="panel-lux relative z-10 mx-auto -mt-10 flex w-fit flex-wrap items-center justify-center gap-1 rounded-full px-2 py-2"
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
                  'flex items-baseline gap-2 rounded-full px-4.5 py-2 text-[0.82rem] font-medium transition duration-300 sm:px-5',
                  isActive
                    ? 'bg-wine-900 text-cream-50 shadow-md shadow-wine-900/25'
                    : 'text-mocha hover:bg-cream-100 hover:text-wine-900',
                )}
              >
                {tab.label}
                <span className={cn('text-[0.68rem]', isActive ? 'text-cream-200/75' : 'text-mocha-light')}>
                  {formatNumber(counts[tab.id])}
                </span>
              </button>
            );
          })}
        </div>

        <div ref={gridReveal} className="mt-10 grid grid-cols-2 gap-4 pb-16 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="py-16 text-center text-sm text-mocha">محصولی در این دسته یافت نشد.</p>
        )}
      </div>
    </div>
  );
}
