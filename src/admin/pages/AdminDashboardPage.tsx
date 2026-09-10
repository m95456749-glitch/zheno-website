// ============================================================
// ZHINO — admin dashboard
// Deliberately small: three useful numbers + two short lists.
// No charts, no vanity metrics.
// ============================================================

import { Link } from 'react-router-dom';
import { useCatalog } from '../../services/catalog';
import { getStoredOrders, useStoredOrders } from '../../services/orderStore';
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
      {/* summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link to="/admin/orders" className="adm-stat">
          <p className="text-[0.72rem] font-bold text-mocha">سفارش‌های در انتظار</p>
          <p className="mt-1.5 text-[1.65rem] font-extrabold leading-none text-wine-900">
            {formatNumber(pending)}
          </p>
          <p className="mt-2 text-[0.68rem] text-mocha-light">نیازمند بررسی و تأیید</p>
        </Link>
        <div className="adm-stat">
          <p className="text-[0.72rem] font-bold text-mocha">فروش</p>
          <p className="mt-1.5 text-[1.15rem] font-extrabold leading-snug text-wine-900">
            {formatPrice(sales)}
          </p>
          <p className="mt-2 text-[0.68rem] text-mocha-light">جمع سفارش‌ها (به‌جز لغو شده‌ها)</p>
        </div>
        <Link to="/admin/inventory" className={cn('adm-stat', lowStock.length > 0 && 'adm-stat-warn')}>
          <p className="text-[0.72rem] font-bold text-mocha">اقلام کم‌موجود</p>
          <p className="mt-1.5 text-[1.65rem] font-extrabold leading-none text-wine-900">
            {formatNumber(lowStock.length)}
          </p>
          <p className="mt-2 text-[0.68rem] text-mocha-light">
            آستانه: {formatNumber(settings.lowStockThreshold)} عدد
          </p>
        </Link>
      </div>

      {/* short lists */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="panel-lux overflow-hidden rounded-2xl">
          <header className="flex items-center justify-between border-b border-espresso/8 px-5 py-4">
            <h2 className="text-sm font-bold text-wine-950">آخرین سفارش‌ها</h2>
            <Link to="/admin/orders" className="text-xs font-bold text-wine-800 transition hover:text-wine-900">
              مشاهده همه ←
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
                <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p dir="ltr" className="truncate text-right font-display text-[0.8rem] tracking-[0.06em] text-wine-900">
                      {o.id}
                    </p>
                    <p className="mt-1 truncate text-[0.7rem] text-mocha">
                      {o.customer.firstName} {o.customer.lastName} · {formatDate(o.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className="text-[0.8rem] font-extrabold text-wine-900">{formatPrice(o.total)}</span>
                    <StatusBadge status={o.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel-lux overflow-hidden rounded-2xl">
          <header className="flex items-center justify-between border-b border-espresso/8 px-5 py-4">
            <h2 className="text-sm font-bold text-wine-950">کم‌موجودی‌ها</h2>
            <Link to="/admin/inventory" className="text-xs font-bold text-wine-800 transition hover:text-wine-900">
              مدیریت موجودی ←
            </Link>
          </header>
          {lowStock.length === 0 ? (
            <EmptyState
              icon={<IconInventory className="h-5 w-5" />}
              title="همه اقلام موجودی کافی دارند"
              text={`آستانه هشدار {formatNumber(settings.lowStockThreshold)} عدد است؛ اگر موجودی هر محصول از آن کمتر شود اینجا اعلام می‌شود.`}
            />
          ) : (
            <ul className="divide-y divide-espresso/6">
              {lowStock.slice(0, 5).map(({ product, variant }) => (
                <li
                  key={`${product.id}__${variant.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[0.8rem] font-bold text-espresso">{product.shortName}</p>
                    <p className="mt-0.5 text-[0.68rem] text-mocha">{variant.weight}</p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-[0.8rem] font-extrabold',
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

      {/* quiet note */}
      <p className="mt-5 text-[0.68rem] leading-6 text-mocha-light">
        {getStoredOrders().length > 0
          ? `مجموع ${formatNumber(getStoredOrders().length)} سفارش در این مرورگر ثبت شده است.`
          : 'اطلاعات این صفحه از همان داده‌های فروشگاه (سفارش‌ها و موجودی) خوانده می‌شود؛ سامانه جداگانه‌ای در کار نیست.'}
      </p>
    </div>
  );
}
