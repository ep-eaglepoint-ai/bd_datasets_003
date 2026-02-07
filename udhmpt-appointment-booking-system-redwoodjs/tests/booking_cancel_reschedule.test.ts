import { DateTime } from 'luxon'
import { cancelBooking, rescheduleBooking } from '../repository_after/api/src/services/bookings/bookings'
import { context } from '@redwoodjs/graphql-server'

jest.mock('../repository_after/api/src/lib/db', () => {
  const m: any = {
    service: { findUnique: jest.fn() },
    booking: { findUnique: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    providerProfile: { findUnique: jest.fn() },
    recurringAvailability: { findMany: jest.fn(() => Promise.resolve([])) },
    customDayAvailability: { findMany: jest.fn(() => Promise.resolve([])) },
    availabilityException: { findMany: jest.fn(() => Promise.resolve([])) },
    manualBlock: { findMany: jest.fn(() => Promise.resolve([])) },
  }
  m.$transaction = jest.fn((cb) => cb(m))
  return { db: m }
})

import { db as mockDb } from '../repository_after/api/src/lib/db'

describe('Cancel and Reschedule rules', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    context.currentUser = { id: 1, email: 'customer@test.com', role: 'CUSTOMER' }
  })

  test('Cancel cases', async () => {
    ; (mockDb.booking.findUnique as any).mockResolvedValue({
      id: 1,
      providerId: 1,
      userId: 1,
      startUtc: DateTime.utc().plus({ days: 5 }).toJSDate(),
      customerEmail: 'provider@test.com',
      version: 1,
    })
    ; (mockDb.providerProfile.findUnique as any).mockResolvedValue({
      id: 1,
      cancellationWindowHours: 24,
      penaltiesApplyForLateCancel: false,
      cancellationFeeCents: 0,
    })
    ; (mockDb.booking.update as any).mockResolvedValue({ canceledAt: new Date() })

    const canceled = await cancelBooking({ id: 1 })
    expect(canceled.canceledAt).toBeTruthy()
  })

  test('Cancel within window is rejected when penalties disabled', async () => {
    ; (mockDb.booking.findUnique as any).mockResolvedValue({
      id: 2,
      providerId: 1,
      userId: 1,
      startUtc: DateTime.utc().plus({ hours: 2 }).toJSDate(),
      customerEmail: 'provider@test.com',
      version: 1,
    })
    ; (mockDb.providerProfile.findUnique as any).mockResolvedValue({
      id: 1,
      cancellationWindowHours: 24,
      penaltiesApplyForLateCancel: false,
      cancellationFeeCents: 500,
    })

    await expect(cancelBooking({ id: 2 })).rejects.toThrow(/Cannot cancel within 24 hour/)
  })

  test('Cancel within window applies fee when penalties enabled', async () => {
    ; (mockDb.booking.findUnique as any).mockResolvedValue({
      id: 4,
      providerId: 1,
      userId: 1,
      startUtc: DateTime.utc().plus({ hours: 2 }).toJSDate(),
      customerEmail: 'provider@test.com',
      version: 1,
      notes: '',
    })
    ; (mockDb.providerProfile.findUnique as any).mockResolvedValue({
      id: 1,
      cancellationWindowHours: 24,
      penaltiesApplyForLateCancel: true,
      cancellationFeeCents: 500,
    })
    ; (mockDb.booking.update as any).mockResolvedValue({
      canceledAt: new Date(),
      penaltyFeeCents: 500,
    })

    const canceled = await cancelBooking({ id: 4 })
    expect(canceled.canceledAt).toBeTruthy()
  })

  test('Reschedule enforces window and updates when valid', async () => {
    const originalStart = DateTime.utc().plus({ days: 3 }).startOf('hour')
    const originalEnd = originalStart.plus({ hours: 1 })
    const newStart = DateTime.utc().plus({ days: 4 }).startOf('hour')
    const newEnd = newStart.plus({ hours: 1 })

    ; (mockDb.booking.findUnique as any).mockResolvedValue({
      id: 3,
      providerId: 1,
      userId: 1,
      serviceId: 9,
      startUtc: originalStart.toJSDate(),
      endUtc: originalEnd.toJSDate(),
      version: 1,
      canceledAt: null,
    })
    ; (mockDb.providerProfile.findUnique as any).mockResolvedValue({
      id: 1,
      timezone: 'UTC',
      bookingLeadTimeHours: 1,
      rescheduleWindowHours: 24,
      penaltiesApplyForLateCancel: false,
      rescheduleFeeCents: 0,
      maxBookingsPerDay: 10,
    })
    ; (mockDb.service.findUnique as any).mockResolvedValue({
      id: 9,
      durationMinutes: 60,
      capacity: 1,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    })
    ; (mockDb.customDayAvailability.findMany as any).mockResolvedValue([
      {
        date: newStart.toJSDate(),
        startUtc: newStart.minus({ hours: 2 }).toJSDate(),
        endUtc: newEnd.plus({ hours: 2 }).toJSDate(),
      },
    ])
    ; (mockDb.booking.findMany as any).mockResolvedValue([])
    ; (mockDb.booking.update as any).mockResolvedValue({ id: 3, status: 'confirmed' })

    const result = await rescheduleBooking({
      id: 3,
      newStartUtcISO: newStart.toISO()!,
      newEndUtcISO: newEnd.toISO()!,
    })
    expect(result.status).toBe('confirmed')
  })

  test('Reschedule within window applies fee when penalties enabled', async () => {
    const originalStart = DateTime.utc().plus({ hours: 2 }).startOf('hour')
    const originalEnd = originalStart.plus({ hours: 1 })
    const newStart = DateTime.utc().plus({ days: 2 }).startOf('hour')
    const newEnd = newStart.plus({ hours: 1 })

    ; (mockDb.booking.findUnique as any).mockResolvedValue({
      id: 5,
      providerId: 1,
      userId: 1,
      serviceId: 9,
      startUtc: originalStart.toJSDate(),
      endUtc: originalEnd.toJSDate(),
      version: 1,
      canceledAt: null,
    })
    ; (mockDb.providerProfile.findUnique as any).mockResolvedValue({
      id: 1,
      timezone: 'UTC',
      bookingLeadTimeHours: 1,
      rescheduleWindowHours: 24,
      penaltiesApplyForLateCancel: true,
      rescheduleFeeCents: 250,
      maxBookingsPerDay: 10,
    })
    ; (mockDb.service.findUnique as any).mockResolvedValue({
      id: 9,
      durationMinutes: 60,
      capacity: 1,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    })
    ; (mockDb.customDayAvailability.findMany as any).mockResolvedValue([
      {
        date: newStart.toJSDate(),
        startUtc: newStart.minus({ hours: 2 }).toJSDate(),
        endUtc: newEnd.plus({ hours: 2 }).toJSDate(),
      },
    ])
    ; (mockDb.booking.findMany as any).mockResolvedValue([])
    ; (mockDb.booking.update as any).mockResolvedValue({ id: 5, status: 'confirmed', penaltyFeeCents: 250 })

    const result = await rescheduleBooking({
      id: 5,
      newStartUtcISO: newStart.toISO()!,
      newEndUtcISO: newEnd.toISO()!,
    })
    expect(result.status).toBe('confirmed')
  })
})
