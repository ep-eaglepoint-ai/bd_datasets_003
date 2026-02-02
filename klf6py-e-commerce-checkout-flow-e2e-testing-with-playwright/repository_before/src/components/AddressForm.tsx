import React, { useState, useEffect } from 'react';
import { ShippingAddress, ValidationErrors } from '../types';
import { formatPhone } from '../utils/format';

interface AddressFormProps {
  initialValues?: ShippingAddress;
  errors: ValidationErrors;
  onSubmit: (address: ShippingAddress) => void;
  isSubmitting: boolean;
}

const emptyAddress: ShippingAddress = {
  firstName: '',
  lastName: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  zipCode: '',
  phone: '',
  email: '',
};

export const AddressForm: React.FC<AddressFormProps> = ({
  initialValues,
  errors,
  onSubmit,
  isSubmitting,
}) => {
  const [address, setAddress] = useState<ShippingAddress>(initialValues || emptyAddress);

  useEffect(() => {
    if (initialValues) {
      setAddress(initialValues);
    }
  }, [initialValues]);

  const handleChange = (field: keyof ShippingAddress) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setAddress((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(address);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setAddress((prev) => ({ ...prev, phone: formatted }));
  };

  return (
    <form onSubmit={handleSubmit} data-testid="address-form" noValidate>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="firstName">First Name *</label>
          <input
            id="firstName"
            type="text"
            data-testid="input-firstName"
            value={address.firstName}
            onChange={handleChange('firstName')}
            aria-invalid={!!errors.firstName}
            aria-describedby={errors.firstName ? 'firstName-error' : undefined}
            autoComplete="given-name"
          />
          {errors.firstName && (
            <span id="firstName-error" className="field-error" role="alert">
              {errors.firstName}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="lastName">Last Name *</label>
          <input
            id="lastName"
            type="text"
            data-testid="input-lastName"
            value={address.lastName}
            onChange={handleChange('lastName')}
            aria-invalid={!!errors.lastName}
            aria-describedby={errors.lastName ? 'lastName-error' : undefined}
            autoComplete="family-name"
          />
          {errors.lastName && (
            <span id="lastName-error" className="field-error" role="alert">
              {errors.lastName}
            </span>
          )}
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="address1">Address *</label>
        <input
          id="address1"
          type="text"
          data-testid="input-address1"
          value={address.address1}
          onChange={handleChange('address1')}
          aria-invalid={!!errors.address1}
          aria-describedby={errors.address1 ? 'address1-error' : undefined}
          autoComplete="address-line1"
        />
        {errors.address1 && (
          <span id="address1-error" className="field-error" role="alert">
            {errors.address1}
          </span>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="address2">Apartment, suite, etc. (optional)</label>
        <input
          id="address2"
          type="text"
          data-testid="input-address2"
          value={address.address2}
          onChange={handleChange('address2')}
          autoComplete="address-line2"
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="city">City *</label>
          <input
            id="city"
            type="text"
            data-testid="input-city"
            value={address.city}
            onChange={handleChange('city')}
            aria-invalid={!!errors.city}
            aria-describedby={errors.city ? 'city-error' : undefined}
            autoComplete="address-level2"
          />
          {errors.city && (
            <span id="city-error" className="field-error" role="alert">
              {errors.city}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="state">State *</label>
          <select
            id="state"
            data-testid="input-state"
            value={address.state}
            onChange={handleChange('state')}
            aria-invalid={!!errors.state}
            aria-describedby={errors.state ? 'state-error' : undefined}
            autoComplete="address-level1"
          >
            <option value="">Select state</option>
            <option value="AL">Alabama</option>
            <option value="AK">Alaska</option>
            <option value="AZ">Arizona</option>
            <option value="CA">California</option>
            <option value="CO">Colorado</option>
            <option value="FL">Florida</option>
            <option value="GA">Georgia</option>
            <option value="IL">Illinois</option>
            <option value="NY">New York</option>
            <option value="OR">Oregon</option>
            <option value="TX">Texas</option>
            <option value="WA">Washington</option>
          </select>
          {errors.state && (
            <span id="state-error" className="field-error" role="alert">
              {errors.state}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="zipCode">ZIP Code *</label>
          <input
            id="zipCode"
            type="text"
            data-testid="input-zipCode"
            value={address.zipCode}
            onChange={handleChange('zipCode')}
            aria-invalid={!!errors.zipCode}
            aria-describedby={errors.zipCode ? 'zipCode-error' : undefined}
            autoComplete="postal-code"
            maxLength={10}
          />
          {errors.zipCode && (
            <span id="zipCode-error" className="field-error" role="alert">
              {errors.zipCode}
            </span>
          )}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="email">Email *</label>
          <input
            id="email"
            type="email"
            data-testid="input-email"
            value={address.email}
            onChange={handleChange('email')}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            autoComplete="email"
          />
          {errors.email && (
            <span id="email-error" className="field-error" role="alert">
              {errors.email}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="phone">Phone *</label>
          <input
            id="phone"
            type="tel"
            data-testid="input-phone"
            value={address.phone}
            onChange={handlePhoneChange}
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? 'phone-error' : undefined}
            autoComplete="tel"
            placeholder="(555) 555-5555"
          />
          {errors.phone && (
            <span id="phone-error" className="field-error" role="alert">
              {errors.phone}
            </span>
          )}
        </div>
      </div>

      <button
        type="submit"
        data-testid="continue-to-payment-btn"
        className="submit-button"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Saving...' : 'Continue to Payment'}
      </button>
    </form>
  );
};
