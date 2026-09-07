// ============================================================
// ZHINO — Cart Hook
// ============================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import type { CartItem } from '../types';
import { getProductById, getVariantById, FREE_SHIPPING_THRESHOLD } from '../data/products';
import { soundService } from '../services/soundService';

const CART_STORAGE_KEY = 'zhino_cart';

interface CartResult {
  success: boolean;
  error?: string;
}

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: unknown) => {
        if (typeof item !== 'object' || item === null) return false;
        const i = item as Record<string, unknown>;
        return (
          typeof i.productId === 'string' &&
          typeof i.variantId === 'string' &&
          typeof i.quantity === 'number' &&
          (i.quantity as number) > 0
        );
      }
    );
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage quota exceeded
  }
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => loadCart());
  const prevSubtotalRef = useRef(0);

  useEffect(() => {
    saveCart(items);
  }, [items]);

  const subtotal = items.reduce((sum, item) => {
    const variant = getVariantById(item.productId, item.variantId);
    return sum + (variant?.price ?? 0) * item.quantity;
  }, 0);

  useEffect(() => {
    if (prevSubtotalRef.current < FREE_SHIPPING_THRESHOLD && subtotal >= FREE_SHIPPING_THRESHOLD) {
      soundService.play('freeShipping');
    }
    prevSubtotalRef.current = subtotal;
  }, [subtotal]);

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

      let result: CartResult = { success: true };

      setItems((prev) => {
        const existing = prev.find(
          (i) => i.productId === productId && i.variantId === variantId
        );
        const currentQty = existing?.quantity ?? 0;
        const newQty = currentQty + quantity;

        if (newQty > variant.stock) {
          result = { success: false, error: 'موجودی فعلاً کافی نیست' };
          return prev;
        }

        if (existing) {
          return prev.map((i) =>
            i.productId === productId && i.variantId === variantId
              ? { ...i, quantity: newQty }
              : i
          );
        }

        return [...prev, { productId, variantId, quantity }];
      });

      if (result.success) {
        soundService.play('addToCart');
      }

      return result;
    },
    []
  );

  const updateQuantity = useCallback(
    (productId: string, variantId: string, quantity: number): CartResult => {
      const variant = getVariantById(productId, variantId);
      if (!variant) return { success: false, error: 'محصول یافت نشد' };

      if (quantity <= 0) {
        setItems((prev) =>
          prev.filter((i) => !(i.productId === productId && i.variantId === variantId))
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
            : i
        )
      );
      return { success: true };
    },
    []
  );

  const removeItem = useCallback((productId: string, variantId: string) => {
    soundService.play('removeFromCart');
    setItems((prev) =>
      prev.filter((i) => !(i.productId === productId && i.variantId === variantId))
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const isShippingFree = subtotal >= FREE_SHIPPING_THRESHOLD;
  const remainingForFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);

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
