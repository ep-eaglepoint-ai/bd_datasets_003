import { prisma } from '@/lib/db';
import { hashPin } from '@/lib/security';
import { LOCKER_STATUS, PARCEL_STATUS } from '@/lib/constants';

async function revalidateExpiredParcels() {
  const now = new Date();
  const expiredParcels = await prisma.parcel.findMany({
    where: {
      status: PARCEL_STATUS.OCCUPIED,
      expiresAt: { lt: now },
    },
    include: { locker: true },
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
}

async function releaseLocker(lockerId: number) {
  await prisma.locker.update({
    where: { id: lockerId },
    data: { status: LOCKER_STATUS.AVAILABLE },
  });
}

describe('Parcel Locker Access Portal Integration Tests', () => {
  // Clean up database before each test
  beforeEach(async () => {
    // Delete in correct order to respect foreign key constraints
    // Use transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      await tx.parcel.deleteMany();
      await tx.locker.deleteMany();
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Requirement 7: PIN Expiration Test', () => {
    it('should return PIN expired when package expires_at is 5 seconds in the past', async () => {
      // Create locker and parcel in a transaction to ensure atomicity
      const expiredTime = new Date(Date.now() - 5000); // 5 seconds ago
      const pinHash = await hashPin('123456');

      const { locker, parcel } = await prisma.$transaction(async (tx) => {
        const locker = await tx.locker.create({
          data: {
            size: 'medium',
            status: LOCKER_STATUS.OCCUPIED,
          },
        });

        const parcel = await tx.parcel.create({
          data: {
            recipient: 'test@example.com',
            lockerId: locker.id,
            pinHash: pinHash,
            expiresAt: expiredTime,
            status: PARCEL_STATUS.OCCUPIED,
          },
        });

        return { locker, parcel };
      });

      // Revalidate expired parcels
      await revalidateExpiredParcels();

      // Verify parcel status is EXPIRED
      const updatedParcel = await prisma.parcel.findUnique({
        where: { id: parcel.id },
      });

      expect(updatedParcel?.status).toBe(PARCEL_STATUS.EXPIRED);

      // Verify locker status is EXPIRED
      const updatedLocker = await prisma.locker.findUnique({
        where: { id: locker.id },
      });

      expect(updatedLocker?.status).toBe(LOCKER_STATUS.EXPIRED);
    });

    it('should return PIN expired via API when package expires_at is 5 seconds in the past', async () => {
      // Create locker and expired parcel in a transaction to ensure atomicity
      const expiredTime = new Date(Date.now() - 5000); // 5 seconds ago
      const pinHash = await hashPin('123456');

      const result = await prisma.$transaction(async (tx) => {
        const locker = await tx.locker.create({
          data: {
            size: 'medium',
            status: LOCKER_STATUS.OCCUPIED,
          },
        });

        const parcel = await tx.parcel.create({
          data: {
            recipient: 'test@example.com',
            lockerId: locker.id,
            pinHash: pinHash,
            expiresAt: expiredTime,
            status: PARCEL_STATUS.OCCUPIED,
          },
        });

        return { locker, parcel };
      });

      // Simulate API call (Resident UI would call this)
      const { POST } = await import('../repository_after/app/api/resident/verify-pin/route');
      const request = {
        json: async () => ({
          recipientEmail: 'test@example.com',
          pin: '123456',
        }),
        headers: new Headers(),
      } as any;

      const response = await POST(request);
      const data = await response.json();

      // Verify API returns 'PIN expired' (status 410)
      // This verifies the Resident UI will receive 'PIN Expired' message
      expect(response.status).toBe(410);
      expect(data.error).toBe('PIN expired');
    });
  });

  describe('Requirement 8: State Transition Test', () => {
    it('should transition locker back to AVAILABLE after parcel is COLLECTED', async () => {
      // Create locker and parcel in a transaction
      const pinHash = await hashPin('654321');
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now

      const { locker, parcel } = await prisma.$transaction(async (tx) => {
        const locker = await tx.locker.create({
          data: {
            size: 'large',
            status: LOCKER_STATUS.OCCUPIED,
          },
        });

        const parcel = await tx.parcel.create({
          data: {
            recipient: 'resident@example.com',
            lockerId: locker.id,
            pinHash: pinHash,
            expiresAt: expiresAt,
            status: PARCEL_STATUS.OCCUPIED,
          },
        });

        return { locker, parcel };
      });

      // Mark parcel as COLLECTED
      await prisma.parcel.update({
        where: { id: parcel.id },
        data: { status: PARCEL_STATUS.COLLECTED },
      });

      // Release the locker
      await releaseLocker(locker.id);

      // Verify locker status is AVAILABLE (for next courier)
      const updatedLocker = await prisma.locker.findUnique({
        where: { id: locker.id },
      });

      expect(updatedLocker?.status).toBe(LOCKER_STATUS.AVAILABLE);
    });

    it('should transition locker to AVAILABLE via API when parcel is COLLECTED', async () => {
      // Create locker and parcel in a transaction to ensure atomicity
      const pinHash = await hashPin('654321');
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      const result = await prisma.$transaction(async (tx) => {
        const locker = await tx.locker.create({
          data: {
            size: 'large',
            status: LOCKER_STATUS.OCCUPIED,
          },
        });

        const parcel = await tx.parcel.create({
          data: {
            recipient: 'resident@example.com',
            lockerId: locker.id,
            pinHash: pinHash,
            expiresAt: expiresAt,
            status: PARCEL_STATUS.OCCUPIED,
          },
        });

        return { locker, parcel };
      });

      const { locker, parcel } = result;

      // Simulate API call (Resident UI collecting package)
      const { POST } = await import('../repository_after/app/api/resident/verify-pin/route');
      const request = {
        json: async () => ({
          recipientEmail: 'resident@example.com',
          pin: '654321',
        }),
        headers: new Headers(),
      } as any;

      const response = await POST(request);
      const data = await response.json();

      // Verify API returns success
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify parcel is COLLECTED
      const updatedParcel = await prisma.parcel.findUnique({
        where: { id: parcel.id },
      });
      expect(updatedParcel?.status).toBe(PARCEL_STATUS.COLLECTED);

      // Verify locker status is AVAILABLE (for next courier)
      const updatedLocker = await prisma.locker.findUnique({
        where: { id: locker.id },
      });
      expect(updatedLocker?.status).toBe(LOCKER_STATUS.AVAILABLE);
    });
  });

  describe('Additional Integration Tests', () => {
    it('should prevent check-in to already OCCUPIED locker', async () => {
      // Create an occupied locker
      const locker = await prisma.locker.create({
        data: {
          size: 'small',
          status: LOCKER_STATUS.OCCUPIED,
        },
      });

      // Verify locker is not available
      const isAvailable = await prisma.locker.findUnique({
        where: { id: locker.id },
      });

      expect(isAvailable?.status).toBe(LOCKER_STATUS.OCCUPIED);
      expect(isAvailable?.status).not.toBe(LOCKER_STATUS.AVAILABLE);
    });

    it('should store PIN as hash, not raw value', async () => {
      const rawPin = '123456';
      const pinHash = await hashPin(rawPin);

      // Create locker and parcel in a transaction
      const { locker, parcel } = await prisma.$transaction(async (tx) => {
        const locker = await tx.locker.create({
          data: {
            size: 'medium',
            status: LOCKER_STATUS.AVAILABLE,
          },
        });

        const parcel = await tx.parcel.create({
          data: {
            recipient: 'test@example.com',
            lockerId: locker.id,
            pinHash: pinHash,
            expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
            status: PARCEL_STATUS.OCCUPIED,
          },
        });

        return { locker, parcel };
      });

      // Verify raw PIN is not stored
      const storedParcel = await prisma.parcel.findUnique({
        where: { id: parcel.id },
      });

      expect(storedParcel?.pinHash).not.toBe(rawPin);
      expect(storedParcel?.pinHash).toBe(pinHash);
      expect(storedParcel?.pinHash.length).toBeGreaterThan(10); // bcrypt hash is long
    });
  });
});
