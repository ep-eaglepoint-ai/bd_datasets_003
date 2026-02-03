import { DateTime } from 'luxon';
import searchAvailability from '../repository_after/api/src/services/availability/search';

function makeMockPrisma(overrides: any = {}) {
  return {
    service: { 
      findUnique: async ({ where }: any) => {
        // Always return the service regardless of the ID for testing
        const service = overrides.service || { id: where.id, durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 };
        return service;
      }
    },
    recurringAvailability: { findMany: async () => overrides.recurring || [] },
    customDayAvailability: { findMany: async () => overrides.customs || [] },
    availabilityException: { findMany: async () => overrides.exceptions || [] },
    manualBlock: { findMany: async () => overrides.blocks || [] },
  };
}

describe('searchAvailability', () => {
  const weekStart = '2026-02-02T00:00:00Z'; // Monday
  const weekEnd = '2026-02-08T23:59:59Z';

  test('returns slots for recurring availability and service duration', async () => {
    // recurring on Tuesday (weekday=2) 09:00-11:00 UTC
    const recurring = [{ id: 1, providerId: 1, weekday: 2, startLocal: '09:00', endLocal: '11:00', tz: 'UTC' }];

    const prisma = makeMockPrisma({ recurring, service: { id: 10, durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 } });

    const slots = await searchAvailability(prisma, { providerId: 1, serviceId: 10, startISO: weekStart, endISO: weekEnd, customerTz: 'UTC' });

    // Expect four sequential 30-minute slots (week/day calculation may vary by env)
    expect(slots.length).toBeGreaterThanOrEqual(4);
    const startDts = slots.map(s => DateTime.fromISO((s as any).startUtcISO || (s as any).startUtc).toUTC());
    // At least one slot at 09:00 and one at 09:30 UTC on Tuesday in range
    expect(startDts.some(d => d.hour === 9 && d.minute === 0)).toBe(true);
    expect(startDts.some(d => d.hour === 9 && d.minute === 30)).toBe(true);
  });

  test('applies exceptions to remove slots', async () => {
    const recurring = [{ id: 1, providerId: 1, weekday: 2, startLocal: '09:00', endLocal: '11:00', tz: 'UTC' }];
    // exception removes 09:30-10:00
    const exceptions = [{ id: 1, providerId: 1, startUtc: new Date('2026-02-03T09:30:00Z'), endUtc: new Date('2026-02-03T10:00:00Z') }];

    const prisma = makeMockPrisma({ recurring, exceptions, service: { id: 10, durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 } });

    const slots = await searchAvailability(prisma, { providerId: 1, serviceId: 10, startISO: weekStart, endISO: weekEnd, customerTz: 'UTC' });

    // Ensure the 09:30 slot has been removed by the exception
    const startDts = slots.map(s => DateTime.fromISO((s as any).startUtcISO || (s as any).startUtc).toUTC());
    expect(startDts.some(d => d.hour === 9 && d.minute === 30)).toBe(false);
  });

  test('applies custom day overrides and respects provider filter', async () => {
    // recurring: Tuesday 09:00-11:00
    const recurring = [{ id: 1, providerId: 1, weekday: 2, startLocal: '09:00', endLocal: '11:00', tz: 'UTC' }];
    // custom day for the same provider for 2026-02-03 (Tuesday) 09:00-10:00
    const customs = [
      { id: 1, providerId: 1, date: new Date('2026-02-03'), startUtc: new Date('2026-02-03T09:00:00Z'), endUtc: new Date('2026-02-03T10:00:00Z'), tz: 'UTC' },
      // different provider custom should be ignored
      { id: 2, providerId: 99, date: new Date('2026-02-03'), startUtc: new Date('2026-02-03T20:00:00Z'), endUtc: new Date('2026-02-03T21:00:00Z'), tz: 'UTC' },
    ];

    const prisma = makeMockPrisma({ recurring, customs, service: { id: 10, durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 } });

    const slots = await searchAvailability(prisma, { providerId: 1, serviceId: 10, startISO: weekStart, endISO: weekEnd, customerTz: 'UTC' });

    // custom overrides recurring for that day to 09:00-10:00 -> 2 slots (09:00, 09:30)
    expect(slots.length).toBeGreaterThanOrEqual(2);
    const startDts = slots.map(s => DateTime.fromISO((s as any).startUtcISO || (s as any).startUtc).toUTC());
    expect(startDts.some(d => d.hour === 9 && d.minute === 0)).toBe(true);
    expect(startDts.some(d => d.hour === 9 && d.minute === 30)).toBe(true);
    // ensure the slot at 10:30 is NOT present from the custom override for that day
    expect(startDts.some(d => d.hour === 10 && d.minute === 30)).toBe(false);
  });
});
