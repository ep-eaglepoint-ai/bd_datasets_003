/**
 * Refund Service
 *
 * Core business logic for processing refunds with atomic transactions.
 *
 * Requirements covered:
 * - Requirement 2: Atomic Prisma Transactions
 * - Requirement 3: Fiscal Consistency Rules
 * - Requirement 4: Concurrency & Conflict Handling
 * - Requirement 5: Data Type Precision (Decimal)
 * - Requirement 7: Idempotency Controls
 */

import { Decimal } from 'decimal.js';
import {
  RefundRequest,
  RefundResponse,
  RefundError,
  RefundErrorCode,
  TransactionStatus,
  ValidationResult,
  TransactionWithBalance,
} from '../types';

// Configure Decimal.js for financial calculations
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Validates refund amount
 * - Must be positive
 * - Must be a valid number
 * - Uses Decimal for precision
 */
export function validateRefundAmount(amount: string | number): ValidationResult {
  try {
    const decimalAmount = new Decimal(amount);

    if (decimalAmount.isNaN()) {
      return {
        valid: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: 'Refund amount must be a valid number',
        },
      };
    }

    if (decimalAmount.lessThanOrEqualTo(0)) {
      return {
        valid: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: 'Refund amount must be greater than zero',
        },
      };
    }

    return { valid: true };
  } catch {
    return {
      valid: false,
      error: {
        code: 'INVALID_AMOUNT',
        message: 'Invalid refund amount format',
      },
    };
  }
}

/**
 * Calculates total refunded amount for a transaction
 * Uses Decimal arithmetic for precision
 */
export function calculateTotalRefunded(refunds: Array<{ amount: Decimal | string | number }>): Decimal {
  return refunds.reduce((sum, refund) => {
    return sum.plus(new Decimal(refund.amount.toString()));
  }, new Decimal(0));
}

/**
 * Calculates remaining refundable balance
 */
export function calculateRemainingBalance(
  originalAmount: Decimal | string | number,
  totalRefunded: Decimal
): Decimal {
  const original = new Decimal(originalAmount.toString());
  return original.minus(totalRefunded);
}

/**
 * Determines new transaction status based on refund
 * Requirement 3: Fiscal Consistency Rules
 */
export function determineTransactionStatus(
  originalAmount: Decimal | string | number,
  totalRefundedAfter: Decimal
): TransactionStatus {
  const original = new Decimal(originalAmount.toString());

  if (totalRefundedAfter.equals(original)) {
    return 'REFUNDED';
  }

  if (totalRefundedAfter.greaterThan(0)) {
    return 'PARTIALLY_REFUNDED';
  }

  return 'SETTLED';
}

/**
 * Validates that refund doesn't exceed remaining balance
 * Requirement 3: Sum(All Refunds) ≤ Original Transaction Amount
 */
export function validateRefundAgainstBalance(
  refundAmount: Decimal | string | number,
  remainingBalance: Decimal
): ValidationResult {
  const amount = new Decimal(refundAmount.toString());

  if (amount.greaterThan(remainingBalance)) {
    return {
      valid: false,
      error: {
        code: 'INSUFFICIENT_BALANCE',
        message: `Refund amount (${amount.toFixed(2)}) exceeds remaining balance (${remainingBalance.toFixed(2)})`,
        details: {
          requestedAmount: amount.toFixed(2),
          remainingBalance: remainingBalance.toFixed(2),
        },
      },
    };
  }

  return { valid: true };
}

/**
 * Creates a refund error response
 */
export function createErrorResponse(code: RefundErrorCode, message: string, details?: Record<string, unknown>): RefundResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}

/**
 * Validates a complete refund request
 */
export function validateRefundRequest(request: RefundRequest): ValidationResult {
  if (!request.transactionId || request.transactionId.trim() === '') {
    return {
      valid: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Transaction ID is required',
      },
    };
  }

  if (!request.idempotencyKey || request.idempotencyKey.trim() === '') {
    return {
      valid: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Idempotency key is required',
      },
    };
  }

  return validateRefundAmount(request.amount);
}

