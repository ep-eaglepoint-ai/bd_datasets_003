'use client';

import { useState } from 'react';
import { ShippingAddress, PaymentInfo } from '@/types';

interface CheckoutFormProps {
  onShippingSubmit: (address: ShippingAddress) => void;
  onPaymentSubmit: (payment: PaymentInfo) => void;
  step: 'shipping' | 'payment';
  isProcessing: boolean;
}

export function CheckoutForm({ onShippingSubmit, onPaymentSubmit, step, isProcessing }: CheckoutFormProps) {
  const [shipping, setShipping] = useState<ShippingAddress>({
    firstName: '',
    lastName: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
  });

  const [payment, setPayment] = useState<PaymentInfo>({
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    cardholderName: '',
  });

  const handleShippingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onShippingSubmit(shipping);
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onPaymentSubmit(payment);
  };

  if (step === 'shipping') {
    return (
      <form onSubmit={handleShippingSubmit} className="space-y-4" data-testid="shipping-form">
        <h2 className="text-xl font-bold">Shipping Address</h2>
        <div className="grid grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="First Name"
            value={shipping.firstName}
            onChange={(e) => setShipping({ ...shipping, firstName: e.target.value })}
            required
            className="p-2 border rounded"
            data-testid="shipping-firstName"
          />
          <input
            type="text"
            placeholder="Last Name"
            value={shipping.lastName}
            onChange={(e) => setShipping({ ...shipping, lastName: e.target.value })}
            required
            className="p-2 border rounded"
            data-testid="shipping-lastName"
          />
        </div>
        <input
          type="text"
          placeholder="Address"
          value={shipping.address}
          onChange={(e) => setShipping({ ...shipping, address: e.target.value })}
          required
          className="w-full p-2 border rounded"
          data-testid="shipping-address"
        />
        <div className="grid grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="City"
            value={shipping.city}
            onChange={(e) => setShipping({ ...shipping, city: e.target.value })}
            required
            className="p-2 border rounded"
            data-testid="shipping-city"
          />
          <input
            type="text"
            placeholder="State"
            value={shipping.state}
            onChange={(e) => setShipping({ ...shipping, state: e.target.value })}
            required
            className="p-2 border rounded"
            data-testid="shipping-state"
          />
          <input
            type="text"
            placeholder="ZIP Code"
            value={shipping.zipCode}
            onChange={(e) => setShipping({ ...shipping, zipCode: e.target.value })}
            required
            className="p-2 border rounded"
            data-testid="shipping-zipCode"
          />
        </div>
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          data-testid="continue-to-payment"
        >
          Continue to Payment
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handlePaymentSubmit} className="space-y-4" data-testid="payment-form">
      <h2 className="text-xl font-bold">Payment Information</h2>
      <input
        type="text"
        placeholder="Cardholder Name"
        value={payment.cardholderName}
        onChange={(e) => setPayment({ ...payment, cardholderName: e.target.value })}
        required
        className="w-full p-2 border rounded"
        data-testid="payment-cardholderName"
      />
      <input
        type="text"
        placeholder="Card Number"
        value={payment.cardNumber}
        onChange={(e) => setPayment({ ...payment, cardNumber: e.target.value })}
        required
        className="w-full p-2 border rounded"
        data-testid="payment-cardNumber"
      />
      <div className="grid grid-cols-2 gap-4">
        <input
          type="text"
          placeholder="MM/YY"
          value={payment.expiryDate}
          onChange={(e) => setPayment({ ...payment, expiryDate: e.target.value })}
          required
          className="p-2 border rounded"
          data-testid="payment-expiryDate"
        />
        <input
          type="text"
          placeholder="CVV"
          value={payment.cvv}
          onChange={(e) => setPayment({ ...payment, cvv: e.target.value })}
          required
          className="p-2 border rounded"
          data-testid="payment-cvv"
        />
      </div>
      <button
        type="submit"
        disabled={isProcessing}
        className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:opacity-50"
        data-testid="place-order"
      >
        {isProcessing ? 'Processing...' : 'Place Order'}
      </button>
    </form>
  );
}
