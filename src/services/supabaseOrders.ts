// ============================================================
// ZHINO — Supabase orders gateway (checkout writes, admin manages)
//
// In connected mode the database is the ONLY order system:
//   - the checkout creates an order through the `create_order`
//     RPC (security definer): it re-validates prices, active
//     catalog rows, shipping rules and stock ON THE SERVER and
//     decrements inventory atomically in the same transaction —
//     the browser can never set a cheaper total or oversell;
//   - the admin panel reads `orders` + `order_items` with the
//     signed-in admin's JWT (RLS: `is_admin()` only) and updates
//     a status through a plain RLS-gated UPDATE.
//
// Row Level Security decides what each session can see:
//   - anonymous visitors  → cannot read any order row (the
//     storefront has no order-reading surface at all);
//   - non-admin accounts  → refused by the same policies;
//   - signed-in admin     → reads everything + updates status.
//
// No service key is ever used here — only the publishable client
// from src/services/supabaseClient.ts. Nothing in this module
// runs when Supabase is not configured: the app then keeps its
// original localStorage order records (src/services/orderStore.ts).
// ============================================================

import type { Address, CartItem, Customer, ShippingMethod } from '../types';
import { getSupabase } from './supabaseClient';
import type { OrderStatus, StoredOrder } from './orderStore';

/* ── row shapes (public schema) ────────────────────────────── */

interface OrderRow {
  id: string;
  status: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_phone: string;
  customer_email: string | null;
  shipping_province: string;
  shipping_city: string;
  shipping_address: string;
  shipping_postal_code: string;
  shipping_method: ShippingMethod;
  subtotal: number;
  shipping_cost: number;
  total: number;
  created_at: string;
}

interface OrderItemRow {
  order_id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  weight: string;
  quantity: number;
  unit_price: number;
}

/* ── status mapping (UI labels ⇄ database enum) ────────────── */
// The database enum and the UI enum use different words for two
// states; each side keeps its own naming and this module is the
// only place that translates between them.
const UI_TO_DB: Record<OrderStatus, string> = {
  new: 'new',
  confirmed: 'confirmed',
  processing: 'preparing',
  shipped: 'shipped',
  delivered: 'completed',
  cancelled: 'cancelled',
};

const DB_TO_UI: Record<string, OrderStatus> = {
  new: 'new',
  confirmed: 'confirmed',
  preparing: 'processing',
  shipped: 'shipped',
  completed: 'delivered',
  cancelled: 'cancelled',
};

/** Unknown database values map to «new» rather than crashing the panel. */
function fromDbStatus(status: string): OrderStatus {
  return DB_TO_UI[status] ?? 'new';
}

/* ── errors ────────────────────────────────────────────────── */

/** A database/network failure with a message that is safe to show. */
export class OrderRemoteError extends Error {
  readonly detail: string;

  constructor(context: string, detail: string) {
    super(`${context}: ${detail}`);
    this.name = 'OrderRemoteError';
    this.detail = detail;
  }
}

function describe(error: { message?: string; details?: string | null; hint?: string | null; code?: string }): string {
  const parts = [error.message, error.details, error.hint, error.code ? `(${error.code})` : ''].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  return parts.join(' ') || 'unknown error';
}

/**
 * Turn a failed order submission into a short Persian message for the
 * checkout page. The database's own error text (never a secret) drives
 * the mapping; everything else gets a generic «try again».
 */
export function describeCheckoutFailure(err: unknown): string {
  const detail =
    err instanceof OrderRemoteError ? `${err.detail} ${err.message}` : err instanceof Error ? err.message : String(err);
  if (/insufficient_stock/i.test(detail)) {
    return 'موجودی کافی برای این سفارش وجود ندارد؛ لطفاً تعداد را تغییر دهید و دوباره تلاش کنید.';
  }
  if (/product_unavailable/i.test(detail)) {
    return 'یکی از اقلام سفارش در حال حاضر در دسترس نیست؛ سبد خرید را بررسی کنید.';
  }
  if (/order_items_required|invalid_order_item|duplicate_order_item/i.test(detail)) {
    return 'اقلام سفارش معتبر نیست؛ سبد خرید را بررسی کنید و دوباره تلاش کنید.';
  }
  if (/customer_and_shipping_required/i.test(detail)) {
    return 'اطلاعات مشتری یا آدرس تحویل ناقص است؛ دوباره تلاش کنید.';
  }
  if (/is not configured|no client/i.test(detail)) {
    return 'اتصال به سرور برقرار نیست؛ لطفاً دوباره تلاش کنید.';
  }
  return 'ثبت سفارش انجام نشد؛ لطفاً دوباره تلاش کنید.';
}

/* ── reads (admin only — RLS enforces it) ──────────────────── */

/** Newest first; capped like the local store so a huge history cannot
 *  bloat the panel (the list stays a management screen, not an archive). */
const MAX_REMOTE_ORDERS = 200;

/**
 * Read the latest orders with their items and map them to the same
 * StoredOrder model the admin UI already renders (so the panel code
 * does not care which source the rows came from).
 */
