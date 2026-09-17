// ============================================================
// ZHINO — admin home dashboard
//
// The landing page is an operational home, not a second menu:
// the logo and live order strip sit at the top, then every existing
// admin section is one circular, direct action away. The existing
// dashboard preferences remain the small, extensible statistics layer.
// ============================================================

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../auth/AuthContext';
import { useCatalog } from '../../services/catalog';
import { useOrders } from '../../services/orderSync';
import { useSettings } from '../../services/settings';
import {
  resetDashboardPreferences,
  saveDashboardPreferences,
  useDashboardPreferences,
  type DashboardCardId,
} from '../../services/dashboardPreferences';
import { formatNumber, formatPrice } from '../../utils/format';
import { formatDate } from '../format';
import { EmptyState, StatusBadge, SyncStatusBadge } from '../components/ui';
import {
  IconContent,
  IconDashboard,
  IconImage,
  IconInventory,
  IconOrders,
  IconPrice,
  IconProducts,
  IconRecipes,
  IconSettings,
} from '../Icons';
import { cn } from '../../utils/cn';

interface DashboardCard {
  id: DashboardCardId;
  label: string;
  value: string;
  hint: string;
  tone: 'wine' | 'gold' | 'green' | 'neutral';
  icon: typeof IconDashboard;
  href: string;
}

interface QuickAction {
  id: string;
  label: string;
  description: string;
  to: string;
  icon: typeof IconDashboard;
}

const CARD_LABELS: Record<DashboardCardId, string> = {
  'new-orders': 'سفارش‌های جدید',
  'preparing-orders': 'در حال آماده‌سازی',
  'shipped-orders': 'سفارش‌های ارسال‌شده',
  'completed-orders': 'سفارش‌های تکمیل‌شده',
  sales: 'مجموع فروش',
  'low-stock': 'موجودی کم یا رو به اتمام',
};

const STATUS_CARD_IDS: DashboardCardId[] = [
  'new-orders',
  'preparing-orders',
  'shipped-orders',
  'completed-orders',
];

/**
 * Price and image management already belong to the product service/page.
 * Their buttons intentionally deep-link to that existing source instead
 * of creating duplicate admin modules.
 */
const QUICK_ACTIONS: QuickAction[] = [
  { id: 'dashboard', label: 'داشبورد', description: 'نمای کلی فروشگاه', to: '/admin/dashboard', icon: IconDashboard },
  { id: 'orders', label: 'سفارش‌ها', description: 'مشاهده و تغییر وضعیت', to: '/admin/orders', icon: IconOrders },
  { id: 'products', label: 'محصولات', description: 'اطلاعات و مدیریت کالا', to: '/admin/products', icon: IconProducts },
  { id: 'inventory', label: 'موجودی', description: 'افزایش، کاهش و کنترل موجودی', to: '/admin/inventory', icon: IconInventory },
  { id: 'prices', label: 'قیمت‌ها', description: 'ویرایش قیمت محصولات', to: '/admin/products?view=prices', icon: IconPrice },
  { id: 'images', label: 'تصاویر محصولات', description: 'مسیر و پیش‌نمایش تصویر', to: '/admin/products?view=images', icon: IconImage },
  { id: 'content', label: 'محتوای سایت', description: 'متن‌های قابل ویرایش سایت', to: '/admin/site-content', icon: IconContent },
  { id: 'recipes', label: 'دستور تهیه', description: 'دستورهای نمایش‌داده‌شده', to: '/admin/recipes', icon: IconRecipes },
  { id: 'settings', label: 'تنظیمات', description: 'ارسال و هشدار موجودی', to: '/admin/settings', icon: IconSettings },
];

