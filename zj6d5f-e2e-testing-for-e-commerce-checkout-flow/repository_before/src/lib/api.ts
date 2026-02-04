import { Product, Order, ShippingAddress, PaymentInfo, CartItem } from '@/types';

const API_BASE = '/api';

export async function fetchProducts(): Promise<Product[]> {
  const response = await fetch(`${API_BASE}/products`);
  if (!response.ok) throw new Error('Failed to fetch products');
  return response.json();
}

export async function fetchProduct(id: string): Promise<Product> {
  const response = await fetch(`${API_BASE}/products/${id}`);
  if (!response.ok) throw new Error('Failed to fetch product');
  return response.json();
}

export async function validateStock(items: CartItem[]): Promise<{ valid: boolean; errors?: string[] }> {
  const response = await fetch(`${API_BASE}/cart/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) throw new Error('Failed to validate stock');
  return response.json();
}

export async function calculateShipping(address: ShippingAddress): Promise<{ cost: number; estimatedDays: number }> {
  const response = await fetch(`${API_BASE}/shipping/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(address),
  });
  if (!response.ok) throw new Error('Failed to calculate shipping');
  return response.json();
}

export async function processPayment(payment: PaymentInfo, amount: number): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  const response = await fetch(`${API_BASE}/payment/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment, amount }),
  });
  if (!response.ok) throw new Error('Failed to process payment');
  return response.json();
}

export async function createOrder(data: {
  items: CartItem[];
  shipping: ShippingAddress;
  paymentTransactionId: string;
}): Promise<Order> {
  const response = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create order');
  return response.json();
}

export async function applyPromoCode(code: string, subtotal: number): Promise<{ valid: boolean; discount: number; message?: string }> {
  const response = await fetch(`${API_BASE}/promo/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, subtotal }),
  });
  if (!response.ok) throw new Error('Failed to validate promo code');
  return response.json();
}
