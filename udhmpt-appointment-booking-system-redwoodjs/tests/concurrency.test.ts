import { db } from '../../src/lib/db'
import { createBooking } from '../../src/services/bookings/bookings'
import { context } from '@redwoodjs/graphql-server'
import { DateTime } from 'luxon'

// This test uses the REAL database (SQLite dev.db) to verify concurrency logic.
// It ensures that the UNIQUE(providerId, startUtc, capacitySlot) constraint
// prevents double-bookings even when parallel requests are fired.

describe('Real DB Concurrency Integration', () => {
    let providerId: number
    let serviceId: number
    let userId: number

    beforeAll(async () => {
        // Enable WAL mode and busy_timeout to reduce "database is locked" flakiness
        try {
            await db.$queryRawUnsafe('PRAGMA journal_mode = WAL;')
            await db.$queryRawUnsafe('PRAGMA busy_timeout = 5000;')
        } catch (e) {
            console.warn('Failed to set PRAGMA:', e)
        }

        // 1. Create a fresh customer
        const user = await db.user.create({
            data: {
                email: `concurrency-customer-${Date.now()}@test.com`,
                role: 'CUSTOMER'
            }
        })
        userId = user.id

        // 2. Create a provider
        const providerUser = await db.user.create({
            data: {
                email: `concurrency-provider-${Date.now()}@test.com`,
                role: 'PROVIDER'
            }
        })
        const profile = await db.providerProfile.create({
            data: {
                userId: providerUser.id,
                name: 'Concurrency Test Provider'
            }
        })
        providerId = profile.id

        // 3. Create a service with CAPACITY = 1
        const service = await db.service.create({
            data: {
                providerId: profile.id,
                name: 'Single Slot Service',
                durationMinutes: 60,
                capacity: 1,
            }
        })
        serviceId = service.id
    })

    test('Parallel createBooking calls should correctly allocate capacitySlot and prevent double-booking', async () => {
        // Mock authenticated user as the customer we created
        context.currentUser = {
            id: userId,
            email: 'customer@test.com',
            role: 'CUSTOMER'
        }

        const startUtcISO = DateTime.utc().plus({ days: 30 }).startOf('hour').toISO()!
        const endUtcISO = DateTime.utc().plus({ days: 30 }).startOf('hour').plus({ hours: 1 }).toISO()!

        // Trigger 5 parallel attempts (reduced from 10 to fit within SQLite limits while proving concurrency)
        const attempts = 5
        const promises = []

        for (let i = 0; i < attempts; i++) {
            promises.push(
                createBooking({
                    input: {
                        providerId,
                        serviceId,
                        startUtcISO,
                        endUtcISO,
                        customerEmail: `concurrent-user-${i}@test.com`
                    }
                }).catch(e => {
                    return e
                })
            )
        }

        const results = await Promise.all(promises)

        const successes = results.filter(r => r && typeof r === 'object' && 'id' in r)
        const failures = results.filter(r => r instanceof Error)

        // Log finding
        console.log(`Concurrency Test Results: ${successes.length} successes, ${failures.length} failures out of ${attempts} attempts.`)

        // ASSERTION 1: Exactly 1 success
        expect(successes.length).toBe(1)

        // ASSERTION 2: Remaining attempts failed
        expect(failures.length).toBe(attempts - 1)

        // ASSERTION 3: Verification in DB
        const bookingsInDb = await db.booking.findMany({
            where: {
                providerId,
                startUtc: DateTime.fromISO(startUtcISO).toJSDate(),
                canceledAt: null
            }
        })
        expect(bookingsInDb.length).toBe(1)
        expect((bookingsInDb[0] as any).capacitySlot).toBe(0)

        // Check failure messages: MUST be valid domain/schema errors.
        // REJECT "database is locked" or timeouts as FAILURES of the test environment.
        const failureMessages = failures.map(f => f.message)
        const infraErrors = failureMessages.filter(m =>
            m.toLowerCase().includes('database is locked') ||
            m.toLowerCase().includes('timed out') ||
            m.toLowerCase().includes('close') ||
            m.includes('P2024') || // Connection/Transaction Timeout
            m.includes('P2025')    // Record not found (can happen if transaction fails internally) -> No, P2025 is logic if it was deleted, but here we don't delete.
        )

        if (infraErrors.length > 0) {
            console.error('Test Failed due to Infrastructure Errors:', infraErrors)
        }

        // Fail if we have infra errors
        expect(infraErrors.length).toBe(0)

        // Confirm logic errors: Must be either capacity or unique constraint
        expect(failureMessages.every(m =>
            m.includes('Capacity exceeded') ||
            m.includes('Unique constraint failed') || // P2002
            m.includes('P2002') ||
            m.includes('P2033') // Number overflow
        )).toBe(true)
    }, 30000)

    test('Parallel createBooking with DIFFERENT services should SUCCEED (Overlaps allowed)', async () => {
        // Mock authenticated user
        context.currentUser = {
            id: userId,
            email: 'customer@test.com',
            role: 'CUSTOMER'
        }

        const startUtcISO = DateTime.utc().plus({ days: 31 }).startOf('hour').toISO()!
        const endUtcISO = DateTime.utc().plus({ days: 31 }).startOf('hour').plus({ hours: 1 }).toISO()!

        // Create a SECOND service
        const service2 = await db.service.create({
            data: {
                providerId: providerId,
                name: 'Second Service',
                durationMinutes: 60,
                capacity: 1,
            }
        })

        // Book Service 1
        await createBooking({
            input: {
                providerId,
                serviceId,
                startUtcISO,
                endUtcISO,
                customerEmail: 'user1@test.com'
            }
        })

        // Book Service 2 at SAME time (should SUCCEED)
        const b2 = await createBooking({
            input: {
                providerId,
                serviceId: service2.id,
                startUtcISO,
                endUtcISO,
                customerEmail: 'user2@test.com'
            }
        })
        expect(b2.id).toBeDefined()
    })

    afterAll(async () => {
        // Cleanup
        try {
            await db.booking.deleteMany({ where: { providerId } })
            await db.service.deleteMany({ where: { providerId } })
            await db.providerProfile.delete({ where: { id: providerId } })
            await db.user.delete({ where: { id: userId } })
        } catch (e) {
            console.warn('Cleanup failed:', (e as any).message)
        }
    })
})
