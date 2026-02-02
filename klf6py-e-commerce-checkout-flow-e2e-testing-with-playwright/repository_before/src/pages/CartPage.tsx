import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import { CartItem } from '../components/CartItem';
import { PromoCodeInput } from '../components/PromoCodeInput';
import { formatCurrency } from '../utils/format';

export const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { items, updateQuantity, removeItem, subtotal, discount, total, applyPromoCode, promoError } = useCart();
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);

  const handleQuantityChange = async (itemId: string, quantity: number) => {
    if (quantity < 1) {
      await removeItem(itemId);
    } else {
      await updateQuantity(itemId, quantity);
    }
  };

  const handleApplyPromo = async (code: string) => {
    setIsApplyingPromo(true);
    try {
      await applyPromoCode(code);
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const handleCheckout = () => {
    if (items.length > 0) {
      navigate('/checkout/shipping');
    }
  };

  if (items.length === 0) {
    return (
      <div data-testid="empty-cart" className="empty-cart">
        <h1>Your cart is empty</h1>
        <p>Add some items to get started</p>
        <button 
          data-testid="continue-shopping-btn"
          onClick={() => navigate('/products')}
        >
          Continue Shopping
        </button>
      </div>
    );
  }

  return (
    <div data-testid="cart-page" className="cart-page">
      <h1>Shopping Cart</h1>
      
      <div className="cart-items" role="list" aria-label="Cart items">
        {items.map((item) => (
          <CartItem
            key={item.id}
            item={item}
            onQuantityChange={(qty) => handleQuantityChange(item.id, qty)}
            onRemove={() => removeItem(item.id)}
          />
        ))}
      </div>

      <div className="cart-summary" data-testid="cart-summary">
        <div className="summary-row">
          <span>Subtotal</span>
          <span data-testid="cart-subtotal">{formatCurrency(subtotal)}</span>
        </div>
        
        {discount > 0 && (
          <div className="summary-row discount" data-testid="cart-discount">
            <span>Discount</span>
            <span>-{formatCurrency(discount)}</span>
          </div>
        )}

        <PromoCodeInput
          onApply={handleApplyPromo}
          isLoading={isApplyingPromo}
          error={promoError}
        />

        <div className="summary-row total">
          <span>Total</span>
          <span data-testid="cart-total">{formatCurrency(total)}</span>
        </div>

        <button
          data-testid="checkout-btn"
          className="checkout-button"
          onClick={handleCheckout}
          aria-label="Proceed to checkout"
        >
          Proceed to Checkout
        </button>
      </div>
    </div>
  );
};
