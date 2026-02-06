/**
 * Concurrency Tests
 *
 * Tests for:
 * - Requirement 4: Concurrency & Conflict Handling
 * - Requirement 7: Idempotency Controls
 * - Requirement 8: Multiple concurrent refund requests
 */

import { Decimal } from 'decimal.js';
import { processRefundAtomic } from '@/lib/refund-service';

describe('Concurrency - Requirement 4: Conflict Handling', () => {
  describe('Optimistic Locking', () => {
    it('should reject request when version mismatch detected', async () => {
      const mockTransaction = {
        id: 'tx-1',
        amount: '100.00',
        status: 'SETTLED',
        version: 5, // Current version is 5
        refunds: [],
      };

      const mockPrisma = {
        refund: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
        transaction: {
          findUnique: jest.fn().mockResolvedValue(mockTransaction),
          update: jest.fn(),
        },
      };

      const result = await processRefundAtomic({
        prisma: mockPrisma,
        transactionId: 'tx-1',
        refundAmount: new Decimal('30.00'),
        idempotencyKey: 'key-1',
        expectedVersion: 3, // Client expects version 3
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CONCURRENT_MODIFICATION');
      expect(result.error?.details?.expectedVersion).toBe(3);
      expect(result.error?.details?.currentVersion).toBe(5);
    });

    it('should succeed when version matches', async () => {
      const mockTransaction = {
        id: 'tx-1',
        amount: '100.00',
        status: 'SETTLED',
        version: 5,
        refunds: [],
      };

      const mockPrisma = {
        refund: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: 'refund-1',
            amount: '30.00',
            transactionId: 'tx-1',
            idempotencyKey: 'key-1',
          }),
        },
        transaction: {
          findUnique: jest.fn().mockResolvedValue(mockTransaction),
          update: jest.fn().mockResolvedValue({
            ...mockTransaction,
            status: 'PARTIALLY_REFUNDED',
            version: 6,
          }),
        },
      };

      const result = await processRefundAtomic({
        prisma: mockPrisma,
        transactionId: 'tx-1',
        refundAmount: new Decimal('30.00'),
        idempotencyKey: 'key-1',
        expectedVersion: 5, // Matches current version
      });

      expect(result.success).toBe(true);
    });

    it('should proceed without version check when expectedVersion not provided', async () => {
      const mockTransaction = {
        id: 'tx-1',
        amount: '100.00',
        status: 'SETTLED',
        version: 99,
        refunds: [],
      };

      const mockPrisma = {
        refund: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'refund-1' }),
        },
        transaction: {
          findUnique: jest.fn().mockResolvedValue(mockTransaction),
          update: jest.fn().mockResolvedValue({ ...mockTransaction, version: 100 }),
        },
      };

      const result = await processRefundAtomic({
        prisma: mockPrisma,
        transactionId: 'tx-1',
        refundAmount: new Decimal('30.00'),
        idempotencyKey: 'key-1',
        // No expectedVersion provided
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Stale Balance Problem', () => {
    it('should detect when balance changed between read and write', async () => {
      // Simulate scenario where admin reads transaction, then another admin
      // issues a refund before the first admin submits

      const originalTransaction = {
        id: 'tx-1',
        amount: '100.00',
        status: 'SETTLED',
        version: 0,
        refunds: [],
      };

      // After another admin's refund
      const modifiedTransaction = {
        id: 'tx-1',
        amount: '100.00',
        status: 'PARTIALLY_REFUNDED',
        version: 1, // Version incremented
        refunds: [{ amount: '80.00' }], // 80 already refunded
      };

      const mockPrisma = {
        refund: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        transaction: {
          findUnique: jest.fn().mockResolvedValue(modifiedTransaction),
        },
      };

      // First admin tries to refund 30 based on stale balance
      const result = await processRefundAtomic({
        prisma: mockPrisma,
        transactionId: 'tx-1',
        refundAmount: new Decimal('30.00'), // Would exceed if 80 already refunded
        idempotencyKey: 'key-1',
        expectedVersion: 0, // Stale version
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CONCURRENT_MODIFICATION');
    });
  });
});

describe('Idempotency - Requirement 7', () => {
  describe('Duplicate Request Prevention', () => {
    it('should return existing refund for duplicate idempotency key', async () => {
      const existingRefund = {
        id: 'refund-1',
        amount: '30.00',
        transactionId: 'tx-1',
        idempotencyKey: 'key-1',
        createdAt: new Date(),
      };

      const mockTransaction = {
        id: 'tx-1',
        amount: '100.00',
        status: 'PARTIALLY_REFUNDED',
        version: 1,
        refunds: [existingRefund],
      };

      const mockPrisma = {
        refund: {
          findUnique: jest.fn().mockResolvedValue(existingRefund),
          create: jest.fn(),
        },
        transaction: {
          findUnique: jest.fn().mockResolvedValue(mockTransaction),
          update: jest.fn(),
        },
      };

      const result = await processRefundAtomic({
        prisma: mockPrisma,
        transactionId: 'tx-1',
        refundAmount: new Decimal('30.00'),
        idempotencyKey: 'key-1', // Same key as existing
      });

      // Should succeed but return existing refund
      expect(result.success).toBe(true);
      expect(result.refund).toEqual(existingRefund);
      // Should NOT create new refund
      expect(mockPrisma.refund.create).not.toHaveBeenCalled();
    });

    it('should allow different idempotency keys for same transaction', async () => {
      const mockTransaction = {
        id: 'tx-1',
        amount: '100.00',
        status: 'SETTLED',
        version: 0,
        refunds: [],
      };

      const mockPrisma = {
        refund: {
          findUnique: jest.fn().mockResolvedValue(null), // No existing refund
          create: jest.fn().mockResolvedValue({
            id: 'refund-new',
            amount: '30.00',
            idempotencyKey: 'key-2',
          }),
        },
        transaction: {
          findUnique: jest.fn().mockResolvedValue(mockTransaction),
          update: jest.fn().mockResolvedValue({ ...mockTransaction, version: 1 }),
        },
      };

      const result = await processRefundAtomic({
        prisma: mockPrisma,
        transactionId: 'tx-1',
        refundAmount: new Decimal('30.00'),
        idempotencyKey: 'key-2', // Different key
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.refund.create).toHaveBeenCalled();
    });

    it('should use unique idempotency key check before balance validation', async () => {
      // If idempotency key exists, we should return early
      // without re-validating balance
      const existingRefund = {
        id: 'refund-1',
        amount: '30.00',
        transactionId: 'tx-1',
        idempotencyKey: 'key-1',
      };

      const mockPrisma = {
        refund: {
          findUnique: jest.fn().mockResolvedValue(existingRefund),
        },
        transaction: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'tx-1',
            refunds: [existingRefund],
          }),
        },
      };

      const result = await processRefundAtomic({
        prisma: mockPrisma,
        transactionId: 'tx-1',
        refundAmount: new Decimal('99999.00'), // Way more than balance
        idempotencyKey: 'key-1', // Existing key
      });

      // Should succeed because we return cached result
      expect(result.success).toBe(true);
      expect(result.refund).toEqual(existingRefund);
    });
  });
});

