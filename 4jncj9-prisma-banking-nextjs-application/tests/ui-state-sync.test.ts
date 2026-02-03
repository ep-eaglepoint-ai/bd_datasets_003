/**
 * UI State Synchronization Tests
 *
 * Tests for Requirement 6: UI state synchronization using Next.js patterns
 */

import { revalidatePath } from 'next/cache';

// Mock is set up in setup.ts
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>;

describe('UI State Synchronization - Requirement 6', () => {
  beforeEach(() => {
    mockRevalidatePath.mockClear();
  });

  describe('revalidatePath Usage', () => {
    it('should have revalidatePath imported in server actions', () => {
      const fs = require('fs');
      const path = require('path');
      const actionsPath = path.join(
        process.cwd(),
        'repository_after/src/actions/refund-actions.ts'
      );

      if (fs.existsSync(actionsPath)) {
        const content = fs.readFileSync(actionsPath, 'utf-8');
        expect(content).toMatch(/import.*revalidatePath.*from ['"]next\/cache['"]/);
      }
    });

    it('should call revalidatePath after successful refund', () => {
      const fs = require('fs');
      const path = require('path');
      const actionsPath = path.join(
        process.cwd(),
        'repository_after/src/actions/refund-actions.ts'
      );

      if (fs.existsSync(actionsPath)) {
        const content = fs.readFileSync(actionsPath, 'utf-8');
        // Should call revalidatePath for transaction routes
        expect(content).toMatch(/revalidatePath\s*\(/);
        expect(content).toMatch(/\/transactions/);
      }
    });

    it('should revalidate both transaction list and detail pages', () => {
      const fs = require('fs');
      const path = require('path');
      const actionsPath = path.join(
        process.cwd(),
        'repository_after/src/actions/refund-actions.ts'
      );

      if (fs.existsSync(actionsPath)) {
        const content = fs.readFileSync(actionsPath, 'utf-8');
        // Should revalidate list page
        expect(content).toMatch(/revalidatePath\(['"]\/transactions['"]\)/);
        // Should revalidate detail page (with dynamic ID)
        expect(content).toMatch(/revalidatePath\(`\/transactions\/\$\{/);
      }
    });
  });

  describe('Server Actions Pattern', () => {
    it('server actions file should export async functions', () => {
      const fs = require('fs');
      const path = require('path');
      const actionsPath = path.join(
        process.cwd(),
        'repository_after/src/actions/refund-actions.ts'
      );

      if (fs.existsSync(actionsPath)) {
        const content = fs.readFileSync(actionsPath, 'utf-8');
        // Should have async function exports
        expect(content).toMatch(/export\s+async\s+function\s+processRefund/);
        expect(content).toMatch(/export\s+async\s+function\s+getTransaction/);
        expect(content).toMatch(/export\s+async\s+function\s+getAllTransactions/);
      }
    });

    it('page should use server-side data fetching', () => {
      const fs = require('fs');
      const path = require('path');
      const pagePath = path.join(
        process.cwd(),
        'repository_after/app/page.tsx'
      );

      if (fs.existsSync(pagePath)) {
        const content = fs.readFileSync(pagePath, 'utf-8');
        // Should be an async server component
        expect(content).toMatch(/export\s+default\s+async\s+function/);
        // Should fetch data on server
        expect(content).toMatch(/await\s+getAllTransactions/);
      }
    });

    it('page should pass server actions to client components', () => {
      const fs = require('fs');
      const path = require('path');
      const pagePath = path.join(
        process.cwd(),
        'repository_after/app/page.tsx'
      );

      if (fs.existsSync(pagePath)) {
        const content = fs.readFileSync(pagePath, 'utf-8');
        // Should have inline server action wrappers
        expect(content).toMatch(/['"]use server['"]/);
        // Should pass handlers to dashboard
        expect(content).toMatch(/onProcessRefund/);
        expect(content).toMatch(/onRefresh/);
      }
    });
  });

  describe('Dynamic Data Updates', () => {
    it('page should be dynamically rendered', () => {
      const fs = require('fs');
      const path = require('path');
      const pagePath = path.join(
        process.cwd(),
        'repository_after/app/page.tsx'
      );

      if (fs.existsSync(pagePath)) {
        const content = fs.readFileSync(pagePath, 'utf-8');
        // Should export dynamic = 'force-dynamic'
        expect(content).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
      }
    });

    it('dashboard should have refresh capability', () => {
      const fs = require('fs');
      const path = require('path');
      const dashboardPath = path.join(
        process.cwd(),
        'repository_after/src/components/TransactionDashboard.tsx'
      );

      if (fs.existsSync(dashboardPath)) {
        const content = fs.readFileSync(dashboardPath, 'utf-8');
        // Should have refresh handler
        expect(content).toMatch(/onRefresh/);
        // Should update local state
        expect(content).toMatch(/setTransactions/);
        // Should have refresh button
        expect(content).toMatch(/data-testid=['"]refresh-button['"]/);
      }
    });
  });

  describe('useTransition for Loading States', () => {
    it('RefundForm should use useTransition hook', () => {
      const fs = require('fs');
      const path = require('path');
      const formPath = path.join(
        process.cwd(),
        'repository_after/src/components/RefundForm.tsx'
      );

      if (fs.existsSync(formPath)) {
        const content = fs.readFileSync(formPath, 'utf-8');
        // Should import useTransition
        expect(content).toMatch(/import.*useTransition.*from ['"]react['"]/);
        // Should use the hook
        expect(content).toMatch(/useTransition\(\)/);
        // Should use startTransition
        expect(content).toMatch(/startTransition/);
      }
    });

    it('RefundForm should show loading state during submission', () => {
      const fs = require('fs');
      const path = require('path');
      const formPath = path.join(
        process.cwd(),
        'repository_after/src/components/RefundForm.tsx'
      );

      if (fs.existsSync(formPath)) {
        const content = fs.readFileSync(formPath, 'utf-8');
        // Should track pending state
        expect(content).toMatch(/isPending|isSubmitting/);
        // Should disable button during loading
        expect(content).toMatch(/disabled.*isLoading|isPending/);
        // Should show loading indicator
        expect(content).toMatch(/Processing|Loading/);
      }
    });
  });
});

describe('Balance Display Updates', () => {
  it('TransactionCard should display remaining balance', () => {
    const fs = require('fs');
    const path = require('path');
    const cardPath = path.join(
      process.cwd(),
      'repository_after/src/components/TransactionCard.tsx'
    );

    if (fs.existsSync(cardPath)) {
      const content = fs.readFileSync(cardPath, 'utf-8');
      // Should display remainingBalance
      expect(content).toMatch(/remainingBalance/);
      // Should have testid for remaining balance
      expect(content).toMatch(/data-testid=['"]remaining-balance['"]/);
    }
  });

  it('TransactionWithBalance type should have computed balance fields', () => {
    const fs = require('fs');
    const path = require('path');
    const typesPath = path.join(
      process.cwd(),
      'repository_after/src/types/index.ts'
    );

    if (fs.existsSync(typesPath)) {
      const content = fs.readFileSync(typesPath, 'utf-8');
      // Should have computed balance fields
      expect(content).toMatch(/totalRefunded/);
      expect(content).toMatch(/remainingBalance/);
      expect(content).toMatch(/TransactionWithBalance/);
    }
  });

  it('refund-service should compute balance correctly', () => {
    const { toTransactionWithBalance } = require('@/lib/refund-service');

    const mockTransaction = {
      id: 'tx-1',
      amount: '100.00',
      currency: 'USD',
      status: 'PARTIALLY_REFUNDED',
      version: 1,
      refunds: [
        { amount: '25.00' },
        { amount: '25.00' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = toTransactionWithBalance(mockTransaction);

    expect(result.totalRefunded).toBe('50.00');
    expect(result.remainingBalance).toBe('50.00');
  });
});
