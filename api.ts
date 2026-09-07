// ============================================================
// ZHINO — API Service Layer
// Future: connect to real backend
// Replace stub implementations with actual fetch calls
// ============================================================

import type { Order, Customer, Address, CartItem, ShippingMethod } from '../types';

const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? '';

interface InitiatePaymentRequest {
  customer: Customer;
  address: Address;
  items: CartItem[];
  shippingMethod: ShippingMethod;
  total: number;
}

interface InitiatePaymentResponse {
  orderId: string;
  gatewayUrl: string;  // redirect to bank gateway
  token: string;
}

/**
 * Initiate a payment session with the backend
 * Backend creates the order and returns a payment gateway URL
 * NEVER pass payment secrets from the frontend
 */
export async function initiatePayment(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _data: InitiatePaymentRequest
): Promise<InitiatePaymentResponse> {
  if (!API_BASE) {
    // Stub for frontend-only mode
    throw new Error('PAYMENT_API_NOT_CONFIGURED');
  }

  const response = await fetch(`${API_BASE}/orders/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(_data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message ?? 'خطا در اتصال به درگاه پرداخت');
  }

  return response.json();
}

/**
 * Verify payment after user returns from gateway
 */
export async function verifyPayment(
  orderId: string,
  token: string
): Promise<{ success: boolean; order?: Order }> {
  if (!API_BASE) {
    throw new Error('PAYMENT_API_NOT_CONFIGURED');
  }

  const response = await fetch(`${API_BASE}/orders/${orderId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    return { success: false };
  }

  return response.json();
}

/**
 * Get order details
 */
export async function getOrder(orderId: string): Promise<Order | null> {
  if (!API_BASE) return null;

  const response = await fetch(`${API_BASE}/orders/${orderId}`);
  if (!response.ok) return null;
  return response.json();
}
