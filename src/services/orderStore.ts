// ============================================================
// ZHINO — order service
// ============================================================
// Supabase is the source of truth when configured. The local snapshot is
// retained only for the existing no-credentials checkout/demo mode, so the
// storefront remains usable before deployment secrets are supplied.

import { useEffect, useSyncExternalStore } from 'react';
import type { Address, Customer, ShippingMethod, OrderStatus as SharedOrderStatus } from '../types';
import { createLocalStore, useLocalStore } from './localStore';
import { isSupabaseConfigured } from './supabase/client';
import { fetchRemoteOrders, updateRemoteOrderStatus } from './supabase/repository';

export type OrderStatus = SharedOrderStatus;

export interface OrderLineRecord {
  productId: string;
  variantId: string;
  quantity: number;
  productName: string;
  weight: string;
  unitPrice: number;
}

export interface StoredOrder {
  id: string;
  createdAt: string;
  status: OrderStatus;
  items: OrderLineRecord[];
  customer: Customer;
  address: Address;
  shippingMethod: ShippingMethod;
  subtotal: number;
  shippingCost: number;
  total: number;
}

export const ORDER_STATUSES: ReadonlyArray<{ id: OrderStatus; label: string }> = [
  { id: 'new', label: 'جدید' },
  { id: 'confirmed', label: 'تأیید شده' },
  { id: 'preparing', label: 'در حال آماده‌سازی' },
  { id: 'shipped', label: 'ارسال شده' },
  { id: 'completed', label: 'تکمیل شده' },
  { id: 'cancelled', label: 'لغو شده' },
];

export function orderStatusLabel(id: OrderStatus): string {
  return ORDER_STATUSES.find((status) => status.id === id)?.label ?? id;
}

const MAX_STORED_ORDERS = 200;

function normaliseStatus(value: unknown): OrderStatus {
  if (value === 'processing') return 'preparing';
  if (value === 'delivered') return 'completed';
  if (value === 'pending') return 'new';
  return ORDER_STATUSES.some((status) => status.id === value) ? (value as OrderStatus) : 'new';
}

function isStoredOrder(value: unknown): value is StoredOrder {
  if (typeof value !== 'object' || value === null) return false;
  const order = value as StoredOrder;
  return (
    typeof order.id === 'string' &&
    typeof order.createdAt === 'string' &&
    typeof order.status === 'string' &&
    Array.isArray(order.items) &&
    typeof order.subtotal === 'number' &&
    typeof order.shippingCost === 'number' &&
    typeof order.total === 'number' &&
    typeof order.customer === 'object' && order.customer !== null &&
    typeof order.address === 'object' && order.address !== null
  );
}

function sanitize(raw: unknown): StoredOrder[] | null {
  if (!Array.isArray(raw)) return null;
  return (raw as unknown[]).filter(isStoredOrder).map((rawOrder) => ({
    ...rawOrder,
    status: normaliseStatus(rawOrder.status),
  }));
}

const store = createLocalStore<StoredOrder[]>('zhino_admin_orders_v1', [], sanitize);
let remoteOrders: StoredOrder[] | null = null;
let remoteAttempted = false;
const remoteListeners = new Set<() => void>();

function notifyRemoteOrders() {
  remoteListeners.forEach((listener) => listener());
}

export async function hydrateOrdersFromSupabase(force = false): Promise<void> {
  if (!isSupabaseConfigured() || (remoteAttempted && !force)) return;
  remoteAttempted = true;
  try {
    remoteOrders = await fetchRemoteOrders();
  } catch (error) {
    remoteOrders = null;
    if (import.meta.env.DEV) console.warn('[zhino] Supabase orders unavailable; using offline mode.', error);
  }
  notifyRemoteOrders();
}

export function getStoredOrders(): StoredOrder[] {
  return remoteOrders ?? (isSupabaseConfigured() ? [] : store.get());
}

/** Offline-only fallback used by checkout when no Supabase project is configured. */
export function recordLocalOrder(order: StoredOrder): void {
  if (isSupabaseConfigured()) return;
  const current = store.get();
  store.set([order, ...current].slice(0, MAX_STORED_ORDERS));
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  if (isSupabaseConfigured()) {
    await updateRemoteOrderStatus(id, status);
    await hydrateOrdersFromSupabase(true);
    return;
  }
  const current = store.get();
  store.set(current.map((order) => (order.id === id ? { ...order, status } : order)));
}

export function useStoredOrders(): StoredOrder[] {
  const localOrders = useLocalStore(store);
  const remote = useSyncExternalStore(
    (listener) => {
      remoteListeners.add(listener);
      return () => remoteListeners.delete(listener);
    },
    () => remoteOrders,
    () => null,
  );
  useEffect(() => {
    void hydrateOrdersFromSupabase();
  }, []);
  return remote ?? (isSupabaseConfigured() ? [] : localOrders);
}
