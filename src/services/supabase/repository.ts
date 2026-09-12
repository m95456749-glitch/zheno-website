// ============================================================
// ZHINO — Supabase repository
// ============================================================
// All database I/O lives here. React components and storefront pages
// consume the existing service modules; they never import Supabase directly.

import type { Recipe } from '../../data/recipes';
import type { Product, ProductVariant, Address, Customer, CartItem, ShippingMethod } from '../../types';
import type { SiteContent } from '../siteContent';
import type { SiteSettings } from '../settings';
import type { OrderStatus, StoredOrder } from '../orderStore';
import { getSupabaseClient } from './client';

interface RemoteProductRow {
  id: string;
  category: Product['category'];
  flavor_id: string;
  name: string;
  short_name: string;
  category_label: string;
  image_url: string | null;
  active: boolean;
  featured: boolean;
  special: boolean;
  created_at: string;
  updated_at: string;
}

interface RemoteVariantRow {
  id: string;
  product_id: string;
  weight: string;
  weight_grams: number;
  price: number;
  sku: string;
  created_at: string;
  updated_at: string;
}

interface RemoteInventoryRow {
  variant_id: string;
  current_stock: number;
  low_stock_threshold: number;
  active: boolean;
  updated_at: string;
}

interface RemoteRecipeRow {
  id: string;
  title: string;
  summary: string;
  category: Recipe['category'];
  ingredients: string[];
  steps: string[];
  emoji: string;
  active: boolean;
}

interface RemoteOrderRow {
  id: string;
  status: OrderStatus;
  customer_first_name: string;
  customer_last_name: string;
  customer_phone: string;
  customer_email: string | null;
  shipping_province: string;
  shipping_city: string;
  shipping_address: string;
  shipping_postal_code: string;
  shipping_method: ShippingMethod;
  subtotal: number;
  shipping_cost: number;
  total: number;
  created_at: string;
}

interface RemoteOrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  weight: string;
  quantity: number;
  unit_price: number;
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error('SUPABASE_NOT_CONFIGURED');
  return client;
}

function throwOnError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function fetchRemoteCatalog(includeInactive = false): Promise<Product[]> {
  const client = requireClient();
  let productQuery = client
    .from('products')
    .select('*')
    .order('created_at', { ascending: true });
  if (!includeInactive) productQuery = productQuery.eq('active', true);

  const [productsResult, variantsResult, inventoryResult] = await Promise.all([
    productQuery,
    client.from('product_variants').select('*'),
    client.from('inventory').select('*'),
  ]);
  throwOnError(productsResult.error);
  throwOnError(variantsResult.error);
  throwOnError(inventoryResult.error);

  const products = (productsResult.data ?? []) as unknown as RemoteProductRow[];
  const variants = (variantsResult.data ?? []) as unknown as RemoteVariantRow[];
  const inventory = (inventoryResult.data ?? []) as unknown as RemoteInventoryRow[];
  const inventoryByVariant = new Map(inventory.map((row) => [row.variant_id, row]));

  return products.map((product) => ({
    id: product.id,
    category: product.category,
    flavorId: product.flavor_id as Product['flavorId'],
    name: product.name,
    shortName: product.short_name,
    categoryLabel: product.category_label,
    imageUrl: product.image_url ?? undefined,
    active: product.active,
    featured: product.featured,
    special: product.special,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    variants: variants
      .filter((variant) => variant.product_id === product.id)
      .map((variant) => {
        const stock = inventoryByVariant.get(variant.id);
        return {
          id: variant.id,
          productId: variant.product_id,
          weight: variant.weight,
          weightGrams: variant.weight_grams,
          price: variant.price,
          sku: variant.sku,
          stock: stock?.current_stock ?? 0,
          available: Boolean(stock?.active && (stock.current_stock ?? 0) > 0),
          lowStockThreshold: stock?.low_stock_threshold ?? 30,
          createdAt: variant.created_at,
          updatedAt: variant.updated_at,
        } satisfies ProductVariant;
      }),
  }));
}

