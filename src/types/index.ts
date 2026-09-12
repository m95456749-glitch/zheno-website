// ============================================================
// ZHINO — shared domain types
// ============================================================

export type ProductCategory = 'jelly' | 'custard';

export type FlavorId =
  | 'pomegranate' | 'strawberry-j' | 'peach' | 'raspberry'
  | 'blueberry' | 'orange-j' | 'pineapple' | 'sour-cherry'
  | 'watermelon' | 'cantaloupe-j' | 'mulberry' | 'mango'
  | 'grape' | 'kiwi' | 'lemon'
  | 'banana' | 'cantaloupe' | 'strawberry-c' | 'chocolate'
  | 'seven-fruit' | 'orange-c' | 'mahlab-vanilla';

export interface Flavor {
  id: FlavorId;
  name: string;
  color: string;
  emoji: string;
  category: ProductCategory;
}

export interface ProductVariant {
  id: string;
  productId: string;
  weight: string;
  weightGrams: number;
  price: number;
  sku: string;
  stock: number;
  available: boolean;
  lowStockThreshold?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  category: ProductCategory;
  flavorId: FlavorId;
  name: string;
  shortName: string;
  categoryLabel: string;
  imageUrl?: string;
  variants: ProductVariant[];
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  featured?: boolean;
  special?: boolean;
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
export type OrderStatus = 'new' | 'confirmed' | 'preparing' | 'shipped' | 'completed' | 'cancelled';

export interface OrderItem {
  productId: string;
  variantId: string;
  productName: string;
  weight: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Order {
  id: string;
  items: OrderItem[];
  customer: Customer;
  address: Address;
  shippingMethod: ShippingMethod;
  subtotal: number;
  shippingCost: number;
  total: number;
  createdAt: string;
  updatedAt?: string;
  status: OrderStatus;
}

export type CheckoutStep = 'cart' | 'customer' | 'address' | 'payment' | 'confirmation';

export interface SoundPreferences {
  enabled: boolean;
}
