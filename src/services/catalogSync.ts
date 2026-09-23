// ============================================================
// ZHINO — catalog sync state (Supabase ⇄ app)
//
// Owns exactly two things:
//   1. the latest catalog SNAPSHOT read from the database
//      (null = never read / not configured → the app falls back to
//      src/data + the local overlay, exactly as before)
//   2. a tiny observable STATUS object so the admin UI can show
//      «متصل / در حال همگامسازی / خطا» honestly instead of
//      pretending a write succeeded.
//
// Reads are served straight from the snapshot (stable object
// identity → safe for useSyncExternalStore). Writes are routed
// through `runRemoteWrite`, which applies the admin's optimistic
// change, pushes it, then re-reads the authoritative rows; on failure
// it re-reads and reports the error — the UI never keeps a value the
// database refused.
// ============================================================

import { useSyncExternalStore } from 'react';
import type { Product } from '../types';
import { getSupabase, isSupabaseConfigured, getSupabaseUrl } from './supabaseClient';
import { fetchRemoteCatalog } from './supabaseCatalog';
import type { RemoteCatalog } from './supabaseCatalog';

export type CatalogSource = 'local' | 'remote';
export type CatalogPhase = 'offline' | 'loading' | 'ready' | 'syncing' | 'error';

export interface CatalogSyncState {
  /** where the storefront/admin data comes from right now */
  source: CatalogSource;
  phase: CatalogPhase;
  /** writes currently in flight */
  pending: number;
  /** last error message (safe for display, contains no secrets) */
  error: string | null;
  /** ISO timestamp of the last successful read */
  lastSyncedAt: string | null;
  /** project URL (public) — shown in the admin panel; "" in local mode */
  projectUrl: string;
}

const configured = isSupabaseConfigured();

let snapshot: RemoteCatalog | null = null;
/** writes currently in flight (kept outside React state: it is a counter) */
let pending = 0;
let readVersion = 0;

let state: CatalogSyncState = {
  source: configured ? 'remote' : 'local',
  phase: configured ? 'loading' : 'offline',
  pending: 0,
  error: null,
  lastSyncedAt: null,
  projectUrl: getSupabaseUrl(),
};

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setState(patch: Partial<CatalogSyncState>): void {
  state = { ...state, ...patch };
  emit();
}

/* ── public read surface ───────────────────────────────────── */

/** The latest database snapshot, or null while unknown/unconfigured. */
export function getRemoteCatalog(): RemoteCatalog | null {
  return snapshot;
}

export function getCatalogSyncState(): CatalogSyncState {
  return state;
}

export function subscribeCatalogSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React binding — the snapshot (stable reference between reads). */
export function useRemoteCatalog(): RemoteCatalog | null {
  return useSyncExternalStore(subscribeCatalogSync, getRemoteCatalog);
}

/** React binding — connection status for the admin UI. */
export function useCatalogSync(): CatalogSyncState {
  return useSyncExternalStore(subscribeCatalogSync, getCatalogSyncState);
}

/* ── internals used by src/services/catalog.ts ─────────────── */

/** Optimistically replace the snapshot (admin edit, before the DB confirms). */
export function updateRemoteCatalog(mutator: (current: RemoteCatalog) => RemoteCatalog): void {
  if (!snapshot) return;
  snapshot = mutator(snapshot);
  emit();
}

/** Build a snapshot from a product list + active map (used by the optimistic path). */
export function makeRemoteCatalog(products: Product[], active: Record<string, boolean>): RemoteCatalog {
  return { products, active, loadedAt: snapshot?.loadedAt ?? new Date().toISOString() };
}

/**
 * Push one admin write, then re-read the database.
 *
 * The optimistic value the UI already applied stays visible until the
 * database answers; then the authoritative rows replace it. A refused
 * write (or a failed read) is reported in `error` — the panel shows it
 * and never pretends the value was saved.
 */
export function runRemoteWrite(label: string, write: () => Promise<void>): void {
  ++readVersion; // invalidate catalog reads started before this mutation
  pending += 1;
  setState({ phase: 'syncing', pending, error: null });

  void (async () => {
    let failure: string | null = null;
    try {
      await write();
    } catch (err) {
      failure = `${label} — ${err instanceof Error ? err.message : String(err)}`;
    }

    try {
      const version = ++readVersion;
      const next = await fetchRemoteCatalog();
      if (version === readVersion) snapshot = next;
    } catch {
      // Keep the previous snapshot: stale data is better than none, and
      // `failure` (if any) already tells the operator what went wrong.
    }

    pending = Math.max(0, pending - 1);
    setState({
      source: 'remote',
      phase: failure ? 'error' : pending > 0 ? 'syncing' : 'ready',
      pending,
      error: failure,
      lastSyncedAt: snapshot?.loadedAt ?? state.lastSyncedAt,
    });
  })();
}

/** Re-read the whole catalog from the database. */
export async function refreshRemoteCatalog(options: { silent?: boolean } = {}): Promise<void> {
  const version = ++readVersion;
  const supabase = getSupabase();
  if (!supabase) {
    snapshot = null;
    setState({ source: 'local', phase: 'offline', error: null, lastSyncedAt: null, pending: 0 });
    return;
  }

  if (!options.silent) setState({ phase: snapshot ? 'syncing' : 'loading' });

  try {
    const next = await fetchRemoteCatalog();
    if (version !== readVersion) return;
    snapshot = next;
    setState({
      source: 'remote',
      phase: pending > 0 ? 'syncing' : 'ready',
      error: null,
      lastSyncedAt: next.loadedAt,
    });
  } catch (err) {
    if (version !== readVersion) return;
    const message = err instanceof Error ? err.message : String(err);
    // Keep the previous snapshot (stale data beats a blank storefront)
    // but say so in the admin panel.
    setState({ phase: 'error', error: message });
  }
}

/**
 * Connect the app to the database:
 *   - reads the catalog once,
 *   - re-reads whenever the admin signs in or out, so the panel shows
 *     the admin-visible rows (inactive products included) and the
 *     storefront hides them again after logout.
 *
 * Safe to call more than once; a complete no-op when Supabase is not
 * configured.
 */
export function startCatalogSync(): void {
  const supabase = getSupabase();
  if (!supabase) return;

  void refreshRemoteCatalog();

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      void refreshRemoteCatalog({ silent: true });
    }
  });
}
