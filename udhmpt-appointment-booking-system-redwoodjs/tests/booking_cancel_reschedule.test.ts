import { createBooking, cancelBooking, cancelBookingWithDetails, rescheduleBooking } from '../repository_after/api/src/services/bookings/bookings';
import { Role, User } from '../repository_after/api/src/lib/auth';
import { DateTime } from 'luxon';

describe('Cancel and Reschedule rules', () => {
  const customer: User = { id: 200, email: 'cust@example.com', role: Role.CUSTOMER };

  test('Cancel inside window succeeds', async () => {
    const state: any = { services: [{ id: 10, capacity: 1 }], bookings: [] };
    const prisma = buildMockPrisma(state);

    // Create booking 5 days from now (fixed date for Docker/Luxon compatibility)
    const start = DateTime.fromISO('2026-02-25T12:00:00Z', { zone: 'utc' });
    const endStart = start.plus({ minutes: 60 });
    const booking = await createBooking(customer, { providerId: 10, serviceId: 10, startUtcISO: start.toISO()!, endUtcISO: endStart.toISO()!, customerEmail: 'cust@example.com', cutoffHours: 1 }, prisma);

    // cancelWindowHours = 24 (must cancel earlier than 24 hours before start) -> now is earlier, so should succeed
    const canceled = await cancelBooking(customer, booking.id || 0, prisma, 24);
    expect(canceled.canceledAt).toBeTruthy();
  });

  test('Cancel outside window fails', async () => {
    const state: any = { services: [{ id: 11, capacity: 1 }], bookings: [] };
    const prisma = buildMockPrisma(state);

    // Create booking 6 hours from now so now+24h >= start => cannot cancel (use Date for Docker/Luxon)
    const in6h = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const start = DateTime.fromJSDate(in6h, { zone: 'utc' }).startOf('hour');
    const endStart = start.plus({ minutes: 60 });
    const booking = await createBooking(customer, { providerId: 11, serviceId: 11, startUtcISO: start.toISO()!, endUtcISO: endStart.toISO()!, customerEmail: 'cust@example.com', cutoffHours: 1 }, prisma);

    // cancelWindowHours = 24 -> now +24h >= start => cannot cancel
    await expect(cancelBooking(customer, booking.id || 0, prisma, 24)).rejects.toThrow('Cancellation window violated');
  });

  test('Reschedule respects same rules', async () => {
    const state: any = { services: [{ id: 12, capacity: 2 }], bookings: [] };
    const prisma = buildMockPrisma(state);

    const start = DateTime.fromISO('2026-02-20T10:00:00Z', { zone: 'utc' });
    const endStart = start.plus({ minutes: 60 });
    const booking = await createBooking(customer, { providerId: 12, serviceId: 12, startUtcISO: start.toISO()!, endUtcISO: endStart.toISO()!, customerEmail: 'cust@example.com', cutoffHours: 1 }, prisma);

    // Attempt to reschedule to a slot within cutoff (2 hours from now)
    const in2h = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const tooSoon = DateTime.fromJSDate(in2h, { zone: 'utc' }).startOf('hour').toISO()!;
    await expect(rescheduleBooking(customer, booking.id || 0, tooSoon, DateTime.fromISO(tooSoon).plus({ minutes: 60 }).toISO()!, prisma, 24)).rejects.toThrow('Booking cutoff violated');

    // Reschedule to a valid future slot beyond cutoff
    const newStart = DateTime.fromISO('2026-02-22T14:00:00Z', { zone: 'utc' }).toISO()!;
    const updated = await rescheduleBooking(customer, booking.id || 0, newStart, DateTime.fromISO(newStart).plus({ minutes: 60 }).toISO()!, prisma, 24);
    expect(DateTime.fromJSDate(updated.startUtc).toISO()).toContain(DateTime.fromISO(newStart).toISO()?.slice(0,19));
  });

  test('Cancel outside window succeeds when penaltiesApplyForLateCancel is true', async () => {
    const state: any = { services: [{ id: 13, capacity: 1 }], bookings: [] };
    const prisma = buildMockPrisma(state);

    // Booking 6 hours from now so now+24h >= start => without policy, cancel throws
    const in6h = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const start = DateTime.fromJSDate(in6h, { zone: 'utc' }).startOf('hour');
    const endStart = start.plus({ minutes: 60 });
    const booking = await createBooking(customer, { providerId: 13, serviceId: 13, startUtcISO: start.toISO()!, endUtcISO: endStart.toISO()!, customerEmail: 'cust@example.com', cutoffHours: 1 }, prisma);

    // Without policy: late cancel should throw
    await expect(cancelBooking(customer, booking.id || 0, prisma, 24)).rejects.toThrow('Cancellation window violated');

    // With penaltiesApplyForLateCancel: late cancel is allowed (with penalty)
    const policy = { cancellationWindowHours: 24, cancellationFeeCents: 2500, penaltiesApplyForLateCancel: true };
    const canceled = await cancelBooking(customer, booking.id || 0, prisma, 24, policy);
    expect(canceled.canceledAt).toBeTruthy();
  });

  test('Cancel with policy returns penaltyApplied and feeCents when canceling late', async () => {
    const state: any = { services: [{ id: 14, capacity: 1 }], bookings: [] };
    const prisma = buildMockPrisma(state);

    // Booking 6 hours from now so we are "outside" window => penalty applies
    const in6h = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const start = DateTime.fromJSDate(in6h, { zone: 'utc' }).startOf('hour');
    const endStart = start.plus({ minutes: 60 });
    const booking = await createBooking(customer, { providerId: 14, serviceId: 14, startUtcISO: start.toISO()!, endUtcISO: endStart.toISO()!, customerEmail: 'cust@example.com', cutoffHours: 1 }, prisma);

    const policy = { cancellationWindowHours: 24, cancellationFeeCents: 1500, penaltiesApplyForLateCancel: true };
    const result = await cancelBookingWithDetails(customer, booking.id || 0, prisma, 24, policy);

    expect(result.booking.canceledAt).toBeTruthy();
    expect(result.penaltyApplied).toBe(true);
    expect(result.feeCents).toBe(1500);
  });
});

