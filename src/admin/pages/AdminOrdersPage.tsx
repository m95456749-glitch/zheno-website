// ============================================================
// ZHINO — admin: order management
// Orders recorded by the existing checkout (frontend-only mode:
// same browser). Simple six-state workflow, no customer CRM.
// UI: one filter menu + one card per order; the primary action
// is the status select on each order.
// ============================================================

import { useMemo, useState } from 'react';
import {
  ORDER_STATUSES,
  updateOrderStatus,
  useStoredOrders,
  type OrderStatus,
  type StoredOrder,
} from '../../services/orderStore';
import { formatNumber, formatPrice } from '../../utils/format';
import { formatDateTime } from '../format';
import { EmptyState } from '../components/ui';
import { IconOrders } from '../Icons';
import { cn } from '../../utils/cn';

type StatusFilter = OrderStatus | 'all';

export default function AdminOrdersPage() {
  const orders = useStoredOrders();
  const [filter, setFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter],
  );

  return (
    <div>
      {/* one simple filter */}
      <div className="mb-5 flex items-center gap-2.5">
        <label htmlFor="order-status-filter" className="text-[0.78rem] font-bold text-mocha">
          نمایش:
        </label>
        <select
          id="order-status-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as StatusFilter)}
          className="adm-input sm:w-56"
        >
          <option value="all">همه سفارش‌ها</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="panel-lux rounded-2xl">
          <EmptyState
            icon={<IconOrders className="h-5 w-5" />}
            title="سفارشی در این دسته دیده نمی‌شود"
            text="سفارش‌هایی که از طریق تسویه‌حساب سایت ثبت می‌شوند (در حالت نمایشی: همین مرورگر) اینجا فهرست و مدیریت می‌شوند."
          />
        </div>
      ) : (
        <ul className="space-y-4">
          {filtered.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: StoredOrder }) {
  return (
    <li className="panel-lux overflow-hidden rounded-2xl">
      {/* header — id, date, total, and the one primary control */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-espresso/8 bg-cream-100/50 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span
            dir="ltr"
            className="rounded-lg bg-wine-900/8 px-2.5 py-1 font-display text-[0.78rem] tracking-[0.06em] text-wine-900 ring-1 ring-wine-900/15"
          >
            {order.id}
          </span>
          <span className="text-[0.72rem] text-mocha">{formatDateTime(order.createdAt)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-extrabold text-wine-900">{formatPrice(order.total)}</span>
          <select
            value={order.status}
            onChange={(e) => updateOrderStatus(order.id, e.target.value as OrderStatus)}
            aria-label={`تغییر وضعیت سفارش ${order.id}`}
            className={cn('adm-status-select', `adm-status-select-${order.status}`)}
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* body */}
      <div className="grid gap-5 px-5 py-4 lg:grid-cols-[1.1fr_0.9fr]">
        {/* items + totals */}
        <div>
          <h3 className="mb-2.5 text-[0.7rem] font-bold text-mocha">اقلام سفارش</h3>
          <ul className="space-y-2">
            {order.items.map((item, i) => (
              <li
                key={`${item.productId}__${item.variantId}__${i}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-cream-100/60 px-3.5 py-2.5 text-[0.78rem]"
              >
                <span className="min-w-0 truncate font-semibold text-espresso">
                  {item.productName}{' '}
                  <span className="font-normal text-mocha-light">
                    ({item.weight} × {formatNumber(item.quantity)})
                  </span>
                </span>
                <span className="shrink-0 font-bold text-wine-900">
                  {formatPrice(item.unitPrice * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1.5 border-t border-espresso/8 pt-3 text-[0.75rem]">
            <div className="flex justify-between">
              <dt className="text-mocha">جمع اقلام</dt>
              <dd className="font-bold text-espresso">{formatPrice(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mocha">
                ارسال ({order.shippingMethod === 'express' ? 'سریع' : 'استاندارد'})
              </dt>
              <dd className="font-bold text-espresso">
                {order.shippingCost === 0 ? 'رایگان' : formatPrice(order.shippingCost)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-espresso/8 pt-2">
              <dt className="font-bold text-wine-950">جمع کل</dt>
              <dd className="font-extrabold text-wine-900">{formatPrice(order.total)}</dd>
            </div>
          </dl>
        </div>

        {/* customer + address (as collected by the existing checkout) */}
        <div className="space-y-3.5 text-[0.78rem]">
          <div>
            <h3 className="mb-1.5 text-[0.7rem] font-bold text-mocha">مشتری</h3>
            <p className="font-bold text-espresso">
              {order.customer.firstName} {order.customer.lastName}
            </p>
            <p className="mt-1 text-mocha">
              موبایل: <span dir="ltr" className="font-semibold tracking-wide">{order.customer.phone}</span>
            </p>
            {order.customer.email && (
              <p className="text-mocha">
                ایمیل: <span dir="ltr">{order.customer.email}</span>
              </p>
            )}
          </div>
          <div>
            <h3 className="mb-1.5 text-[0.7rem] font-bold text-mocha">آدرس تحویل</h3>
            <p className="font-semibold leading-6 text-espresso">
              {order.address.province} — {order.address.city}
            </p>
            <p className="leading-6 text-mocha">{order.address.address}</p>
            <p className="mt-0.5 text-mocha">
              کد پستی: <span dir="ltr" className="font-semibold">{order.address.postalCode}</span>
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}
