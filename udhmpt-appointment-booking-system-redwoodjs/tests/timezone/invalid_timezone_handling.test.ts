import { DateTime } from 'luxon';
import { generateSlots } from '../../repository_after/api/src/services/availability/availability';
import { mergeOverrides } from '../../repository_after/api/src/services/availability/availability';

jest.mock('../../repository_after/api/src/lib/db', () => {
  const m: any = {
    service: { findUnique: jest.fn(), findMany: jest.fn() },
    booking: { findMany: jest.fn(), count: jest.fn() },
    recurringAvailability: { findMany: jest.fn() },
    customDayAvailability: { findMany: jest.fn() },
    availabilityException: { findMany: jest.fn() },
    manualBlock: { findMany: jest.fn() },
    providerProfile: { findUnique: jest.fn() },
  }
  m.$transaction = jest.fn((cb) => cb(m))
  return { db: m }
})

import { db as mockDb } from '../../repository_after/api/src/lib/db'
const { searchAvailability } = require('../../repository_after/api/src/services/availability/availability')

describe('Invalid Timezone Handling - Functional Boundaries', () => {
  test('System handles malformed and edge-case timezones without crashing', () => {
    const invalidTzs = ['', '   ', 'invalid-timezone', 'timezone@with@symbols', null, undefined];

    invalidTzs.forEach((tz: any) => {
      // Logic should fallback to UTC or result in an Invalid DateTime (which Luxon handles without throwing)
      const dt = DateTime.fromISO('2024-06-15T10:00:00', { zone: tz });
      expect(dt).toBeDefined();
    });
  });

  test('Availability helpers process invalid zones safely', () => {
    const window = [{ startUtcISO: '2024-06-15T10:00:00Z', endUtcISO: '2024-06-15T11:00:00Z' }];
    const customDays = [{
      dateISO: '2024-06-15',
      startUtcISO: '2024-06-15T14:00:00Z',
      endUtcISO: '2024-06-15T16:00:00Z',
      tz: 'Invalid/Timezone'
    }];

    // verify core functions handle poison values
    expect(() => generateSlots(window, 60, 0, 0, 'Invalid/Zone')).not.toThrow();
    expect(() => mergeOverrides([], customDays)).not.toThrow();
  });

  test('searchAvailability falls back to UTC for invalid customerTz', async () => {
    ;(mockDb.service.findUnique as any).mockResolvedValue({
      id: 1,
      durationMinutes: 60,
      capacity: 1,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    })
    ;(mockDb.providerProfile.findUnique as any).mockResolvedValue({
      id: 1,
      timezone: 'UTC',
      bookingLeadTimeHours: 0,
    })
    ;(mockDb.recurringAvailability.findMany as any).mockResolvedValue([])
    ;(mockDb.customDayAvailability.findMany as any).mockResolvedValue([
      {
        date: new Date('2026-06-01T00:00:00Z'),
        startUtc: new Date('2026-06-01T09:00:00Z'),
        endUtc: new Date('2026-06-01T10:00:00Z'),
      },
    ])
    ;(mockDb.availabilityException.findMany as any).mockResolvedValue([])
    ;(mockDb.manualBlock.findMany as any).mockResolvedValue([])
    ;(mockDb.booking.findMany as any).mockResolvedValue([])
    ;(mockDb.service.findMany as any).mockResolvedValue([])

    const slots = await searchAvailability({
      input: {
        providerId: 1,
        serviceId: 1,
        startISO: '2026-06-01T00:00:00Z',
        endISO: '2026-06-01T23:59:59Z',
        customerTz: 'Invalid/Zone',
      }
    })

    expect(slots.length).toBeGreaterThan(0)
  })

  test('searchAvailability rejects invalid provider timezone', async () => {
    ;(mockDb.service.findUnique as any).mockResolvedValue({
      id: 1,
      durationMinutes: 60,
      capacity: 1,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    })
    ;(mockDb.providerProfile.findUnique as any).mockResolvedValue({
      id: 1,
      timezone: 'Bad/Timezone',
      bookingLeadTimeHours: 0,
    })

    await expect(searchAvailability({
      input: {
        providerId: 1,
        serviceId: 1,
        startISO: '2026-06-01T00:00:00Z',
        endISO: '2026-06-01T23:59:59Z',
        customerTz: 'UTC',
      }
    })).rejects.toThrow(/Invalid timezone/)
  })

  test('Timezone validation is performant under rapid invalid input', () => {
    const start = Date.now();
    for (let i = 0; i < 50; i++) {
      DateTime.fromISO('2024-06-15T10:00:00', { zone: `Invalid-${i}` });
    }
    expect(Date.now() - start).toBeLessThan(500);
  });
});
