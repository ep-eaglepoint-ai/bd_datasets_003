import { db } from '../repository_after/api/src/lib/db'
import { searchAvailability } from '../repository_after/api/src/services/availability/availability'
import { cancelBooking, createBooking } from '../repository_after/api/src/services/bookings/bookings'
import { context } from '@redwoodjs/graphql-server'
import { DateTime } from 'luxon'

describe('Production-Ready Hardening Verification', () => {
    let providerId: number
    let serviceId: number
    let userId: number

    beforeAll(async () => {
        // 1. Create a provider in a non-UTC timezone (e.g., Tokyo UTC+9)
        const providerUser = await db.user.create({
            data: { email: `hardening-provider-${Date.now()}@test.com`, role: 'PROVIDER' }
        })
        const profile = await db.providerProfile.create({
            data: {
                userId: providerUser.id,
                name: 'Hardening Test Provider',
                timezone: 'Asia/Tokyo',
                penaltiesApplyForLateCancel: true,
                cancellationFeeCents: 500,
                cancellationWindowHours: 24,
                bookingLeadTimeHours: 2,
            }
        })
        providerId = profile.id

        const service = await db.service.create({
            data: {
                providerId: profile.id,
                name: 'Hardening Service',
                durationMinutes: 60,
                capacity: 1,
            }
        })
        serviceId = service.id

        const customer = await db.user.create({
            data: { email: `hardening-customer-${Date.now()}@test.com`, role: 'CUSTOMER' }
        })
        userId = customer.id

        // Add recurring availability for Monday 09:00 - 17:00
        await db.recurringAvailability.create({
            data: {
                providerId: profile.id,
                weekday: 1,
                startLocal: '09:00',
                endLocal: '17:00',
                tz: 'Asia/Tokyo'
            }
        })
    })

    test('searchAvailability correctly expands weeks in provider timezone', async () => {
        // A Sunday night in UTC might be Monday morning in Tokyo.
        // UTC: 2026-02-08T20:00:00Z (Sunday)
        // Tokyo: 2026-02-09T05:00:00+09:00 (Monday)

        const startISO = '2026-02-08T20:00:00Z'
        const endISO = '2026-02-09T10:00:00Z'

        const slots = await searchAvailability({
            input: {
                providerId,
                serviceId,
                startISO,
                endISO,
                customerTz: 'UTC'
            }
        })

        // Should find slots because it's Monday in Tokyo
        expect(slots.length).toBeGreaterThan(0)
        // First slot in Tokyo is 09:00 local, which is 00:00 UTC on Feb 9
        expect(slots[0].startUtcISO).toContain('2026-02-09T00:00:00')
    })

    test('cancelBooking populates structured penaltyFeeCents', async () => {
        context.currentUser = { id: userId, email: 'customer@test.com', role: 'CUSTOMER' }

        // Create a booking for 1 hour from now (late cancellation)
        const startUtcISO = DateTime.utc().plus({ hours: 3 }).toISO()!
        const endUtcISO = DateTime.utc().plus({ hours: 4 }).toISO()!

        const booking = await createBooking({
            input: {
                providerId,
                serviceId,
                startUtcISO,
                endUtcISO,
                customerEmail: 'customer@test.com'
            }
        })

        // Cancel it. Since window is 24h, this is late.
        const canceled = await cancelBooking({ id: booking.id })
        expect(canceled.status).toBe('cancelled')
        expect(canceled.penaltyFeeCents).toBe(500)
        expect(canceled.notes).toContain('Late cancellation penalty applied')
    })

    afterAll(async () => {
        await db.booking.deleteMany({ where: { providerId } })
        await db.service.deleteMany({ where: { providerId } })
        await db.recurringAvailability.deleteMany({ where: { providerId } })
        await db.providerProfile.delete({ where: { id: providerId } })
        // No easy way to delete all users without cascades, but this is fine for a test
    })
})
