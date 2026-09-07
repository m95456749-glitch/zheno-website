// ============================================================
// ZHINO — Cart Context (single shared cart across all pages)
// Wraps the useCart hook and adds add-to-cart success feedback.
// ============================================================

import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useCart } from '../hooks/useCart';
import { getProductById } from '../data/products';

interface AddResult {
  success: boolean;
  error?: string;
}

interface CartContextValue extends ReturnType<typeof useCart> {
  toast: string | null;
  dismissToast: () => void;
  addItemWithToast: (productId: string, variantId: string, quantity?: number) => AddResult;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const cart = useCart();
  const [toast, setToast] = useState<string | null>(null);

  const value = useMemo<CartContextValue>(() => {
    const dismissToast = () => setToast(null);
    const addItemWithToast = (
      productId: string,
      variantId: string,
      quantity = 1,
    ): AddResult => {
      const result = cart.addItem(productId, variantId, quantity);
      if (result.success) {
        const product = getProductById(productId);
        setToast(
          product ? `${product.shortName} به سبد خرید اضافه شد` : 'به سبد خرید اضافه شد',
        );
      }
      return result;
    };
    return { ...cart, toast, dismissToast, addItemWithToast };
  }, [cart, toast]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCartContext(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCartContext must be used within a CartProvider');
  }
  return ctx;
}