describe('Requirement 8: Concurrent Refund Requests', () => {
  describe('Simulated Concurrent Access', () => {
    it('should handle race condition - only one request should succeed', async () => {
      // Simulate two requests arriving simultaneously
      // Both think they can refund $60 from a $100 transaction

      let currentVersion = 0;
      let currentRefunds: any[] = [];

      const createMockPrisma = () => ({
        refund: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((args) => {
            // Simulate actual creation
            const newRefund = {
              id: `refund-${Date.now()}`,
              ...args.data,
            };
            currentRefunds.push(newRefund);
            return Promise.resolve(newRefund);
          }),
        },
        transaction: {
          findUnique: jest.fn().mockImplementation(() => ({
            id: 'tx-1',
            amount: '100.00',
            status: currentRefunds.length > 0 ? 'PARTIALLY_REFUNDED' : 'SETTLED',
            version: currentVersion,
            refunds: [...currentRefunds],
          })),
          update: jest.fn().mockImplementation(() => {
            currentVersion++;
            return Promise.resolve({
              id: 'tx-1',
              version: currentVersion,
            });
          }),
        },
      });

      // Both requests use expected version 0
      const mockPrisma1 = createMockPrisma();
      const mockPrisma2 = createMockPrisma();

      // First request - should succeed
      const result1 = await processRefundAtomic({
        prisma: mockPrisma1,
        transactionId: 'tx-1',
        refundAmount: new Decimal('60.00'),
        idempotencyKey: 'key-1',
        expectedVersion: 0,
      });

      // Second request - should fail due to version mismatch
      const result2 = await processRefundAtomic({
        prisma: mockPrisma2,
        transactionId: 'tx-1',
        refundAmount: new Decimal('60.00'),
        idempotencyKey: 'key-2',
        expectedVersion: 0, // Still expects 0, but version is now 1
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(false);
      expect(result2.error?.code).toBe('CONCURRENT_MODIFICATION');
    });

    it('should prevent total refunds exceeding transaction amount', async () => {
      // Transaction: $100
      // Request 1: Refund $60 (remaining: $40)
      // Request 2: Refund $60 (should fail - only $40 remaining)

      const mockTransaction = {
        id: 'tx-1',
        amount: '100.00',
        status: 'PARTIALLY_REFUNDED',
        version: 1,
        refunds: [{ amount: '60.00' }], // $60 already refunded
      };

      const mockPrisma = {
        refund: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        transaction: {
          findUnique: jest.fn().mockResolvedValue(mockTransaction),
        },
      };

      const result = await processRefundAtomic({
        prisma: mockPrisma,
        transactionId: 'tx-1',
        refundAmount: new Decimal('60.00'), // Only $40 remaining
        idempotencyKey: 'key-2',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INSUFFICIENT_BALANCE');
    });

    it('should handle multiple sequential refunds correctly', async () => {
      // $100 transaction, 4 x $25 refunds
      const refundAmounts = ['25.00', '25.00', '25.00', '25.00'];
      let version = 0;
      const refunds: any[] = [];

      for (let i = 0; i < refundAmounts.length; i++) {
        const mockPrisma = {
          refund: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((args) => {
              const newRefund = { id: `refund-${i}`, ...args.data };
              refunds.push(newRefund);
              return Promise.resolve(newRefund);
            }),
          },
          transaction: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'tx-1',
              amount: '100.00',
              status: version === 0 ? 'SETTLED' : 'PARTIALLY_REFUNDED',
              version,
              refunds: [...refunds],
            }),
            update: jest.fn().mockImplementation(() => {
              version++;
              return Promise.resolve({ version });
            }),
          },
        };

        const result = await processRefundAtomic({
          prisma: mockPrisma,
          transactionId: 'tx-1',
          refundAmount: new Decimal(refundAmounts[i]),
          idempotencyKey: `key-${i}`,
        });

        expect(result.success).toBe(true);
      }

      // Total refunded should be exactly $100
      expect(refunds.length).toBe(4);
    });

    it('should reject 5th refund after 4 x $25 refunds', async () => {
      const mockTransaction = {
        id: 'tx-1',
        amount: '100.00',
        status: 'REFUNDED',
        version: 4,
        refunds: [
          { amount: '25.00' },
          { amount: '25.00' },
          { amount: '25.00' },
          { amount: '25.00' },
        ],
      };

      const mockPrisma = {
        refund: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        transaction: {
          findUnique: jest.fn().mockResolvedValue(mockTransaction),
        },
      };

      const result = await processRefundAtomic({
        prisma: mockPrisma,
        transactionId: 'tx-1',
        refundAmount: new Decimal('1.00'),
        idempotencyKey: 'key-5',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TRANSACTION_ALREADY_REFUNDED');
    });
  });
});
