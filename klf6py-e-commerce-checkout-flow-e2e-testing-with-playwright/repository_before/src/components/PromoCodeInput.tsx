import React, { useState } from 'react';

interface PromoCodeInputProps {
  onApply: (code: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export const PromoCodeInput: React.FC<PromoCodeInputProps> = ({ onApply, isLoading, error }) => {
  const [code, setCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      await onApply(code.trim().toUpperCase());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="promo-form" data-testid="promo-form">
      <div className="promo-input-group">
        <input
          type="text"
          data-testid="promo-input"
          placeholder="Enter promo code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Promo code"
          aria-describedby={error ? 'promo-error' : undefined}
        />
        <button
          type="submit"
          data-testid="apply-promo-btn"
          disabled={isLoading || !code.trim()}
          aria-label="Apply promo code"
        >
          {isLoading ? 'Applying...' : 'Apply'}
        </button>
      </div>
      {error && (
        <p id="promo-error" className="error-message" data-testid="promo-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
};
