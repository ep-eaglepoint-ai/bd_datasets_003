import { DateTime } from 'luxon'
import { context } from '@redwoodjs/graphql-server'

jest.mock('../../repository_after/api/src/lib/db', () => {
  const m: any = {
    service: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    booking: {
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    providerProfile: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    recurringAvailability: { findMany: jest.fn(), create: jest.fn() },
    customDayAvailability: { findMany: jest.fn(), create: jest.fn() },
    availabilityException: { findMany: jest.fn(), create: jest.fn() },
    manualBlock: { findMany: jest.fn(), create: jest.fn() },
  }
  m.$transaction = jest.fn((cb) => cb(m))
  return { db: m }
})

import { db as mockDb } from '../../repository_after/api/src/lib/db'
const {
  searchAvailability,
  createRecurringAvailability,
  createCustomDayAvailability,
  createAvailabilityException,
  createManualBlock,
} = require('../../repository_after/api/src/services/availability/availability')
const { createBooking, cancelBooking, rescheduleBooking } = require('../../repository_after/api/src/services/bookings/bookings')
const { createProviderProfile } = require('../../repository_after/api/src/services/providers/providers')
const { createService } = require('../../repository_after/api/src/services/services/services')

describe('End-to-End User Workflows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ;(mockDb.service.findMany as any).mockResolvedValue([])
    ;(context as any).currentUser = { id: 1, email: 'provider@test.com', role: 'PROVIDER' };
  })

  test('Customer lifecycle: search -> book -> cancel', async () => {
    ;(mockDb.service.findUnique as any).mockResolvedValue({
      id: 10,
      durationMinutes: 60,
      capacity: 1,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    })
    ;(mockDb.recurringAvailability.findMany as any).mockResolvedValue([])
    ;(mockDb.customDayAvailability.findMany as any).mockResolvedValue([
      {
        date: new Date('2026-06-01T00:00:00Z'),
        startUtc: new Date('2026-06-01T09:00:00Z'),
        endUtc: new Date('2026-06-01T17:00:00Z'),
      },
    ])
    ;(mockDb.availabilityException.findMany as any).mockResolvedValue([])
    ;(mockDb.manualBlock.findMany as any).mockResolvedValue([])
    ;(mockDb.booking.findMany as any).mockResolvedValue([])

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

    ;(mockDb.providerProfile.findUnique as any).mockResolvedValue({
      id: 1,
      timezone: 'UTC',
      bookingLeadTimeHours: 1,
    })
    ;(mockDb.booking.count as any).mockResolvedValue(0)
    ;(mockDb.booking.create as any).mockResolvedValue({ id: 1, reference: 'E2E-REF' })
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

    ;(context as any).currentUser = { id: 99, email: 'e2e@test.com', role: 'CUSTOMER' } // Switch to customer context

    ;(mockDb.booking.findUnique as any).mockResolvedValue({
      id: 1,
      providerId: 1,
      userId: 99,
      startUtc: new Date(slots[0].startUtcISO),
      customerEmail: 'e2e@test.com',
      version: 1,
    })
    ;(mockDb.providerProfile.findUnique as any).mockResolvedValue({
      id: 1,
      cancellationWindowHours: 24,
      penaltiesApplyForLateCancel: false,
      cancellationFeeCents: 0,
    })
    ;(mockDb.booking.update as any).mockResolvedValue({ canceledAt: new Date() })
    const canceled = await cancelBooking({ id: 1 })
    expect(canceled.canceledAt).toBeDefined()
  })

  test('Provider onboarding: profile -> service -> availability setup', async () => {
    ;(context as any).currentUser = { id: 7, email: 'provider2@test.com', role: 'PROVIDER' }

    ;(mockDb.providerProfile.findUnique as any).mockResolvedValueOnce(null)
    ;(mockDb.providerProfile.create as any).mockResolvedValue({ id: 55, userId: 7, name: 'Provider Two' })

    const profile = await createProviderProfile({ input: { name: 'Provider Two', bio: 'Bio' } })
    expect(profile.id).toBe(55)

    ;(mockDb.providerProfile.findUnique as any).mockResolvedValue({ id: 55, userId: 7, timezone: 'UTC' })
    ;(mockDb.service.create as any).mockResolvedValue({ id: 501, providerId: 55, durationMinutes: 45 })
    const svc = await createService({ input: { name: 'Onboarding Service', durationMinutes: 45, capacity: 1 } })
    expect(svc.providerId).toBe(55)

    ;(mockDb.recurringAvailability.create as any).mockResolvedValue({ id: 1, providerId: 55 })
    const recurring = await createRecurringAvailability({ input: { weekday: 2, startLocal: '09:00', endLocal: '12:00' } })
    expect(recurring.providerId).toBe(55)

    ;(mockDb.customDayAvailability.create as any).mockResolvedValue({ id: 2, providerId: 55 })
    const custom = await createCustomDayAvailability({ input: { date: '2026-07-01', startLocal: '10:00', endLocal: '14:00' } })
    expect(custom.providerId).toBe(55)

    ;(mockDb.availabilityException.create as any).mockResolvedValue({ id: 3, providerId: 55 })
    const exception = await createAvailabilityException({
      input: {
        startUtcISO: '2026-07-01T11:00:00Z',
        endUtcISO: '2026-07-01T12:00:00Z',
        reason: 'Meeting',
      },
    })
    expect(exception.providerId).toBe(55)

    ;(mockDb.manualBlock.create as any).mockResolvedValue({ id: 4, providerId: 55 })
    const block = await createManualBlock({
      input: { startUtcISO: '2026-07-02T09:00:00Z', endUtcISO: '2026-07-02T12:00:00Z', reason: 'Vacation' },
    })
    expect(block.providerId).toBe(55)
  })

  test('Reschedule respects policy windows and availability', async () => {
    const originalStart = DateTime.utc().plus({ days: 5 }).startOf('hour')
    const originalEnd = originalStart.plus({ hours: 1 })
    const newStart = DateTime.utc().plus({ days: 6 }).startOf('hour')
    const newEnd = newStart.plus({ hours: 1 })

    ;(context as any).currentUser = { id: 9, email: 'customer2@test.com', role: 'CUSTOMER' }
    ;(mockDb.booking.findUnique as any).mockResolvedValue({
      id: 77,
      providerId: 1,
      userId: 9,
      serviceId: 10,
      startUtc: originalStart.toJSDate(),
      endUtc: originalEnd.toJSDate(),
      version: 1,
      canceledAt: null,
    })
    ;(mockDb.providerProfile.findUnique as any).mockResolvedValue({
      id: 1,
      timezone: 'UTC',
      bookingLeadTimeHours: 1,
      rescheduleWindowHours: 24,
      penaltiesApplyForLateCancel: false,
      rescheduleFeeCents: 0,
      maxBookingsPerDay: 5,
    })
    ;(mockDb.service.findUnique as any).mockResolvedValue({
      id: 10,
      durationMinutes: 60,
      capacity: 1,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    })
    ;(mockDb.customDayAvailability.findMany as any).mockResolvedValue([
      {
        date: newStart.toJSDate(),
        startUtc: newStart.minus({ hours: 3 }).toJSDate(),
        endUtc: newEnd.plus({ hours: 3 }).toJSDate(),
      },
    ])
    ;(mockDb.recurringAvailability.findMany as any).mockResolvedValue([])
    ;(mockDb.availabilityException.findMany as any).mockResolvedValue([])
    ;(mockDb.manualBlock.findMany as any).mockResolvedValue([])
    ;(mockDb.booking.findMany as any).mockResolvedValue([])
    ;(mockDb.booking.count as any).mockResolvedValue(0)
    ;(mockDb.booking.update as any).mockResolvedValue({ id: 77, status: 'confirmed' })

    const updated = await rescheduleBooking({
      id: 77,
      newStartUtcISO: newStart.toISO()!,
      newEndUtcISO: newEnd.toISO()!,
    })
    expect(updated.status).toBe('confirmed')
  })

  test('Overlapping booking across services is rejected', async () => {
    const start = DateTime.utc().plus({ days: 10 }).startOf('hour')
    const end = start.plus({ hours: 1 })

    ;(context as any).currentUser = { id: 11, email: 'customer3@test.com', role: 'CUSTOMER' }
    ;(mockDb.service.findUnique as any).mockResolvedValue({
      id: 10,
      durationMinutes: 60,
      capacity: 1,
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
        startUtc: start.minus({ hours: 3 }).toJSDate(),
        endUtc: end.plus({ hours: 3 }).toJSDate(),
      },
    ])
    ;(mockDb.recurringAvailability.findMany as any).mockResolvedValue([])
    ;(mockDb.availabilityException.findMany as any).mockResolvedValue([])
    ;(mockDb.manualBlock.findMany as any).mockResolvedValue([])
    ;(mockDb.booking.findMany as any).mockResolvedValue([
      {
        id: 900,
        providerId: 1,
        serviceId: 99,
        capacitySlot: 0,
        startUtc: start.toJSDate(),
        endUtc: end.toJSDate(),
        canceledAt: null,
      },
    ])
    ;(mockDb.booking.count as any).mockResolvedValue(0)

    await expect(createBooking({
      input: {
        providerId: 1,
        serviceId: 10,
        startUtcISO: start.toISO()!,
        endUtcISO: end.toISO()!,
        customerEmail: 'e2e3@test.com',
      },
    })).rejects.toThrow(/Provider is already booked|Capacity exceeded/)
  })
})
