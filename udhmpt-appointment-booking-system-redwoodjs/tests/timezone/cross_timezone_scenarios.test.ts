import { searchAvailability } from '../../repository_after/api/src/services/availability/availability'

jest.mock('../../repository_after/api/src/lib/db', () => {
  const m: any = {
    service: { findUnique: jest.fn() },
    booking: { count: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    providerProfile: { findUnique: jest.fn() },
    recurringAvailability: { findMany: jest.fn() },
    customDayAvailability: { findMany: jest.fn() },
    availabilityException: { findMany: jest.fn() },
    manualBlock: { findMany: jest.fn() },
  }
  m.$transaction = jest.fn((cb) => cb(m))
  return { db: m }
})

import { db as mockDb } from '../../repository_after/api/src/lib/db'

describe('Cross-Timezone Scenarios', () => {
  test('Search handles timezone conversions correctly', async () => {
    ; (mockDb.service.findUnique as any).mockResolvedValue({
      id: 1, durationMinutes: 60, capacity: 1, bufferBeforeMinutes: 0, bufferAfterMinutes: 0
    })
      ; (mockDb.recurringAvailability.findMany as any).mockResolvedValue([{
        weekday: 1, startLocal: '09:00', endLocal: '17:00', tz: 'America/New_York'
      }])
      ; (mockDb.customDayAvailability.findMany as any).mockResolvedValue([])
      ; (mockDb.availabilityException.findMany as any).mockResolvedValue([])
      ; (mockDb.manualBlock.findMany as any).mockResolvedValue([])
      ; (mockDb.booking.count as any).mockResolvedValue(0)
      ; (mockDb.providerProfile.findUnique as any).mockResolvedValue({ id: 1, timezone: 'America/New_York' })
      ; (mockDb.booking.findMany as any).mockResolvedValue([])

    const slots = await searchAvailability({
      input: {
        providerId: 1,
        serviceId: 1,
        startISO: '2026-06-01T00:00:00Z',
        endISO: '2026-06-01T23:59:59Z',
        customerTz: 'Asia/Tokyo',
      }
    })

    expect(slots.length).toBeGreaterThan(0)
    // 09:00 AM NY (EDT, UTC-4) is 10:00 PM Tokyo (JST, UTC+9)
    expect(slots[0].startLocalISO).toContain('22:00')
  })
})
