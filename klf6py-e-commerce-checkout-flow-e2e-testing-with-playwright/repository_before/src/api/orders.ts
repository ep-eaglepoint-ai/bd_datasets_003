import { Order, CreateOrderRequest } from '../types';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

export const createOrder = async (request: CreateOrderRequest): Promise<Order> => {
  const response = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create order');
  }

  return response.json();
};

export const getOrder = async (orderId: string): Promise<Order> => {
  const response = await fetch(`${API_BASE}/orders/${orderId}`);

  if (!response.ok) {
    throw new Error('Failed to fetch order');
  }

  return response.json();
};
