/**
 * Atomic Transaction Tests
 *
 * Tests for Requirement 2: Atomic Prisma Transactions
 * Verifies that refund operations are indivisible.
 */

import { Decimal } from 'decimal.js';
import { processRefundAtomic } from '@/lib/refund-service';

// Mock Prisma client for testing atomic operations
function createMockPrismaClient(options: {
  existingRefund?: any;
  transaction?: any;
  shouldFailOnCreate?: boolean;
  shouldFailOnUpdate?: boolean;
}) {
  const { existingRefund, transaction, shouldFailOnCreate, shouldFailOnUpdate } = options;

  return {
    refund: {
      findUnique: jest.fn().mockResolvedValue(existingRefund || null),
      create: jest.fn().mockImplementation((args) => {
        if (shouldFailOnCreate) {
          throw new Error('Create failed');
        }
        return Promise.resolve({
          id: 'refund-1',
          ...args.data,
          createdAt: new Date(),
        });
      }),
    },
    transaction: {
      findUnique: jest.fn().mockResolvedValue(transaction || null),
      update: jest.fn().mockImplementation((args) => {
        if (shouldFailOnUpdate) {
          throw new Error('Update failed');
        }
        return Promise.resolve({
          ...transaction,
          ...args.data,
          version: (transaction?.version || 0) + 1,
        });
      }),
    },
  };
}

