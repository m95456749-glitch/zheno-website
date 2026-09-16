// ============================================================
// ZHINO — Supabase catalog gateway (products, variants, inventory)
//
// This is the ONLY module that knows the database row shapes. It
// maps them to the app's Product / ProductVariant model so the rest
// of the app (storefront + admin) keeps using the same types it
// already used (src/types/index.ts).
//
// Every statement is executed under the browser's own credentials
// (publishable key + the signed-in admin's JWT), so Row Level
// Security decides what is allowed:
//   - anonymous visitors  → SELECT of active products only
//   - signed-in admin     → SELECT of everything + INSERT/UPDATE
//   - non-admin accounts  → refused by the policies
// No service key is ever used here.
//
// Nothing in this file creates or alters schema, and nothing deletes
// rows: the admin panel's «حذف» maps to `active = false`.
// ============================================================

import type { Product, ProductCategory, ProductVariant, FlavorId } from '../types';
import { getSupabase } from './supabaseClient';

/* ── row shapes (public schema) ────────────────────────────── */

interface ProductRow {
  id: string;
  category: ProductCategory;
  flavor_id: string;
  name: string;
  short_name: string;
  category_label: string;
  image_url: string | null;
  active: boolean;
  featured: boolean;
  special: boolean;
}

interface VariantRow {
  id: string;
  product_id: string;
  weight: string;
  weight_grams: number;
  price: number;
  sku: string;
}

interface InventoryRow {
  variant_id: string;
  current_stock: number;
  active: boolean;
}

/** A catalog snapshot as read from the database. */
export interface RemoteCatalog {
  /** full catalog, including products an admin has deactivated */
  products: Product[];
  /** product id → products.active */
  active: Record<string, boolean>;
  /** ISO timestamp of the read */
  loadedAt: string;
}

/* ── errors ────────────────────────────────────────────────── */

/** A database/network failure with a message that is safe to show. */
export class CatalogRemoteError extends Error {
  readonly detail: string;

  constructor(context: string, detail: string) {
    super(`${context}: ${detail}`);
    this.name = 'CatalogRemoteError';
    this.detail = detail;
  }
}

function describe(error: { message?: string; details?: string | null; hint?: string | null; code?: string }): string {
  const parts = [error.message, error.details, error.hint, error.code ? `(${error.code})` : ''].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  return parts.join(' ') || 'unknown error';
}

/* ── read ──────────────────────────────────────────────────── */

/**
 * Read the whole catalog (products + variants + inventory).
 * Throws CatalogRemoteError when the database is unreachable or the
 * request is not permitted.
 */
export async function fetchRemoteCatalog(): Promise<RemoteCatalog> {
  const supabase = getSupabase();
  if (!supabase) throw new CatalogRemoteError('Supabase is not configured', 'no client');

  const [productsRes, variantsRes, inventoryRes] = await Promise.all([
    supabase
      .from('products')
      .select('id,category,flavor_id,name,short_name,category_label,image_url,active,featured,special')
      .order('id'),
    supabase.from('product_variants').select('id,product_id,weight,weight_grams,price,sku').order('id'),
    supabase.from('inventory').select('variant_id,current_stock,active'),
  ]);

  if (productsRes.error) throw new CatalogRemoteError('خواندن محصولات ناموفق بود', describe(productsRes.error));
  if (variantsRes.error) throw new CatalogRemoteError('خواندن تنوع‌ها ناموفق بود', describe(variantsRes.error));
  if (inventoryRes.error) throw new CatalogRemoteError('خواندن موجودی ناموفق بود', describe(inventoryRes.error));

  const productRows = (productsRes.data ?? []) as ProductRow[];
  const variantRows = (variantsRes.data ?? []) as VariantRow[];
  const inventoryRows = (inventoryRes.data ?? []) as InventoryRow[];

  const stockByVariant = new Map<string, InventoryRow>();
  for (const row of inventoryRows) stockByVariant.set(row.variant_id, row);

  const variantsByProduct = new Map<string, ProductVariant[]>();
  for (const row of variantRows) {
    const inv = stockByVariant.get(row.id);
    const variant: ProductVariant = {
      id: row.id,
      productId: row.product_id,
      weight: row.weight,
      weightGrams: row.weight_grams,
      price: row.price,
      sku: row.sku,
      // Inventory is the single stock source. A variant without an
      // inventory row is treated as out of stock rather than crashing.
      stock: inv ? inv.current_stock : 0,
      // `available` mirrors today's semantics: it is the sellable
      // flag, not the quantity guard (the cart checks stock itself).
      available: inv ? inv.active : false,
    };
    const list = variantsByProduct.get(row.product_id);
    if (list) list.push(variant);
    else variantsByProduct.set(row.product_id, [variant]);
  }

  const active: Record<string, boolean> = {};
  const products: Product[] = [];
  for (const row of productRows) {
    const variants = variantsByProduct.get(row.id);
    // A product without a variant cannot be sold; the storefront's
    // cart guards already handle an unknown variant.
    if (!variants || variants.length === 0) continue;
    products.push({
      id: row.id,
      category: row.category,
      flavorId: row.flavor_id as FlavorId,
      name: row.name,
      shortName: row.short_name,
      categoryLabel: row.category_label,
      imageUrl: row.image_url ?? undefined,
      variants: variants.sort((a, b) => a.weightGrams - b.weightGrams),
      featured: row.featured,
      special: row.special,
    });
    active[row.id] = row.active;
  }

  return { products, active, loadedAt: new Date().toISOString() };
}

