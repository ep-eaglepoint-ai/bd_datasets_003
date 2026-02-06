import { searchAvailability } from '../repository_after/api/src/services/availability/availability'

jest.mock('../repository_after/api/src/lib/db', () => {
  const m: any = {
    service: { findUnique: jest.fn() },
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

import { db as mockDb } from '../repository_after/api/src/lib/db'

describe('searchAvailability', () => {
  beforeEach(() => { jest.clearAllMocks() })

  test('returns slots', async () => {
    ; (mockDb.service.findUnique as any).mockResolvedValue({
      id: 10,
      durationMinutes: 30,
      capacity: 1,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0
    })
      ; (mockDb.recurringAvailability.findMany as any).mockResolvedValue([{ weekday: 1, startLocal: '09:00', endLocal: '10:00', tz: 'UTC' }])
      ; (mockDb.customDayAvailability.findMany as any).mockResolvedValue([])
      ; (mockDb.availabilityException.findMany as any).mockResolvedValue([])
      ; (mockDb.manualBlock.findMany as any).mockResolvedValue([])
      ; (mockDb.booking.findMany as any).mockResolvedValue([])
      ; (mockDb.providerProfile.findUnique as any).mockResolvedValue({ id: 1, timezone: 'UTC' })

    const slots = await searchAvailability({
      input: {
        providerId: 1,
        serviceId: 10,
        startISO: '2026-06-01T00:00:00Z',
        endISO: '2026-06-01T23:59:59Z',
        customerTz: 'UTC',
      }
    })
    expect(slots.length).toBeGreaterThan(0)
  })
})
