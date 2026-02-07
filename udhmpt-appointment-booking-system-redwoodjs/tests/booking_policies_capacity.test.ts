import { DateTime } from 'luxon'
import { createBooking } from '../repository_after/api/src/services/bookings/bookings'
import { context } from '@redwoodjs/graphql-server'

jest.mock('../repository_after/api/src/lib/db', () => {
  const m: any = {
    service: { findUnique: jest.fn(), findMany: jest.fn() },
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

describe('Booking policies and capacity', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    context.currentUser = { id: 42, email: 'customer@test.com', role: 'CUSTOMER' }
    ;(mockDb.service.findMany as any).mockResolvedValue([])
  })

  const seedAvailability = (start: DateTime, end: DateTime) => {
    ;(mockDb.recurringAvailability.findMany as any).mockResolvedValue([])
    ;(mockDb.customDayAvailability.findMany as any).mockResolvedValue([
      {
        date: start.toJSDate(),
        startUtc: start.minus({ hours: 4 }).toJSDate(),
        endUtc: end.plus({ hours: 4 }).toJSDate(),
      },
    ])
    ;(mockDb.availabilityException.findMany as any).mockResolvedValue([])
    ;(mockDb.manualBlock.findMany as any).mockResolvedValue([])
  }

  test('rejects booking within provider lead time', async () => {
    jest.useFakeTimers()
    const now = new Date('2026-02-07T12:00:00.000Z')
    jest.setSystemTime(now)

    const start = DateTime.utc().plus({ hours: 2 })
    const end = start.plus({ hours: 1 })

    ;(mockDb.service.findUnique as any).mockResolvedValue({
      id: 1,
      capacity: 1,
      durationMinutes: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    })
    ;(mockDb.providerProfile.findUnique as any).mockResolvedValue({
      id: 1,
      timezone: 'UTC',
      bookingLeadTimeHours: 4,
    })
    seedAvailability(start, end)
    ;(mockDb.booking.findMany as any).mockResolvedValue([])
    ;(mockDb.booking.count as any).mockResolvedValue(0)

    await expect(
      createBooking({
        input: {
          providerId: 1,
          serviceId: 1,
          startUtcISO: start.toISO()!,
          endUtcISO: end.toISO()!,
          customerEmail: 'test@test.com',
        },
      })
    ).rejects.toThrow(/Must book at least 4 hour\(s\) in advance/)

    jest.useRealTimers()
  })

  test('enforces max bookings per day', async () => {
    const start = DateTime.utc().plus({ days: 1 })
    const end = start.plus({ hours: 1 })

    ;(mockDb.service.findUnique as any).mockResolvedValue({
      id: 1,
      capacity: 1,
      durationMinutes: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    })
    ;(mockDb.providerProfile.findUnique as any).mockResolvedValue({
      id: 1,
      timezone: 'UTC',
      bookingLeadTimeHours: 1,
      maxBookingsPerDay: 1,
    })
    seedAvailability(start, end)
    ;(mockDb.booking.findMany as any).mockResolvedValue([])
    ;(mockDb.booking.count as any).mockResolvedValue(1)

    await expect(
      createBooking({
        input: {
          providerId: 1,
          serviceId: 1,
          startUtcISO: start.toISO()!,
          endUtcISO: end.toISO()!,
          customerEmail: 'test@test.com',
        },
      })
    ).rejects.toThrow(/Maximum bookings per day reached/)
  })

  test('allocates a different capacity slot for group sessions', async () => {
    const start = DateTime.utc().plus({ days: 1 })
    const end = start.plus({ hours: 1 })

    ;(mockDb.service.findUnique as any).mockResolvedValue({
      id: 1,
      capacity: 2,
      durationMinutes: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    })
    ;(mockDb.providerProfile.findUnique as any).mockResolvedValue({
      id: 1,
      timezone: 'UTC',
      bookingLeadTimeHours: 1,
    })
    seedAvailability(start, end)
    ;(mockDb.booking.findMany as any).mockResolvedValue([
      {
        id: 99,
        serviceId: 1,
        capacitySlot: 0,
        startUtc: start.toJSDate(),
        endUtc: end.toJSDate(),
        canceledAt: null,
      },
    ])
    ;(mockDb.service.findMany as any).mockResolvedValue([
      { id: 1, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
    ])
    ;(mockDb.booking.count as any).mockResolvedValue(0)
    ;(mockDb.booking.create as any).mockResolvedValue({ id: 2, reference: 'REF2' })

    await createBooking({
      input: {
        providerId: 1,
        serviceId: 1,
        startUtcISO: start.toISO()!,
        endUtcISO: end.toISO()!,
        customerEmail: 'test@test.com',
      },
    })

    const createArgs = (mockDb.booking.create as any).mock.calls[0][0]
    expect(createArgs.data.capacitySlot).toBe(1)
  })

  test('rejects booking when capacity is exceeded', async () => {
    const start = DateTime.utc().plus({ days: 1 })
    const end = start.plus({ hours: 1 })

    ;(mockDb.service.findUnique as any).mockResolvedValue({
      id: 1,
      capacity: 2,
      durationMinutes: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    })
    ;(mockDb.providerProfile.findUnique as any).mockResolvedValue({
      id: 1,
      timezone: 'UTC',
      bookingLeadTimeHours: 1,
    })
    seedAvailability(start, end)
    ;(mockDb.booking.findMany as any).mockResolvedValue([
      {
        id: 1,
        serviceId: 1,
        capacitySlot: 0,
        startUtc: start.toJSDate(),
        endUtc: end.toJSDate(),
        canceledAt: null,
      },
      {
        id: 2,
        serviceId: 1,
        capacitySlot: 1,
        startUtc: start.toJSDate(),
        endUtc: end.toJSDate(),
        canceledAt: null,
      },
    ])
    ;(mockDb.service.findMany as any).mockResolvedValue([
      { id: 1, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
    ])
    ;(mockDb.booking.count as any).mockResolvedValue(0)

    await expect(
      createBooking({
        input: {
          providerId: 1,
          serviceId: 1,
          startUtcISO: start.toISO()!,
          endUtcISO: end.toISO()!,
          customerEmail: 'test@test.com',
        },
      })
    ).rejects.toThrow(/Capacity exceeded/)
  })

  test('buffer time blocks near-adjacent booking', async () => {
    const day = DateTime.utc().plus({ days: 1 }).startOf('day')
    const start = day.set({ hour: 10, minute: 45 })
    const end = start.plus({ hours: 1 })

    ;(mockDb.service.findUnique as any).mockResolvedValue({
      id: 1,
      capacity: 1,
      durationMinutes: 60,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
    })
    ;(mockDb.providerProfile.findUnique as any).mockResolvedValue({
      id: 1,
      timezone: 'UTC',
      bookingLeadTimeHours: 1,
    })
    ;(mockDb.recurringAvailability.findMany as any).mockResolvedValue([])
    ;(mockDb.customDayAvailability.findMany as any).mockResolvedValue([
      {
        date: day.toJSDate(),
        startUtc: day.plus({ hours: 9 }).toJSDate(),
        endUtc: day.plus({ hours: 17 }).toJSDate(),
      },
    ])
    ;(mockDb.availabilityException.findMany as any).mockResolvedValue([])
    ;(mockDb.manualBlock.findMany as any).mockResolvedValue([])
    ;(mockDb.booking.findMany as any).mockResolvedValue([
      {
        id: 5,
        serviceId: 1,
        capacitySlot: 0,
        startUtc: DateTime.utc().plus({ days: 1 }).set({ hour: 10, minute: 0 }).toJSDate(),
        endUtc: DateTime.utc().plus({ days: 1 }).set({ hour: 11, minute: 0 }).toJSDate(),
        canceledAt: null,
      },
    ])
    ;(mockDb.service.findMany as any).mockResolvedValue([
      { id: 1, bufferBeforeMinutes: 15, bufferAfterMinutes: 15 },
    ])
    ;(mockDb.booking.count as any).mockResolvedValue(0)

    await expect(
      createBooking({
        input: {
          providerId: 1,
          serviceId: 1,
          startUtcISO: start.toISO()!,
          endUtcISO: end.toISO()!,
          customerEmail: 'test@test.com',
        },
      })
    ).rejects.toThrow(/Capacity exceeded/)
  })
})
