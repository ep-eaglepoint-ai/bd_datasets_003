// API route for resident PIN verification
// Requires both email and PIN for security (prevents listing all parcels)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPin } from '@/lib/security';
import { revalidateExpiredParcels } from '@/lib/state-manager';
import { PARCEL_STATUS, LOCKER_STATUS } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { recipientEmail, pin } = body;

    // Validate input
    if (!recipientEmail || !pin) {
      return NextResponse.json(
        { error: 'Recipient email and PIN are required' },
        { status: 400 }
      );
    }

    // Validate PIN format (6 digits)
    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json(
        { error: 'Invalid PIN format. PIN must be 6 digits' },
        { status: 400 }
      );
    }

    // Revalidate expired parcels before checking
    await revalidateExpiredParcels();

    // Find parcel by recipient email and status (OCCUPIED or EXPIRED)
    // Note: We cannot search by PIN hash directly, so we check all parcels for this email
    const parcels = await prisma.parcel.findMany({
      where: {
        recipient: recipientEmail,
        status: {
          in: [PARCEL_STATUS.OCCUPIED, PARCEL_STATUS.EXPIRED],
        },
      },
      include: {
        locker: true,
      },
      orderBy: {
        createdAt: 'desc', // Most recent first
      },
    });

    if (parcels.length === 0) {
      return NextResponse.json(
        { error: 'No package found for this email' },
        { status: 404 }
      );
    }

    // Check if any parcel has expired
    const now = new Date();
    const expiredParcel = parcels.find(
      (p) => p.status === PARCEL_STATUS.EXPIRED || p.expiresAt < now
    );
    if (expiredParcel) {
      return NextResponse.json(
        { error: 'PIN expired' },
        { status: 410 }
      );
    }

    // Verify PIN against all active parcels for this email
    let verifiedParcel = null;
    for (const parcel of parcels) {
      const isValid = await verifyPin(pin, parcel.pinHash);
      if (isValid) {
        verifiedParcel = parcel;
        break;
      }
    }

    if (!verifiedParcel) {
      return NextResponse.json(
        { error: 'Invalid PIN' },
        { status: 401 }
      );
    }

    // Check if parcel is already collected
    if (verifiedParcel.status === PARCEL_STATUS.COLLECTED) {
      return NextResponse.json(
        { error: 'Locker already empty' },
        { status: 409 }
      );
    }

    // Mark parcel as COLLECTED and release locker
    // Use transaction with increased timeout and do both updates in the same transaction
    await prisma.$transaction(
      async (tx) => {
        await tx.parcel.update({
          where: { id: verifiedParcel!.id },
          data: { status: PARCEL_STATUS.COLLECTED },
        });
        await tx.locker.update({
          where: { id: verifiedParcel!.lockerId },
          data: { status: LOCKER_STATUS.AVAILABLE },
        });
      },
      {
        timeout: 10000, // 10 seconds timeout
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Package collected successfully',
      lockerId: verifiedParcel.lockerId,
    });
  } catch (error) {
    console.error('PIN verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
