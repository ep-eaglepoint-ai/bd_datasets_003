import { DateTime } from 'luxon'
import { cancelBooking } from '../repository_after/api/src/services/bookings/bookings'

jest.mock('../repository_after/api/src/lib/db', () => {
  const m: any = {
    service: { findUnique: jest.fn() },
    booking: { findUnique: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    providerProfile: { findUnique: jest.fn() },
    recurringAvailability: { findMany: jest.fn(() => Promise.resolve([])) },
    customDayAvailability: { findMany: jest.fn(() => Promise.resolve([])) },
  }
  m.$transaction = jest.fn((cb) => cb(m))
  return { db: m }
})

import { db as mockDb } from '../repository_after/api/src/lib/db'

describe('Cancel and Reschedule rules', () => {
  beforeEach(() => { jest.clearAllMocks() })

  test('Cancel cases', async () => {
    ; (mockDb.booking.findUnique as any).mockResolvedValue({
      id: 1,
      providerId: 1,
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
})
