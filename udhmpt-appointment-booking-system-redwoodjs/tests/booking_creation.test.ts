import { DateTime } from 'luxon'
import { createBooking } from '../repository_after/api/src/services/bookings/bookings'
import { context } from '@redwoodjs/graphql-server'

jest.mock('../repository_after/api/src/lib/db', () => {
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

import { db as mockDb } from '../repository_after/api/src/lib/db'

describe('Booking creation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    context.currentUser = { id: 42, email: 'customer@test.com', role: 'CUSTOMER' }
  })

  test('should create booking', async () => {
    const start = DateTime.utc().plus({ days: 1 }).startOf('hour')
    const end = start.plus({ hours: 1 })

    ;(mockDb.service.findUnique as any).mockResolvedValue({
      id: 1,
      capacity: 5,
      durationMinutes: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    })
    ;(mockDb.providerProfile.findUnique as any).mockResolvedValue({
      id: 1,
      timezone: 'UTC',
      bookingLeadTimeHours: 1,
    })
    ;(mockDb.customDayAvailability.findMany as any).mockResolvedValue([
      {
        date: start.toJSDate(),
        startUtc: start.minus({ hours: 2 }).toJSDate(),
        endUtc: start.plus({ hours: 4 }).toJSDate(),
      },
    ])
    ;(mockDb.recurringAvailability.findMany as any).mockResolvedValue([])
    ;(mockDb.availabilityException.findMany as any).mockResolvedValue([])
    ;(mockDb.manualBlock.findMany as any).mockResolvedValue([])
    ;(mockDb.booking.findMany as any).mockResolvedValue([])
    ;(mockDb.booking.count as any).mockResolvedValue(0)
    ;(mockDb.booking.create as any).mockResolvedValue({ id: 1, reference: 'REF1' })

    const booking = await createBooking({
      input: {
        providerId: 1,
        serviceId: 1,
        startUtcISO: start.toISO()!,
        endUtcISO: end.toISO()!,
        customerEmail: 'test@test.com',
      },
    })
    expect(booking.reference).toBe('REF1')
  })
})
