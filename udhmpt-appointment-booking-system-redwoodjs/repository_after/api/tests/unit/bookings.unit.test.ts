import { createBooking } from '../../src/services/bookings/bookings'
import { db } from '../../src/lib/db'
import { context } from '@redwoodjs/graphql-server'

// Mock the dependencies
jest.mock('../../src/lib/db', () => ({
    db: {
        $transaction: jest.fn(),
        booking: {
            count: jest.fn(),
        },
        service: {
            findUnique: jest.fn(),
        },
        providerProfile: {
            findUnique: jest.fn(),
        },
    },
}))

describe('createBooking Logic Unit Tests', () => {
    const mockTx = {
        service: { findUnique: jest.fn() },
        providerProfile: { findUnique: jest.fn() },
        booking: {
            findMany: jest.fn(),
            create: jest.fn(),
            count: jest.fn(),
        },
    }

    beforeEach(() => {
        jest.clearAllMocks()
        context.currentUser = { id: 1, email: 'user@test.com', role: 'CUSTOMER' }

            // Default transaction mock implementation
            ; (db.$transaction as jest.Mock).mockImplementation(async (callback) => {
                return callback(mockTx)
            })
    })

    test('Should correctly pick the first available slot', async () => {
        // Setup Service with capacity 3
        ; (db.service.findUnique as jest.Mock).mockResolvedValue({
            id: 1,
            capacity: 3,
            durationMinutes: 60,
            bufferBeforeMinutes: 0,
            bufferAfterMinutes: 0,
        })
            ; (db.providerProfile.findUnique as jest.Mock).mockResolvedValue({ id: 1, timezone: 'UTC', bookingLeadTimeHours: 1 })

        // Setup existing bookings: Slot 0 taken, Slot 2 taken. Slot 1 is free.
        mockTx.booking.findMany.mockResolvedValue([
            { serviceId: 1, capacitySlot: 0 },
            { serviceId: 1, capacitySlot: 2 },
        ])

        mockTx.booking.create.mockResolvedValue({ id: 999 })

        await createBooking({
            input: {
                providerId: 1,
                serviceId: 1,
                startUtcISO: '2030-12-01T10:00:00Z',
                endUtcISO: '2030-12-01T11:00:00Z',
                customerEmail: 'test@test.com',
            },
        })

        // Verify correct slot (1) was chosen
        expect(mockTx.booking.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    capacitySlot: 1,
                }),
            })
        )
    })

    test('Should throw Capacity exceeded if all slots taken', async () => {
        ; (db.service.findUnique as jest.Mock).mockResolvedValue({
            id: 1,
            capacity: 2, // Only 2 slots
            bufferBeforeMinutes: 0,
            bufferAfterMinutes: 0,
        })
            ; (db.providerProfile.findUnique as jest.Mock).mockResolvedValue({ id: 1, timezone: 'UTC', bookingLeadTimeHours: 1 })

        // Slots 0 and 1 taken
        mockTx.booking.findMany.mockResolvedValue([
            { serviceId: 1, capacitySlot: 0 },
            { serviceId: 1, capacitySlot: 1 },
        ])

        await expect(createBooking({
            input: {
                providerId: 1,
                serviceId: 1,
                startUtcISO: '2030-12-01T10:00:00Z',
                endUtcISO: '2030-12-01T11:00:00Z',
                customerEmail: 'test@test.com',
            },
        })).rejects.toThrow('Capacity exceeded')
    })
})
