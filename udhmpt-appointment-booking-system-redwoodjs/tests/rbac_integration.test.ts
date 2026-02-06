import { db } from '../../src/lib/db'
import { bookings, booking as getBooking } from '../../src/services/bookings/bookings'
import { context } from '@redwoodjs/graphql-server'

// This test verifies that RBAC logic is correctly integrated with real DB records.
// It ensures that customers can only access their own bookings and providers only their own.

describe('Real DB RBAC Integration', () => {
    let providerId: number
    let providerUserId: number
    let customer1Id: number
    let customer2Id: number
    let bookingId: number

    beforeAll(async () => {
        // Setup Users
        const pUser = await db.user.create({ data: { email: `p-rbac-${Date.now()}@test.com`, role: 'PROVIDER' } })
        const c1User = await db.user.create({ data: { email: `c1-rbac-${Date.now()}@test.com`, role: 'CUSTOMER' } })
        const c2User = await db.user.create({ data: { email: `c2-rbac-${Date.now()}@test.com`, role: 'CUSTOMER' } })

        providerUserId = pUser.id
        customer1Id = c1User.id
        customer2Id = c2User.id

        const profile = await db.providerProfile.create({ data: { userId: pUser.id, name: 'RBAC Provider' } })
        providerId = profile.id

        const service = await db.service.create({ data: { providerId: profile.id, name: 'RBAC Service', durationMinutes: 30 } })

        // Create a booking for Customer 1
        const booking = await (db.booking as any).create({
            data: {
                providerId,
                serviceId: service.id,
                startUtc: new Date('2026-10-01T10:00:00Z'),
                endUtc: new Date('2026-10-01T10:30:00Z'),
                customerEmail: 'c1@test.com',
                userId: customer1Id,
                reference: `REF-RBAC-${Date.now()}`,
                status: 'confirmed'
            }
        })
        bookingId = booking.id
    })

    test('Customer 1 should find their own booking via list', async () => {
        context.currentUser = { id: customer1Id, email: 'c1@test.com', role: 'CUSTOMER' }
        const result = await bookings({})
        expect(result.some(b => b.id === bookingId)).toBe(true)
    })

    test('Customer 2 should NOT see Customer 1 booking in list', async () => {
        context.currentUser = { id: customer2Id, email: 'c2@test.com', role: 'CUSTOMER' }
        const result = await bookings({})
        expect(result.some(b => b.id === bookingId)).toBe(false)
    })

    test('Customer 1 should be able to fetch their specific booking', async () => {
        context.currentUser = { id: customer1Id, email: 'c1@test.com', role: 'CUSTOMER' }
        const b = await getBooking({ id: bookingId })
        expect(b.id).toBe(bookingId)
    })

    test('Customer 2 should be blocked from unauthorized booking access', async () => {
        context.currentUser = { id: customer2Id, email: 'c2@test.com', role: 'CUSTOMER' }
        await expect(getBooking({ id: bookingId })).rejects.toThrow('permission')
    })

    test('Provider should see the booking assigned to them', async () => {
        context.currentUser = { id: providerUserId, email: 'p@test.com', role: 'PROVIDER' }
        const result = await bookings({ providerId })
        expect(result.some(b => b.id === bookingId)).toBe(true)
    })

    test('Admin should see everything', async () => {
        context.currentUser = { id: 999, email: 'admin@test.com', role: 'ADMIN', roles: ['ADMIN'] }
        const result = await bookings({})
        expect(result.some(b => b.id === bookingId)).toBe(true)
    })

    afterAll(async () => {
        // Cleanup
        try {
            await db.booking.deleteMany({ where: { providerId } })
            await db.service.deleteMany({ where: { providerId } })
            await db.providerProfile.delete({ where: { id: providerId } })
        } catch (e) {
            console.warn('RBAC Cleanup failed:', (e as any).message)
        }
    })
})
