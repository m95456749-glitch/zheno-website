// ============================================================
// ZHINO — صفحهٔ اصلی پنل مدیریت
//
// طراحی خواسته‌شده: Premium، منظم و خلوت.
//   • هدر برند کوچک (بازگشت به سایت + حالت نمایشی/وضعیت همگام‌سازی)
//   • شش کارت آماری (سفارش‌های جدید تا موجودی کم) از بالای صفحه حذف
//     شدند؛ چون پنل «تنظیم کارت‌ها» دیگر کارتی برای مدیریت نداشت
//     (گزینه‌های ترتیب/نمایش بی‌اثر بودند)، خود دکمه و پنل هم موقتاً
//     برداشته شدند. سرویس dashboardPreferences.ts دست‌نخورده ماند تا
//     برگرداندن کارت‌ها در صورت نیاز ساده باشد.
//   • هفت کارت «مستقل و هم‌سطح»: محصولات، سفارش‌ها، ربات ژینو،
//     تنظیمات، موجودی، دستور تهیه، محتوای سایت.
//     هر کارت = آیکون + عنوان کوتاه + یک خط توضیح + دکمهٔ گرد.
//     هیچ بخشی زیرمجموعهٔ کارت دیگری نیست.
//   • دو میان‌بر ظریف و جدا: «قیمت‌ها» و «تصاویر محصولات» (هر دو به
//     همان صفحهٔ محصولات می‌روند؛ Routing دست‌نخورده است).
//   • فهرست‌های آخرین سفارش‌ها/کم‌موجودی‌ها همان منطق قبلی را دارند،
//     فقط جمع‌شونده و بی‌سروصدا شده‌اند.
//
// هر قابلیت فقط در صفحهٔ خودش مدیریت می‌شود؛ این صفحه فقط «ورودی»
// تمیز و مستقیم به همان صفحه‌هاست.
// ============================================================

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../auth/AuthContext';
import { useCatalog } from '../../services/catalog';
import { useOrders } from '../../services/orderSync';
import { useSettings } from '../../services/settings';
import { formatNumber, formatPrice } from '../../utils/format';
import { formatDate } from '../format';
import { EmptyState, StatusBadge, SyncStatusBadge } from '../components/ui';
import {
  IconAssistant,
  IconContent,
  IconImage,
  IconInventory,
  IconOrders,
  IconPrice,
  IconProducts,
  IconRecipes,
  IconSettings,
} from '../Icons';
import { cn } from '../../utils/cn';

interface SectionCard {
  id: string;
  label: string;
  description: string;
  to: string;
  icon: typeof IconOrders;
}

/**
 * هفت بخش اصلی پنل — هرکدام یک کارت مستقل با صفحهٔ اختصاصی خودش.
 * هیچ‌کدام زیرمجموعهٔ دیگری نیست.
 */
const SECTION_CARDS: SectionCard[] = [
  {
    id: 'products',
    label: 'محصولات',
    description: 'افزودن، ویرایش و انتشار کالاها',
    to: '/admin/products',
    icon: IconProducts,
  },
  {
    id: 'orders',
    label: 'سفارش‌ها',
    description: 'مشاهده و ثبت تغییر وضعیت',
    to: '/admin/orders',
    icon: IconOrders,
  },
  {
    id: 'assistant',
    label: 'ربات ژینو',
    description: 'صدا، رفتار و وضعیت سرویس',
    to: '/admin/assistant',
    icon: IconAssistant,
  },
  {
    id: 'settings',
    label: 'تنظیمات',
    description: 'ارسال و آستانهٔ هشدار موجودی',
    to: '/admin/settings',
    icon: IconSettings,
  },
  {
    id: 'inventory',
    label: 'موجودی',
    description: 'افزایش و کاهش موجودی انبار',
    to: '/admin/inventory',
    icon: IconInventory,
  },
  {
    id: 'recipes',
    label: 'دستور تهیه',
    description: 'دستورهایی که در سایت دیده می‌شوند',
    to: '/admin/recipes',
    icon: IconRecipes,
  },
  {
    id: 'site-content',
    label: 'محتوای سایت',
    description: 'متن‌های قابل ویرایش صفحه‌ها',
    to: '/admin/site-content',
    icon: IconContent,
  },
];

