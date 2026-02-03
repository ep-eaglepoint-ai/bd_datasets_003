/**
 * TransactionDashboard Component
 *
 * Main dashboard for managing transactions and refunds.
 * Handles loading states and orchestrates the refund workflow.
 *
 * Requirements covered:
 * - Requirement 6: UI State Synchronization
 * - Requirement 9: Error handling without page crash
 */

'use client';

import React, { useState, useCallback } from 'react';
import { TransactionCard } from './TransactionCard';
import { RefundForm } from './RefundForm';
import { TransactionWithBalance, RefundError } from '../types';

interface TransactionDashboardProps {
  initialTransactions: TransactionWithBalance[];
  onProcessRefund: (
    transactionId: string,
    amount: string,
    idempotencyKey: string
  ) => Promise<{ success: boolean; error?: RefundError }>;
  onRefresh: () => Promise<TransactionWithBalance[]>;
}

export function TransactionDashboard({
  initialTransactions,
  onProcessRefund,
  onRefresh,
}: TransactionDashboardProps) {
  const [transactions, setTransactions] = useState<TransactionWithBalance[]>(initialTransactions);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const selectedTransaction = transactions.find((t) => t.id === selectedTransactionId);

  const handleRefundClick = useCallback((transactionId: string) => {
    setSelectedTransactionId(transactionId);
    setGlobalError(null);
  }, []);

  const handleRefundSubmit = useCallback(
    async (transactionId: string, amount: string, idempotencyKey: string) => {
      try {
        const result = await onProcessRefund(transactionId, amount, idempotencyKey);

        if (result.success) {
          // Refresh transactions to get updated balances (Requirement 6)
          setIsLoading(true);
          try {
            const updatedTransactions = await onRefresh();
            setTransactions(updatedTransactions);
          } catch (refreshError) {
            console.error('Failed to refresh transactions:', refreshError);
            setGlobalError('Refund processed but failed to refresh. Please reload the page.');
          } finally {
            setIsLoading(false);
          }
        }

        return result;
      } catch (error) {
        // Prevent page crash (Requirement 9)
        console.error('Refund submission error:', error);
        return {
          success: false,
          error: {
            code: 'INTERNAL_ERROR' as const,
            message: error instanceof Error ? error.message : 'Failed to process refund',
          },
        };
      }
    },
    [onProcessRefund, onRefresh]
  );

  const handleRefundSuccess = useCallback(() => {
    setSelectedTransactionId(null);
  }, []);

  const handleRefundCancel = useCallback(() => {
    setSelectedTransactionId(null);
  }, []);

  const handleManualRefresh = useCallback(async () => {
    setIsLoading(true);
    setGlobalError(null);
    try {
      const updatedTransactions = await onRefresh();
      setTransactions(updatedTransactions);
    } catch (error) {
      setGlobalError('Failed to refresh transactions. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [onRefresh]);

  return (
    <div className="transaction-dashboard max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Transaction Management</h1>
        <button
          onClick={handleManualRefresh}
          disabled={isLoading}
          className="px-4 py-2 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
          data-testid="refresh-button"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {globalError && (
        <div
          className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded"
          role="alert"
        >
          {globalError}
        </div>
      )}

      {/* Refund Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h2 className="text-xl font-semibold mb-4">Issue Refund</h2>
            <RefundForm
              transaction={selectedTransaction}
              onSubmit={handleRefundSubmit}
              onSuccess={handleRefundSuccess}
              onCancel={handleRefundCancel}
            />
          </div>
        </div>
      )}

      {/* Transaction List */}
      <div className="space-y-4" data-testid="transaction-list">
        {transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No transactions found.
          </div>
        ) : (
          transactions.map((transaction) => (
            <TransactionCard
              key={transaction.id}
              transaction={transaction}
              onRefundClick={handleRefundClick}
            />
          ))
        )}
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-white bg-opacity-75 flex items-center justify-center z-40">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default TransactionDashboard;
