import { useState, useEffect, useCallback } from 'react';
import { CartItemType } from '../types';
import * as cartApi from '../api/cart';

interface UseCartReturn {
  items: CartItemType[];
  isLoading: boolean;
  error: string | null;
  subtotal: number;
  discount: number;
  total: number;
  promoError: string | null;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  applyPromoCode: (code: string) => Promise<void>;
  clearCart: () => void;
}

export function useCart(): UseCartReturn {
  const [items, setItems] = useState<CartItemType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [promoError, setPromoError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCart = async () => {
      try {
        const cartItems = await cartApi.getCart();
        setItems(cartItems);
      } catch (err) {
        setError('Failed to load cart');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCart();
  }, []);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = subtotal * (discountPercent / 100);
  const total = subtotal - discount;

  const updateQuantity = useCallback(async (itemId: string, quantity: number) => {
    try {
      const updatedItem = await cartApi.updateCartItem(itemId, quantity);
      setItems((prev) =>
        prev.map((item) => (item.id === itemId ? updatedItem : item))
      );
    } catch (err) {
      setError('Failed to update quantity');
    }
  }, []);

  const removeItem = useCallback(async (itemId: string) => {
    try {
      await cartApi.removeCartItem(itemId);
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      setError('Failed to remove item');
    }
  }, []);

  const applyPromoCode = useCallback(async (code: string) => {
    setPromoError(null);
    try {
      const response = await cartApi.applyPromoCode(code);
      if (response.valid && response.discountType === 'percentage') {
        setDiscountPercent(response.discountValue);
      }
    } catch (err: any) {
      setPromoError(err.message || 'Invalid promo code');
    }
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setDiscountPercent(0);
  }, []);

  return {
    items,
    isLoading,
    error,
    subtotal,
    discount,
    total,
    promoError,
    updateQuantity,
    removeItem,
    applyPromoCode,
    clearCart,
  };
}
