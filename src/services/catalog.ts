// ============================================================
// ZHINO — catalog service (single source for product lookups)
//
// TWO SOURCES, ONE API — and the storefront never knows which one
// is active:
//
//   1. CONNECTED (Supabase configured — see src/services/
//      supabaseClient.ts): products/variants/inventory are read
//      from PostgreSQL and written back by the admin panel. The
//      writes are normal PostgREST calls that Row Level Security
//      only allows for a signed-in admin (`is_admin()` from the JWT
//      app_metadata) — there is no public write path anywhere.
//
//   2. LOCAL (no Supabase configured, or the database is
//      unreachable): the static catalog (src/data/products.ts) stays
//      the base data and admin edits live in a localStorage overlay
//      ("zhino_admin_catalog_v1"), exactly as before. This is also
//      the offline fallback: a failed read keeps the previous
//      snapshot instead of blanking the storefront.
//
// The storefront consumes ONLY getVisibleProducts / getProductById /
// getVariantById (plus the React bindings), so both modes behave
// identically from the outside.
//
// «حذف» in the admin panel NEVER deletes a row: products are
// referenced by orders and `delete` would be destructive. It sets
// `active = false`, which is what the storefront already treats as
// "not for sale".
// ============================================================

import {
  PRODUCTS,
  getProductById as getBaseProductById,
  getVariantById as getBaseVariantById,
} from '../data/products';
import type { Product, ProductVariant } from '../types';
import { createLocalStore, useLocalStore } from './localStore';
import {
  getRemoteCatalog,
  makeRemoteCatalog,
  refreshRemoteCatalog,
  runRemoteWrite,
  updateRemoteCatalog,
  useRemoteCatalog,
  getCatalogSyncState,
} from './catalogSync';
import {
  pushProductActive,
  pushProductRow,
  pushVariantRow,
  pushVariantStock,
  pushVariantStockAdjustment,
} from './supabaseCatalog';

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

/* ── mode ──────────────────────────────────────────────────── */

/** true while the admin panel writes to the PostgreSQL database */
export function isDatabaseConnected(): boolean {
  return getCatalogSyncState().source === 'remote';
}

/** Re-read the catalog from the database (no-op in local mode). */
export function reloadCatalogFromDatabase(): Promise<void> {
  return refreshRemoteCatalog();
}

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
  const remote = getRemoteCatalog();
  if (remote) return remote.products;
  return mergedList(store.get());
}

/**
 * Products shown by the storefront: effective catalog minus
 * deactivated products. Identical to the base catalog until an
 * admin changes something.
 */
export function getVisibleProducts(): Product[] {
  const remote = getRemoteCatalog();
  if (remote) return remote.products.filter((p) => remote.active[p.id] !== false && p.variants.length > 0);
  const overlay = store.get();
  return mergedList(overlay).filter((p) => overlay.meta[p.id]?.active !== false);
}

/**
 * Lookup used by cart / checkout / product pages.
 *
 * While a database snapshot exists it is the ONLY authority: a product
 * the snapshot does not contain is not sellable (an admin deactivated
 * it, RLS does not expose it to this session, or it is no longer in the
 * database). Falling back to the static catalog here would let a
 * deactivated product stay in a cart — and be ordered — with a price the
 * database no longer agrees with. The cart loader already drops entries
 * whose product/variant no longer resolves, so an existing cart line is
 * removed exactly like a locally «removed» product.
 *
 * Before the first successful read (or in local mode) the base catalog +
 * admin overlay is used, i.e. the original behaviour.
 */
export function getProductById(id: string): Product | undefined {
  const remote = getRemoteCatalog();
  if (remote) return remote.products.find((p) => p.id === id && p.variants.length > 0);

  const overlay = store.get();
  if (overlay.removed.includes(id)) return undefined;
  return overlay.upserts[id] ?? getBaseProductById(id);
}

export function getVariantById(productId: string, variantId: string): ProductVariant | undefined {
  const remote = getRemoteCatalog();
  if (remote) {
    const product = remote.products.find((p) => p.id === productId);
    return product?.variants.find((v) => v.id === variantId);
  }

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
  const remote = getRemoteCatalog();
  if (remote) return { active: remote.active[id] !== false };
  const meta = store.get().meta[id];
  return meta ? { ...meta } : { active: true };
}

/* ── writes (admin) ────────────────────────────────────────── */

