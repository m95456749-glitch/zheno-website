// ============================================================
// ZHINO — dashboard presentation preferences
//
// This is intentionally local and non-sensitive: only the current
// admin browser's card visibility/order is stored. It never controls
// authorization or data queries. Database-backed statistics remain
// the source of truth; this store only decides how they are arranged.
// ============================================================

import { createLocalStore, useLocalStore } from './localStore';

export type DashboardCardId =
  | 'new-orders'
  | 'preparing-orders'
  | 'shipped-orders'
  | 'completed-orders'
  | 'sales'
  | 'low-stock';

export const DASHBOARD_CARD_ORDER: readonly DashboardCardId[] = [
  'new-orders',
  'preparing-orders',
  'shipped-orders',
  'completed-orders',
  'sales',
  'low-stock',
];

export interface DashboardPreferences {
  order: DashboardCardId[];
  hidden: DashboardCardId[];
}

const DEFAULT_PREFERENCES: DashboardPreferences = {
  order: [...DASHBOARD_CARD_ORDER],
  hidden: [],
};

function isCardId(value: unknown): value is DashboardCardId {
  return typeof value === 'string' && (DASHBOARD_CARD_ORDER as readonly string[]).includes(value);
}

function uniqueKnown(values: unknown): DashboardCardId[] {
  if (!Array.isArray(values)) return [];
  return values.filter(isCardId).filter((value, index, list) => list.indexOf(value) === index);
}

function sanitize(raw: unknown): DashboardPreferences | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const savedOrder = uniqueKnown(value.order);
  const order = [
    ...savedOrder,
    ...DASHBOARD_CARD_ORDER.filter((id) => !savedOrder.includes(id)),
  ];
  const hidden = uniqueKnown(value.hidden);
  return { order, hidden };
}

const store = createLocalStore<DashboardPreferences>(
  'zhino_admin_dashboard_v1',
  DEFAULT_PREFERENCES,
  sanitize,
);

export function getDashboardPreferences(): DashboardPreferences {
  return store.get();
}

export function saveDashboardPreferences(next: DashboardPreferences): void {
  store.set(sanitize(next) ?? DEFAULT_PREFERENCES);
}

export function resetDashboardPreferences(): void {
  store.reset();
}

export function useDashboardPreferences(): DashboardPreferences {
  return useLocalStore(store);
}
