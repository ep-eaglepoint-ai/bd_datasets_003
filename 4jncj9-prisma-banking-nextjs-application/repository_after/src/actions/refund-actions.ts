/**
 * Server Actions for Refund Operations
 *
 * IMPORTANT: This file contains server-side only code.
 * All functions are marked with 'use server' directive.
 *
 * Requirements covered:
 * - Requirement 1: Next.js Server-Side Enforcement
 * - Requirement 2: Atomic Prisma Transactions
 * - Requirement 6: UI State Synchronization (revalidatePath)
 */

'use server';

import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma';
import {
  validateRefundRequest,
  processRefundAtomic,
  toTransactionWithBalance,
  createErrorResponse,
} from '../lib/refund-service';
import {
  RefundRequest,
  RefundResponse,
  ActionResult,
  TransactionWithBalance,
} from '../types';
import { revalidatePath } from 'next/cache';

/**
 * Server Action: Process a refund request
 *
 * This action uses Prisma's $transaction API to ensure atomic operations.
 * The entire refund process (validation, balance check, creation) happens
 * within a single database transaction.
 *
 * Requirement 2: Atomic Prisma Transactions
 * Requirement 6: UI State Synchronization via revalidatePath
 */
export async function processRefund(request: RefundRequest): Promise<RefundResponse> {
  // Validate request
  const validation = validateRefundRequest(request);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  try {
    const refundAmount = new Decimal(request.amount.toString());

    // Execute within atomic transaction (Requirement 2)
    const result = await prisma.$transaction(async (tx) => {
      return processRefundAtomic({
        prisma: tx,
        transactionId: request.transactionId,
        refundAmount,
        idempotencyKey: request.idempotencyKey,
      });
    }, {
      // Set isolation level for strict consistency
      isolationLevel: 'Serializable',
    });

    if (result.success) {
      // Revalidate the transaction page to update UI (Requirement 6)
      revalidatePath(`/transactions/${request.transactionId}`);
      revalidatePath('/transactions');
    }

    return result;
  } catch (error) {
    // Handle Prisma-specific errors
    if (error instanceof Error) {
      // Check for unique constraint violation (duplicate idempotency key)
      if (error.message.includes('Unique constraint')) {
        return createErrorResponse(
          'DUPLICATE_REQUEST',
          'A refund with this idempotency key already exists'
        );
      }

      // Check for serialization failure (concurrent modification)
      if (error.message.includes('could not serialize') ||
          error.message.includes('deadlock') ||
          error.message.includes('lock')) {
        return createErrorResponse(
          'CONCURRENT_MODIFICATION',
          'Transaction was modified concurrently. Please retry.',
          { originalError: error.message }
        );
      }
    }

    console.error('Refund processing error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'An unexpected error occurred while processing the refund'
    );
  }
}

/**
 * Server Action: Get transaction with balance information
 *
 * Fetches a transaction and computes the remaining refundable balance.
 */
export async function getTransaction(transactionId: string): Promise<ActionResult<TransactionWithBalance>> {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { refunds: true },
    });

    if (!transaction) {
      return {
        success: false,
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: `Transaction ${transactionId} not found`,
        },
      };
    }

    return {
      success: true,
      data: toTransactionWithBalance(transaction),
    };
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch transaction',
      },
    };
  }
}

/**
 * Server Action: Get all transactions with balance information
 */
export async function getAllTransactions(): Promise<ActionResult<TransactionWithBalance[]>> {
  try {
    const transactions = await prisma.transaction.findMany({
      include: { refunds: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: transactions.map(toTransactionWithBalance),
    };
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch transactions',
      },
    };
  }
}

/**
 * Server Action: Create a new transaction (for testing/demo purposes)
 */
export async function createTransaction(
  amount: string | number,
  currency: string = 'USD'
): Promise<ActionResult<TransactionWithBalance>> {
  try {
    const decimalAmount = new Decimal(amount.toString());

    if (decimalAmount.lessThanOrEqualTo(0)) {
      return {
        success: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: 'Transaction amount must be positive',
        },
      };
    }

    const transaction = await prisma.transaction.create({
      data: {
        amount: decimalAmount.toFixed(2),
        currency,
        status: 'SETTLED',
      },
      include: { refunds: true },
    });

    revalidatePath('/transactions');

    return {
      success: true,
      data: toTransactionWithBalance(transaction),
    };
  } catch (error) {
    console.error('Error creating transaction:', error);
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create transaction',
      },
    };
  }
}

/**
 * Server Action: Process refund with optimistic locking
 *
 * This version includes version checking for explicit optimistic locking.
 * Useful when the client has a cached version of the transaction.
 *
 * Requirement 4: Concurrency & Conflict Handling
 */
export async function processRefundWithVersion(
  request: RefundRequest,
  expectedVersion: number
): Promise<RefundResponse> {
  const validation = validateRefundRequest(request);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  try {
    const refundAmount = new Decimal(request.amount.toString());

    const result = await prisma.$transaction(async (tx) => {
      return processRefundAtomic({
        prisma: tx,
        transactionId: request.transactionId,
        refundAmount,
        idempotencyKey: request.idempotencyKey,
        expectedVersion,
      });
    }, {
      isolationLevel: 'Serializable',
    });

    if (result.success) {
      revalidatePath(`/transactions/${request.transactionId}`);
      revalidatePath('/transactions');
    }

    return result;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('could not serialize') ||
          error.message.includes('deadlock')) {
        return createErrorResponse(
          'CONCURRENT_MODIFICATION',
          'Transaction was modified concurrently. Please retry.',
          { originalError: error.message }
        );
      }
    }

    console.error('Refund processing error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'An unexpected error occurred while processing the refund'
    );
  }
}