export async function saveRemoteProduct(product: Product, active: boolean): Promise<void> {
  const client = requireClient();
  const productResult = await client.from('products').upsert({
    id: product.id,
    category: product.category,
    flavor_id: product.flavorId,
    name: product.name,
    short_name: product.shortName,
    category_label: product.categoryLabel,
    image_url: product.imageUrl ?? null,
    active,
    featured: Boolean(product.featured),
    special: Boolean(product.special),
  });
  throwOnError(productResult.error);

  for (const variant of product.variants) {
    const variantResult = await client.from('product_variants').upsert({
      id: variant.id,
      product_id: product.id,
      weight: variant.weight,
      weight_grams: variant.weightGrams,
      price: variant.price,
      sku: variant.sku,
    });
    throwOnError(variantResult.error);

    // Keep existing stock out of a normal upsert. The database RPC below is
    // the only mutation path for current_stock, so concurrent admin edits
    // cannot be silently overwritten by a product metadata save.
    const existingInventory = await client
      .from('inventory')
      .select('variant_id')
      .eq('variant_id', variant.id)
      .maybeSingle();
    throwOnError(existingInventory.error);
    if (existingInventory.data) {
      const inventoryResult = await client
        .from('inventory')
        .update({
          low_stock_threshold: Math.max(0, Math.floor(variant.lowStockThreshold ?? 30)),
          active: Boolean(active && variant.available),
        })
        .eq('variant_id', variant.id);
      throwOnError(inventoryResult.error);
    } else {
      const inventoryResult = await client.from('inventory').insert({
        variant_id: variant.id,
        current_stock: 0,
        low_stock_threshold: Math.max(0, Math.floor(variant.lowStockThreshold ?? 30)),
        active: Boolean(active && variant.available),
      });
      throwOnError(inventoryResult.error);
    }
    const stockResult = await client.rpc('set_inventory_stock', {
      p_variant_id: variant.id,
      p_current_stock: Math.max(0, Math.floor(variant.stock)),
    });
    throwOnError(stockResult.error);
  }
}

export async function setRemoteProductActive(id: string, active: boolean): Promise<void> {
  const client = requireClient();
  const productResult = await client.from('products').update({ active }).eq('id', id);
  throwOnError(productResult.error);
  const product = await client.from('product_variants').select('id').eq('product_id', id);
  throwOnError(product.error);
  const ids = ((product.data ?? []) as unknown as Array<{ id: string }>).map((row) => row.id);
  if (ids.length > 0) {
    const inventoryResult = await client.from('inventory').update({ active }).in('variant_id', ids);
    throwOnError(inventoryResult.error);
  }
}

/** Soft delete: order history keeps its foreign-key snapshots. */
export async function removeRemoteProduct(id: string): Promise<void> {
  return setRemoteProductActive(id, false);
}

export async function setRemoteVariantStock(productId: string, variantId: string, stock: number): Promise<void> {
  const client = requireClient();
  const variant = await client.from('product_variants').select('id').eq('id', variantId).eq('product_id', productId).maybeSingle();
  throwOnError(variant.error);
  if (!variant.data) throw new Error('variant_not_found');
  const result = await client.rpc('set_inventory_stock', {
    p_variant_id: variantId,
    p_current_stock: Math.max(0, Math.floor(stock)),
  });
  throwOnError(result.error);
}

export async function fetchRemoteRecipes(includeInactive = false): Promise<Recipe[]> {
  const client = requireClient();
  let query = client.from('recipes').select('*').order('created_at', { ascending: true });
  if (!includeInactive) query = query.eq('active', true);
  const result = await query;
  throwOnError(result.error);
  return ((result.data ?? []) as unknown as RemoteRecipeRow[]).map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    summary: recipe.summary,
    category: recipe.category,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    emoji: recipe.emoji,
  }));
}

export async function saveRemoteRecipe(recipe: Recipe): Promise<void> {
  const client = requireClient();
  const result = await client.from('recipes').upsert({
    id: recipe.id,
    title: recipe.title,
    summary: recipe.summary,
    category: recipe.category,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    emoji: recipe.emoji,
    active: true,
  });
  throwOnError(result.error);
}

export async function removeRemoteRecipe(id: string): Promise<void> {
  const client = requireClient();
  const result = await client.from('recipes').update({ active: false }).eq('id', id);
  throwOnError(result.error);
}

