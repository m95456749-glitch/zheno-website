// ============================================================
// ZHINO — catalog service (single source for product lookups)
//
// The static catalog (src/data/products.ts) is the base data and
// is NEVER mutated. Admin edits live in a localStorage overlay
// ("zhino_admin_catalog_v1") and are merged on read:
//
//   effective catalog = base − removed, with per-product upserts
//                       (edits to existing products or brand-new
//                       products) applied on top.
//
// The storefront consumes ONLY getVisibleProducts /
// getProductById / getVariantById — so when a real backend
// lands, this module is the single swap point: its functions
// become API-backed and every storefront page follows.
//
// In this phase the overlay is per-browser (demo), which is
// exactly what the admin UI discloses to the operator.
// ============================================================

import {
  PRODUCTS,
  getProductById as getBaseProductById,
  getVariantById as getBaseVariantById,
} from '../data/products';
import type { Product, ProductVariant } from '../types';
import { createLocalStore, useLocalStore } from './localStore';

/** admin flags per product */
export interface CatalogMeta {
  /** false = hidden from the storefront (deactivated in admin) */
  active: boolean;
  updatedAt?: string;
}

interface CatalogOverlay {
  /** full records: edits of existing products or entirely new ones */
  upserts: Record<string, Product>;
  /** base product ids removed in admin */
  removed: string[];
  /** per-product admin flags */
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
        meta[id] = {
          active: m.active,
          updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : undefined,
        };
      }
    }
  }

  return { upserts, removed, meta };
}

const store = createLocalStore<CatalogOverlay>('zhino_admin_catalog_v1', EMPTY_OVERLAY, sanitize);

/* ── merge (cached per overlay version — stable refs for React) ── */

let cachedOverlay: CatalogOverlay | null = null;
let cachedList: Product[] = [];

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

/* ── reads ─────────────────────────────────────────────────── */

/**
 * The full effective catalog (admin view — includes deactivated
 * products so the operator can re-activate them).
 */
export function getEffectiveCatalog(): Product[] {
  return mergedList(store.get());
}

/**
 * Products shown by the storefront: effective catalog minus
 * deactivated products. Identical to the base catalog until an
 * admin changes something.
 */
export function getVisibleProducts(): Product[] {
  const overlay = store.get();
  return mergedList(overlay).filter((p) => overlay.meta[p.id]?.active !== false);
}

/**
 * Lookup used by cart / checkout / product pages. Resolves
 * overlay edits and deletions; unknown ids resolve against the
 * base catalog (a deleted product resolves to undefined, exactly
 * like an unknown one — cart guards already handle that).
 */
export function getProductById(id: string): Product | undefined {
  const overlay = store.get();
  if (overlay.removed.includes(id)) return undefined;
  return overlay.upserts[id] ?? getBaseProductById(id);
}

export function getVariantById(productId: string, variantId: string): ProductVariant | undefined {
  const overlay = store.get();
  if (overlay.removed.includes(productId)) return undefined;
  const product = overlay.upserts[productId] ?? getBaseProductById(productId);
  if (product) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) return variant;
  }
  return getBaseVariantById(productId, variantId);
}

/** admin flags for a product (defaults: active) */
export function getCatalogMeta(id: string): CatalogMeta {
  const meta = store.get().meta[id];
  return meta ? { ...meta } : { active: true };
}

/* ── writes (admin) ────────────────────────────────────────── */

/** Create or update a product (+ its active flag). */
export function upsertProduct(product: Product, active: boolean): void {
  const overlay = store.get();
  store.set({
    upserts: { ...overlay.upserts, [product.id]: product },
    removed: overlay.removed.filter((id) => id !== product.id),
    meta: {
      ...overlay.meta,
      [product.id]: { active, updatedAt: new Date().toISOString() },
    },
  });
}

/** Remove a product from the storefront (overlay tombstone). */
export function removeProduct(id: string): void {
  const overlay = store.get();
  store.set({
    ...overlay,
    removed: overlay.removed.includes(id) ? overlay.removed : [...overlay.removed, id],
  });
}

/** Toggle a product's active flag without touching its data. */
export function setProductActive(id: string, active: boolean): void {
  const overlay = store.get();
  store.set({
    ...overlay,
    meta: {
      ...overlay.meta,
      [id]: { active, updatedAt: new Date().toISOString() },
    },
  });
}

/** Update one variant's stock (shared with the inventory page —
 *  same data as the storefront, no second inventory system). */
export function setVariantStock(productId: string, variantId: string, stock: number): void {
  const product = getProductById(productId);
  if (!product || stock < 0) return;
  const next: Product = {
    ...product,
    variants: product.variants.map((v) => (v.id === variantId ? { ...v, stock } : v)),
  };
  upsertProduct(next, getCatalogMeta(productId).active);
}

/** Discard every admin catalog change (back to the base data). */
export function resetCatalog(): void {
  store.reset();
}

/* ── React binding ─────────────────────────────────────────── */

/** Effective catalog as a hook (admin pages). */
export function useCatalog(): Product[] {
  const overlay = useLocalStore(store);
  return mergedList(overlay);
}
