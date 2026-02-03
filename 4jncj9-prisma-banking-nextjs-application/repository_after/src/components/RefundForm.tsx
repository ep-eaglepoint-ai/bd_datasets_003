/**
 * RefundForm Component
 *
 * Form for submitting refund requests with validation and error handling.
 *
 * Requirements covered:
 * - Requirement 6: UI State Synchronization (useFormStatus)
 * - Requirement 9: Graceful error rendering without page crash
 */

'use client';

import React, { useState, useCallback, useTransition } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { RefundError, TransactionWithBalance } from '../types';

interface RefundFormProps {
  transaction: TransactionWithBalance;
  onSubmit: (transactionId: string, amount: string, idempotencyKey: string) => Promise<{
    success: boolean;
    error?: RefundError;
  }>;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function RefundForm({ transaction, onSubmit, onSuccess, onCancel }: RefundFormProps) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<RefundError | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const remainingBalance = parseFloat(String(transaction.remainingBalance));
  const canRefund = remainingBalance > 0 && transaction.status !== 'REFUNDED';

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError({
        code: 'INVALID_AMOUNT',
        message: 'Please enter a valid positive amount',
      });
      return;
    }

    if (numericAmount > remainingBalance) {
      setError({
        code: 'INSUFFICIENT_BALANCE',
        message: `Amount exceeds remaining balance of ${transaction.currency} ${remainingBalance.toFixed(2)}`,
      });
      return;
    }

    setIsSubmitting(true);

    // Generate idempotency key (Requirement 7)
    const idempotencyKey = uuidv4();

    startTransition(async () => {
      try {
        const result = await onSubmit(transaction.id, amount, idempotencyKey);

        if (result.success) {
          setAmount('');
          onSuccess?.();
        } else if (result.error) {
          setError(result.error);
        }
      } catch (err) {
        // Catch any unexpected errors to prevent page crash (Requirement 9)
        setError({
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'An unexpected error occurred',
        });
      } finally {
        setIsSubmitting(false);
      }
    });
  }, [amount, remainingBalance, transaction, onSubmit, onSuccess]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
    setError(null);
  };

  const handleRefundAll = () => {
    setAmount(remainingBalance.toFixed(2));
    setError(null);
  };

  const isLoading = isPending || isSubmitting;

  return (
    <form onSubmit={handleSubmit} className="refund-form space-y-4" data-testid="refund-form">
      <div className="bg-gray-50 p-3 rounded">
        <p className="text-sm text-gray-600">Transaction ID</p>
        <p className="font-mono text-sm">{transaction.id}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
        <div>
          <p className="text-sm text-gray-600">Original Amount</p>
          <p className="font-semibold">
            {transaction.currency} {String(transaction.amount)}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Available for Refund</p>
          <p className="font-semibold text-blue-600">
            {transaction.currency} {remainingBalance.toFixed(2)}
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="refund-amount" className="block text-sm font-medium text-gray-700 mb-1">
          Refund Amount
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              {transaction.currency}
            </span>
            <input
              id="refund-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={remainingBalance}
              value={amount}
              onChange={handleAmountChange}
              disabled={!canRefund || isLoading}
              className="w-full pl-14 pr-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              placeholder="0.00"
              data-testid="refund-amount-input"
              aria-describedby={error ? 'refund-error' : undefined}
            />
          </div>
          <button
            type="button"
            onClick={handleRefundAll}
            disabled={!canRefund || isLoading}
            className="px-3 py-2 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Refund All
          </button>
        </div>
      </div>

      {/* Error Display - Requirement 9: Clear error rendering */}
      {error && (
        <div
          id="refund-error"
          className="error-message bg-red-50 border border-red-200 text-red-700 p-3 rounded"
          role="alert"
          data-testid="refund-error"
        >
          <p className="font-medium">{getErrorTitle(error.code)}</p>
          <p className="text-sm">{error.message}</p>
          {error.details && (
            <pre className="text-xs mt-2 bg-red-100 p-2 rounded overflow-auto">
              {JSON.stringify(error.details, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={!canRefund || isLoading || !amount}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="submit-refund-button"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner />
              Processing...
            </span>
          ) : (
            'Process Refund'
          )}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>

      {!canRefund && (
        <p className="text-sm text-gray-500 text-center">
          {transaction.status === 'REFUNDED'
            ? 'This transaction has been fully refunded.'
            : 'No refundable balance remaining.'}
        </p>
      )}
    </form>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function getErrorTitle(code: string): string {
  switch (code) {
    case 'INVALID_AMOUNT':
      return 'Invalid Amount';
    case 'INSUFFICIENT_BALANCE':
      return 'Insufficient Balance';
    case 'TRANSACTION_NOT_FOUND':
      return 'Transaction Not Found';
    case 'TRANSACTION_ALREADY_REFUNDED':
      return 'Already Refunded';
    case 'CONCURRENT_MODIFICATION':
      return 'Conflict Detected';
    case 'DUPLICATE_REQUEST':
      return 'Duplicate Request';
    default:
      return 'Error';
  }
}

export default RefundForm;
