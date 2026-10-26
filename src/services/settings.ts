// ============================================================
// ZHINO — site settings (admin-editable, storefront-consumed)
//
// Defaults are the site's existing shipping constants
// (src/data/products.ts), so behaviour is byte-for-byte the
// same until an admin actually changes a value.
//
// Storefront call sites: cart hook, free-shipping progress,
// cart/checkout totals, product-detail note.
// Admin call sites: settings page (write), dashboard/inventory
// (low-stock threshold).
//
// Supabase is the primary connected source; localStorage remains the
// deliberate offline/demo fallback.
// ============================================================

import {
  FREE_SHIPPING_THRESHOLD,
  SHIPPING_COST_EXPRESS,
  SHIPPING_COST_STANDARD,
} from '../data/products';
import { createLocalStore, useLocalStore } from './localStore';
import { getRemoteSiteData, runRemoteSiteWrite, useRemoteSiteData, pushRemoteSettings } from './siteDataSync';
import { getSupabase } from './supabaseClient';

export interface SiteSettings {
  /** minimum cart subtotal for free shipping (Tomans) */
  freeShippingThreshold: number;
  /** standard shipping cost (Tomans) */
  standardShippingCost: number;
  /** express shipping cost (Tomans) */
  expressShippingCost: number;
  /** units at or below which a variant is flagged low-stock */
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
  const r = raw as Record<string, unknown>;
  const num = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.round(value)
      : fallback;
  return {
    freeShippingThreshold: num(r.freeShippingThreshold, DEFAULT_SITE_SETTINGS.freeShippingThreshold),
    standardShippingCost: num(r.standardShippingCost, DEFAULT_SITE_SETTINGS.standardShippingCost),
    expressShippingCost: num(r.expressShippingCost, DEFAULT_SITE_SETTINGS.expressShippingCost),
    lowStockThreshold: num(r.lowStockThreshold, DEFAULT_SITE_SETTINGS.lowStockThreshold),
  };
}

const store = createLocalStore<SiteSettings>(
  'zhino_admin_settings_v1',
  DEFAULT_SITE_SETTINGS,
  sanitize,
);

/** Read current settings from Supabase when available, otherwise the local overlay. */
export function getSettings(): SiteSettings {
  return getRemoteSiteData()?.settings ?? store.get();
}

export async function saveSettings(next: SiteSettings): Promise<boolean> {
  if (!Number.isSafeInteger(next.freeShippingThreshold) || next.freeShippingThreshold < 0) return false;
  if (!Number.isSafeInteger(next.standardShippingCost) || next.standardShippingCost < 0) return false;
  if (!Number.isSafeInteger(next.expressShippingCost) || next.expressShippingCost < 0) return false;
  if (!Number.isSafeInteger(next.lowStockThreshold) || next.lowStockThreshold < 0) return false;

  if (getSupabase()) {
    return runRemoteSiteWrite('ذخیره تنظیمات', () => pushRemoteSettings(next));
  }
  store.set(next);
  return true;
}

export async function resetSettings(): Promise<boolean> {
  if (getSupabase()) {
    return runRemoteSiteWrite('بازنشانی تنظیمات', () => pushRemoteSettings(DEFAULT_SITE_SETTINGS));
  }
  store.reset();
  return true;
}

/** React binding used by dashboard/storefront surfaces that must refresh after a save. */
export function useSettings(): SiteSettings {
  const local = useLocalStore(store);
  const remote = useRemoteSiteData();
  return remote?.settings ?? local;
}
