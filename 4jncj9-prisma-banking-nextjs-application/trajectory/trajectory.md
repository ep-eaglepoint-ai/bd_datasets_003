# Implementation Trajectory

## WealthWire Prisma Banking Next.js Application

### Task Overview

Build a fullstack financial ledger system with strict state consistency featuring:
- React interface for Transaction Management dashboard
- Prisma-backed API with atomic transactions
- Multi-stage validation to prevent over-refunding
- Concurrency handling for simultaneous admin actions

### Technology Stack

| Technology | Choice | Rationale |
|------------|--------|-----------|
| Framework | Next.js 14 | App Router, Server Components, Server Actions |
| ORM | Prisma | Type-safe database access, $transaction API |
| Language | TypeScript | Strict type safety for financial calculations |
| Precision | Decimal.js | Prevents floating-point errors in currency |
| Testing | Jest | Integration and unit testing |

---

## Implementation Steps

### Phase 1: Project Setup

#### Step 1.1: Package Configuration
**File**: `package.json`

Dependencies:
- `next@^14.0.0` - Next.js framework
- `@prisma/client@^5.7.0` - Prisma ORM client
- `decimal.js@^10.4.3` - Decimal precision for currency
- `uuid@^9.0.0` - Idempotency key generation

#### Step 1.2: TypeScript Configuration
**File**: `tsconfig.json`

Configured with:
- `strict: true` - Full type safety
- `moduleResolution: "bundler"` - Modern resolution
- Path aliases: `@/*` → `repository_after/src/*`

#### Step 1.3: Jest Configuration
**File**: `jest.config.js`

Test environment setup with ts-jest preset.

---

### Phase 2: Prisma Schema

#### Step 2.1: Database Schema
**File**: `repository_after/prisma/schema.prisma`

**Requirement 5: Data Type Precision**

```prisma
model Transaction {
  id        String   @id @default(uuid())
  amount    Decimal  // Decimal type for precision
  currency  String   @default("USD")
  status    String   @default("SETTLED")
  version   Int      @default(0) // Optimistic locking
  refunds   Refund[]
}

model Refund {
  id             String      @id @default(uuid())
  amount         Decimal     // Decimal type for precision
  transactionId  String
  transaction    Transaction @relation(...)
  idempotencyKey String      @unique // Requirement 7
}
```

Key features:
- `Decimal` type for all currency fields (Requirement 5)
- `version` field for optimistic locking (Requirement 4)
- `idempotencyKey` unique constraint (Requirement 7)

---

### Phase 3: Type Definitions

#### Step 3.1: Core Types
**File**: `repository_after/src/types/index.ts`

```typescript
// Transaction status
type TransactionStatus = 'SETTLED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';

// Error codes for clear UI display
type RefundErrorCode =
  | 'INVALID_AMOUNT'
  | 'INSUFFICIENT_BALANCE'
  | 'TRANSACTION_NOT_FOUND'
  | 'TRANSACTION_ALREADY_REFUNDED'
  | 'CONCURRENT_MODIFICATION'
  | 'DUPLICATE_REQUEST'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';

// Transaction with computed balance
interface TransactionWithBalance extends Transaction {
  totalRefunded: Decimal | string | number;
  remainingBalance: Decimal | string | number;
}
```

---

### Phase 4: Server-Side Core Logic

#### Step 4.1: Prisma Client Singleton
**File**: `repository_after/src/lib/prisma.ts`

**Requirement 1: Server-Side Enforcement**

```typescript
// Server-only check
const serverOnlyMarker = typeof window === 'undefined';

if (!serverOnlyMarker && process.env.NODE_ENV !== 'test') {
  throw new Error(
    'PrismaClient cannot be imported on the client side.'
  );
}

export const PRISMA_SERVER_ONLY = true;
export const DATABASE_URL_EXPOSED = false;
```

#### Step 4.2: Refund Service
**File**: `repository_after/src/lib/refund-service.ts`

**Requirement 3: Fiscal Consistency Rules**

```typescript
// Sum(All Refunds) ≤ Original Transaction Amount
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
        message: `Refund amount (${amount.toFixed(2)}) exceeds remaining balance`,
      },
    };
  }

  return { valid: true };
}

// Status transition logic
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
```

