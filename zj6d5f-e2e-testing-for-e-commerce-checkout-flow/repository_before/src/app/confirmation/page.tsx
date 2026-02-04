'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function ConfirmationPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');

  return (
    <div className="container mx-auto p-8 text-center" data-testid="confirmation-page">
      <div className="max-w-md mx-auto">
        <div className="text-green-500 text-6xl mb-4">✓</div>
        <h1 className="text-2xl font-bold mb-4">Order Confirmed!</h1>
        <p className="text-gray-600 mb-2">Thank you for your purchase.</p>
        <p className="text-gray-600 mb-6">
          Your order number is: <span className="font-mono font-bold" data-testid="order-id">{orderId}</span>
        </p>
        <p className="text-gray-600 mb-8">
          You will receive an email confirmation shortly.
        </p>
        <Link
          href="/"
          className="inline-block bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          data-testid="continue-shopping"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