/** Create or update a product (+ its active flag). */
export function upsertProduct(product: Product, active: boolean): void {
  if (isDatabaseConnected()) {
    updateRemoteCatalog((current) => {
      const products = current.products.slice();
      const index = products.findIndex((p) => p.id === product.id);
      if (index >= 0) products[index] = product;
      else products.push(product);
      return makeRemoteCatalog(products, { ...current.active, [product.id]: active });
    });
    runRemoteWrite('ذخیره محصول', async () => {
      await pushProductRow(product, active);
      for (const variant of product.variants) {
        await pushVariantRow(variant);
        await pushVariantStock(variant.id, variant.stock);
      }
    });
    return;
  }

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

/**
 * Remove a product from the storefront.
 *
 * Connected mode: this sets `active = false` in the database. Nothing
 * is deleted — orders and order_items reference product rows, and a
 * destructive delete would both fail (ON DELETE RESTRICT) and lose
 * history. Local mode keeps the overlay tombstone it always had.
 */
export function removeProduct(id: string): void {
  if (isDatabaseConnected()) {
    updateRemoteCatalog((current) => makeRemoteCatalog(current.products, { ...current.active, [id]: false }));
    runRemoteWrite('پنهان‌کردن محصول', async () => {
      await pushProductActive(id, false);
    });
    return;
  }

  const overlay = store.get();
  store.set({
    ...overlay,
    removed: overlay.removed.includes(id) ? overlay.removed : [...overlay.removed, id],
  });
}

/** Toggle a product's active flag without touching its data. */
export function setProductActive(id: string, active: boolean): void {
  if (isDatabaseConnected()) {
    updateRemoteCatalog((current) => makeRemoteCatalog(current.products, { ...current.active, [id]: active }));
    runRemoteWrite('تغییر وضعیت نمایش', async () => {
      await pushProductActive(id, active);
    });
    return;
  }

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
  if (!product || !Number.isSafeInteger(stock) || stock < 0) return;

  if (isDatabaseConnected()) {
    const next: Product = {
      ...product,
      variants: product.variants.map((v) => (v.id === variantId ? { ...v, stock } : v)),
    };
    updateRemoteCatalog((current) =>
      makeRemoteCatalog(
        current.products.map((p) => (p.id === productId ? next : p)),
        current.active,
      ),
    );
    runRemoteWrite('ذخیره موجودی', async () => {
      await pushVariantStock(variantId, stock);
    });
    return;
  }

  const next: Product = {
    ...product,
    variants: product.variants.map((v) => (v.id === variantId ? { ...v, stock } : v)),
  };
  upsertProduct(next, getCatalogMeta(productId).active);
}

/** Increase or decrease one stock row with the database's atomic RPC. */
export function adjustVariantStock(productId: string, variantId: string, delta: number): void {
  const product = getProductById(productId);
  if (!product || !Number.isSafeInteger(delta) || delta === 0) return;
  const variant = product.variants.find((item) => item.id === variantId);
  if (!variant) return;
  const nextStock = variant.stock + delta;
  if (!Number.isSafeInteger(nextStock) || nextStock < 0) return;

  if (isDatabaseConnected()) {
    const next: Product = {
      ...product,
      variants: product.variants.map((item) => (item.id === variantId ? { ...item, stock: nextStock } : item)),
    };
    updateRemoteCatalog((current) =>
      makeRemoteCatalog(current.products.map((item) => (item.id === productId ? next : item)), current.active),
    );
    runRemoteWrite('تغییر موجودی', () => pushVariantStockAdjustment(variantId, delta));
    return;
  }

  setVariantStock(productId, variantId, nextStock);
}

/**
 * Discard every admin catalog change.
 * Connected mode: drops any leftover local overlay and re-reads the
 * database — it never writes a "reset" to PostgreSQL.
 */
export function resetCatalog(): void {
  store.reset();
  if (isDatabaseConnected()) void refreshRemoteCatalog();
}

/* ── React binding ─────────────────────────────────────────── */

/** Effective catalog as a hook (admin pages). */
export function useCatalog(): Product[] {
  const overlay = useLocalStore(store);
  const remote = useRemoteCatalog();
  return remote ? remote.products : mergedList(overlay);
}

/** Image demo writes must never report success on a failed localStorage save. */
export function setLocalProductImage(product: Product, imageUrl: string | undefined): void {
  if (isDatabaseConnected()) throw new Error('ذخیرهٔ محلی در حالت متصل مجاز نیست.');
  const overlay = store.get();
  store.setStrict({ ...overlay, upserts: { ...overlay.upserts, [product.id]: { ...product, imageUrl } } });
}
