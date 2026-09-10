// ============================================================
// ZHINO — admin dashboard
// Deliberately small: one plain row of three numbers + two
// short lists. No charts, no vanity metrics, no decorative
// cards — the owner sees at a glance what needs attention.
// ============================================================

import { Link } from 'react-router-dom';
import { useCatalog } from '../../services/catalog';
import { useStoredOrders } from '../../services/orderStore';
import { getSettings } from '../../services/settings';
import { formatNumber, formatPrice } from '../../utils/format';
import { formatDate } from '../format';
import { EmptyState, StatusBadge } from '../components/ui';
import { IconOrders, IconInventory } from '../Icons';
import { cn } from '../../utils/cn';

export default function AdminDashboardPage() {
  const orders = useStoredOrders();
  const catalog = useCatalog();
  const settings = getSettings();

  const pending = orders.filter((o) => o.status === 'new' || o.status === 'confirmed').length;
  const sales = orders.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0);
  const lowStock = catalog.flatMap((p) =>
    p.variants
      .filter((v) => v.stock <= settings.lowStockThreshold)
      .map((v) => ({ product: p, variant: v })),
  );
  const recent = orders.slice(0, 5);

  return (
    <div>
      {/* three plain numbers — the whole summary */}
      <div className="panel-lux grid grid-cols-1 rounded-2xl sm:grid-cols-3 sm:divide-x sm:divide-x-reverse sm:divide-espresso/8">
        <div className="px-6 py-5">
          <p className="text-[0.75rem] font-bold text-mocha">سفارش‌های در انتظار</p>
          <p className="mt-1 text-[1.7rem] font-extrabold leading-none text-wine-900">
            {formatNumber(pending)}
          </p>
        </div>
        <div className="border-t border-espresso/8 px-6 py-5 sm:border-t-0">
          <p className="text-[0.75rem] font-bold text-mocha">فروش</p>
          <p className="mt-2 text-[1.15rem] font-extrabold leading-snug text-wine-900">
            {formatPrice(sales)}
          </p>
        </div>
        <div className="border-t border-espresso/8 px-6 py-5 sm:border-t-0">
          <p className="text-[0.75rem] font-bold text-mocha">اقلام کم‌موجود</p>
          <p
            className={cn(
              'mt-1 text-[1.7rem] font-extrabold leading-none',
              lowStock.length > 0 ? 'text-gold-700' : 'text-wine-900',
            )}
          >
            {formatNumber(lowStock.length)}
          </p>
        </div>
      </div>

      {/* latest orders */}
      <section className="panel-lux mt-6 overflow-hidden rounded-2xl">
        <header className="flex items-center justify-between border-b border-espresso/8 px-5 py-4">
          <h2 className="text-sm font-bold text-wine-950">آخرین سفارش‌ها</h2>
          <Link to="/admin/orders" className="adm-quiet-link">
            مشاهده همه
          </Link>
        </header>
        {recent.length === 0 ? (
          <EmptyState
            icon={<IconOrders className="h-5 w-5" />}
            title="هنوز سفارشی ثبت نشده است"
            text="سفارش‌هایی که از طریق تسویه‌حساب سایت ثبت می‌شوند (در حالت نمایشی: همین مرورگر) اینجا فهرست می‌شوند."
          />
        ) : (
          <ul className="divide-y divide-espresso/6">
            {recent.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p dir="ltr" className="truncate text-right font-display text-[0.8rem] tracking-[0.06em] text-wine-900">
                    {o.id}
                  </p>
                  <p className="mt-1 truncate text-[0.72rem] text-mocha">
                    {o.customer.firstName} {o.customer.lastName} · {formatDate(o.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <span className="text-[0.82rem] font-extrabold text-wine-900">{formatPrice(o.total)}</span>
                  <StatusBadge status={o.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* low stock */}
      <section className="panel-lux mt-5 overflow-hidden rounded-2xl">
        <header className="flex items-center justify-between border-b border-espresso/8 px-5 py-4">
          <h2 className="text-sm font-bold text-wine-950">کم‌موجودی‌ها</h2>
          <Link to="/admin/inventory" className="adm-quiet-link">
            مدیریت موجودی
          </Link>
        </header>
        {lowStock.length === 0 ? (
          <EmptyState
            icon={<IconInventory className="h-5 w-5" />}
            title="همه اقلام موجودی کافی دارند"
            text={`اگر موجودی هر محصول به ${formatNumber(settings.lowStockThreshold)} عدد یا کمتر برسد، اینجا اعلام می‌شود.`}
          />
        ) : (
          <ul className="divide-y divide-espresso/6">
            {lowStock.slice(0, 5).map(({ product, variant }) => (
              <li
                key={`${product.id}__${variant.id}`}
                className="flex items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.82rem] font-bold text-espresso">{product.shortName}</p>
                  <p className="mt-0.5 text-[0.68rem] text-mocha">{variant.weight}</p>
                </div>
                <span
                  className={cn(
                    'shrink-0 text-[0.82rem] font-extrabold',
                    variant.stock === 0 ? 'text-red-600' : 'text-gold-700',
                  )}
                >
                  {formatNumber(variant.stock)} عدد
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
