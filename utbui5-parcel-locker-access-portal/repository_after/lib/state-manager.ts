import { prisma } from './db';
import { LOCKER_STATUS, PARCEL_STATUS } from './constants';

export async function revalidateExpiredParcels(): Promise<void> {
  try {
    const now = new Date();
    const expiredParcels = await prisma.parcel.findMany({
      where: {
        status: PARCEL_STATUS.OCCUPIED,
        expiresAt: {
          lt: now,
        },
      },
      include: {
        locker: true,
      },
    });

    for (const parcel of expiredParcels) {
      await prisma.$transaction([
        prisma.parcel.update({
          where: { id: parcel.id },
          data: { status: PARCEL_STATUS.EXPIRED },
        }),
        prisma.locker.update({
          where: { id: parcel.lockerId },
          data: { status: LOCKER_STATUS.EXPIRED },
        }),
      ]);
    }
  } catch (error: any) {
    if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
      console.warn('Database not initialized. Skipping revalidation.');
      return;
    }
    throw error;
  }
}

export async function isLockerAvailable(lockerId: number): Promise<boolean> {
  try {
    const locker = await prisma.locker.findUnique({
      where: { id: lockerId },
    });

    if (!locker) {
      return false;
    }

    return locker.status === LOCKER_STATUS.AVAILABLE;
  } catch (error: any) {
    if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
      throw new Error('Database not initialized. Please run: pnpm db:push && pnpm db:init');
    }
    throw error;
  }
}

export async function releaseLocker(lockerId: number): Promise<void> {
  await prisma.locker.update({
    where: { id: lockerId },
    data: { status: LOCKER_STATUS.AVAILABLE },
  });
}