/**
 * Processes refund within an atomic transaction
 *
 * This is the core function that must be called within prisma.$transaction
 *
 * Requirements:
 * - Requirement 2: Atomic operation
 * - Requirement 3: Fiscal consistency
 * - Requirement 4: Concurrency handling via version check
 * - Requirement 5: Decimal precision
 * - Requirement 7: Idempotency via unique key
 */
export interface AtomicRefundParams {
  prisma: any; // Prisma transaction client
  transactionId: string;
  refundAmount: Decimal;
  idempotencyKey: string;
  expectedVersion?: number;
}

export interface AtomicRefundResult {
  success: boolean;
  refund?: any;
  transaction?: any;
  error?: RefundError;
}

export async function processRefundAtomic(params: AtomicRefundParams): Promise<AtomicRefundResult> {
  const { prisma, transactionId, refundAmount, idempotencyKey, expectedVersion } = params;

  // Step 1: Check for existing refund with same idempotency key (Requirement 7)
  const existingRefund = await prisma.refund.findUnique({
    where: { idempotencyKey },
  });

  if (existingRefund) {
    // Return the existing refund for idempotent response
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { refunds: true },
    });
    return {
      success: true,
      refund: existingRefund,
      transaction,
    };
  }

  // Step 2: Fetch transaction with current state
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

  // Step 3: Check version for optimistic locking (Requirement 4)
  if (expectedVersion !== undefined && transaction.version !== expectedVersion) {
    return {
      success: false,
      error: {
        code: 'CONCURRENT_MODIFICATION',
        message: 'Transaction was modified by another request. Please refresh and try again.',
        details: {
          expectedVersion,
          currentVersion: transaction.version,
        },
      },
    };
  }

  // Step 4: Check if already fully refunded
  if (transaction.status === 'REFUNDED') {
    return {
      success: false,
      error: {
        code: 'TRANSACTION_ALREADY_REFUNDED',
        message: 'Transaction has already been fully refunded',
      },
    };
  }

  // Step 5: Calculate totals using Decimal precision (Requirement 5)
  const totalRefunded = calculateTotalRefunded(transaction.refunds);
  const remainingBalance = calculateRemainingBalance(transaction.amount, totalRefunded);

  // Step 6: Validate refund against balance (Requirement 3)
  const balanceValidation = validateRefundAgainstBalance(refundAmount, remainingBalance);
  if (!balanceValidation.valid) {
    return {
      success: false,
      error: balanceValidation.error,
    };
  }

  // Step 7: Calculate new totals and status
  const newTotalRefunded = totalRefunded.plus(refundAmount);
  const newStatus = determineTransactionStatus(transaction.amount, newTotalRefunded);

  // Step 8: Create refund and update transaction atomically
  const refund = await prisma.refund.create({
    data: {
      amount: refundAmount.toFixed(2),
      transactionId,
      idempotencyKey,
    },
  });

  const updatedTransaction = await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      status: newStatus,
      version: { increment: 1 },
    },
    include: { refunds: true },
  });

  return {
    success: true,
    refund,
    transaction: updatedTransaction,
  };
}

/**
 * Converts a transaction to include computed balance fields
 */
export function toTransactionWithBalance(transaction: any): TransactionWithBalance {
  const totalRefunded = calculateTotalRefunded(transaction.refunds || []);
  const remainingBalance = calculateRemainingBalance(transaction.amount, totalRefunded);

  return {
    ...transaction,
    totalRefunded: totalRefunded.toFixed(2),
    remainingBalance: remainingBalance.toFixed(2),
  };
}

/**
 * HTTP status code mapper for error codes
 */
export function getHttpStatusForError(errorCode: RefundErrorCode): number {
  switch (errorCode) {
    case 'INVALID_AMOUNT':
    case 'VALIDATION_ERROR':
      return 400; // Bad Request
    case 'TRANSACTION_NOT_FOUND':
      return 404; // Not Found
    case 'CONCURRENT_MODIFICATION':
      return 409; // Conflict
    case 'INSUFFICIENT_BALANCE':
    case 'TRANSACTION_ALREADY_REFUNDED':
    case 'DUPLICATE_REQUEST':
      return 422; // Unprocessable Entity
    case 'INTERNAL_ERROR':
    default:
      return 500; // Internal Server Error
  }
}
