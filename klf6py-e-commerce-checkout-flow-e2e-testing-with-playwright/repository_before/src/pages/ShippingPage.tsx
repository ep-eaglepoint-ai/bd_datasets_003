import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCheckout } from '../hooks/useCheckout';
import { AddressForm } from '../components/AddressForm';
import { ShippingAddress, ValidationErrors } from '../types';

export const ShippingPage: React.FC = () => {
  const navigate = useNavigate();
  const { saveShippingAddress, shippingAddress } = useCheckout();
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateAddress = (address: ShippingAddress): ValidationErrors => {
    const errors: ValidationErrors = {};
    
    if (!address.firstName?.trim()) {
      errors.firstName = 'First name is required';
    }
    if (!address.lastName?.trim()) {
      errors.lastName = 'Last name is required';
    }
    if (!address.address1?.trim()) {
      errors.address1 = 'Address is required';
    }
    if (!address.city?.trim()) {
      errors.city = 'City is required';
    }
    if (!address.state?.trim()) {
      errors.state = 'State is required';
    }
    if (!address.zipCode?.trim()) {
      errors.zipCode = 'ZIP code is required';
    } else if (!/^\d{5}(-\d{4})?$/.test(address.zipCode)) {
      errors.zipCode = 'Invalid ZIP code format';
    }
    if (!address.phone?.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!/^\(\d{3}\) \d{3}-\d{4}$/.test(address.phone) && !/^\d{10}$/.test(address.phone.replace(/\D/g, ''))) {
      errors.phone = 'Invalid phone number format';
    }
    if (!address.email?.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.email)) {
      errors.email = 'Invalid email format';
    }

    return errors;
  };

  const handleSubmit = async (address: ShippingAddress) => {
    const validationErrors = validateAddress(address);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length === 0) {
      setIsSubmitting(true);
      try {
        await saveShippingAddress(address);
        navigate('/checkout/payment');
      } catch (error) {
        setErrors({ form: 'Failed to save address. Please try again.' });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleBack = () => {
    navigate('/cart');
  };

  return (
    <div data-testid="shipping-page" className="shipping-page">
      <h1>Shipping Address</h1>
      
      <div className="checkout-progress" role="navigation" aria-label="Checkout progress">
        <span className="step completed">Cart</span>
        <span className="step active">Shipping</span>
        <span className="step">Payment</span>
        <span className="step">Confirmation</span>
      </div>

      {errors.form && (
        <div className="form-error" data-testid="form-error" role="alert">
          {errors.form}
        </div>
      )}

      <AddressForm
        initialValues={shippingAddress || undefined}
        errors={errors}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      <button
        type="button"
        data-testid="back-to-cart-btn"
        className="back-button"
        onClick={handleBack}
      >
        Back to Cart
      </button>
    </div>
  );
};
