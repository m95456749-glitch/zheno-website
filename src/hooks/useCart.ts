// ============================================================
// ZHINO — Cart Hook
// ============================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import type { CartItem } from '../types';
// catalog lookups go through the shared service (admin overlay
// aware); the free-shipping threshold comes from site settings
// (default = the original constant — unchanged behaviour).
import { getProductById, getVariantById } from '../services/catalog';
import { getSettings } from '../services/settings';
import { soundService } from '../services/soundService';

const CART_STORAGE_KEY = 'zhino_cart';

interface CartResult {
  success: boolean;
  error?: string;
}

function loadCart(): CartItem[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const valid: CartItem[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) continue;
      const i = entry as Record<string, unknown>;
      if (
        typeof i.productId !== 'string' ||
        typeof i.variantId !== 'string' ||
        typeof i.quantity !== 'number'
      ) {
        continue;
      }
      // Drop entries that no longer match the catalog (removed product,
      // unknown variant, unavailable item) so a stale or hand-edited stored
      // cart can never break totals or render a broken cart page.
      const product = getProductById(i.productId);
      const variant = getVariantById(i.productId, i.variantId);
      if (!product || !variant || !variant.available) continue;
      const qty = Math.floor(i.quantity);
      if (qty <= 0) continue;
      valid.push({
        productId: i.productId,
        variantId: i.variantId,
        quantity: Math.min(qty, variant.stock),
      });
    }

    // Merge duplicate lines (defensive: hand-edited storage)
    const merged = new Map<string, CartItem>();
    for (const item of valid) {
      const key = `${item.productId}__${item.variantId}`;
      const prev = merged.get(key);
      if (prev) {
        const variant = getVariantById(item.productId, item.variantId);
        const cap = variant?.stock ?? prev.quantity;
        prev.quantity = Math.min(prev.quantity + item.quantity, cap);
      } else {
        merged.set(key, { ...item });
      }
    }
    return [...merged.values()];
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage unavailable or quota exceeded — cart still works in memory
  }
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => loadCart());
  const prevSubtotalRef = useRef(0);
  const freeShippingThreshold = getSettings().freeShippingThreshold;

  useEffect(() => {
    saveCart(items);
  }, [items]);

  const subtotal = items.reduce((sum, item) => {
    const variant = getVariantById(item.productId, item.variantId);
    return sum + (variant?.price ?? 0) * item.quantity;
  }, 0);

  useEffect(() => {
    if (prevSubtotalRef.current < freeShippingThreshold && subtotal >= freeShippingThreshold) {
      soundService.play('freeShipping');
    }
    prevSubtotalRef.current = subtotal;
  }, [subtotal, freeShippingThreshold]);

  // NOTE: stock/availability decisions are computed from the current `items`
  // state (not inside a setState updater function) so the returned result
  // stays correct under React StrictMode, where updater functions may be
  // invoked twice in development.
  const addItem = useCallback(
    (productId: string, variantId: string, quantity = 1): CartResult => {
      const product = getProductById(productId);
      const variant = getVariantById(productId, variantId);

      if (!product || !variant) {
        return { success: false, error: 'محصول یافت نشد' };
      }
      if (!variant.available) {
        return { success: false, error: 'این محصول در حال حاضر موجود نیست' };
      }

      const existing = items.find(
        (i) => i.productId === productId && i.variantId === variantId,
      );
      const newQty = (existing?.quantity ?? 0) + quantity;

      if (newQty > variant.stock) {
        return { success: false, error: 'موجودی فعلاً کافی نیست' };
      }

      soundService.play('addToCart');
      if (existing) {
        setItems((prev) =>
          prev.map((i) =>
            i.productId === productId && i.variantId === variantId
              ? { ...i, quantity: newQty }
              : i,
          ),
        );
      } else {
        setItems((prev) => [...prev, { productId, variantId, quantity }]);
      }
      return { success: true };
    },
    [items],
  );

  const updateQuantity = useCallback(
    (productId: string, variantId: string, quantity: number): CartResult => {
      const variant = getVariantById(productId, variantId);
      if (!variant) return { success: false, error: 'محصول یافت نشد' };

      if (quantity <= 0) {
        setItems((prev) =>
          prev.filter((i) => !(i.productId === productId && i.variantId === variantId)),
        );
        soundService.play('removeFromCart');
        return { success: true };
      }

      if (quantity > variant.stock) {
        return { success: false, error: 'موجودی فعلاً کافی نیست' };
      }

      soundService.play('quantityChange');
      setItems((prev) =>
        prev.map((i) =>
          i.productId === productId && i.variantId === variantId
            ? { ...i, quantity }
            : i,
        ),
      );
      return { success: true };
    },
    [],
  );

  const removeItem = useCallback((productId: string, variantId: string) => {
    soundService.play('removeFromCart');
    setItems((prev) =>
      prev.filter((i) => !(i.productId === productId && i.variantId === variantId)),
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const isShippingFree = subtotal >= freeShippingThreshold;
  const remainingForFreeShipping = Math.max(0, freeShippingThreshold - subtotal);

  return {
    items,
    totalItems,
    subtotal,
    isShippingFree,
    remainingForFreeShipping,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  };
}
