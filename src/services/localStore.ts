// ============================================================
// ZHINO — tiny localStorage-backed store (admin data, phase 1)
//
// This is the storage foundation for the admin panel's local
// data (catalog overlay, orders, site content, settings). It is
// deliberately small and dependency-free.
//
// Future backend: every service built on createLocalStore exposes
// plain functions (getX / saveX); swapping the body for fetch
// calls does not change any storefront or admin call site.
// ============================================================

import { useSyncExternalStore } from 'react';

export interface LocalStore<T> {
  /** current value (in-memory, initialized from localStorage) */
  get(): T;
  /** replace the whole value (immutable) + persist + notify */
  set(next: T): void;
  /** back to the defaults (clears the stored entry) */
  reset(): void;
  subscribe(listener: () => void): () => void;
}

/**
 * Create a namespaced local store.
 * - `sanitize` must return null for anything that is not a valid value
 *   (corrupt / hand-edited storage falls back to defaults instead of
 *   breaking the app — same defensive posture as the cart loader).
 */
export function createLocalStore<T>(
  key: string,
  defaults: T,
  sanitize: (raw: unknown) => T | null,
): LocalStore<T> {
  const listeners = new Set<() => void>();

  function load(): T {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(key);
        if (raw !== null) {
          const cleaned = sanitize(JSON.parse(raw));
          if (cleaned !== null) return cleaned;
        }
      }
    } catch {
      // corrupt entry → defaults
    }
    return defaults;
  }

  let data: T = load();

  function persist(next: T) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, JSON.stringify(next));
      }
    } catch {
      // storage full / blocked — the value still lives in memory
    }
  }

  return {
    get: () => data,
    set: (next: T) => {
      data = next;
      persist(next);
      listeners.forEach((l) => l());
    },
    reset: () => {
      data = defaults;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
      } catch {
        // ignore
      }
      listeners.forEach((l) => l());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** React binding — re-renders the component when the store changes. */
export function useLocalStore<T>(store: Pick<LocalStore<T>, 'get' | 'subscribe'>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}
