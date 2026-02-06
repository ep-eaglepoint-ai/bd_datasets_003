/**
 * TransactionCard Component
 *
 * Displays transaction details including balance information.
 * This is a client component that receives data from server components.
 *
 * Requirement 1: No Prisma imports in client components
 */

'use client';

import React from 'react';
import { TransactionWithBalance, TransactionStatus } from '../types';

interface TransactionCardProps {
  transaction: TransactionWithBalance;
  onRefundClick?: (transactionId: string) => void;
}

const statusColors: Record<TransactionStatus, string> = {
  SETTLED: 'bg-green-100 text-green-800',
  PARTIALLY_REFUNDED: 'bg-yellow-100 text-yellow-800',
  REFUNDED: 'bg-gray-100 text-gray-800',
};

const statusLabels: Record<TransactionStatus, string> = {
  SETTLED: 'Settled',
  PARTIALLY_REFUNDED: 'Partially Refunded',
  REFUNDED: 'Fully Refunded',
};

export function TransactionCard({ transaction, onRefundClick }: TransactionCardProps) {
  const status = transaction.status as TransactionStatus;
  const canRefund = status !== 'REFUNDED';

  return (
    <div className="transaction-card border rounded-lg p-4 shadow-sm bg-white">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold text-lg">Transaction</h3>
          <p className="text-sm text-gray-500 font-mono">{transaction.id}</p>
        </div>
        <span className={`px-2 py-1 rounded text-sm font-medium ${statusColors[status]}`}>
          {statusLabels[status]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-sm text-gray-500">Original Amount</p>
          <p className="text-xl font-bold">
            {transaction.currency} {String(transaction.amount)}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Remaining Balance</p>
          <p className="text-xl font-bold text-blue-600" data-testid="remaining-balance">
            {transaction.currency} {String(transaction.remainingBalance)}
          </p>
        </div>
      </div>

      <div className="border-t pt-3">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-500">Total Refunded</p>
            <p className="font-medium text-red-600">
              {transaction.currency} {String(transaction.totalRefunded)}
            </p>
          </div>
          {canRefund && onRefundClick && (
            <button
              onClick={() => onRefundClick(transaction.id)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              data-testid="refund-button"
            >
              Issue Refund
            </button>
          )}
        </div>
      </div>

      {transaction.refunds && transaction.refunds.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Refund History ({transaction.refunds.length})
          </p>
          <ul className="space-y-1">
            {transaction.refunds.map((refund) => (
              <li key={refund.id} className="text-sm text-gray-600 flex justify-between">
                <span className="font-mono text-xs">{refund.id.slice(0, 8)}...</span>
                <span className="text-red-600">
                  -{transaction.currency} {String(refund.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default TransactionCard;
