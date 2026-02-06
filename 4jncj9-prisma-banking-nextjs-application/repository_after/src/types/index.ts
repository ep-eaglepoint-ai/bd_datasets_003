/**
 * Type definitions for WealthWire Banking Application
 * Financial ledger system types
 */

import { Decimal } from 'decimal.js';

// Transaction status enum
export type TransactionStatus = 'SETTLED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';

// Transaction interface matching Prisma model
export interface Transaction {
  id: string;
  amount: Decimal | string | number;
  currency: string;
  status: TransactionStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  refunds?: Refund[];
}

// Refund interface matching Prisma model
export interface Refund {
  id: string;
  amount: Decimal | string | number;
  transactionId: string;
  idempotencyKey: string;
  createdAt: Date;
}

// Request payload for creating a refund
export interface RefundRequest {
  transactionId: string;
  amount: string | number;
  idempotencyKey: string;
}

// Response from refund operations
export interface RefundResponse {
  success: boolean;
  refund?: Refund;
  transaction?: Transaction;
  error?: RefundError;
}

// Error types for refund operations
export interface RefundError {
  code: RefundErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type RefundErrorCode =
  | 'INVALID_AMOUNT'
  | 'INSUFFICIENT_BALANCE'
  | 'TRANSACTION_NOT_FOUND'
  | 'TRANSACTION_ALREADY_REFUNDED'
  | 'CONCURRENT_MODIFICATION'
  | 'DUPLICATE_REQUEST'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';

// Server action result type
export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: RefundError;
}

// Transaction with computed fields for UI
export interface TransactionWithBalance extends Transaction {
  totalRefunded: Decimal | string | number;
  remainingBalance: Decimal | string | number;
}

// Form state for React components
export interface RefundFormState {
  isSubmitting: boolean;
  error: RefundError | null;
  lastSubmittedAt: Date | null;
}

// Validation result type
export interface ValidationResult {
  valid: boolean;
  error?: RefundError;
}

// Concurrency check result
export interface ConcurrencyCheckResult {
  canProceed: boolean;
  currentVersion: number;
  error?: RefundError;
}
