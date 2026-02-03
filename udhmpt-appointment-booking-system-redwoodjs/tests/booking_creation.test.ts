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

    const start = DateTime.fromISO('2026-02-15T12:00:00Z', { zone: 'utc' });
    const endStart = start.plus({ minutes: 60 });
    const input = {
      providerId: 1,
      serviceId: 1,
      startUtcISO: start.toISO()!,
      endUtcISO: endStart.toISO()!,
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

    const start = DateTime.fromISO('2026-02-16T12:00:00Z', { zone: 'utc' });
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

    const in1h = new Date(Date.now() + 60 * 60 * 1000);
    const start = DateTime.fromJSDate(in1h, { zone: 'utc' }).startOf('hour');
    const input = { providerId: 3, serviceId: 3, startUtcISO: start.toISO()!, endUtcISO: start.plus({ minutes: 60 }).toISO()!, customerEmail: 'c@x.com', cutoffHours: 24 };

    await expect(createBooking(customer, input, prisma)).rejects.toThrow('Booking cutoff violated');
  });

  test('Reference is unique across bookings', async () => {
    const state: any = { services: [{ id: 4, capacity: 10 }], bookings: [] };
    const prisma = buildMockPrisma(state);
    const start = DateTime.fromISO('2026-02-18T12:00:00Z', { zone: 'utc' });
    const input = { providerId: 4, serviceId: 4, startUtcISO: start.toISO()!, endUtcISO: start.plus({ minutes: 60 }).toISO()!, customerEmail: 'd@x.com', cutoffHours: 1 };

    const refs = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const r = await createBooking(customer, input, prisma);
      expect(refs.has(r.reference)).toBe(false);
      refs.add(r.reference);
    }
  });

  test('Max bookings per day enforced when provider has limit', async () => {
    const state: any = { services: [{ id: 5, capacity: 1 }], bookings: [] };
    const prisma = buildMockPrisma(state, { maxBookingsPerDay: 1 });

    const dayStart = DateTime.fromISO('2026-02-12T00:00:00Z', { zone: 'utc' });
    const slot1 = dayStart.set({ hour: 9, minute: 0, second: 0 });
    const slot2 = dayStart.set({ hour: 14, minute: 0, second: 0 });

    const input1 = {
      providerId: 5,
      serviceId: 5,
      startUtcISO: slot1.toISO()!,
      endUtcISO: slot1.plus({ minutes: 60 }).toISO()!,
      customerEmail: 'first@x.com',
      cutoffHours: 1,
    };
    const first = await createBooking(customer, input1, prisma);
    expect(first.reference).toBeTruthy();

    const input2 = {
      providerId: 5,
      serviceId: 5,
      startUtcISO: slot2.toISO()!,
      endUtcISO: slot2.plus({ minutes: 60 }).toISO()!,
      customerEmail: 'second@x.com',
      cutoffHours: 1,
    };
    await expect(createBooking(customer, input2, prisma)).rejects.toThrow('Maximum bookings per day reached');
  });
});

// Helper: build a mock prisma that supports $transaction and basic find/count/create
function buildMockPrisma(state: any, options?: { maxBookingsPerDay?: number | null }) {
  const lock = { inFlight: 0 };
  const maxBookingsPerDay = options?.maxBookingsPerDay !== undefined ? options.maxBookingsPerDay : null;

  const prisma: any = {
    providerProfile: {
      findUnique: async ({ where }: any) => (where.id ? { id: where.id, maxBookingsPerDay } : null),
    },
    service: {
      findUnique: async ({ where }: any) => state.services.find((s: any) => s.id === where.id) || null,
    },
    booking: {
      count: async ({ where }: any) => {
        if (where.providerId != null && where.startUtc?.gte != null && where.startUtc?.lte != null) {
          const gte = where.startUtc.gte.getTime();
          const lte = where.startUtc.lte.getTime();
          return state.bookings.filter((b: any) => b.providerId === where.providerId && !b.canceledAt && b.startUtc.getTime() >= gte && b.startUtc.getTime() <= lte).length;
        }
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
      while (lock.inFlight > 0) {
        await new Promise(res => setTimeout(res, 1));
      }
      lock.inFlight++;
      try {
        const r = await cb(prisma);
        return r;
      } finally {
        lock.inFlight--;
      }
    }
  };
  return prisma;
}
