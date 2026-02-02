// API route for state revalidation
// Background worker endpoint to transition expired parcels

import { NextResponse } from 'next/server';
import { revalidateExpiredParcels } from '@/lib/state-manager';

export async function POST() {
  try {
    await revalidateExpiredParcels();
    return NextResponse.json({
      success: true,
      message: 'State revalidation completed',
    });
  } catch (error) {
    console.error('Revalidation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
