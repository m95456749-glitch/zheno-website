// ============================================================
// ZHINO — catalog service
// ============================================================
// UI code uses this module only. With Supabase variables present it
// hydrates products/variants/inventory from PostgreSQL and sends admin
// writes through the repository. Without them, the immutable catalog in
// src/data/products.ts remains the storefront-safe fallback; no remote
// call or credential is attempted.

import { useEffect, useSyncExternalStore } from 'react';
import {
  PRODUCTS,
  getProductById as getBaseProductById,
  getVariantById as getBaseVariantById,
} from '../data/products';
import type { Product, ProductVariant } from '../types';
import { createLocalStore, useLocalStore } from './localStore';
import { isSupabaseConfigured } from './supabase/client';
import {
  fetchRemoteCatalog,
  removeRemoteProduct,
  saveRemoteProduct,
  setRemoteProductActive,
  setRemoteVariantStock,
} from './supabase/repository';

export interface CatalogMeta {
  active: boolean;
  updatedAt?: string;
}

interface CatalogOverlay {
  upserts: Record<string, Product>;
  removed: string[];
  meta: Record<string, CatalogMeta>;
}

const EMPTY_OVERLAY: CatalogOverlay = { upserts: {}, removed: [], meta: {} };

function isProduct(value: unknown): value is Product {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Product;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.shortName === 'string' &&
    (p.category === 'jelly' || p.category === 'custard') &&
    Array.isArray(p.variants) &&
    p.variants.length > 0 &&
    p.variants.every(
      (v) =>
        v &&
        typeof v.id === 'string' &&
        typeof v.productId === 'string' &&
        typeof v.weightGrams === 'number' &&
        typeof v.price === 'number',
    )
  );
}

function sanitize(raw: unknown): CatalogOverlay | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const upserts: Record<string, Product> = {};
  if (typeof r.upserts === 'object' && r.upserts && r.upserts !== null) {
    for (const [id, value] of Object.entries(r.upserts as Record<string, unknown>)) {
      if (id && isProduct(value)) upserts[id] = value;
    }
  }
  const removed = Array.isArray(r.removed)
    ? (r.removed as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const meta: Record<string, CatalogMeta> = {};
  if (typeof r.meta === 'object' && r.meta && r.meta !== null) {
    for (const [id, value] of Object.entries(r.meta as Record<string, unknown>)) {
      const m = value as CatalogMeta | null;
      if (id && m && typeof m.active === 'boolean') {
        meta[id] = { active: m.active, updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : undefined };
      }
    }
  }
  return { upserts, removed, meta };
}

const store = createLocalStore<CatalogOverlay>('zhino_admin_catalog_v1', EMPTY_OVERLAY, sanitize);
let cachedOverlay: CatalogOverlay | null = null;
let cachedList: Product[] = [];
let remoteCatalog: Product[] | null = null;
let remoteAttempted = false;
const remoteListeners = new Set<() => void>();

function mergedList(overlay: CatalogOverlay): Product[] {
  if (cachedOverlay === overlay) return cachedList;
  const list: Product[] = [];
  for (const base of PRODUCTS) {
    if (overlay.removed.includes(base.id)) continue;
    list.push(overlay.upserts[base.id] ?? base);
  }
  for (const [id, product] of Object.entries(overlay.upserts)) {
    if (!PRODUCTS.some((p) => p.id === id)) list.push(product);
  }
  cachedOverlay = overlay;
  cachedList = list;
  return list;
}

function notifyRemoteCatalog() {
  remoteListeners.forEach((listener) => listener());
}

/** Fetches the database catalog. RLS decides whether this is public or admin data. */
export async function hydrateCatalogFromSupabase(force = false): Promise<void> {
  if (!isSupabaseConfigured() || (remoteAttempted && !force)) return;
  remoteAttempted = true;
  try {
    remoteCatalog = await fetchRemoteCatalog(true);
    notifyRemoteCatalog();
  } catch (error) {
    // Keep the real static catalog usable if a project is not migrated yet.
    remoteCatalog = null;
    notifyRemoteCatalog();
    if (import.meta.env.DEV) console.warn('[zhino] Supabase catalog unavailable; using bundled data.', error);
  }
}

