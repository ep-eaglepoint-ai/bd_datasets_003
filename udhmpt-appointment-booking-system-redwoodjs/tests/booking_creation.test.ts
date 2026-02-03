import { createBooking } from '../repository_after/api/src/services/bookings/bookings';
import { Role, User } from '../repository_after/api/src/lib/auth';
import { DateTime } from 'luxon';

describe('Booking creation: transactions, capacity, cutoff, reference', () => {
  const customer: User = { id: 100, email: 'c@example.com', role: Role.CUSTOMER };

  test('Two parallel bookings → one fails when capacity=1', async () => {
    // In-memory mock datastore
    const state: any = {
      services: [{ id: 1, capacity: 1 }],
      bookings: [],
    };

    const prisma = buildMockPrisma(state);

    const start = DateTime.utc().plus({ days: 2 }).startOf('hour');
    const input = {
      providerId: 1,
      serviceId: 1,
      startUtcISO: start.toISO()!,
      endUtcISO: start.plus({ minutes: 60 }).toISO()!,
      customerEmail: 'a@x.com',
      cutoffHours: 1,
    };

    const p1 = createBooking(customer, input, prisma);
    const p2 = createBooking(customer, input, prisma);

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
  });

  test('Capacity >1 allows multiple bookings', async () => {
    const state: any = { services: [{ id: 2, capacity: 2 }], bookings: [] };
    const prisma = buildMockPrisma(state);

    const start = DateTime.utc().plus({ days: 2 }).startOf('hour');
    const input = { providerId: 2, serviceId: 2, startUtcISO: start.toISO()!, endUtcISO: start.plus({ minutes: 60 }).toISO()!, customerEmail: 'b@x.com', cutoffHours: 1 };

    const r1 = await createBooking(customer, input, prisma);
    const r2 = await createBooking(customer, input, prisma);
    expect(r1.reference).toBeTruthy();
    expect(r2.reference).toBeTruthy();
    expect(r1.reference).not.toBe(r2.reference);
  });

  test('Booking cutoff enforced', async () => {
    const state: any = { services: [{ id: 3, capacity: 1 }], bookings: [] };
    const prisma = buildMockPrisma(state);

    const start = DateTime.utc().plus({ hours: 1 }).startOf('hour');
    const input = { providerId: 3, serviceId: 3, startUtcISO: start.toISO()!, endUtcISO: start.plus({ minutes: 60 }).toISO()!, customerEmail: 'c@x.com', cutoffHours: 24 };

    await expect(createBooking(customer, input, prisma)).rejects.toThrow('Booking cutoff violated');
  });

  test('Reference is unique across bookings', async () => {
    const state: any = { services: [{ id: 4, capacity: 10 }], bookings: [] };
    const prisma = buildMockPrisma(state);
    const start = DateTime.utc().plus({ days: 3 }).startOf('hour');
    const input = { providerId: 4, serviceId: 4, startUtcISO: start.toISO()!, endUtcISO: start.plus({ minutes: 60 }).toISO()!, customerEmail: 'd@x.com', cutoffHours: 1 };

    const refs = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const r = await createBooking(customer, input, prisma);
      expect(refs.has(r.reference)).toBe(false);
      refs.add(r.reference);
    }
  });
});

// Helper: build a mock prisma that supports $transaction and basic find/count/create
function buildMockPrisma(state: any) {
  const lock = { inFlight: 0 };

  const prisma: any = {
    service: {
      findUnique: async ({ where }: any) => state.services.find((s: any) => s.id === where.id) || null,
    },
    booking: {
      count: async ({ where }: any) => {
        // count bookings with same serviceId and exact startUtc
        return state.bookings.filter((b: any) => b.serviceId === where.serviceId && b.startUtc.getTime() === where.startUtc.getTime()).length;
      },
      create: async ({ data }: any) => {
        const rec = { ...data };
        // emulate created record shape
        state.bookings.push(rec);
        return rec;
      }
    },
    $transaction: async (cb: any) => {
      // serialize transactions to simulate DB isolation
      while (lock.inFlight > 0) {
        await new Promise(res => setTimeout(res, 1));
      }
      lock.inFlight++;
      try {
        const tx = prisma; // tx shares same state (simple mock)
        const r = await cb(tx);
        return r;
      } finally {
        lock.inFlight--;
      }
    }
  };
  return prisma;
}
