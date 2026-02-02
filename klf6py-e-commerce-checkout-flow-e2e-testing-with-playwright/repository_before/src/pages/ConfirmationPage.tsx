import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import { getOrder } from '../api/orders';
import { Order } from '../types';
import { formatCurrency } from '../utils/format';

export const ConfirmationPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const orderId = location.state?.orderId;

  useEffect(() => {
    if (!orderId) {
      navigate('/cart');
      return;
    }

    const fetchOrder = async () => {
      try {
        const orderData = await getOrder(orderId);
        setOrder(orderData);
        clearCart();
      } catch (err) {
        setError('Failed to load order details');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, navigate, clearCart]);

  if (isLoading) {
    return (
      <div data-testid="confirmation-loading" className="loading">
        Loading order details...
      </div>
    );
  }

  if (error || !order) {
    return (
      <div data-testid="confirmation-error" className="error">
        <h1>Something went wrong</h1>
        <p>{error || 'Order not found'}</p>
        <button onClick={() => navigate('/cart')}>Return to Cart</button>
      </div>
    );
  }

  return (
    <div data-testid="confirmation-page" className="confirmation-page">
      <div className="success-icon" aria-hidden="true">✓</div>
      
      <h1>Order Confirmed!</h1>
      
      <p className="thank-you-message">
        Thank you for your purchase. A confirmation email has been sent to{' '}
        <strong data-testid="confirmation-email">{order.email}</strong>
      </p>

      <div className="order-details" data-testid="order-details">
        <h2>Order Details</h2>
        
        <div className="detail-row">
          <span>Order Number:</span>
          <span data-testid="order-number">{order.orderNumber}</span>
        </div>

        <div className="detail-row">
          <span>Order Date:</span>
          <span data-testid="order-date">
            {new Date(order.createdAt).toLocaleDateString()}
          </span>
        </div>

        <div className="detail-row">
          <span>Total:</span>
          <span data-testid="order-total">{formatCurrency(order.total)}</span>
        </div>
      </div>

      <div className="shipping-details" data-testid="shipping-details">
        <h3>Shipping To:</h3>
        <address>
          {order.shippingAddress.firstName} {order.shippingAddress.lastName}<br />
          {order.shippingAddress.address1}<br />
          {order.shippingAddress.address2 && <>{order.shippingAddress.address2}<br /></>}
          {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zipCode}
        </address>
      </div>

      <div className="order-items" data-testid="order-items">
        <h3>Items Ordered</h3>
        {order.items.map((item) => (
          <div key={item.id} className="order-item" data-testid={`order-item-${item.id}`}>
            <span>{item.name} x {item.quantity}</span>
            <span>{formatCurrency(item.price * item.quantity)}</span>
          </div>
        ))}
      </div>

      <button
        data-testid="continue-shopping-btn"
        className="continue-button"
        onClick={() => navigate('/products')}
      >
        Continue Shopping
      </button>
    </div>
  );
};
