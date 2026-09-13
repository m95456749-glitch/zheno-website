// Generated-by-hand contract for the checked-in Supabase migration.
// Keep this file in sync with supabase/migrations/20260912000000_initial_schema.sql.
// It intentionally contains no credentials.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type ProductCategory = 'jelly' | 'custard';
type OrderStatus = 'new' | 'confirmed' | 'preparing' | 'shipped' | 'completed' | 'cancelled';

type ProductRow = {
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
  created_at: string;
  updated_at: string;
};
type ProductInsert = Omit<ProductRow, 'created_at' | 'updated_at'> & {
  created_at?: string;
  updated_at?: string;
};
type ProductUpdate = Partial<ProductInsert>;

type VariantRow = {
  id: string;
  product_id: string;
  weight: string;
  weight_grams: number;
  price: number;
  sku: string;
  created_at: string;
  updated_at: string;
};
type VariantInsert = Omit<VariantRow, 'created_at' | 'updated_at'> & {
  created_at?: string;
  updated_at?: string;
};
type VariantUpdate = Partial<VariantInsert>;

type InventoryRow = {
  variant_id: string;
  current_stock: number;
  low_stock_threshold: number;
  active: boolean;
  updated_at: string;
};
type InventoryInsert = Omit<InventoryRow, 'updated_at'> & { updated_at?: string };
type InventoryUpdate = Partial<InventoryInsert>;

type RecipeRow = {
  id: string;
  title: string;
  summary: string;
  category: ProductCategory;
  ingredients: string[];
  steps: string[];
  emoji: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};
type RecipeInsert = Omit<RecipeRow, 'created_at' | 'updated_at'> & {
  created_at?: string;
  updated_at?: string;
};
type RecipeUpdate = Partial<RecipeInsert>;

type SiteContentRow = {
  key: string;
  value: string;
  published: boolean;
  updated_at: string;
};
type SiteContentInsert = Omit<SiteContentRow, 'updated_at'> & { updated_at?: string };
type SiteContentUpdate = Partial<SiteContentInsert>;

type SiteSettingsRow = {
  id: string;
  free_shipping_threshold: number;
  standard_shipping_cost: number;
  express_shipping_cost: number;
  low_stock_threshold: number;
  updated_at: string;
};
type SiteSettingsInsert = Omit<SiteSettingsRow, 'updated_at'> & { updated_at?: string };
type SiteSettingsUpdate = Partial<SiteSettingsInsert>;

type OrderRow = {
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
  shipping_method: 'standard' | 'express';
  subtotal: number;
  shipping_cost: number;
  total: number;
  created_at: string;
  updated_at: string;
};
type OrderInsert = Partial<OrderRow> & Pick<OrderRow, 'customer_first_name' | 'customer_last_name' | 'customer_phone' | 'shipping_province' | 'shipping_city' | 'shipping_address' | 'shipping_postal_code' | 'shipping_method'>;
type OrderUpdate = Partial<OrderInsert>;

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  weight: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
};
type OrderItemInsert = Omit<OrderItemRow, 'id' | 'total_price' | 'created_at'> & {
  id?: string;
  total_price?: number;
  created_at?: string;
};
type OrderItemUpdate = Partial<OrderItemInsert>;

export interface Database {
  public: {
    Tables: {
      flavors: {
        Row: { id: string; category: ProductCategory; name: string; color: string; emoji: string; created_at: string; updated_at: string };
        Insert: { id: string; category: ProductCategory; name: string; color: string; emoji: string; created_at?: string; updated_at?: string };
        Update: Partial<{ id: string; category: ProductCategory; name: string; color: string; emoji: string; created_at: string; updated_at: string }>;
        Relationships: [];
      };
      products: { Row: ProductRow; Insert: ProductInsert; Update: ProductUpdate; Relationships: [] };
      product_variants: { Row: VariantRow; Insert: VariantInsert; Update: VariantUpdate; Relationships: [] };
      inventory: { Row: InventoryRow; Insert: InventoryInsert; Update: InventoryUpdate; Relationships: [] };
      recipes: { Row: RecipeRow; Insert: RecipeInsert; Update: RecipeUpdate; Relationships: [] };
      site_content: { Row: SiteContentRow; Insert: SiteContentInsert; Update: SiteContentUpdate; Relationships: [] };
      site_settings: { Row: SiteSettingsRow; Insert: SiteSettingsInsert; Update: SiteSettingsUpdate; Relationships: [] };
      orders: { Row: OrderRow; Insert: OrderInsert; Update: OrderUpdate; Relationships: [] };
      order_items: { Row: OrderItemRow; Insert: OrderItemInsert; Update: OrderItemUpdate; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      create_order: {
        Args: {
          p_customer: Json;
          p_shipping: Json;
          p_items: Json;
          p_shipping_method: 'standard' | 'express';
        };
        Returns: { order_id: string; subtotal: number; shipping_cost: number; total: number }[];
      };
      set_inventory_stock: {
        Args: { p_variant_id: string; p_current_stock: number };
        Returns: InventoryRow[];
      };
      adjust_inventory: {
        Args: { p_variant_id: string; p_delta: number };
        Returns: InventoryRow[];
      };
    };
    Enums: {
      product_category: ProductCategory;
      order_status: OrderStatus;
      shipping_method: 'standard' | 'express';
    };
    CompositeTypes: Record<string, never>;
  };
}