export async function fetchRemoteOrders(): Promise<StoredOrder[]> {
  const supabase = getSupabase();
  if (!supabase) throw new OrderRemoteError('Supabase is not configured', 'no client');

  const { data: orderRows, error: orderError } = await supabase
    .from('orders')
    .select(
      'id,status,customer_first_name,customer_last_name,customer_phone,customer_email,' +
        'shipping_province,shipping_city,shipping_address,shipping_postal_code,' +
        'shipping_method,subtotal,shipping_cost,total,created_at',
    )
    .order('created_at', { ascending: false })
    .limit(MAX_REMOTE_ORDERS);
  if (orderError) throw new OrderRemoteError('خواندن سفارش‌ها ناموفق بود', describe(orderError));

  const rows = (orderRows ?? []) as unknown as OrderRow[];
  if (rows.length === 0) return [];

  const { data: itemRows, error: itemError } = await supabase
    .from('order_items')
    .select('order_id,product_id,variant_id,product_name,weight,quantity,unit_price')
    .in('order_id', rows.map((r) => r.id))
    .order('created_at', { ascending: true });
  if (itemError) throw new OrderRemoteError('خواندن اقلام سفارش ناموفق بود', describe(itemError));

  const itemsByOrder = new Map<string, OrderItemRow[]>();
  for (const row of (itemRows ?? []) as unknown as OrderItemRow[]) {
    const list = itemsByOrder.get(row.order_id);
    if (list) list.push(row);
    else itemsByOrder.set(row.order_id, [row]);
  }

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    status: fromDbStatus(row.status),
    items: (itemsByOrder.get(row.id) ?? []).map((i) => ({
      productId: i.product_id,
      variantId: i.variant_id,
      quantity: i.quantity,
      productName: i.product_name,
      weight: i.weight,
      unitPrice: i.unit_price,
    })),
    customer: {
      firstName: row.customer_first_name,
      lastName: row.customer_last_name,
      phone: row.customer_phone,
      email: row.customer_email ?? '',
    },
    address: {
      province: row.shipping_province,
      city: row.shipping_city,
      address: row.shipping_address,
      postalCode: row.shipping_postal_code,
    },
    shippingMethod: row.shipping_method,
    subtotal: row.subtotal,
    shippingCost: row.shipping_cost,
    total: row.total,
  }));
}

/* ── writes ────────────────────────────────────────────────── */

/**
 * Update an order's status (admin panel). The UPDATE runs under the
 * signed-in admin's JWT and is allowed by RLS only for `is_admin()` —
 * the database enum value is translated here (UI «processing» ⇄ DB
 * «preparing», UI «delivered» ⇄ DB «completed»).
 */
export async function updateRemoteOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new OrderRemoteError('Supabase is not configured', 'no client');

  const { error } = await supabase.from('orders').update({ status: UI_TO_DB[status] }).eq('id', id);
  if (error) throw new OrderRemoteError('تغییر وضعیت سفارش ناموفق بود', describe(error));
}

export interface RemoteOrderResult {
  /** server-generated order id (ZH-…) — the one shown to the customer */
  id: string;
  /** authoritative amounts computed by the database, not the browser */
  subtotal: number;
  shippingCost: number;
  total: number;
}

/**
 * Register a guest checkout through the database's `create_order` RPC.
 *
 * Only variant ids + quantities are sent — prices, shipping cost and
 * the final total are computed by the database from the catalog and
 * site_settings rows, so a modified bundle can never underpay. The RPC
 * is granted to anonymous sessions (guest checkout) and decrements
 * inventory atomically; on any violation it rolls the whole
 * transaction back and no order row is left behind.
 */
export async function submitRemoteOrder(input: {
  customer: Customer;
  address: Address;
  items: CartItem[];
  shippingMethod: ShippingMethod;
}): Promise<RemoteOrderResult> {
  const supabase = getSupabase();
  if (!supabase) throw new OrderRemoteError('Supabase is not configured', 'no client');

  const { data, error } = await supabase.rpc('create_order', {
    p_customer: {
      firstName: input.customer.firstName.trim(),
      lastName: input.customer.lastName.trim(),
      phone: input.customer.phone.trim(),
      email: input.customer.email.trim(),
    },
    p_shipping: {
      province: input.address.province.trim(),
      city: input.address.city.trim(),
      address: input.address.address.trim(),
      postalCode: input.address.postalCode.trim(),
    },
    p_items: input.items.map((item) => ({ variant_id: item.variantId, quantity: item.quantity })),
    p_shipping_method: input.shippingMethod,
  });
  if (error) throw new OrderRemoteError('ثبت سفارش ناموفق بود', describe(error));

  const row = (Array.isArray(data) ? data[0] : data) as
    | { order_id?: unknown; subtotal?: unknown; shipping_cost?: unknown; total?: unknown }
    | null;
  if (!row || typeof row.order_id !== 'string') {
    throw new OrderRemoteError('ثبت سفارش ناموفق بود', 'پاسخ نامعتبر از سرور');
  }
  return {
    id: row.order_id,
    subtotal: typeof row.subtotal === 'number' ? row.subtotal : 0,
    shippingCost: typeof row.shipping_cost === 'number' ? row.shipping_cost : 0,
    total: typeof row.total === 'number' ? row.total : 0,
  };
}