/**
 * دو میان‌بر مستقیم و جدا: «قیمت‌ها» همان صفحهٔ محصولات است (ستون
 * قیمت و فرم ویرایش) و «تصاویر محصولات» به بخش اختصاصی گالری می‌رود
 * (بارگذاری، جایگزینی، حذف با تأیید و انتخاب تصویر اصلی).
 */
const PRODUCT_SHORTCUTS = [
  { id: 'prices', label: 'قیمت‌ها', to: '/admin/products?view=prices', icon: IconPrice },
  { id: 'images', label: 'تصاویر محصولات', to: '/admin/product-images', icon: IconImage },
];

/** فلش گردِ کارت‌ها — در RTL به سمت چپ (مسیر پیش‌رو) اشاره می‌کند */
function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M12.4 4.8 7.2 10l5.2 5.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AdminDashboardPage() {
  const { isDemo, isDatabaseAuth } = useAdminAuth();
  const { orders, state } = useOrders();
  const catalog = useCatalog();
  const settings = useSettings();
  /** فهرست سفارش‌ها از همان اول باز است (مدیر نباید دنبالش بگردد) */
  const [listsOpen, setListsOpen] = useState(true);

  const lowStock = useMemo(
    () =>
      catalog.flatMap((product) =>
        product.variants
          .filter((variant) => variant.stock <= settings.lowStockThreshold)
          .map((variant) => ({ product, variant })),
      ),
    [catalog, settings.lowStockThreshold],
  );

  const recent = orders.slice(0, 5);

  return (
    <div className="adm-dashboard-home">
      {/* ── هدر برند: کوچک، بدون شلوغی ─────────────────────────── */}
      <header className="adm-dashboard-brand-header">
        <Link to="/" className="adm-dashboard-brand" aria-label="ژینو — بازگشت به سایت">
          <span className="adm-dashboard-brand-mark">ژ</span>
          <span>
            <strong>ژینو</strong>
            <small>پنل مدیریت</small>
          </span>
        </Link>
        <div className="adm-dashboard-brand-meta">
          <span className="adm-dashboard-source">
            {state.source === 'remote' ? 'داده زنده' : 'داده محلی'}
          </span>
          {isDemo && <span className="adm-badge-demo">نمایشی</span>}
          {isDatabaseAuth && <SyncStatusBadge />}
        </div>
      </header>

      {/* ── هفت کارت مستقل و هم‌سطح ───────────────────────────── */}
      <nav className="adm-card-grid" aria-label="بخش‌های پنل مدیریت">
        {SECTION_CARDS.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.id} to={section.to} className="adm-card">
              <span className="adm-card-icon">
                <Icon className="h-5 w-5" />
              </span>
              <span className="adm-card-body">
                <span className="adm-card-title">{section.label}</span>
                <span className="adm-card-desc">{section.description}</span>
              </span>
              <span className="adm-card-action" aria-hidden="true">
                <ArrowIcon />
              </span>
            </Link>
          );
        })}
      </nav>

      {/* ── دو میان‌بر مستقیم به همان صفحهٔ محصولات (جدا، نه زیرمجموعه) ── */}
      <div className="adm-shortcuts">
        {PRODUCT_SHORTCUTS.map((shortcut) => {
          const Icon = shortcut.icon;
          return (
            <Link key={shortcut.id} to={shortcut.to} className="adm-shortcut">
              <Icon className="h-4 w-4" />
              <span>{shortcut.label}</span>
            </Link>
          );
        })}
      </div>

      {/* ── فهرست‌های تکمیلی: جمع‌شونده تا صفحهٔ اصلی خلوت بماند ── */}
      <section className="adm-fold">
        <button
          type="button"
          className="adm-fold-toggle"
          onClick={() => setListsOpen((open) => !open)}
          aria-expanded={listsOpen}
        >
          <span>آخرین سفارش‌ها و کم‌موجودی‌ها</span>
          <span className={cn('adm-fold-caret', listsOpen && 'is-open')} aria-hidden="true">
            <ArrowIcon />
          </span>
        </button>

        {listsOpen && (
          <div className="adm-fold-body">
            <section className="panel-lux overflow-hidden rounded-2xl">
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

            <section className="panel-lux mt-4 overflow-hidden rounded-2xl">
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
        )}
      </section>
    </div>
  );
}
