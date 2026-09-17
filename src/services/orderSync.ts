// ============================================================
// ZHINO — order sync state (Supabase ⇄ app)
//
// Mirrors src/services/catalogSync.ts for the order data:
//   1. the latest order SNAPSHOT read from the database
//      (null = never read / not configured → the panel falls
//      back to the localStorage records from
//      src/services/orderStore.ts, exactly as before)
//   2. a small observable STATUS object so the orders page and
//      dashboard can show «در حال بارگذاری / خطا / آماده»
//      honestly instead of pretending a read succeeded.
//
// The snapshot is owned by the ADMIN side only: the storefront
// never reads orders (RLS does not allow it for guests, and the
// site has no customer order page), so the first fetch happens
// when the admin panel opens (AdminLayout), not at app start.
//
// Status updates are routed by source: local mode writes the
// localStorage record synchronously; remote mode applies the
// change optimistically, confirms it with the database and
// re-reads the authoritative rows — on failure the panel shows
// the error and never keeps a status the database refused.
// ============================================================

import { useSyncExternalStore } from 'react';
import type { OrderStatus, StoredOrder } from './orderStore';
import { getStoredOrders, updateOrderStatus as updateLocalOrderStatus, useStoredOrders } from './orderStore';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { fetchRemoteOrders, updateRemoteOrderStatus } from './supabaseOrders';

export type OrderSyncPhase = 'offline' | 'loading' | 'ready' | 'syncing' | 'error';

export interface OrderSyncState {
  /** where the panel's order data comes from right now */
  source: 'local' | 'remote';
  phase: OrderSyncPhase;
  /** writes currently in flight */
  pending: number;
  /** last error message (safe for display, contains no secrets) */
  error: string | null;
  /** ISO timestamp of the last successful read */
  lastSyncedAt: string | null;
}

const configured = isSupabaseConfigured();

let snapshot: StoredOrder[] | null = null;
/** writes currently in flight (kept outside React state: it is a counter) */
let pending = 0;

let state: OrderSyncState = {
  source: configured ? 'remote' : 'local',
  phase: configured ? 'loading' : 'offline',
  pending: 0,
  error: null,
  lastSyncedAt: null,
};

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setState(patch: Partial<OrderSyncState>): void {
  state = { ...state, ...patch };
  emit();
}

/* ── public read surface ───────────────────────────────────── */

/** The latest database snapshot, or null while unknown/unconfigured. */
export function getOrdersSnapshot(): StoredOrder[] | null {
  return snapshot;
}

export function getOrderSyncState(): OrderSyncState {
  return state;
}

export function subscribeOrderSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * All orders the panel should show, from the active source:
 * the database snapshot when connected, the localStorage
 * records otherwise. Always an array (empty while the first
 * remote read is still in flight — see `state.phase`).
 */
export function getOrders(): StoredOrder[] {
  return state.source === 'remote' ? (snapshot ?? []) : getStoredOrders();
}

/** React binding — orders + sync state for the admin pages. */
export function useOrders(): { orders: StoredOrder[]; state: OrderSyncState } {
  // Both bindings subscribe: the local store (so local-mode edits
  // re-render, exactly as useStoredOrders did before) and the sync
  // state (remote reads/writes). In local mode the result is
  // byte-for-byte the previous behaviour.
  const localOrders = useStoredOrders();
  const syncState = useSyncExternalStore(subscribeOrderSync, getOrderSyncState);
  const orders = syncState.source === 'remote' ? (snapshot ?? []) : localOrders;
  return { orders, state: syncState };
}

/* ── reads ─────────────────────────────────────────────────── */

/** Re-read the orders from the database (no-op that resets to local
 *  mode when Supabase is not configured). */
export async function refreshOrders(options: { silent?: boolean } = {}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    snapshot = null;
    setState({ source: 'local', phase: 'offline', error: null, lastSyncedAt: null, pending: 0 });
    return;
  }

  if (!options.silent) setState({ phase: snapshot ? 'syncing' : 'loading' });

  try {
    const next = await fetchRemoteOrders();
    snapshot = next;
    setState({
      source: 'remote',
      phase: pending > 0 ? 'syncing' : 'ready',
      error: null,
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Keep the previous snapshot (stale data beats a blank panel) but
    // say so in the page — same posture as the catalog sync.
    setState({
      source: 'remote',
      phase: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/* ── writes ────────────────────────────────────────────────── */

/**
 * Change an order's status, routed by the active source:
 *   - local mode → the synchronous localStorage write it always had;
 *   - remote mode → optimistic snapshot update + database UPDATE +
 *     authoritative re-read (a refused write is reported in `error`).
 */
export function updateOrderStatus(id: string, status: OrderStatus): void {
  if (state.source !== 'remote') {
    updateLocalOrderStatus(id, status);
    return;
  }

  snapshot = (snapshot ?? []).map((o) => (o.id === id ? { ...o, status } : o));
  pending += 1;
  setState({ phase: 'syncing', pending, error: null });

  void (async () => {
    let failure: string | null = null;
    try {
      await updateRemoteOrderStatus(id, status);
    } catch (err) {
      failure = `تغییر وضعیت سفارش ${id} — ${err instanceof Error ? err.message : String(err)}`;
    }

    try {
      snapshot = await fetchRemoteOrders();
    } catch {
      // Keep the optimistic snapshot: `failure` already reports the problem.
    }

    pending = Math.max(0, pending - 1);
    setState({
      source: 'remote',
      phase: failure ? 'error' : pending > 0 ? 'syncing' : 'ready',
      pending,
      error: failure,
      lastSyncedAt: snapshot ? new Date().toISOString() : state.lastSyncedAt,
    });
  })();
}

/* ── lifecycle ─────────────────────────────────────────────── */

/**
 * Start keeping the order snapshot fresh. Called by the admin panel
 * (AdminLayout) when a verified session opens the panel — safe to
 * call more than once; a complete no-op when Supabase is not
 * configured. Returns a cleanup that stops following the session.
 */
export function startOrderSync(): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => undefined;

  void refreshOrders();

  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
      void refreshOrders({ silent: true });
    } else if (event === 'SIGNED_OUT') {
      // No admin session → the panel no longer owns this snapshot.
      snapshot = null;
      setState({ phase: 'loading', error: null });
    }
  });

  return () => data.subscription.unsubscribe();
}