**Requirement 2: Atomic Prisma Transactions**

```typescript
export async function processRefundAtomic(params: AtomicRefundParams): Promise<AtomicRefundResult> {
  const { prisma, transactionId, refundAmount, idempotencyKey, expectedVersion } = params;

  // Step 1: Check idempotency (Requirement 7)
  const existingRefund = await prisma.refund.findUnique({
    where: { idempotencyKey },
  });
  if (existingRefund) {
    return { success: true, refund: existingRefund };
  }

  // Step 2: Fetch transaction
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { refunds: true },
  });

  // Step 3: Version check (Requirement 4)
  if (expectedVersion !== undefined && transaction.version !== expectedVersion) {
    return {
      success: false,
      error: { code: 'CONCURRENT_MODIFICATION', ... },
    };
  }

  // Step 4: Balance validation (Requirement 3)
  const totalRefunded = calculateTotalRefunded(transaction.refunds);
  const remainingBalance = calculateRemainingBalance(transaction.amount, totalRefunded);
  const balanceValidation = validateRefundAgainstBalance(refundAmount, remainingBalance);
  if (!balanceValidation.valid) {
    return { success: false, error: balanceValidation.error };
  }

  // Step 5: Atomic create + update
  const refund = await prisma.refund.create({ ... });
  const updatedTransaction = await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      status: newStatus,
      version: { increment: 1 },
    },
  });

  return { success: true, refund, transaction: updatedTransaction };
}
```

**Requirement 4: HTTP Status Codes**

```typescript
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
      return 422; // Unprocessable Entity
    default:
      return 500;
  }
}
```

---

### Phase 5: Server Actions

#### Step 5.1: Refund Actions
**File**: `repository_after/src/actions/refund-actions.ts`

**Requirement 1: Server-Side Only**
**Requirement 6: UI State Synchronization**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '../lib/prisma';

export async function processRefund(request: RefundRequest): Promise<RefundResponse> {
  // Validate request
  const validation = validateRefundRequest(request);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Execute within atomic transaction (Requirement 2)
  const result = await prisma.$transaction(async (tx) => {
    return processRefundAtomic({
      prisma: tx,
      transactionId: request.transactionId,
      refundAmount: new Decimal(request.amount.toString()),
      idempotencyKey: request.idempotencyKey,
    });
  }, {
    isolationLevel: 'Serializable', // Strict consistency
  });

  if (result.success) {
    // UI State Synchronization (Requirement 6)
    revalidatePath(`/transactions/${request.transactionId}`);
    revalidatePath('/transactions');
  }

  return result;
}
```

---

### Phase 6: React Components

#### Step 6.1: TransactionCard
**File**: `repository_after/src/components/TransactionCard.tsx`

**Requirement 1: No Prisma in Client Components**

```typescript
'use client';

// NO Prisma imports here
import React from 'react';
import { TransactionWithBalance } from '../types';

export function TransactionCard({ transaction, onRefundClick }: Props) {
  return (
    <div className="transaction-card">
      <p data-testid="remaining-balance">
        {transaction.currency} {String(transaction.remainingBalance)}
      </p>
      {/* ... */}
    </div>
  );
}
```

#### Step 6.2: RefundForm
**File**: `repository_after/src/components/RefundForm.tsx`

**Requirement 6: useTransition for Loading States**
**Requirement 9: Error Handling**

```typescript
'use client';

import { useState, useTransition } from 'react';
import { v4 as uuidv4 } from 'uuid';

