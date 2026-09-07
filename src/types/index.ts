// ============================================================
// ZHINO — Core Type Definitions
// ============================================================

export type ProductCategory = 'jelly' | 'custard';

export type FlavorId =
  // Jelly flavors
  | 'pomegranate' | 'strawberry-j' | 'peach' | 'raspberry'
  | 'blueberry' | 'orange-j' | 'pineapple' | 'sour-cherry'
  // Custard flavors
  | 'banana' | 'cantaloupe' | 'strawberry-c' | 'chocolate'
  | 'seven-fruit' | 'orange-c' | 'mahlab-vanilla';

export interface Flavor {
  id: FlavorId;
  name: string;
  color: string;       // Tailwind bg color token or hex
  emoji: string;
  category: ProductCategory;
}

export interface ProductVariant {
  id: string;
  productId: string;
  weight: string;       // e.g. "250 گرم"
  weightGrams: number;  // numeric for sorting/logic
  price: number;        // in Tomans
  sku: string;
  stock: number;        // units in stock
  available: boolean;
}

export interface Product {
  id: string;
  category: ProductCategory;
  flavorId: FlavorId;
  name: string;         // full display name
  shortName: string;    // short name for cards
  categoryLabel: string; // "پودر ژله" | "پودر کاستارد"
  imageUrl?: string;
  variants: ProductVariant[];
  featured?: boolean;
  special?: boolean;    // e.g. محلبی وانیلی
}

export interface CartItem {
  productId: string;
  variantId: string;
  quantity: number;
}

export interface CartState {
  items: CartItem[];
}

export interface Customer {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export interface Address {
  province: string;
  city: string;
  address: string;
  postalCode: string;
}

export type ShippingMethod = 'standard' | 'express';

export interface Order {
  id: string;
  items: CartItem[];
  customer: Customer;
  address: Address;
  shippingMethod: ShippingMethod;
  subtotal: number;
  shippingCost: number;
  total: number;
  createdAt: string;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered';
}

export type CheckoutStep = 'cart' | 'customer' | 'address' | 'payment' | 'confirmation';

export interface SoundPreferences {
  enabled: boolean;
}
