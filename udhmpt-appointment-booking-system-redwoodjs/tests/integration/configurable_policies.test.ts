import { db } from '../../repository_after/api/src/lib/db'
import { context } from '@redwoodjs/graphql-server'
import { cancelBooking, rescheduleBooking } from '../../repository_after/api/src/services/bookings/bookings'
import { DateTime } from 'luxon'

describe('Configurable Policy Tests', () => {
    let providerId: number
    let serviceId: number
    let userId: number
    let bookingId: number

    beforeAll(async () => {
        // Create test user
        const user = await db.user.create({
            data: { email: 'policy@test.com', role: 'CUSTOMER', name: 'Policy Test' }
        })
        userId = user.id

        // Set user context
        context.currentUser = { id: userId, email: 'policy@test.com', role: 'CUSTOMER' }

        // Create provider profile with custom policy windows
        const profile = await db.providerProfile.create({
            data: {
                userId: user.id,
                name: 'Policy Provider',
                timezone: 'UTC',
                cancellationWindowHours: 48, // 48-hour cancellation window
                rescheduleWindowHours: 72, // 72-hour reschedule window
                penaltiesApplyForLateCancel: true,
                cancellationFeeCents: 2500, // $25.00
                rescheduleFeeCents: 1500 // $15.00
            }
        })
        providerId = profile.id

        // Create a service
        const service = await db.service.create({
            data: {
                providerId: profile.id,
                name: 'Policy Service',
                durationMinutes: 60
            }
        })
        serviceId = service.id
    })

    afterAll(async () => {
        await db.booking.deleteMany({})
        await db.service.deleteMany({})
        await db.providerProfile.deleteMany({})
        await db.user.deleteMany({})
    })

    afterEach(async () => {
        await db.booking.deleteMany({})
    })

    describe('Cancellation policy with custom windows', () => {
        it('should not apply penalty when canceling outside the 48h window', async () => {
            // Create booking 3 days in the future
            const futureStart = DateTime.utc().plus({ days: 3 }).toISO()
            const futureEnd = DateTime.utc().plus({ days: 3, hours: 1 }).toISO()

            const booking = await db.booking.create({
                data: {
                    providerId,
                    serviceId,
                    startUtc: new Date(futureStart),
                    endUtc: new Date(futureEnd),
                    customerEmail: 'policy@test.com',
                    userId: userId,
                    reference: 'POLICY-001',
                    status: 'pending'
                }
            })

            const canceled = await cancelBooking({ id: booking.id })

            expect(canceled.status).toBe('cancelled')
            expect(canceled.notes || '').not.toContain('penalty')
        })

        it('should apply penalty when canceling within the 48h window', async () => {
            // Create booking 1 day in the future (within 48h window)
            const nearStart = DateTime.utc().plus({ hours: 36 }).toISO()
            const nearEnd = DateTime.utc().plus({ hours: 37 }).toISO()

            const booking = await db.booking.create({
                data: {
                    providerId,
                    serviceId,
                    startUtc: new Date(nearStart),
                    endUtc: new Date(nearEnd),
                    customerEmail: 'policy@test.com',
                    userId: userId,
                    reference: 'POLICY-002',
                    status: 'pending'
                }
            })

            const canceled = await cancelBooking({ id: booking.id })

            expect(canceled.status).toBe('cancelled')
            expect(canceled.notes).toContain('penalty')
            expect(canceled.notes).toContain('48h')
            expect(canceled.notes).toContain('2500 cents')
        })
    })

    describe('Reschedule policy with custom windows', () => {
        it('should not apply penalty when rescheduling outside the 72h window', async () => {
            // Create booking 4 days in the future
            const futureStart = DateTime.utc().plus({ days: 4 }).toISO()
            const futureEnd = DateTime.utc().plus({ days: 4, hours: 1 }).toISO()

            const booking = await db.booking.create({
                data: {
                    providerId,
                    serviceId,
                    startUtc: new Date(futureStart),
                    endUtc: new Date(futureEnd),
                    customerEmail: 'policy@test.com',
                    userId: userId,
                    reference: 'POLICY-003',
                    status: 'pending'
                }
            })

            const newStart = DateTime.utc().plus({ days: 5 }).toISO()
            const newEnd = DateTime.utc().plus({ days: 5, hours: 1 }).toISO()

            const rescheduled = await rescheduleBooking({
                id: booking.id,
                newStartUtcISO: newStart,
                newEndUtcISO: newEnd
            })

            expect(rescheduled.status).toBe('confirmed')
            expect(rescheduled.notes || '').not.toContain('penalty')
        })

        it('should apply penalty when rescheduling within the 72h window', async () => {
            // Create booking 2 days in the future (within 72h window)
            const nearStart = DateTime.utc().plus({ hours: 48 }).toISO()
            const nearEnd = DateTime.utc().plus({ hours: 49 }).toISO()

            const booking = await db.booking.create({
                data: {
                    providerId,
                    serviceId,
                    startUtc: new Date(nearStart),
                    endUtc: new Date(nearEnd),
                    customerEmail: 'policy@test.com',
                    userId: userId,
                    reference: 'POLICY-004',
                    status: 'pending'
                }
            })

            const newStart = DateTime.utc().plus({ days: 3 }).toISO()
            const newEnd = DateTime.utc().plus({ days: 3, hours: 1 }).toISO()

            const rescheduled = await rescheduleBooking({
                id: booking.id,
                newStartUtcISO: newStart,
                newEndUtcISO: newEnd
            })

            expect(rescheduled.status).toBe('confirmed')
            expect(rescheduled.notes).toContain('penalty')
            expect(rescheduled.notes).toContain('72h')
            expect(rescheduled.notes).toContain('1500 cents')
        })
    })

    describe('Provider-specific policy configuration', () => {
        it('should respect different policy windows per provider', async () => {
            // Create a second provider with different policy
            const user2 = await db.user.create({
                data: { email: 'provider2@test.com', role: 'PROVIDER', name: 'Provider 2' }
            })

            const profile2 = await db.providerProfile.create({
                data: {
                    userId: user2.id,
                    name: 'Lenient Provider',
                    timezone: 'UTC',
                    cancellationWindowHours: 12, // Only 12 hours
                    rescheduleWindowHours: 12,
                    penaltiesApplyForLateCancel: false // No penalties
                }
            })

            const service2 = await db.service.create({
                data: {
                    providerId: profile2.id,
                    name: 'Lenient Service',
                    durationMinutes: 60
                }
            })

            // Create booking 18 hours in the future (outside 12h window, but inside 48h)
            const start = DateTime.utc().plus({ hours: 18 }).toISO()
            const end = DateTime.utc().plus({ hours: 19 }).toISO()

            const booking = await db.booking.create({
                data: {
                    providerId: profile2.id,
                    serviceId: service2.id,
                    startUtc: new Date(start),
                    endUtc: new Date(end),
                    customerEmail: 'policy@test.com',
                    userId: userId,
                    reference: 'LENIENT-001',
                    status: 'pending'
                }
            })

            const canceled = await cancelBooking({ id: booking.id })

            // Should not have penalty (outside 12h window AND penalties disabled)
            expect(canceled.status).toBe('cancelled')
            expect(canceled.notes || '').not.toContain('penalty')

            // Cleanup
            await db.booking.deleteMany({ where: { serviceId: service2.id } })
            await db.service.delete({ where: { id: service2.id } })
            await db.providerProfile.delete({ where: { id: profile2.id } })
            await db.user.delete({ where: { id: user2.id } })
        })
    })
})
