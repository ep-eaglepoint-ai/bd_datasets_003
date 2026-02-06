import { DateTime } from 'luxon'
import { searchAvailability } from '../../repository_after/api/src/services/availability/availability'
import { createBooking, cancelBooking } from '../../repository_after/api/src/services/bookings/bookings'
import { context } from '@redwoodjs/graphql-server'

jest.mock('../../repository_after/api/src/lib/db', () => {
  const m: any = {
    service: { findUnique: jest.fn() },
    booking: { count: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
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

describe('End-to-End User Workflows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (context as any).currentUser = { id: 1, email: 'provider@test.com' };
  })

  test('Customer lifecycle: search -> book -> cancel', async () => {
    ; (mockDb.service.findUnique as any).mockResolvedValue({ id: 10, durationMinutes: 60, capacity: 1, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 })
      ; (mockDb.recurringAvailability.findMany as any).mockResolvedValue([{ weekday: 1, startLocal: '09:00', endLocal: '17:00', tz: 'UTC' }])
      ; (mockDb.customDayAvailability.findMany as any).mockResolvedValue([])
      ; (mockDb.availabilityException.findMany as any).mockResolvedValue([])
      ; (mockDb.manualBlock.findMany as any).mockResolvedValue([])
      ; (mockDb.booking.findMany as any).mockResolvedValue([])

    const slots = await searchAvailability({
      input: {
        providerId: 1,
        serviceId: 10,
        startISO: '2026-06-01T00:00:00Z',
        endISO: '2026-06-01T23:59:59Z',
        customerTz: 'UTC',
      },
    })
    expect(slots.length).toBeGreaterThan(0)

      ; (mockDb.providerProfile.findUnique as any).mockResolvedValue({ id: 1, timezone: 'UTC' })
      ; (mockDb.booking.count as any).mockResolvedValue(0)
      ; (mockDb.booking.create as any).mockResolvedValue({ id: 1, reference: 'E2E-REF' })
    const booking = await createBooking({
      input: {
        providerId: 1,
        serviceId: 10,
        startUtcISO: slots[0].startUtcISO,
        endUtcISO: slots[0].endUtcISO,
        customerEmail: 'e2e@test.com',
      },
    })
    expect(booking.reference).toBe('E2E-REF')

      ; (context as any).currentUser = { id: 99, email: 'e2e@test.com' } // Switch to customer context

      ; (mockDb.booking.findUnique as any).mockResolvedValue({
        id: 1,
        providerId: 1,
        userId: 99,
        startUtc: new Date(slots[0].startUtcISO),
        customerEmail: 'e2e@test.com',
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
    expect(canceled.canceledAt).toBeDefined()
  })
})
