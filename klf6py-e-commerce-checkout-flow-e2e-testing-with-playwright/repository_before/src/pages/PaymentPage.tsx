import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useCheckout } from '../hooks/useCheckout';
import { useCart } from '../hooks/useCart';
import { formatCurrency } from '../utils/format';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLIC_KEY || 'pk_test_placeholder');

const PaymentForm: React.FC = () => {
  const navigate = useNavigate();
  const stripe = useStripe();
  const elements = useElements();
  const { shippingAddress, createOrder } = useCheckout();
  const { total, items } = useCart();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);

  useEffect(() => {
    if (!shippingAddress) {
      navigate('/checkout/shipping');
    }
  }, [shippingAddress, navigate]);

  const handleCardChange = (event: any) => {
    setCardComplete(event.complete);
    if (event.error) {
      setPaymentError(event.error.message);
    } else {
      setPaymentError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setPaymentError(null);

    try {
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
          name: `${shippingAddress?.firstName} ${shippingAddress?.lastName}`,
          email: shippingAddress?.email,
          phone: shippingAddress?.phone,
          address: {
            line1: shippingAddress?.address1,
            line2: shippingAddress?.address2,
            city: shippingAddress?.city,
            state: shippingAddress?.state,
            postal_code: shippingAddress?.zipCode,
          },
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      const order = await createOrder({
        paymentMethodId: paymentMethod.id,
        items,
        shippingAddress: shippingAddress!,
        total,
      });

      navigate('/checkout/confirmation', { state: { orderId: order.id } });
    } catch (error: any) {
      setPaymentError(error.message || 'Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBack = () => {
    navigate('/checkout/shipping');
  };

  return (
    <form onSubmit={handleSubmit} data-testid="payment-form">
      <div className="order-summary" data-testid="order-summary">
        <h3>Order Summary</h3>
        <p data-testid="payment-total">Total: {formatCurrency(total)}</p>
      </div>

      <div className="card-element-container">
        <label htmlFor="card-element">Card Details</label>
        <div data-testid="card-element-wrapper">
          <CardElement
            id="card-element"
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#424770',
                  '::placeholder': {
                    color: '#aab7c4',
                  },
                },
                invalid: {
                  color: '#9e2146',
                },
              },
            }}
            onChange={handleCardChange}
          />
        </div>
      </div>

      {paymentError && (
        <div 
          className="payment-error" 
          data-testid="payment-error" 
          role="alert"
        >
          {paymentError}
        </div>
      )}

      <div className="button-group">
        <button
          type="button"
          data-testid="back-to-shipping-btn"
          className="back-button"
          onClick={handleBack}
          disabled={isProcessing}
        >
          Back to Shipping
        </button>

        <button
          type="submit"
          data-testid="place-order-btn"
          className="submit-button"
          disabled={!stripe || !cardComplete || isProcessing}
        >
          {isProcessing ? 'Processing...' : `Pay ${formatCurrency(total)}`}
        </button>
      </div>
    </form>
  );
};

export const PaymentPage: React.FC = () => {
  return (
    <div data-testid="payment-page" className="payment-page">
      <h1>Payment</h1>
      
      <div className="checkout-progress" role="navigation" aria-label="Checkout progress">
        <span className="step completed">Cart</span>
        <span className="step completed">Shipping</span>
        <span className="step active">Payment</span>
        <span className="step">Confirmation</span>
      </div>

      <Elements stripe={stripePromise}>
        <PaymentForm />
      </Elements>
    </div>
  );
};
