import { useState, useCallback } from 'react';
import { ShippingAddress, Order, CreateOrderRequest } from '../types';
import { createOrder as createOrderApi } from '../api/orders';

interface UseCheckoutReturn {
  shippingAddress: ShippingAddress | null;
  saveShippingAddress: (address: ShippingAddress) => Promise<void>;
  createOrder: (request: CreateOrderRequest) => Promise<Order>;
}

export function useCheckout(): UseCheckoutReturn {
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(() => {
    // Restore from session storage if available
    const saved = sessionStorage.getItem('shippingAddress');
    return saved ? JSON.parse(saved) : null;
  });

  const saveShippingAddress = useCallback(async (address: ShippingAddress) => {
    setShippingAddress(address);
    sessionStorage.setItem('shippingAddress', JSON.stringify(address));
  }, []);

  const createOrder = useCallback(async (request: CreateOrderRequest) => {
    const order = await createOrderApi(request);
    sessionStorage.removeItem('shippingAddress');
    return order;
  }, []);

  return {
    shippingAddress,
    saveShippingAddress,
    createOrder,
  };
}
