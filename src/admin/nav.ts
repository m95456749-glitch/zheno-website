// ============================================================
// ZHINO — admin navigation (single source for sidebar, drawer
// and page titles)
// ============================================================

import type { ComponentType } from 'react';
import {
  IconContent,
  IconDashboard,
  IconInventory,
  IconOrders,
  IconProducts,
  IconRecipes,
  IconSettings,
} from './Icons';

export interface AdminNavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { to: '/admin/dashboard', label: 'داشبورد', icon: IconDashboard },
  { to: '/admin/products', label: 'محصولات', icon: IconProducts },
  { to: '/admin/orders', label: 'سفارش‌ها', icon: IconOrders },
  { to: '/admin/inventory', label: 'موجودی', icon: IconInventory },
  { to: '/admin/recipes', label: 'دستور تهیه', icon: IconRecipes },
  { to: '/admin/site-content', label: 'محتوای سایت', icon: IconContent },
  { to: '/admin/settings', label: 'تنظیمات', icon: IconSettings },
];
