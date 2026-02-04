'use client';

import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/cartStore';
import { CartItem } from '@/components/CartItem';
import { OrderSummary } from '@/components/OrderSummary';
import { validateStock } from '@/lib/api';
import { useState } from 'react';

export default function CartPage() {
  const router = useRouter();
  const { items, clearCart } = useCartStore();
  const [error, setError] = useState('');
  const [validating, setValidating] = useState(false);

  const handleCheckout = async () => {
    if (items.length === 0) return;
    
    setValidating(true);
    setError('');
    
    try {
      const result = await validateStock(items);
      if (result.valid) {
        router.push('/checkout');
      } else {
        setError(result.errors?.join(', ') || 'Some items are out of stock');
      }
    } catch {
      setError('Failed to validate cart');
    } finally {
      setValidating(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="container mx-auto p-8 text-center" data-testid="empty-cart">
        <h1 className="text-2xl font-bold mb-4">Your Cart is Empty</h1>
        <p className="text-gray-600 mb-4">Add some items to get started!</p>
        <button
          onClick={() => router.push('/')}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
        >
          Continue Shopping
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8" data-testid="cart-page">
      <h1 className="text-2xl font-bold mb-6">Shopping Cart</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {items.map((item) => (
            <CartItem key={item.product.id} item={item} />
          ))}
        </div>
        <div>
          <OrderSummary />
          {error && <p className="text-red-500 mt-4" data-testid="cart-error">{error}</p>}
          <button
            onClick={handleCheckout}
            disabled={validating}
            className="w-full mt-4 bg-blue-600 text-white py-3 rounded hover:bg-blue-700 disabled:opacity-50"
            data-testid="proceed-to-checkout"
          >
            {validating ? 'Validating...' : 'Proceed to Checkout'}
          </button>
        </div>
      </div>
    </div>
  );
}