// Reuse the in-memory mock Prisma builder from booking tests, but redefine here for isolation
function buildMockPrisma(state: any) {
  const lock = { inFlight: 0 };
  // assign incremental id for bookings
  let idSeq = 1;

  const prisma: any = {
    providerProfile: {
      findUnique: async ({ where }: any) => (where.id ? { id: where.id, maxBookingsPerDay: null } : null),
    },
    service: {
      findUnique: async ({ where }: any) => state.services.find((s: any) => s.id === where.id) || null,
    },
    booking: {
      findUnique: async ({ where }: any) => state.bookings.find((b: any) => b.id === where.id) || null,
      count: async ({ where }: any) => {
        return state.bookings.filter((b: any) => b.serviceId === where.serviceId && b.startUtc.getTime() === where.startUtc.getTime() && (!where.canceledAt || b.canceledAt === null)).length;
      },
      create: async ({ data }: any) => {
        const rec = { id: idSeq++, ...data };
        state.bookings.push(rec);
        return rec;
      },
      update: async ({ where, data }: any) => {
        const idx = state.bookings.findIndex((b: any) => b.id === where.id);
        if (idx === -1) throw new Error('Not found');
        state.bookings[idx] = { ...state.bookings[idx], ...data };
        return state.bookings[idx];
      }
    },
    $transaction: async (cb: any) => {
      while (lock.inFlight > 0) {
        await new Promise(res => setTimeout(res, 1));
      }
      lock.inFlight++;
      try {
        const tx = prisma;
        const r = await cb(tx);
        return r;
      } finally {
        lock.inFlight--;
      }
    }
  };
  return prisma;
}
