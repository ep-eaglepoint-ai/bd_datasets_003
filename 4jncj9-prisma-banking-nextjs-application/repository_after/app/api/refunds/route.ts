/**
 * API Route: Refunds
 *
 * REST API endpoint for processing refunds.
 * Alternative to Server Actions for external integrations.
 *
 * Requirements covered:
 * - Requirement 1: Server-side only Prisma operations
 * - Requirement 2: Atomic transactions
 * - Requirement 4: Proper HTTP status codes for conflicts
 */

import { NextRequest, NextResponse } from 'next/server';
import { Decimal } from 'decimal.js';
import { prisma } from '../../../src/lib/prisma';
import {
  validateRefundRequest,
  processRefundAtomic,
  getHttpStatusForError,
} from '../../../src/lib/refund-service';
import { RefundRequest } from '../../../src/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as RefundRequest;

    // Validate request
    const validation = validateRefundRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: getHttpStatusForError(validation.error!.code) }
      );
    }

    const refundAmount = new Decimal(body.amount.toString());

    // Execute within atomic transaction (Requirement 2)
    const result = await prisma.$transaction(async (tx) => {
      return processRefundAtomic({
        prisma: tx,
        transactionId: body.transactionId,
        refundAmount,
        idempotencyKey: body.idempotencyKey,
      });
    }, {
      isolationLevel: 'Serializable',
    });

    if (!result.success) {
      // Requirement 4: Return appropriate status code
      const statusCode = getHttpStatusForError(result.error!.code);
      return NextResponse.json(
        { success: false, error: result.error },
        { status: statusCode }
      );
    }

    return NextResponse.json({
      success: true,
      refund: result.refund,
      transaction: result.transaction,
    });
  } catch (error) {
    console.error('API refund error:', error);

    // Check for serialization/concurrency errors
    if (error instanceof Error) {
      if (error.message.includes('could not serialize') ||
          error.message.includes('deadlock')) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'CONCURRENT_MODIFICATION',
              message: 'Transaction was modified concurrently. Please retry.',
            },
          },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const transactionId = searchParams.get('transactionId');

  try {
    if (transactionId) {
      // Get refunds for a specific transaction
      const refunds = await prisma.refund.findMany({
        where: { transactionId },
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({ success: true, refunds });
    }

    // Get all refunds
    const refunds = await prisma.refund.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ success: true, refunds });
  } catch (error) {
    console.error('API get refunds error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch refunds',
        },
      },
      { status: 500 }
    );
  }
}
