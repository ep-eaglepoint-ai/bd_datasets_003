/**
 * API Route: Transactions
 *
 * REST API endpoint for transaction operations.
 *
 * Requirement 1: Server-side only Prisma operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { Decimal } from 'decimal.js';
import { prisma } from '../../../src/lib/prisma';
import { toTransactionWithBalance } from '../../../src/lib/refund-service';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  try {
    if (id) {
      // Get single transaction
      const transaction = await prisma.transaction.findUnique({
        where: { id },
        include: { refunds: true },
      });

      if (!transaction) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'TRANSACTION_NOT_FOUND',
              message: `Transaction ${id} not found`,
            },
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        transaction: toTransactionWithBalance(transaction),
      });
    }

    // Get all transactions
    const transactions = await prisma.transaction.findMany({
      include: { refunds: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      transactions: transactions.map(toTransactionWithBalance),
    });
  } catch (error) {
    console.error('API get transactions error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch transactions',
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, currency = 'USD' } = body;

    if (!amount) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Amount is required',
          },
        },
        { status: 400 }
      );
    }

    const decimalAmount = new Decimal(amount.toString());

    if (decimalAmount.lessThanOrEqualTo(0)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_AMOUNT',
            message: 'Amount must be positive',
          },
        },
        { status: 400 }
      );
    }

    const transaction = await prisma.transaction.create({
      data: {
        amount: decimalAmount.toFixed(2),
        currency,
        status: 'SETTLED',
      },
      include: { refunds: true },
    });

    return NextResponse.json({
      success: true,
      transaction: toTransactionWithBalance(transaction),
    });
  } catch (error) {
    console.error('API create transaction error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create transaction',
        },
      },
      { status: 500 }
    );
  }
}
