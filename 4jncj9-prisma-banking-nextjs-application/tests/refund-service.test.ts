/**
 * Refund Service Tests
 *
 * Tests for core refund logic including:
 * - Requirement 3: Fiscal Consistency Rules
 * - Requirement 5: Data Type Precision (Decimal)
 */

import { Decimal } from 'decimal.js';
import {
  validateRefundAmount,
  calculateTotalRefunded,
  calculateRemainingBalance,
  determineTransactionStatus,
  validateRefundAgainstBalance,
  validateRefundRequest,
  getHttpStatusForError,
} from '@/lib/refund-service';

describe('Refund Service - Requirement 3: Fiscal Consistency Rules', () => {
  describe('validateRefundAmount', () => {
    it('should accept valid positive amounts', () => {
      expect(validateRefundAmount('100.00').valid).toBe(true);
      expect(validateRefundAmount(50.5).valid).toBe(true);
      expect(validateRefundAmount('0.01').valid).toBe(true);
    });

    it('should reject zero amount', () => {
      const result = validateRefundAmount(0);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_AMOUNT');
    });

    it('should reject negative amounts', () => {
      const result = validateRefundAmount(-50);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_AMOUNT');
    });

    it('should reject invalid number formats', () => {
      const result = validateRefundAmount('not-a-number');
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_AMOUNT');
    });
  });

  describe('calculateTotalRefunded', () => {
    it('should calculate sum of refunds correctly', () => {
      const refunds = [
        { amount: '25.00' },
        { amount: '30.50' },
        { amount: '44.50' },
      ];
      const total = calculateTotalRefunded(refunds);
      expect(total.toString()).toBe('100');
    });

    it('should return zero for empty refunds array', () => {
      const total = calculateTotalRefunded([]);
      expect(total.toString()).toBe('0');
    });

    it('should handle Decimal type amounts', () => {
      const refunds = [
        { amount: new Decimal('10.00') },
        { amount: new Decimal('20.00') },
      ];
      const total = calculateTotalRefunded(refunds);
      expect(total.toString()).toBe('30');
    });
  });

  describe('calculateRemainingBalance', () => {
    it('should calculate remaining balance correctly', () => {
      const remaining = calculateRemainingBalance('100.00', new Decimal('30.00'));
      expect(remaining.toString()).toBe('70');
    });

    it('should return zero when fully refunded', () => {
      const remaining = calculateRemainingBalance('100.00', new Decimal('100.00'));
      expect(remaining.toString()).toBe('0');
    });

    it('should return full amount when no refunds', () => {
      const remaining = calculateRemainingBalance('100.00', new Decimal('0'));
      expect(remaining.toString()).toBe('100');
    });
  });

  describe('determineTransactionStatus', () => {
    it('should return SETTLED when no refunds', () => {
      const status = determineTransactionStatus('100.00', new Decimal('0'));
      expect(status).toBe('SETTLED');
    });

    it('should return PARTIALLY_REFUNDED for partial refunds', () => {
      const status = determineTransactionStatus('100.00', new Decimal('50.00'));
      expect(status).toBe('PARTIALLY_REFUNDED');
    });

    it('should return REFUNDED when fully refunded', () => {
      const status = determineTransactionStatus('100.00', new Decimal('100.00'));
      expect(status).toBe('REFUNDED');
    });
  });

  describe('validateRefundAgainstBalance - Sum(All Refunds) ≤ Original Amount', () => {
    it('should accept refund within balance', () => {
      const result = validateRefundAgainstBalance('30.00', new Decimal('50.00'));
      expect(result.valid).toBe(true);
    });

    it('should accept refund equal to balance', () => {
      const result = validateRefundAgainstBalance('50.00', new Decimal('50.00'));
      expect(result.valid).toBe(true);
    });

    it('should reject refund exceeding balance', () => {
      const result = validateRefundAgainstBalance('60.00', new Decimal('50.00'));
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INSUFFICIENT_BALANCE');
      expect(result.error?.details).toHaveProperty('requestedAmount');
      expect(result.error?.details).toHaveProperty('remainingBalance');
    });
  });
});

describe('Refund Service - Requirement 5: Data Type Precision', () => {
  describe('Decimal arithmetic precision', () => {
    it('should handle floating point precision correctly', () => {
      // Classic floating point issue: 0.1 + 0.2 !== 0.3
      const refunds = [
        { amount: '0.1' },
        { amount: '0.2' },
      ];
      const total = calculateTotalRefunded(refunds);
      expect(total.toString()).toBe('0.3');
    });

    it('should handle many small refunds without precision loss', () => {
      const refunds = Array(100).fill({ amount: '0.01' });
      const total = calculateTotalRefunded(refunds);
      expect(total.toString()).toBe('1');
    });

    it('should handle large amounts with cents precision', () => {
      const remaining = calculateRemainingBalance('999999.99', new Decimal('1.01'));
      expect(remaining.toString()).toBe('999998.98');
    });

    it('should maintain precision through multiple calculations', () => {
      const original = '1000.00';
      const refund1 = new Decimal('333.33');
      const refund2 = new Decimal('333.33');
      const refund3 = new Decimal('333.34');

      const total = refund1.plus(refund2).plus(refund3);
      const remaining = calculateRemainingBalance(original, total);

      expect(remaining.toString()).toBe('0');
    });
  });
});

describe('Refund Service - Request Validation', () => {
  describe('validateRefundRequest', () => {
    it('should accept valid request', () => {
      const result = validateRefundRequest({
        transactionId: 'tx-123',
        amount: '50.00',
        idempotencyKey: 'key-123',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject missing transaction ID', () => {
      const result = validateRefundRequest({
        transactionId: '',
        amount: '50.00',
        idempotencyKey: 'key-123',
      });
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject missing idempotency key', () => {
      const result = validateRefundRequest({
        transactionId: 'tx-123',
        amount: '50.00',
        idempotencyKey: '',
      });
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid amount', () => {
      const result = validateRefundRequest({
        transactionId: 'tx-123',
        amount: '-50.00',
        idempotencyKey: 'key-123',
      });
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_AMOUNT');
    });
  });
});

describe('Refund Service - HTTP Status Codes', () => {
  describe('getHttpStatusForError', () => {
    it('should return 400 for validation errors', () => {
      expect(getHttpStatusForError('INVALID_AMOUNT')).toBe(400);
      expect(getHttpStatusForError('VALIDATION_ERROR')).toBe(400);
    });

    it('should return 404 for not found', () => {
      expect(getHttpStatusForError('TRANSACTION_NOT_FOUND')).toBe(404);
    });

    it('should return 409 for concurrent modification', () => {
      expect(getHttpStatusForError('CONCURRENT_MODIFICATION')).toBe(409);
    });

    it('should return 422 for business rule violations', () => {
      expect(getHttpStatusForError('INSUFFICIENT_BALANCE')).toBe(422);
      expect(getHttpStatusForError('TRANSACTION_ALREADY_REFUNDED')).toBe(422);
      expect(getHttpStatusForError('DUPLICATE_REQUEST')).toBe(422);
    });

    it('should return 500 for internal errors', () => {
      expect(getHttpStatusForError('INTERNAL_ERROR')).toBe(500);
    });
  });
});