export async function fetchRemoteSettings(): Promise<SiteSettings> {
  const client = requireClient();
  const result = await client.from('site_settings').select('*').eq('id', 'default').maybeSingle();
  throwOnError(result.error);
  if (!result.data) throw new Error('site_settings_not_seeded');
  const row = result.data;
  return {
    freeShippingThreshold: row.free_shipping_threshold,
    standardShippingCost: row.standard_shipping_cost,
    expressShippingCost: row.express_shipping_cost,
    lowStockThreshold: row.low_stock_threshold,
  };
}

export async function saveRemoteSettings(settings: SiteSettings): Promise<void> {
  const client = requireClient();
  const result = await client.from('site_settings').upsert({
    id: 'default',
    free_shipping_threshold: settings.freeShippingThreshold,
    standard_shipping_cost: settings.standardShippingCost,
    express_shipping_cost: settings.expressShippingCost,
    low_stock_threshold: settings.lowStockThreshold,
  });
  throwOnError(result.error);
}

export async function fetchRemoteContent(): Promise<Partial<SiteContent>> {
  const client = requireClient();
  const result = await client.from('site_content').select('key, value').eq('published', true);
  throwOnError(result.error);
  return Object.fromEntries(((result.data ?? []) as Array<{ key: string; value: string }>).map((row) => [row.key, row.value]));
}

export async function saveRemoteContent(content: SiteContent): Promise<void> {
  const client = requireClient();
  const result = await client.from('site_content').upsert(
    Object.entries(content).map(([key, value]) => ({ key, value, published: true })),
  );
  throwOnError(result.error);
}

export async function createRemoteOrder(data: {
  customer: Customer;
  address: Address;
  items: CartItem[];
  shippingMethod: ShippingMethod;
}): Promise<{ orderId: string; subtotal: number; shippingCost: number; total: number }> {
  const client = requireClient();
  const result = await client.rpc('create_order', {
    p_customer: { ...data.customer },
    p_shipping: { ...data.address },
    p_items: data.items.map((item) => ({ variant_id: item.variantId, quantity: item.quantity })),
    p_shipping_method: data.shippingMethod,
  });
  throwOnError(result.error);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row) throw new Error('order_creation_failed');
  return {
    orderId: row.order_id,
    subtotal: row.subtotal,
    shippingCost: row.shipping_cost,
    total: row.total,
  };
}

function mapRemoteOrder(order: RemoteOrderRow, items: RemoteOrderItemRow[]): StoredOrder {
  return {
    id: order.id,
    createdAt: order.created_at,
    status: order.status,
    items: items.filter((item) => item.order_id === order.id).map((item) => ({
      productId: item.product_id,
      variantId: item.variant_id,
      quantity: item.quantity,
      productName: item.product_name,
      weight: item.weight,
      unitPrice: item.unit_price,
    })),
    customer: {
      firstName: order.customer_first_name,
      lastName: order.customer_last_name,
      phone: order.customer_phone,
      email: order.customer_email ?? '',
    },
    address: {
      province: order.shipping_province,
      city: order.shipping_city,
      address: order.shipping_address,
      postalCode: order.shipping_postal_code,
    },
    shippingMethod: order.shipping_method,
    subtotal: order.subtotal,
    shippingCost: order.shipping_cost,
    total: order.total,
  };
}

export async function fetchRemoteOrders(): Promise<StoredOrder[]> {
  const client = requireClient();
  const [ordersResult, itemsResult] = await Promise.all([
    client.from('orders').select('*').order('created_at', { ascending: false }),
    client.from('order_items').select('*'),
  ]);
  throwOnError(ordersResult.error);
  throwOnError(itemsResult.error);
  return ((ordersResult.data ?? []) as unknown as RemoteOrderRow[]).map((order) =>
    mapRemoteOrder(order, (itemsResult.data ?? []) as unknown as RemoteOrderItemRow[]),
  );
}

export async function updateRemoteOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const client = requireClient();
  const result = await client.from('orders').update({ status }).eq('id', id);
  throwOnError(result.error);
}