describe('Atomic Transactions - Requirement 2', () => {
  describe('processRefundAtomic', () => {
    it('should process refund successfully within transaction', async () => {
      const mockTransaction = {
        id: 'tx-1',
        amount: '100.00',
        currency: 'USD',
        status: 'SETTLED',
        version: 0,
        refunds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPrisma = createMockPrismaClient({ transaction: mockTransaction });

      const result = await processRefundAtomic({
        prisma: mockPrisma,
        transactionId: 'tx-1',
        refundAmount: new Decimal('30.00'),
        idempotencyKey: 'key-1',
      });

      expect(result.success).toBe(true);
      expect(result.refund).toBeDefined();
      expect(mockPrisma.refund.create).toHaveBeenCalled();
      expect(mockPrisma.transaction.update).toHaveBeenCalled();
    });

    it('should verify balance before creating refund', async () => {
      const mockTransaction = {
        id: 'tx-1',
        amount: '100.00',
        currency: 'USD',
        status: 'PARTIALLY_REFUNDED',
        version: 1,
        refunds: [{ amount: '80.00' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPrisma = createMockPrismaClient({ transaction: mockTransaction });

      // Try to refund more than remaining balance (20.00)
      const result = await processRefundAtomic({
        prisma: mockPrisma,
        transactionId: 'tx-1',
        refundAmount: new Decimal('30.00'),
        idempotencyKey: 'key-1',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INSUFFICIENT_BALANCE');
      // Refund should NOT be created
      expect(mockPrisma.refund.create).not.toHaveBeenCalled();
    });

    it('should atomically create refund AND update transaction', async () => {
      const mockTransaction = {
        id: 'tx-1',
        amount: '100.00',
        currency: 'USD',
        status: 'SETTLED',
        version: 0,
        refunds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPrisma = createMockPrismaClient({ transaction: mockTransaction });

      await processRefundAtomic({
        prisma: mockPrisma,
        transactionId: 'tx-1',
        refundAmount: new Decimal('50.00'),
        idempotencyKey: 'key-1',
      });

      // Both operations should happen
      expect(mockPrisma.refund.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.transaction.update).toHaveBeenCalledTimes(1);

      // Transaction status should be updated
      expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PARTIALLY_REFUNDED',
          }),
        })
      );
    });

    it('should set status to REFUNDED when fully refunded', async () => {
      const mockTransaction = {
        id: 'tx-1',
        amount: '100.00',
        currency: 'USD',
        status: 'SETTLED',
        version: 0,
        refunds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPrisma = createMockPrismaClient({ transaction: mockTransaction });

      await processRefundAtomic({
        prisma: mockPrisma,
        transactionId: 'tx-1',
        refundAmount: new Decimal('100.00'),
        idempotencyKey: 'key-1',
      });

      expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REFUNDED',
          }),
        })
      );
    });

    it('should reject if transaction not found', async () => {
      const mockPrisma = createMockPrismaClient({ transaction: null });

      const result = await processRefundAtomic({
        prisma: mockPrisma,
        transactionId: 'non-existent',
        refundAmount: new Decimal('30.00'),
        idempotencyKey: 'key-1',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TRANSACTION_NOT_FOUND');
    });

    it('should reject if transaction already fully refunded', async () => {
      const mockTransaction = {
        id: 'tx-1',
        amount: '100.00',
        currency: 'USD',
        status: 'REFUNDED',
        version: 2,
        refunds: [{ amount: '100.00' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPrisma = createMockPrismaClient({ transaction: mockTransaction });

      const result = await processRefundAtomic({
        prisma: mockPrisma,
        transactionId: 'tx-1',
        refundAmount: new Decimal('10.00'),
        idempotencyKey: 'key-1',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TRANSACTION_ALREADY_REFUNDED');
    });

    it('should increment version on each update', async () => {
      const mockTransaction = {
        id: 'tx-1',
        amount: '100.00',
        currency: 'USD',
        status: 'SETTLED',
        version: 5,
        refunds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPrisma = createMockPrismaClient({ transaction: mockTransaction });

      await processRefundAtomic({
        prisma: mockPrisma,
        transactionId: 'tx-1',
        refundAmount: new Decimal('30.00'),
        idempotencyKey: 'key-1',
      });

      expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: { increment: 1 },
          }),
        })
      );
    });
  });
});

describe('Atomic Transaction Boundaries', () => {
  it('should not partially update on validation failure', async () => {
    const mockTransaction = {
      id: 'tx-1',
      amount: '100.00',
      status: 'SETTLED',
      version: 0,
      refunds: [{ amount: '90.00' }],
    };

    const mockPrisma = createMockPrismaClient({ transaction: mockTransaction });

    await processRefundAtomic({
      prisma: mockPrisma,
      transactionId: 'tx-1',
      refundAmount: new Decimal('20.00'), // Exceeds remaining balance of 10
      idempotencyKey: 'key-1',
    });

    // Neither create nor update should be called
    expect(mockPrisma.refund.create).not.toHaveBeenCalled();
    expect(mockPrisma.transaction.update).not.toHaveBeenCalled();
  });

  it('should calculate correct remaining balance with multiple prior refunds', async () => {
    const mockTransaction = {
      id: 'tx-1',
      amount: '100.00',
      status: 'PARTIALLY_REFUNDED',
      version: 3,
      refunds: [
        { amount: '25.00' },
        { amount: '25.00' },
        { amount: '25.00' },
      ], // Total refunded: 75.00, remaining: 25.00
    };

    const mockPrisma = createMockPrismaClient({ transaction: mockTransaction });

    // Should succeed - exactly remaining balance
    const result1 = await processRefundAtomic({
      prisma: mockPrisma,
      transactionId: 'tx-1',
      refundAmount: new Decimal('25.00'),
      idempotencyKey: 'key-1',
    });
    expect(result1.success).toBe(true);

    // Reset mock
    mockPrisma.refund.create.mockClear();
    mockPrisma.transaction.update.mockClear();

    // Should fail - exceeds remaining balance
    const result2 = await processRefundAtomic({
      prisma: mockPrisma,
      transactionId: 'tx-1',
      refundAmount: new Decimal('25.01'),
      idempotencyKey: 'key-2',
    });
    expect(result2.success).toBe(false);
    expect(result2.error?.code).toBe('INSUFFICIENT_BALANCE');
  });
});
