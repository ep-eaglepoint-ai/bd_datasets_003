'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/cartStore';
import { CheckoutForm } from '@/components/CheckoutForm';
import { OrderSummary } from '@/components/OrderSummary';
import { ShippingAddress, PaymentInfo } from '@/types';
import { calculateShipping, processPayment, createOrder } from '@/lib/api';

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getTotal, clearCart } = useCartStore();
  const [step, setStep] = useState<'shipping' | 'payment'>('shipping');
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null);
  const [shippingCost, setShippingCost] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  if (items.length === 0) {
    router.push('/cart');
    return null;
  }

  const handleShippingSubmit = async (address: ShippingAddress) => {
    setError('');
    try {
      const shipping = await calculateShipping(address);
      setShippingAddress(address);
      setShippingCost(shipping.cost);
      setStep('payment');
    } catch {
      setError('Failed to calculate shipping');
    }
  };

  const handlePaymentSubmit = async (payment: PaymentInfo) => {
    if (!shippingAddress) return;
    
    setIsProcessing(true);
    setError('');
    
    try {
      const total = getTotal() + shippingCost;
      const paymentResult = await processPayment(payment, total);
      
      if (!paymentResult.success) {
        setError(paymentResult.error || 'Payment failed');
        setIsProcessing(false);
        return;
      }

      const order = await createOrder({
        items,
        shipping: shippingAddress,
        paymentTransactionId: paymentResult.transactionId!,
      });

      clearCart();
      router.push(`/confirmation?orderId=${order.id}`);
    } catch {
      setError('Failed to process order');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="container mx-auto p-8" data-testid="checkout-page">
      <h1 className="text-2xl font-bold mb-6">Checkout</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {error && <p className="text-red-500 mb-4" data-testid="checkout-error">{error}</p>}
          <CheckoutForm
            onShippingSubmit={handleShippingSubmit}
            onPaymentSubmit={handlePaymentSubmit}
            step={step}
            isProcessing={isProcessing}
          />
        </div>
        <div>
          <OrderSummary shippingCost={shippingCost} />
        </div>
      </div>
    </div>
  );
}
