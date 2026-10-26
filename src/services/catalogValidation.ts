// ============================================================
// ZHINO — pure catalog write validation
//
// Kept dependency-free so the product form, the catalog write
// service and offline regression tests all apply exactly the
// same rules before a multi-table write is even started. This
// does not replace database constraints/RLS; it prevents the
// panel from starting a write that is already known to be
// incomplete or in conflict with the loaded catalog.
// ============================================================

import type { FlavorId, Product, ProductCategory, ProductVariant } from '../types';

/** PostgreSQL `integer` columns used by price, weight and stock. */
export const MAX_DB_INTEGER = 2_147_483_647;

export function isDbIntegerInRange(
  value: number,
  min: number,
  max = MAX_DB_INTEGER,
): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** SKUs are stored in the existing uppercase, separator-based form. */
export function normalizeSku(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidSku(value: string): boolean {
  const sku = normalizeSku(value);
  return sku.length >= 3 && sku.length <= 64 && /^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$/.test(sku);
}

/** Preserve the panel's existing automatic SKU convention. */
export function generateSku(category: ProductCategory, flavorId: FlavorId, weightGrams: number): string {
  return `Z${category === 'jelly' ? 'J' : 'C'}-${flavorId.slice(0, 3).toUpperCase()}-${weightGrams}`;
}

export interface SkuConflict {
  product: Product;
  variant: ProductVariant;
}

/** Find another variant already using a SKU (case-insensitive). */
export function findSkuConflict(
  products: readonly Product[],
  sku: string,
  exceptVariantId?: string,
): SkuConflict | null {
  const wanted = normalizeSku(sku);
  if (!wanted) return null;

  for (const product of products) {
    for (const variant of product.variants) {
      if (variant.id !== exceptVariantId && normalizeSku(variant.sku) === wanted) {
        return { product, variant };
      }
    }
  }
  return null;
}

/**
 * Validate a complete product before the panel writes the product,
 * variant and inventory rows. Returns a stable internal reason, or
 * null when the loaded data says the write may be attempted.
 */
export function validateProductForSave(
  product: Product,
  existingProducts: readonly Product[],
): string | null {
  if (!Array.isArray(product.variants) || product.variants.length === 0) {
    return 'product_has_no_variant';
  }

  const skusInProduct = new Set<string>();
  for (const variant of product.variants) {
    if (variant.productId !== product.id) return 'variant_product_mismatch';
    if (!isDbIntegerInRange(variant.weightGrams, 1)) return 'invalid_weight';
    if (!isDbIntegerInRange(variant.price, 1)) return 'invalid_price';
    if (!isDbIntegerInRange(variant.stock, 0)) return 'invalid_stock';
    if (!isValidSku(variant.sku)) return 'invalid_sku';

    const sku = normalizeSku(variant.sku);
    if (skusInProduct.has(sku)) return 'duplicate_sku_in_product';
    skusInProduct.add(sku);

    if (findSkuConflict(existingProducts, sku, variant.id)) return 'duplicate_sku';
  }

  return null;
}
