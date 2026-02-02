import React from 'react';
import { CartItemType } from '../types';
import { formatCurrency } from '../utils/format';

interface CartItemProps {
  item: CartItemType;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}

export const CartItem: React.FC<CartItemProps> = ({ item, onQuantityChange, onRemove }) => {
  return (
    <div 
      data-testid={`cart-item-${item.id}`} 
      className="cart-item"
      role="listitem"
    >
      <img src={item.image} alt={item.name} className="item-image" />
      
      <div className="item-details">
        <h3 data-testid={`item-name-${item.id}`}>{item.name}</h3>
        <p className="item-price" data-testid={`item-price-${item.id}`}>
          {formatCurrency(item.price)}
        </p>
      </div>

      <div className="quantity-controls">
        <button
          data-testid={`decrease-qty-${item.id}`}
          onClick={() => onQuantityChange(item.quantity - 1)}
          aria-label={`Decrease quantity of ${item.name}`}
          disabled={item.quantity <= 1}
        >
          -
        </button>
        
        <input
          type="number"
          data-testid={`quantity-input-${item.id}`}
          value={item.quantity}
          onChange={(e) => onQuantityChange(parseInt(e.target.value) || 1)}
          min="1"
          max="99"
          aria-label={`Quantity of ${item.name}`}
        />
        
        <button
          data-testid={`increase-qty-${item.id}`}
          onClick={() => onQuantityChange(item.quantity + 1)}
          aria-label={`Increase quantity of ${item.name}`}
        >
          +
        </button>
      </div>

      <div className="item-total" data-testid={`item-total-${item.id}`}>
        {formatCurrency(item.price * item.quantity)}
      </div>

      <button
        data-testid={`remove-item-${item.id}`}
        className="remove-button"
        onClick={onRemove}
        aria-label={`Remove ${item.name} from cart`}
      >
        Remove
      </button>
    </div>
  );
};
