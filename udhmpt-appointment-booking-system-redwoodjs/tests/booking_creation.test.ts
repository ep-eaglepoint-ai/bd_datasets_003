import { DateTime } from 'luxon'
import { createBooking } from '../repository_after/api/src/services/bookings/bookings'

jest.mock('../repository_after/api/src/lib/db', () => {
  const m: any = {
    service: { findUnique: jest.fn() },
    booking: { count: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    providerProfile: { findUnique: jest.fn() },
  }
  m.$transaction = jest.fn((cb) => cb(m))
  return { db: m }
})

import { db as mockDb } from '../repository_after/api/src/lib/db'

describe('Booking creation', () => {
  beforeEach(() => { jest.clearAllMocks() })

  test('should create booking', async () => {
    ; (mockDb.service.findUnique as any).mockResolvedValue({ id: 1, capacity: 5 })
      ; (mockDb.providerProfile.findUnique as any).mockResolvedValue({ id: 1, timezone: 'UTC', bookingLeadTimeHours: 1 })
      ; (mockDb.booking.findMany as any).mockResolvedValue([])
      ; (mockDb.booking.count as any).mockResolvedValue(0)
      ; (mockDb.booking.create as any).mockResolvedValue({ id: 1, reference: 'REF1' })

    const booking = await createBooking({
      input: {
        providerId: 1,
        serviceId: 1,
        startUtcISO: DateTime.utc().plus({ days: 1 }).toISO()!,
        endUtcISO: DateTime.utc().plus({ days: 1, hours: 1 }).toISO()!,
        customerEmail: 'test@test.com',
      },
    })
    expect(booking.reference).toBe('REF1')
  })
})
