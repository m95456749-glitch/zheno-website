// ============================================================
// ZHINO — site settings service
// ============================================================
// Shipping and low-stock settings share one source. Supabase is used when
// configured; original constants are the safe no-credentials fallback.

import { useEffect, useSyncExternalStore } from 'react';
import {
  FREE_SHIPPING_THRESHOLD,
  SHIPPING_COST_EXPRESS,
  SHIPPING_COST_STANDARD,
} from '../data/products';
import { createLocalStore, useLocalStore } from './localStore';
import { isSupabaseConfigured } from './supabase/client';
import { fetchRemoteSettings, saveRemoteSettings } from './supabase/repository';

export interface SiteSettings {
  freeShippingThreshold: number;
  standardShippingCost: number;
  expressShippingCost: number;
  lowStockThreshold: number;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
  standardShippingCost: SHIPPING_COST_STANDARD,
  expressShippingCost: SHIPPING_COST_EXPRESS,
  lowStockThreshold: 30,
};

function sanitize(raw: unknown): SiteSettings | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const numberValue = (input: unknown, fallback: number) =>
    typeof input === 'number' && Number.isFinite(input) && input >= 0 ? Math.round(input) : fallback;
  return {
    freeShippingThreshold: numberValue(value.freeShippingThreshold, DEFAULT_SITE_SETTINGS.freeShippingThreshold),
    standardShippingCost: numberValue(value.standardShippingCost, DEFAULT_SITE_SETTINGS.standardShippingCost),
    expressShippingCost: numberValue(value.expressShippingCost, DEFAULT_SITE_SETTINGS.expressShippingCost),
    lowStockThreshold: numberValue(value.lowStockThreshold, DEFAULT_SITE_SETTINGS.lowStockThreshold),
  };
}

const store = createLocalStore<SiteSettings>('zhino_admin_settings_v1', DEFAULT_SITE_SETTINGS, sanitize);
let remoteSettings: SiteSettings | null = null;
let remoteAttempted = false;
const remoteListeners = new Set<() => void>();

function notifyRemoteSettings() {
  remoteListeners.forEach((listener) => listener());
}

export async function hydrateSettingsFromSupabase(force = false): Promise<void> {
  if (!isSupabaseConfigured() || (remoteAttempted && !force)) return;
  remoteAttempted = true;
  try {
    remoteSettings = await fetchRemoteSettings();
  } catch (error) {
    remoteSettings = null;
    if (import.meta.env.DEV) console.warn('[zhino] Supabase settings unavailable; using bundled defaults.', error);
  }
  notifyRemoteSettings();
}

export function getSettings(): SiteSettings {
  return remoteSettings ?? (isSupabaseConfigured() ? DEFAULT_SITE_SETTINGS : store.get());
}

export async function saveSettings(next: SiteSettings): Promise<void> {
  if (isSupabaseConfigured()) {
    await saveRemoteSettings(next);
    await hydrateSettingsFromSupabase(true);
    return;
  }
  store.set(next);
}

export function resetSettings(): void {
  if (isSupabaseConfigured()) {
    void hydrateSettingsFromSupabase(true);
    return;
  }
  store.reset();
}

export function useSiteSettings(): SiteSettings {
  const local = useLocalStore(store);
  const remote = useSyncExternalStore(
    (listener) => {
      remoteListeners.add(listener);
      return () => remoteListeners.delete(listener);
    },
    () => remoteSettings,
    () => null,
  );
  useEffect(() => {
    void hydrateSettingsFromSupabase();
  }, []);
  return remote ?? (isSupabaseConfigured() ? DEFAULT_SITE_SETTINGS : local);
}
