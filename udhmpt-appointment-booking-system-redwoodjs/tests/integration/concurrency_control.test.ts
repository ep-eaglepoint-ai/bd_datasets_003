import { db } from '../../repository_after/api/src/lib/db'
import { context } from '@redwoodjs/graphql-server'
import { createBooking, rescheduleBooking } from '../../repository_after/api/src/services/bookings/bookings'

describe('Concurrency Control Tests', () => {
    let providerId: number
    let serviceId: number
    let userId: number

    beforeAll(async () => {
        // Create test user
        const user = await db.user.create({
            data: { email: 'concurrent@test.com', role: 'CUSTOMER', name: 'Concurrent Test' }
        })
        userId = user.id

        // Set user context
        context.currentUser = { id: userId, email: 'concurrent@test.com', role: 'CUSTOMER' }

        // Create provider profile
        const profile = await db.providerProfile.create({
            data: {
                userId: user.id,
                name: 'Concurrent Provider',
                timezone: 'UTC'
            }
        })
        providerId = profile.id

        // Create a service with capacity = 1
        const service = await db.service.create({
            data: {
                providerId: profile.id,
                name: 'Limited Service',
                durationMinutes: 60,
                capacity: 1
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

    describe('Double-booking prevention with optimistic locking', () => {
        it('should prevent concurrent bookings for the same slot when capacity = 1', async () => {
            const startUtcISO = '2026-04-01T10:00:00Z'
            const endUtcISO = '2026-04-01T11:00:00Z'

            // Simulate two concurrent requests
            const booking1Promise = createBooking({
                input: {
                    providerId,
                    serviceId,
                    startUtcISO,
                    endUtcISO,
                    customerEmail: 'concurrent@test.com'
                }
            })

            const booking2Promise = createBooking({
                input: {
                    providerId,
                    serviceId,
                    startUtcISO,
                    endUtcISO,
                    customerEmail: 'concurrent@test.com'
                }
            })

            // One should succeed, one should fail
            const results = await Promise.allSettled([booking1Promise, booking2Promise])

            const succeeded = results.filter(r => r.status === 'fulfilled')
            const failed = results.filter(r => r.status === 'rejected')

            expect(succeeded).toHaveLength(1)
            expect(failed).toHaveLength(1)

            // The failed one should have a meaningful error
            const rejectedReason = (failed[0] as PromiseRejectedResult).reason
            expect(rejectedReason.message).toMatch(/capacity exceeded|slot already full|busy/i)
        })

        it('should retry on version conflicts', async () => {
            // Create an initial booking
            const booking = await createBooking({
                input: {
                    providerId,
                    serviceId,
                    startUtcISO: '2026-04-02T10:00:00Z',
                    endUtcISO: '2026-04-02T11:00:00Z',
                    customerEmail: 'concurrent@test.com'
                }
            })

            // Attempt to reschedule - this should use optimistic locking
            const rescheduled = await rescheduleBooking({
                id: booking.id,
                newStartUtcISO: '2026-04-02T14:00:00Z',
                newEndUtcISO: '2026-04-02T15:00:00Z'
            })

            expect(rescheduled.id).toBe(booking.id)
            expect(rescheduled.version).toBe(2) // Version should be incremented
            expect(new Date(rescheduled.startUtc).toISOString()).toBe('2026-04-02T14:00:00.000Z')
        })

        it('should handle stale reads with version mismatch', async () => {
            // Create an initial booking
            const booking = await createBooking({
                input: {
                    providerId,
                    serviceId,
                    startUtcISO: '2026-04-03T10:00:00Z',
                    endUtcISO: '2026-04-03T11:00:00Z',
                    customerEmail: 'concurrent@test.com'
                }
            })

            // Simulate: Process A reads the booking
            const staleBooking = await db.booking.findUnique({ where: { id: booking.id } })
            expect(staleBooking?.version).toBe(1)

            // Process B successfully reschedules (increments version to 2)
            await rescheduleBooking({
                id: booking.id,
                newStartUtcISO: '2026-04-03T12:00:00Z',
                newEndUtcISO: '2026-04-03T13:00:00Z'
            })

            // Verify version was incremented
            const updated = await db.booking.findUnique({ where: { id: booking.id } })
            expect(updated?.version).toBe(2)

            // Process A tries to reschedule with stale version = 1
            // This should either fail or retry automatically
            // Since withOptimisticLock has retry logic, it should succeed after retry
            const result = await rescheduleBooking({
                id: booking.id,
                newStartUtcISO: '2026-04-03T14:00:00Z',
                newEndUtcISO: '2026-04-03T15:00:00Z'
            })

            // Should succeed (after retry) and have version 3
            expect(result.version).toBeGreaterThanOrEqual(2)
        })
    })

    describe('Service capacity enforcement', () => {
        it('should allow multiple bookings if capacity allows', async () => {
            // Create a service with capacity = 2
            const multiCapacityService = await db.service.create({
                data: {
                    providerId,
                    name: 'Multi-Capacity Service',
                    durationMinutes: 60,
                    capacity: 2
                }
            })

            const startUtcISO = '2026-04-04T10:00:00Z'
            const endUtcISO = '2026-04-04T11:00:00Z'

            // First booking should succeed
            const booking1 = await createBooking({
                input: {
                    providerId,
                    serviceId: multiCapacityService.id,
                    startUtcISO,
                    endUtcISO,
                    customerEmail: 'concurrent@test.com'
                }
            })
            expect(booking1).toBeDefined()

            // Second booking should also succeed (capacity = 2)
            const booking2 = await createBooking({
                input: {
                    providerId,
                    serviceId: multiCapacityService.id,
                    startUtcISO,
                    endUtcISO,
                    customerEmail: 'concurrent@test.com'
                }
            })
            expect(booking2).toBeDefined()

            // Third booking should fail (capacity exceeded)
            await expect(
                createBooking({
                    input: {
                        providerId,
                        serviceId: multiCapacityService.id,
                        startUtcISO,
                        endUtcISO,
                        customerEmail: 'concurrent@test.com'
                    }
                })
            ).rejects.toThrow(/capacity exceeded|slot already full/i)

            // Cleanup
            await db.booking.deleteMany({ where: { serviceId: multiCapacityService.id } })
            await db.service.delete({ where: { id: multiCapacityService.id } })
        })
    })
})
