'use client';

import { CartItem as CartItemType } from '@/types';
import { useCartStore } from '@/store/cartStore';

interface CartItemProps {
  item: CartItemType;
}

export function CartItem({ item }: CartItemProps) {
  const { updateQuantity, removeItem } = useCartStore();

  return (
    <div className="flex items-center gap-4 p-4 border-b" data-testid={`cart-item-${item.product.id}`}>
      <img
        src={item.product.image}
        alt={item.product.name}
        className="w-20 h-20 object-cover rounded"
      />
      <div className="flex-1">
        <h3 className="font-medium" data-testid="item-name">{item.product.name}</h3>
        <p className="text-gray-600" data-testid="item-price">${item.product.price.toFixed(2)}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
          className="px-2 py-1 border rounded"
          data-testid="decrease-quantity"
        >
          -
        </button>
        <span data-testid="item-quantity">{item.quantity}</span>
        <button
          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
          className="px-2 py-1 border rounded"
          data-testid="increase-quantity"
        >
          +
        </button>
      </div>
      <button
        onClick={() => removeItem(item.product.id)}
        className="text-red-500 hover:text-red-700"
        data-testid="remove-item"
      >
        Remove
      </button>
    </div>
  );
}
