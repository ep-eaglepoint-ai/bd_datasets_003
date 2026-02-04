'use client';

import { useState } from 'react';
import { useCartStore } from '@/store/cartStore';
import { applyPromoCode } from '@/lib/api';

interface OrderSummaryProps {
  shippingCost?: number;
}

export function OrderSummary({ shippingCost = 0 }: OrderSummaryProps) {
  const { items, getTotal } = useCartStore();
  const [promoCode, setPromoCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [promoError, setPromoError] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);

  const subtotal = getTotal();
  const total = subtotal + shippingCost - discount;

  const handleApplyPromo = async () => {
    setPromoError('');
    try {
      const result = await applyPromoCode(promoCode, subtotal);
      if (result.valid) {
        setDiscount(result.discount);
        setPromoApplied(true);
      } else {
        setPromoError(result.message || 'Invalid promo code');
      }
    } catch {
      setPromoError('Failed to apply promo code');
    }
  };

  return (
    <div className="bg-gray-50 p-6 rounded-lg" data-testid="order-summary">
      <h2 className="text-xl font-bold mb-4">Order Summary</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.product.id} className="flex justify-between text-sm">
            <span>{item.product.name} x {item.quantity}</span>
            <span>${(item.product.price * item.quantity).toFixed(2)}</span>
          </div>
        ))}
      </div>
      <hr className="my-4" />
      <div className="space-y-2">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span data-testid="subtotal">${subtotal.toFixed(2)}</span>
        </div>
        {shippingCost > 0 && (
          <div className="flex justify-between">
            <span>Shipping</span>
            <span data-testid="shipping-cost">${shippingCost.toFixed(2)}</span>
          </div>
        )}
        {discount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Discount</span>
            <span data-testid="discount">-${discount.toFixed(2)}</span>
          </div>
        )}
      </div>
      <hr className="my-4" />
      <div className="flex justify-between font-bold text-lg">
        <span>Total</span>
        <span data-testid="total">${total.toFixed(2)}</span>
      </div>
      {!promoApplied && (
        <div className="mt-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Promo code"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              className="flex-1 p-2 border rounded"
              data-testid="promo-code-input"
            />
            <button
              onClick={handleApplyPromo}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              data-testid="apply-promo"
            >
              Apply
            </button>
          </div>
          {promoError && <p className="text-red-500 text-sm mt-1" data-testid="promo-error">{promoError}</p>}
        </div>
      )}
    </div>
  );
}