function getCatalog(): Product[] {
  return remoteCatalog ?? (isSupabaseConfigured() ? PRODUCTS : mergedList(store.get()));
}

export function getEffectiveCatalog(): Product[] {
  return getCatalog();
}

export function getVisibleProducts(): Product[] {
  if (remoteCatalog) return remoteCatalog.filter((product) => product.active !== false);
  if (isSupabaseConfigured()) return PRODUCTS;
  const overlay = store.get();
  return mergedList(overlay).filter((p) => overlay.meta[p.id]?.active !== false);
}

export function getProductById(id: string): Product | undefined {
  if (remoteCatalog) return remoteCatalog.find((product) => product.id === id);
  const overlay = store.get();
  if (overlay.removed.includes(id)) return undefined;
  return overlay.upserts[id] ?? getBaseProductById(id);
}

export function getVariantById(productId: string, variantId: string): ProductVariant | undefined {
  const product = getProductById(productId);
  if (product) return product.variants.find((variant) => variant.id === variantId);
  return getBaseVariantById(productId, variantId);
}

export function getCatalogMeta(id: string): CatalogMeta {
  if (remoteCatalog) {
    const product = remoteCatalog.find((item) => item.id === id);
    return { active: product?.active !== false, updatedAt: product?.updatedAt };
  }
  if (isSupabaseConfigured()) return { active: true };
  const meta = store.get().meta[id];
  return meta ? { ...meta } : { active: true };
}

export async function upsertProduct(product: Product, active: boolean): Promise<void> {
  if (isSupabaseConfigured()) {
    await saveRemoteProduct(product, active);
    await hydrateCatalogFromSupabase(true);
    return;
  }
  const overlay = store.get();
  store.set({
    upserts: { ...overlay.upserts, [product.id]: product },
    removed: overlay.removed.filter((id) => id !== product.id),
    meta: { ...overlay.meta, [product.id]: { active, updatedAt: new Date().toISOString() } },
  });
}

export async function removeProduct(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    await removeRemoteProduct(id);
    await hydrateCatalogFromSupabase(true);
    return;
  }
  const overlay = store.get();
  store.set({ ...overlay, removed: overlay.removed.includes(id) ? overlay.removed : [...overlay.removed, id] });
}

export async function setProductActive(id: string, active: boolean): Promise<void> {
  if (isSupabaseConfigured()) {
    await setRemoteProductActive(id, active);
    await hydrateCatalogFromSupabase(true);
    return;
  }
  const overlay = store.get();
  store.set({
    ...overlay,
    meta: { ...overlay.meta, [id]: { active, updatedAt: new Date().toISOString() } },
  });
}

export async function setVariantStock(productId: string, variantId: string, stock: number): Promise<void> {
  if (stock < 0) return;
  if (isSupabaseConfigured()) {
    await setRemoteVariantStock(productId, variantId, stock);
    await hydrateCatalogFromSupabase(true);
    return;
  }
  const product = getProductById(productId);
  if (!product) return;
  const next: Product = {
    ...product,
    variants: product.variants.map((variant) => (variant.id === variantId ? { ...variant, stock } : variant)),
  };
  await upsertProduct(next, getCatalogMeta(productId).active);
}

/** Reset remains a local fallback operation. Remote data is managed by migrations/admin writes. */
export function resetCatalog(): void {
  if (isSupabaseConfigured()) {
    void hydrateCatalogFromSupabase(true);
    return;
  }
  store.reset();
}

export function useCatalog(): Product[] {
  const overlay = useLocalStore(store);
  const remote = useSyncExternalStore(
    (listener) => {
      remoteListeners.add(listener);
      return () => remoteListeners.delete(listener);
    },
    () => remoteCatalog,
    () => null,
  );
  useEffect(() => {
    void hydrateCatalogFromSupabase();
  }, []);
  return remote ?? mergedList(overlay);
}
