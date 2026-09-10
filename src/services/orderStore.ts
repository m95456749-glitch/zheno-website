// ============================================================
// ZHINO — order records (checkout writes, admin manages)
//
// Frontend-only mode: the checkout has no backend to register the
// order with, so it records a snapshot here (same browser,
// localStorage) and the admin panel's «سفارش‌ها» page manages it.
// The record is denormalized (product names/prices captured at
// purchase time) so a later catalog change never rewrites
// history.
//
// One store, two consumers — there is no second order system.
//
// Future backend: when VITE_API_BASE_URL is configured the order
// is created by the payment API (src/services/api.ts) and this
// local record is simply not written; the admin's orders page
// switches to the API-backed list.
// ============================================================

import type { Address, Customer, ShippingMethod } from '../types';
import { createLocalStore, useLocalStore } from './localStore';

export type OrderStatus =
  | 'new'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface OrderLineRecord {
  productId: string;
  variantId: string;
  quantity: number;
  /** snapshot of the display name at purchase time */
  productName: string;
  /** snapshot of the variant weight label, e.g. «۲۵۰ گرم» */
  weight: string;
  /** snapshot of the unit price (Tomans) at purchase time */
  unitPrice: number;
}

export interface StoredOrder {
  id: string;
  createdAt: string; // ISO
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
  { id: 'processing', label: 'در حال آماده‌سازی' },
  { id: 'shipped', label: 'ارسال شده' },
  { id: 'delivered', label: 'تکمیل شده' },
  { id: 'cancelled', label: 'لغو شده' },
];

export function orderStatusLabel(id: OrderStatus): string {
  return ORDER_STATUSES.find((s) => s.id === id)?.label ?? id;
}

const MAX_STORED_ORDERS = 200;

function isStoredOrder(value: unknown): value is StoredOrder {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as StoredOrder;
  return (
    typeof o.id === 'string' &&
    typeof o.createdAt === 'string' &&
    (ORDER_STATUSES.some((s) => s.id === o.status) || typeof o.status === 'string') &&
    Array.isArray(o.items) &&
    typeof o.subtotal === 'number' &&
    typeof o.shippingCost === 'number' &&
    typeof o.total === 'number' &&
    typeof o.customer === 'object' &&
    o.customer !== null &&
    typeof o.address === 'object' &&
    o.address !== null
  );
}

function sanitize(raw: unknown): StoredOrder[] | null {
  if (!Array.isArray(raw)) return null;
  return (raw as unknown[]).filter(isStoredOrder) as StoredOrder[];
}

const store = createLocalStore<StoredOrder[]>('zhino_admin_orders_v1', [], sanitize);

/** All recorded orders, newest first. */
export function getStoredOrders(): StoredOrder[] {
  return store.get();
}

/** Called by the checkout (frontend-only mode) after order confirmation. */
export function recordLocalOrder(order: StoredOrder): void {
  const current = store.get();
  store.set([order, ...current].slice(0, MAX_STORED_ORDERS));
}

export function updateOrderStatus(id: string, status: OrderStatus): void {
  const current = store.get();
  store.set(current.map((o) => (o.id === id ? { ...o, status } : o)));
}

/** React binding (admin orders page). */
export function useStoredOrders(): StoredOrder[] {
  return useLocalStore(store);
}
