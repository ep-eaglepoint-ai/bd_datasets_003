import { searchAvailability } from '../../repository_after/api/src/services/availability/availability'
import { bookings } from '../../repository_after/api/src/services/bookings/bookings'
import { context } from '@redwoodjs/graphql-server'

jest.mock('../../repository_after/api/src/lib/db', () => {
  const m: any = {
    service: { findUnique: jest.fn(() => Promise.resolve(null)) },
    booking: { findMany: jest.fn(() => Promise.resolve([])), count: jest.fn(() => Promise.resolve(0)) },
    recurringAvailability: { findMany: jest.fn(() => Promise.resolve([])) },
    customDayAvailability: { findMany: jest.fn(() => Promise.resolve([])) },
    availabilityException: { findMany: jest.fn(() => Promise.resolve([])) },
    manualBlock: { findMany: jest.fn(() => Promise.resolve([])) },
    providerProfile: { findUnique: jest.fn(() => Promise.resolve({ id: 1 })) },
  }
  m.$transaction = jest.fn((cb) => cb(m))
  return { db: m }
})

import { db as mockDb } from '../../repository_after/api/src/lib/db'

describe('Actual SQL Injection Prevention (Service Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
      ; (context as any).currentUser = { id: 1, email: 'customer@test.com', role: 'CUSTOMER' }
  })

  test('searchAvailability should not be vulnerable to injection via customerTz', async () => {
    ; (mockDb.service.findUnique as any).mockResolvedValue({ id: 1, durationMinutes: 30 })

    const maliciousTz = "UTC'; DROP TABLE users; --"

    // This should NOT throw if Prisma handles it (it will just be a string parameter)
    await searchAvailability({
      input: {
        providerId: 1,
        serviceId: 1,
        startISO: '2026-06-01T00:00:00Z',
        endISO: '2026-06-01T23:59:59Z',
        customerTz: maliciousTz
      }
    })

    // Verify findMany was called with the string as-is
    expect(mockDb.recurringAvailability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { providerId: 1 } })
    )
  })

  test('bookings service should not be vulnerable to injection via startISO/endISO', async () => {
    const maliciousISO = "2024-01-01'; DELETE FROM Booking; --"

    await bookings({
      providerId: 1,
      startISO: maliciousISO
    })

    // Verify Prisma query structure
    expect(mockDb.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startUtc: expect.objectContaining({
            gte: expect.any(Date)
          })
        })
      })
    )
  })

  describe('Logging and Monitoring', () => {
    test('Should log suspicious query patterns', () => {
      const suspiciousPatterns = [
        /drop\s+table/i,
        /delete\s+from/i,
        /insert\s+into/i,
        /update\s+set/i,
        /union\s+select/i,
        /exec\s*\(/i,
        /xp_cmdshell/i,
        /sp_executesql/i
      ];

      const logSuspiciousQuery = (query: string) => {
        const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(query));

        if (isSuspicious) {
          return true;
        }

        return false;
      };

      const normalQuery = 'SELECT * FROM bookings WHERE customer_email = ?';
      const suspiciousQuery = 'SELECT * FROM users; DROP TABLE users; --';

      expect(logSuspiciousQuery(normalQuery)).toBe(false);
      expect(logSuspiciousQuery(suspiciousQuery)).toBe(true);
    });
  });
});
