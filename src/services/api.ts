// ============================================================
// ZHINO — checkout integration service
// ============================================================
// Existing API_BASE support is preserved for a future payment gateway.
// When only Supabase is configured, checkout creates a validated order via
// the database RPC and does not pretend that a bank payment happened.

import type { Order, Customer, Address, CartItem, ShippingMethod } from '../types';
import { isSupabaseConfigured } from './supabase/client';
import { createRemoteOrder } from './supabase/repository';

const API_BASE: string = (import.meta.env.VITE_API_BASE_URL ?? '').trim();

interface InitiatePaymentRequest {
  customer: Customer;
  address: Address;
  items: CartItem[];
  shippingMethod: ShippingMethod;
  total: number;
}

export interface InitiatePaymentResponse {
  orderId: string;
  /** Present only when an external payment gateway is configured. */
  gatewayUrl?: string;
  token?: string;
  paymentRequired: boolean;
}

export async function initiatePayment(data: InitiatePaymentRequest): Promise<InitiatePaymentResponse> {
  if (isSupabaseConfigured() && !API_BASE) {
    const order = await createRemoteOrder(data);
    return { ...order, paymentRequired: false };
  }

  if (!API_BASE) throw new Error('PAYMENT_API_NOT_CONFIGURED');

  const response = await fetch(`${API_BASE}/orders/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message ?? 'خطا در اتصال به درگاه پرداخت');
  }
  const result = (await response.json()) as Omit<InitiatePaymentResponse, 'paymentRequired'>;
  return { ...result, paymentRequired: true };
}

export async function verifyPayment(orderId: string, token: string): Promise<{ success: boolean; order?: Order }> {
  if (!API_BASE) throw new Error('PAYMENT_API_NOT_CONFIGURED');
  const response = await fetch(`${API_BASE}/orders/${orderId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) return { success: false };
  return response.json();
}

export async function getOrder(orderId: string): Promise<Order | null> {
  if (!API_BASE) return null;
  const response = await fetch(`${API_BASE}/orders/${orderId}`);
  if (!response.ok) return null;
  return response.json();
}
