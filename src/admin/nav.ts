// ============================================================
// ZHINO — admin navigation (single source for sidebar, mobile
// circular navigation and page titles)
// Each entry carries a one-line purpose text shown under the
// page title, so every screen states what it is for.
// ============================================================

import type { ComponentType } from 'react';
import {
  IconAssistant,
  IconContent,
  IconDashboard,
  IconImage,
  IconInventory,
  IconOrders,
  IconProducts,
  IconRecipes,
  IconSettings,
} from './Icons';

export interface AdminNavItem {
  to: string;
  label: string;
  /** one short line — the purpose of the section */
  desc: string;
  icon: ComponentType<{ className?: string }>;
}

export const ADMIN_NAV: AdminNavItem[] = [
  {
    to: '/admin/dashboard',
    label: 'داشبورد',
    desc: 'نمای کلی فروشگاه در یک نگاه',
    icon: IconDashboard,
  },
  {
    to: '/admin/assistant',
    label: 'ربات ژینو',
    desc: 'صدا، رفتار و سلامت دستیار فروشگاه — همه در یک جا',
    icon: IconAssistant,
  },
  {
    to: '/admin/products',
    label: 'محصولات',
    desc: 'افزودن، ویرایش و مدیریت محصولات فروشگاه',
    icon: IconProducts,
  },
  {
    to: '/admin/product-images',
    label: 'تصاویر محصولات',
    desc: 'بارگذاری، جایگزینی و حذف تصویر هر محصول و انتخاب تصویر اصلی',
    icon: IconImage,
  },
  {
    to: '/admin/orders',
    label: 'سفارش‌ها',
    desc: 'مشاهده سفارش‌ها و ثبت تغییر وضعیت آن‌ها',
    icon: IconOrders,
  },
  {
    to: '/admin/inventory',
    label: 'موجودی',
    desc: 'به‌روزرسانی موجودی هر محصول',
    icon: IconInventory,
  },
  {
    to: '/admin/recipes',
    label: 'دستور تهیه',
    desc: 'مدیریت دستورهایی که در سایت نمایش داده می‌شوند',
    icon: IconRecipes,
  },
  {
    to: '/admin/site-content',
    label: 'محتوای سایت',
    desc: 'ویرایش متن‌هایی که سایت نمایش می‌دهد',
    icon: IconContent,
  },
  {
    to: '/admin/settings',
    label: 'تنظیمات',
    desc: 'هزینه ارسال و آستانه هشدار موجودی',
    icon: IconSettings,
  },
];
