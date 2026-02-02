// API route for courier check-in
// Handles package registration and secure PIN generation

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateSecurePin, hashPin } from '@/lib/security';
import { isLockerAvailable } from '@/lib/state-manager';
import { LOCKER_STATUS, PARCEL_STATUS, PIN_EXPIRATION_MS } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { recipientEmail, lockerId } = body;

    // Validate input
    if (!recipientEmail || !lockerId) {
      return NextResponse.json(
        { error: 'Recipient email and locker ID are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if locker is available (collision prevention)
    const available = await isLockerAvailable(lockerId);
    if (!available) {
      return NextResponse.json(
        { error: 'Locker is already occupied' },
        { status: 409 }
      );
    }

    // Generate secure PIN and hash it
    const rawPin = generateSecurePin();
    const pinHash = await hashPin(rawPin);

    // Calculate expiration time (48 hours from now)
    const expiresAt = new Date(Date.now() + PIN_EXPIRATION_MS);

    // Create parcel and update locker status in a transaction
    const parcel = await prisma.$transaction(async (tx) => {
      // Create parcel with hashed PIN
      const newParcel = await tx.parcel.create({
        data: {
          recipient: recipientEmail,
          lockerId: lockerId,
          pinHash: pinHash,
          expiresAt: expiresAt,
          status: PARCEL_STATUS.OCCUPIED,
        },
      });

      // Update locker status to OCCUPIED
      await tx.locker.update({
        where: { id: lockerId },
        data: { status: LOCKER_STATUS.OCCUPIED },
      });

      return newParcel;
    });

    // Return the raw PIN only once to the courier (never stored in DB)
    return NextResponse.json({
      success: true,
      parcelId: parcel.id,
      pin: rawPin, // Show PIN only once during check-in
      expiresAt: expiresAt.toISOString(),
      message: 'Package checked in successfully',
    });
  } catch (error) {
    console.error('Check-in error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