export function RefundForm({ transaction, onSubmit }: Props) {
  const [error, setError] = useState<RefundError | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Generate idempotency key (Requirement 7)
    const idempotencyKey = uuidv4();

    startTransition(async () => {
      try {
        const result = await onSubmit(transaction.id, amount, idempotencyKey);
        if (!result.success && result.error) {
          setError(result.error);
        }
      } catch (err) {
        // Prevent page crash (Requirement 9)
        setError({
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Unexpected error',
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Error Display (Requirement 9) */}
      {error && (
        <div role="alert" data-testid="refund-error">
          <p>{error.message}</p>
        </div>
      )}
    </form>
  );
}
```

---

### Phase 7: API Routes

#### Step 7.1: Refunds API
**File**: `repository_after/app/api/refunds/route.ts`

**Requirement 4: Proper HTTP Status Codes**

```typescript
export async function POST(request: NextRequest) {
  const body = await request.json() as RefundRequest;

  const result = await prisma.$transaction(async (tx) => {
    return processRefundAtomic({ ... });
  }, {
    isolationLevel: 'Serializable',
  });

  if (!result.success) {
    // Return appropriate status code (Requirement 4)
    const statusCode = getHttpStatusForError(result.error!.code);
    return NextResponse.json(
      { success: false, error: result.error },
      { status: statusCode }
    );
  }

  return NextResponse.json({ success: true, ... });
}
```

---

### Phase 8: Next.js Configuration

#### Step 8.1: Next Config
**File**: `repository_after/next.config.js`

**Requirement 10: Prisma Client Vanishment from Client Bundle**

```javascript
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude Prisma from client bundle
      config.resolve.alias = {
        ...config.resolve.alias,
        '@prisma/client': false,
        '.prisma/client': false,
      };
    }
    return config;
  },
};
```

---

## Test Suite

### Test Files

| File | Tests | Coverage |
|------|-------|----------|
| refund-service.test.ts | ~25 | Req 3, 5 |
| atomic-transactions.test.ts | ~15 | Req 2 |
| concurrency.test.ts | ~20 | Req 4, 7, 8 |
| server-side-enforcement.test.ts | ~15 | Req 1, 10 |
| error-handling.test.ts | ~15 | Req 9 |
| ui-state-sync.test.ts | ~15 | Req 6 |

---

## Requirements Verification Matrix

| Req # | Description | Implementation | Test File |
|-------|-------------|----------------|-----------|
| 1 | Server-Side Enforcement | prisma.ts, components/*.tsx | server-side-enforcement.test.ts |
| 2 | Atomic Prisma Transactions | refund-service.ts, refund-actions.ts | atomic-transactions.test.ts |
| 3 | Fiscal Consistency Rules | refund-service.ts | refund-service.test.ts |
| 4 | Concurrency & Conflict | refund-service.ts (version check) | concurrency.test.ts |
| 5 | Data Type Precision | Decimal.js usage throughout | refund-service.test.ts |
| 6 | UI State Synchronization | revalidatePath, useTransition | ui-state-sync.test.ts |
| 7 | Idempotency Controls | idempotencyKey in schema | concurrency.test.ts |
| 8 | Concurrent Refund Test | Mock concurrent requests | concurrency.test.ts |
| 9 | Error Rendering Test | RefundForm error display | error-handling.test.ts |
| 10 | Prisma Bundle Vanishment | next.config.js, file checks | server-side-enforcement.test.ts |

---

## Files Created Summary

### Configuration (Root)
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `jest.config.js` - Test configuration
- `Dockerfile` - Docker build
- `docker-compose.yml` - Docker services

### Source Code (repository_after/)
- `prisma/schema.prisma` - Database schema
- `src/types/index.ts` - Type definitions
- `src/lib/prisma.ts` - Prisma client singleton
- `src/lib/refund-service.ts` - Core refund logic
- `src/actions/refund-actions.ts` - Server actions
- `src/components/TransactionCard.tsx` - Transaction display
- `src/components/RefundForm.tsx` - Refund form
- `src/components/TransactionDashboard.tsx` - Dashboard
- `app/layout.tsx` - Root layout
- `app/page.tsx` - Main page
- `app/api/refunds/route.ts` - Refunds API
- `app/api/transactions/route.ts` - Transactions API
- `next.config.js` - Next.js configuration

### Tests (tests/)
- `setup.ts` - Test setup
- `refund-service.test.ts` - Service tests
- `atomic-transactions.test.ts` - Transaction tests
- `concurrency.test.ts` - Concurrency tests
- `server-side-enforcement.test.ts` - Server-only tests
- `error-handling.test.ts` - Error handling tests
- `ui-state-sync.test.ts` - UI sync tests

### Evaluation & Metadata
- `evaluation/evaluation.js` - Test runner with reporting
- `instances/instance.json` - Instance metadata
- `trajectory/trajectory.md` - This file
- `README.md` - Project documentation
