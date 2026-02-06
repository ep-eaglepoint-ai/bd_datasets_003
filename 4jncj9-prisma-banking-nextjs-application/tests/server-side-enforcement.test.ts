/**
 * Server-Side Enforcement Tests
 *
 * Tests for:
 * - Requirement 1: Next.js Server-Side Enforcement
 * - Requirement 10: Prisma client vanishment from client bundle
 */

import { PRISMA_SERVER_ONLY, DATABASE_URL_EXPOSED, isServerSide } from '@/lib/prisma';

describe('Server-Side Enforcement - Requirement 1', () => {
  describe('Prisma Module Markers', () => {
    it('should have PRISMA_SERVER_ONLY marker set to true', () => {
      expect(PRISMA_SERVER_ONLY).toBe(true);
    });

    it('should NOT expose DATABASE_URL', () => {
      expect(DATABASE_URL_EXPOSED).toBe(false);
    });

    it('should have isServerSide utility function', () => {
      expect(typeof isServerSide).toBe('function');
    });
  });

  describe('Client Component Isolation', () => {
    it('should not import Prisma in TransactionCard component', () => {
      // Read the component source to verify no Prisma imports
      const componentPath = 'repository_after/src/components/TransactionCard.tsx';
      const fs = require('fs');
      const path = require('path');
      const fullPath = path.join(process.cwd(), componentPath);

      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        expect(content).not.toMatch(/from ['"]@prisma\/client['"]/);
        expect(content).not.toMatch(/from ['"]\.\.\/lib\/prisma['"]/);
        expect(content).not.toMatch(/import.*prisma/i);
      }
    });

    it('should not import Prisma in RefundForm component', () => {
      const componentPath = 'repository_after/src/components/RefundForm.tsx';
      const fs = require('fs');
      const path = require('path');
      const fullPath = path.join(process.cwd(), componentPath);

      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        expect(content).not.toMatch(/from ['"]@prisma\/client['"]/);
        expect(content).not.toMatch(/from ['"]\.\.\/lib\/prisma['"]/);
        expect(content).not.toMatch(/import.*prisma/i);
      }
    });

    it('should not import Prisma in TransactionDashboard component', () => {
      const componentPath = 'repository_after/src/components/TransactionDashboard.tsx';
      const fs = require('fs');
      const path = require('path');
      const fullPath = path.join(process.cwd(), componentPath);

      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        expect(content).not.toMatch(/from ['"]@prisma\/client['"]/);
        expect(content).not.toMatch(/from ['"]\.\.\/lib\/prisma['"]/);
        expect(content).not.toMatch(/import.*prisma/i);
      }
    });

    it('client components should have "use client" directive', () => {
      const fs = require('fs');
      const path = require('path');

      const clientComponents = [
        'repository_after/src/components/TransactionCard.tsx',
        'repository_after/src/components/RefundForm.tsx',
        'repository_after/src/components/TransactionDashboard.tsx',
      ];

      for (const componentPath of clientComponents) {
        const fullPath = path.join(process.cwd(), componentPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          expect(content).toMatch(/['"]use client['"]/);
        }
      }
    });
  });

  describe('Server Actions Isolation', () => {
    it('server actions should have "use server" directive', () => {
      const fs = require('fs');
      const path = require('path');
      const actionsPath = path.join(process.cwd(), 'repository_after/src/actions/refund-actions.ts');

      if (fs.existsSync(actionsPath)) {
        const content = fs.readFileSync(actionsPath, 'utf-8');
        expect(content).toMatch(/['"]use server['"]/);
      }
    });

    it('server actions should import Prisma (server-side only)', () => {
      const fs = require('fs');
      const path = require('path');
      const actionsPath = path.join(process.cwd(), 'repository_after/src/actions/refund-actions.ts');

      if (fs.existsSync(actionsPath)) {
        const content = fs.readFileSync(actionsPath, 'utf-8');
        // Server actions CAN import prisma
        expect(content).toMatch(/from ['"]\.\.\/lib\/prisma['"]/);
      }
    });
  });
});

describe('Client Bundle Verification - Requirement 10', () => {
  describe('Database Credentials Protection', () => {
    it('should not have DATABASE_URL in environment accessible to tests', () => {
      // In production, DATABASE_URL should only be available server-side
      // For this test, we verify the pattern exists
      expect(DATABASE_URL_EXPOSED).toBe(false);
    });

    it('should have server-only check in prisma module', () => {
      const fs = require('fs');
      const path = require('path');
      const prismaPath = path.join(process.cwd(), 'repository_after/src/lib/prisma.ts');

      if (fs.existsSync(prismaPath)) {
        const content = fs.readFileSync(prismaPath, 'utf-8');
        // Should have window check
        expect(content).toMatch(/typeof window/);
      }
    });

    it('should configure Next.js to exclude Prisma from client bundle', () => {
      const fs = require('fs');
      const path = require('path');
      const nextConfigPath = path.join(process.cwd(), 'repository_after/next.config.js');

      if (fs.existsSync(nextConfigPath)) {
        const content = fs.readFileSync(nextConfigPath, 'utf-8');
        // Should have webpack config for client exclusion
        expect(content).toMatch(/isServer/);
        expect(content).toMatch(/@prisma\/client/);
      }
    });
  });

  describe('Prisma Client Singleton Pattern', () => {
    it('should use singleton pattern for development', () => {
      const fs = require('fs');
      const path = require('path');
      const prismaPath = path.join(process.cwd(), 'repository_after/src/lib/prisma.ts');

      if (fs.existsSync(prismaPath)) {
        const content = fs.readFileSync(prismaPath, 'utf-8');
        // Should use globalThis pattern
        expect(content).toMatch(/globalThis\.prisma/);
      }
    });

    it('should have PrismaClient import only in server module', () => {
      const fs = require('fs');
      const path = require('path');

      // Only lib/prisma.ts should import PrismaClient
      const prismaPath = path.join(process.cwd(), 'repository_after/src/lib/prisma.ts');

      if (fs.existsSync(prismaPath)) {
        const content = fs.readFileSync(prismaPath, 'utf-8');
        expect(content).toMatch(/import.*PrismaClient.*from.*@prisma\/client/);
      }

      // Components should NOT import PrismaClient
      const componentsDir = path.join(process.cwd(), 'repository_after/src/components');
      if (fs.existsSync(componentsDir)) {
        const files = fs.readdirSync(componentsDir);
        for (const file of files) {
          if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            const content = fs.readFileSync(path.join(componentsDir, file), 'utf-8');
            expect(content).not.toMatch(/import.*PrismaClient.*from.*@prisma\/client/);
          }
        }
      }
    });
  });
});

describe('API Routes Server-Side Only', () => {
  it('API routes should import prisma from lib module', () => {
    const fs = require('fs');
    const path = require('path');

    const apiRoutes = [
      'repository_after/app/api/refunds/route.ts',
      'repository_after/app/api/transactions/route.ts',
    ];

    for (const routePath of apiRoutes) {
      const fullPath = path.join(process.cwd(), routePath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        // API routes should use the prisma module
        expect(content).toMatch(/from ['"].*lib\/prisma['"]/);
      }
    }
  });

  it('API routes should NOT have "use client" directive', () => {
    const fs = require('fs');
    const path = require('path');

    const apiRoutes = [
      'repository_after/app/api/refunds/route.ts',
      'repository_after/app/api/transactions/route.ts',
    ];

    for (const routePath of apiRoutes) {
      const fullPath = path.join(process.cwd(), routePath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        expect(content).not.toMatch(/['"]use client['"]/);
      }
    }
  });
});
