/**
 * Main Page - Transaction Dashboard
 *
 * Server Component that fetches initial data and renders the dashboard.
 *
 * Requirement 1: Prisma operations only on server side
 * Requirement 6: Initial data fetching on server
 */

import { TransactionDashboard } from '../src/components/TransactionDashboard';
import { getAllTransactions, processRefund } from '../src/actions/refund-actions';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const result = await getAllTransactions();

  if (!result.success || !result.data) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded">
          <h2 className="font-semibold">Error Loading Transactions</h2>
          <p>{result.error?.message || 'Failed to load transactions'}</p>
        </div>
      </div>
    );
  }

  // Wrapper function for client component
  async function handleProcessRefund(
    transactionId: string,
    amount: string,
    idempotencyKey: string
  ) {
    'use server';
    return processRefund({
      transactionId,
      amount,
      idempotencyKey,
    });
  }

  async function handleRefresh() {
    'use server';
    const refreshResult = await getAllTransactions();
    return refreshResult.data || [];
  }

  return (
    <TransactionDashboard
      initialTransactions={result.data}
      onProcessRefund={handleProcessRefund}
      onRefresh={handleRefresh}
    />
  );
}
