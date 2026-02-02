import { CartItemType, PromoCodeResponse } from '../types';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

export const getCart = async (): Promise<CartItemType[]> => {
  const response = await fetch(`${API_BASE}/cart`);
  if (!response.ok) {
    throw new Error('Failed to fetch cart');
  }
  return response.json();
};

export const updateCartItem = async (itemId: string, quantity: number): Promise<CartItemType> => {
  const response = await fetch(`${API_BASE}/cart/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity }),
  });
  if (!response.ok) {
    throw new Error('Failed to update cart item');
  }
  return response.json();
};

export const removeCartItem = async (itemId: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/cart/${itemId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to remove cart item');
  }
};

export const applyPromoCode = async (code: string): Promise<PromoCodeResponse> => {
  const response = await fetch(`${API_BASE}/cart/promo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Invalid promo code');
  }
  
  return response.json();
};