export default function AdminDashboardPage() {
  const { isDemo, isDatabaseAuth } = useAdminAuth();
  const { orders, state } = useOrders();
  const catalog = useCatalog();
  const settings = useSettings();
  const preferences = useDashboardPreferences();
  const [customizing, setCustomizing] = useState(false);

  const lowStock = useMemo(
    () =>
      catalog.flatMap((product) =>
        product.variants
          .filter((variant) => variant.stock <= settings.lowStockThreshold)
          .map((variant) => ({ product, variant })),
      ),
    [catalog, settings.lowStockThreshold],
  );

  const cards = useMemo<DashboardCard[]>(() => {
    const count = (status: 'new' | 'processing' | 'shipped' | 'delivered') =>
      orders.filter((order) => order.status === status).length;
    const sales = orders
      .filter((order) => order.status !== 'cancelled')
      .reduce((sum, order) => sum + order.total, 0);

    return [
      {
        id: 'new-orders',
        label: CARD_LABELS['new-orders'],
        value: formatNumber(count('new')),
        hint: 'نیازمند بررسی و تأیید',
        tone: 'wine',
        icon: IconOrders,
        href: '/admin/orders',
      },
      {
        id: 'preparing-orders',
        label: CARD_LABELS['preparing-orders'],
        value: formatNumber(count('processing')),
        hint: 'در حال آماده‌سازی برای ارسال',
        tone: 'gold',
        icon: IconOrders,
        href: '/admin/orders',
      },
      {
        id: 'shipped-orders',
        label: CARD_LABELS['shipped-orders'],
        value: formatNumber(count('shipped')),
        hint: 'در مسیر مشتری',
        tone: 'neutral',
        icon: IconOrders,
        href: '/admin/orders',
      },
      {
        id: 'completed-orders',
        label: CARD_LABELS['completed-orders'],
        value: formatNumber(count('delivered')),
        hint: 'تحویل‌شده و نهایی',
        tone: 'green',
        icon: IconOrders,
        href: '/admin/orders',
      },
      {
        id: 'sales',
        label: CARD_LABELS.sales,
        value: formatPrice(sales),
        hint: 'سفارش‌های لغوشده محاسبه نشده‌اند',
        tone: 'wine',
        icon: IconDashboard,
        href: '/admin/orders',
      },
      {
        id: 'low-stock',
        label: CARD_LABELS['low-stock'],
        value: formatNumber(lowStock.length),
        hint: `آستانه هشدار: ${formatNumber(settings.lowStockThreshold)} عدد`,
        tone: lowStock.length > 0 ? 'gold' : 'green',
        icon: IconInventory,
        href: '/admin/inventory',
      },
    ];
  }, [lowStock.length, orders, settings.lowStockThreshold]);

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const visibleCards = preferences.order
    .map((id) => cardsById.get(id))
    .filter((card): card is DashboardCard => card !== undefined && !preferences.hidden.includes(card.id));
  const visibleStatusCards = visibleCards.filter((card) => STATUS_CARD_IDS.includes(card.id));
  const visibleSecondaryCards = visibleCards.filter((card) => !STATUS_CARD_IDS.includes(card.id));

  const moveCard = (id: DashboardCardId, direction: -1 | 1) => {
    const index = preferences.order.indexOf(id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= preferences.order.length) return;
    const order = [...preferences.order];
    [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    saveDashboardPreferences({ ...preferences, order });
  };

  const setHidden = (id: DashboardCardId, hidden: boolean) => {
    const nextHidden = hidden
      ? [...preferences.hidden, id]
      : preferences.hidden.filter((cardId) => cardId !== id);
    saveDashboardPreferences({ ...preferences, hidden: nextHidden });
  };

  const recent = orders.slice(0, 5);

  return (
    <div className="adm-dashboard-home">
      <header className="adm-dashboard-brand-header">
        <Link to="/" className="adm-dashboard-brand" aria-label="ژینو — بازگشت به سایت">
          <span className="adm-dashboard-brand-mark">ژ</span>
          <span>
            <strong>ژینو</strong>
            <small>پنل مدیریت</small>
          </span>
        </Link>
        <div className="adm-dashboard-brand-meta">
          <p>مدیریت هوشمند فروشگاه</p>
          {isDemo && <span className="adm-badge-demo">نمایشی</span>}
          {isDatabaseAuth && <SyncStatusBadge />}
        </div>
      </header>

      <section className="adm-status-strip" aria-label="وضعیت سفارش‌ها">
        <div className="adm-status-strip-heading">
          <span className="adm-live-dot" aria-hidden="true" />
          <span>وضعیت سفارش‌ها</span>
          <small>{state.source === 'remote' ? 'همگام با Supabase' : 'حالت محلی'}</small>
        </div>
        <div className="adm-status-strip-items">
          {visibleStatusCards.map((card) => (
            <Link key={card.id} to={card.href} className={cn('adm-status-item', `adm-status-item-${card.tone}`)}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </Link>
          ))}
          {visibleStatusCards.length === 0 && (
            <button type="button" onClick={() => setCustomizing(true)} className="adm-status-empty">
              کارت‌های وضعیت پنهان هستند؛ تنظیم کارت‌ها
            </button>
          )}
        </div>
      </section>

      <section className="adm-launcher-section" aria-labelledby="admin-launcher-title">
        <div className="adm-section-heading">
          <div>
            <h2 id="admin-launcher-title">دسترسی سریع</h2>
            <p>هر بخش را مستقیم و بدون منوی اضافه باز کنید.</p>
          </div>
          <span className="adm-dashboard-source">{state.source === 'remote' ? 'داده زنده' : 'داده محلی'}</span>
        </div>
        <nav className="adm-launcher-grid" aria-label="دسترسی مستقیم به بخش‌های مدیریت">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.id} to={action.to} className="adm-launcher-action">
                <span className="adm-launcher-circle"><Icon className="h-6 w-6" /></span>
                <span className="adm-launcher-label">{action.label}</span>
                <span className="adm-launcher-description">{action.description}</span>
              </Link>
            );
          })}
        </nav>
      </section>

      <section className="adm-secondary-stats" aria-label="آمار تکمیلی">
        <div className="adm-section-heading">
          <div>
            <h2>آمار تکمیلی</h2>
            <p>قابل توسعه، قابل تنظیم و متصل به منبع واقعی داده.</p>
          </div>
          <button
            type="button"
            onClick={() => setCustomizing((open) => !open)}
            className="adm-dashboard-settings"
            aria-expanded={customizing}
          >
            <IconSettings className="h-4 w-4" />
            تنظیم کارت‌ها
          </button>
        </div>
        {visibleSecondaryCards.length > 0 ? (
          <div className="adm-metric-rail">
            {visibleSecondaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link key={card.id} to={card.href} className="adm-metric-pill">
                  <span className={cn('adm-metric-pill-icon', `adm-metric-pill-${card.tone}`)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span><small>{card.label}</small><strong>{card.value}</strong></span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="adm-secondary-empty">کارت‌های تکمیلی پنهان هستند.</div>
        )}
      </section>

      {customizing && (
        <section className="adm-dashboard-customizer mb-6" aria-label="تنظیم کارت‌های داشبورد">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-wine-950">کارت‌های آماری</h2>
              <p className="mt-1 text-[0.7rem] leading-6 text-mocha">
                فقط نمایش و ترتیب کارت‌ها در همین مرورگر تغییر می‌کند؛ اطلاعات اصلی حذف نمی‌شود.
              </p>
            </div>
            <button type="button" onClick={() => resetDashboardPreferences()} className="adm-quiet-link shrink-0">
              بازنشانی
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {preferences.order.map((id, index) => (
              <div key={id} className="adm-dashboard-option">
                <span className="min-w-0 flex-1 truncate text-[0.75rem] font-bold text-espresso">{CARD_LABELS[id]}</span>
                <button type="button" onClick={() => moveCard(id, -1)} disabled={index === 0} aria-label={`انتقال ${CARD_LABELS[id]} به جایگاه بالاتر`} className="adm-order-button">↑</button>
                <button type="button" onClick={() => moveCard(id, 1)} disabled={index === preferences.order.length - 1} aria-label={`انتقال ${CARD_LABELS[id]} به جایگاه پایین‌تر`} className="adm-order-button">↓</button>
                <button type="button" role="switch" aria-checked={!preferences.hidden.includes(id)} onClick={() => setHidden(id, !preferences.hidden.includes(id))} className={cn('adm-visibility-button', !preferences.hidden.includes(id) && 'active')}>
                  {preferences.hidden.includes(id) ? 'نمایش' : 'نمایش داده می‌شود'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel-lux mt-6 overflow-hidden rounded-2xl">
        <header className="flex items-center justify-between border-b border-espresso/8 px-5 py-4">
          <h2 className="text-sm font-bold text-wine-950">آخرین سفارش‌ها</h2>
          <Link to="/admin/orders" className="adm-quiet-link">مشاهده همه</Link>
        </header>
        {state.source === 'remote' && state.phase === 'loading' ? (
          <p className="px-5 py-8 text-center text-[0.75rem] font-bold text-mocha">در حال بارگذاری سفارش‌ها از دیتابیس…</p>
        ) : recent.length === 0 ? (
          <EmptyState
            icon={<IconOrders className="h-5 w-5" />}
            title="هنوز سفارشی ثبت نشده است"
            text={state.source === 'remote' ? 'سفارش‌هایی که مشتریان از طریق تسویه‌حساب سایت ثبت می‌کنند اینجا فهرست می‌شوند.' : 'سفارش‌هایی که از طریق تسویه‌حساب سایت ثبت می‌شوند (در حالت نمایشی: همین مرورگر) اینجا فهرست می‌شوند.'}
          />
        ) : (
          <ul className="divide-y divide-espresso/6">
            {recent.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p dir="ltr" className="truncate text-right font-display text-[0.8rem] tracking-[0.06em] text-wine-900">{order.id}</p>
                  <p className="mt-1 truncate text-[0.72rem] text-mocha">{order.customer.firstName} {order.customer.lastName} · {formatDate(order.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <span className="text-[0.82rem] font-extrabold text-wine-900">{formatPrice(order.total)}</span>
                  <StatusBadge status={order.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel-lux mt-5 overflow-hidden rounded-2xl">
        <header className="flex items-center justify-between border-b border-espresso/8 px-5 py-4">
          <h2 className="text-sm font-bold text-wine-950">کم‌موجودی‌ها</h2>
          <Link to="/admin/inventory" className="adm-quiet-link">مدیریت موجودی</Link>
        </header>
        {lowStock.length === 0 ? (
          <EmptyState icon={<IconInventory className="h-5 w-5" />} title="همه اقلام موجودی کافی دارند" text={`اگر موجودی هر محصول به ${formatNumber(settings.lowStockThreshold)} عدد یا کمتر برسد، اینجا اعلام می‌شود.`} />
        ) : (
          <ul className="divide-y divide-espresso/6">
            {lowStock.slice(0, 5).map(({ product, variant }) => (
              <li key={`${product.id}__${variant.id}`} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0"><p className="truncate text-[0.82rem] font-bold text-espresso">{product.shortName}</p><p className="mt-0.5 text-[0.68rem] text-mocha">{variant.weight}</p></div>
                <span className={cn('shrink-0 text-[0.82rem] font-extrabold', variant.stock === 0 ? 'text-red-600' : 'text-gold-700')}>{formatNumber(variant.stock)} عدد</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