/* ── write (admin only — RLS enforces it) ──────────────────── */

/** Create or update a product row. */
export async function pushProductRow(product: Product, active: boolean): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new CatalogRemoteError('Supabase is not configured', 'no client');

  const { error } = await supabase.from('products').upsert(
    {
      id: product.id,
      category: product.category,
      flavor_id: product.flavorId,
      name: product.name,
      short_name: product.shortName,
      category_label: product.categoryLabel,
      image_url: product.imageUrl ?? null,
      active,
      featured: product.featured ?? false,
      special: product.special ?? false,
    },
    { onConflict: 'id' },
  );
  if (error) throw new CatalogRemoteError('ذخیره محصول ناموفق بود', describe(error));
}

/** Create or update a sellable variant row. */
export async function pushVariantRow(variant: ProductVariant): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new CatalogRemoteError('Supabase is not configured', 'no client');

  const { error } = await supabase.from('product_variants').upsert(
    {
      id: variant.id,
      product_id: variant.productId,
      weight: variant.weight,
      weight_grams: variant.weightGrams,
      price: variant.price,
      sku: variant.sku,
    },
    { onConflict: 'id' },
  );
  if (error) throw new CatalogRemoteError('ذخیره وزن/قیمت ناموفق بود', describe(error));
}

/** Flip a product's `active` flag (this is what «حذف» does). */
export async function pushProductActive(id: string, active: boolean): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new CatalogRemoteError('Supabase is not configured', 'no client');

  const { error } = await supabase.from('products').update({ active }).eq('id', id);
  if (error) throw new CatalogRemoteError('تغییر وضعیت نمایش ناموفق بود', describe(error));
}

/**
 * Set one variant's stock.
 *
 * Existing rows go through the database's atomic, admin-checked RPC
 * `set_inventory_stock` (security definer, validates is_admin and
 * refuses negative values). A brand-new variant has no inventory row
 * yet, so it is created with an INSERT — also an admin-only write
 * under RLS.
 */
export async function pushVariantStock(variantId: string, stock: number): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new CatalogRemoteError('Supabase is not configured', 'no client');
  if (!Number.isInteger(stock) || stock < 0) {
    throw new CatalogRemoteError('موجودی نامعتبر است', `value=${stock}`);
  }

  const { data: existing, error: readError } = await supabase
    .from('inventory')
    .select('variant_id')
    .eq('variant_id', variantId)
    .maybeSingle();
  if (readError) throw new CatalogRemoteError('خواندن ردیف موجودی ناموفق بود', describe(readError));

  if (existing) {
    const { error } = await supabase.rpc('set_inventory_stock', {
      p_variant_id: variantId,
      p_current_stock: stock,
    });
    if (error) throw new CatalogRemoteError('ذخیره موجودی ناموفق بود', describe(error));
    return;
  }

  const { error } = await supabase
    .from('inventory')
    .insert({ variant_id: variantId, current_stock: stock });
  if (error) throw new CatalogRemoteError('ایجاد ردیف موجودی ناموفق بود', describe(error));
}

/** Read the `is_admin()` helper the RLS policies use (defence in depth). */
export async function fetchIsAdmin(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('is_admin');
  if (error) throw new CatalogRemoteError('بررسی دسترسی مدیر ناموفق بود', describe(error));
  return data === true;
}
