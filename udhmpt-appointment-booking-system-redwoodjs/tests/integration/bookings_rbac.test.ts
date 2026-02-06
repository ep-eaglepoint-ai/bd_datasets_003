import { db } from '../../repository_after/api/src/lib/db'
import { context } from '@redwoodjs/graphql-server'
import { bookings, booking } from '../../repository_after/api/src/services/bookings/bookings'

describe('RBAC Authorization Tests', () => {
    let providerId: number
    let customerId: number
    let otherCustomerId: number
    let adminId: number
    let bookingId: number

    beforeAll(async () => {
        // Create test users
        const provider = await db.user.create({
            data: { email: 'provider@test.com', role: 'PROVIDER', name: 'Test Provider' }
        })
        providerId = provider.id

        const customer = await db.user.create({
            data: { email: 'customer@test.com', role: 'CUSTOMER', name: 'Test Customer' }
        })
        customerId = customer.id

        const otherCustomer = await db.user.create({
            data: { email: 'other@test.com', role: 'CUSTOMER', name: 'Other Customer' }
        })
        otherCustomerId = otherCustomer.id

        const admin = await db.user.create({
            data: { email: 'admin@test.com', role: 'ADMIN', name: 'Admin User' }
        })
        adminId = admin.id

        // Create provider profile
        const profile = await db.providerProfile.create({
            data: {
                userId: providerId,
                name: 'Test Provider',
                timezone: 'UTC'
            }
        })

        // Create a service
        const service = await db.service.create({
            data: {
                providerId: profile.id,
                name: 'Test Service',
                durationMinutes: 60
            }
        })

        // Create a test booking
        const testBooking = await db.booking.create({
            data: {
                providerId: profile.id,
                serviceId: service.id,
                startUtc: new Date('2026-03-01T10:00:00Z'),
                endUtc: new Date('2026-03-01T11:00:00Z'),
                customerEmail: 'customer@test.com',
                userId: customerId,
                reference: 'TEST-REF-001',
                status: 'pending'
            }
        })
        bookingId = testBooking.id
    })

    afterAll(async () => {
        await db.booking.deleteMany({})
        await db.service.deleteMany({})
        await db.providerProfile.deleteMany({})
        await db.user.deleteMany({})
    })

    describe('bookings query (list)', () => {
        it('should prevent unauthenticated access', async () => {
            context.currentUser = null

            await expect(bookings({ providerId: 1 })).rejects.toThrow('Not authenticated')
        })

        it('should prevent customer from reading other customer bookings', async () => {
            context.currentUser = {
                id: otherCustomerId,
                email: 'other@test.com',
                role: 'CUSTOMER'
            }

            const results = await bookings({})

            // Should return empty array since other customer has no bookings
            expect(results).toHaveLength(0)

            // Should NOT contain the booking for customer@test.com
            expect(results.find(b => b.customerEmail === 'customer@test.com')).toBeUndefined()
        })

        it('should allow customer to read only their own bookings', async () => {
            context.currentUser = {
                id: customerId,
                email: 'customer@test.com',
                role: 'CUSTOMER'
            }

            const results = await bookings({})

            expect(results).toHaveLength(1)
            expect(results[0].customerEmail).toBe('customer@test.com')
        })

        it('should prevent provider from reading other provider bookings', async () => {
            // Create another provider
            const otherProvider = await db.user.create({
                data: { email: 'other-provider@test.com', role: 'PROVIDER', name: 'Other Provider' }
            })
            const otherProfile = await db.providerProfile.create({
                data: {
                    userId: otherProvider.id,
                    name: 'Other Provider',
                    timezone: 'UTC'
                }
            })

            context.currentUser = {
                id: otherProvider.id,
                email: 'other-provider@test.com',
                role: 'PROVIDER'
            }

            const results = await bookings({})

            // Should return empty array since other provider has no bookings
            expect(results).toHaveLength(0)

            // Cleanup
            await db.providerProfile.delete({ where: { id: otherProfile.id } })
            await db.user.delete({ where: { id: otherProvider.id } })
        })

        it('should allow admin to read all bookings', async () => {
            context.currentUser = {
                id: adminId,
                email: 'admin@test.com',
                role: 'ADMIN'
            }

            const results = await bookings({})

            // Admin should see all bookings
            expect(results.length).toBeGreaterThanOrEqual(1)
        })
    })

    describe('booking query (single)', () => {
        it('should prevent unauthenticated access', async () => {
            context.currentUser = null

            await expect(booking({ id: bookingId })).rejects.toThrow('Not authenticated')
        })

        it('should prevent customer from reading other customer booking', async () => {
            context.currentUser = {
                id: otherCustomerId,
                email: 'other@test.com',
                role: 'CUSTOMER'
            }

            await expect(booking({ id: bookingId })).rejects.toThrow('You do not have permission to access this booking')
        })

        it('should allow customer to read their own booking', async () => {
            context.currentUser = {
                id: customerId,
                email: 'customer@test.com',
                role: 'CUSTOMER'
            }

            const result = await booking({ id: bookingId })

            expect(result).toBeDefined()
            expect(result.customerEmail).toBe('customer@test.com')
        })

        it('should allow admin to read any booking', async () => {
            context.currentUser = {
                id: adminId,
                email: 'admin@test.com',
                role: 'ADMIN'
            }

            const result = await booking({ id: bookingId })

            expect(result).toBeDefined()
        })
    })
})
