import { Prisma } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import { DateTime } from 'luxon'
import { db } from '../../lib/db'
import {
  getAuthenticatedUser,
  isAdmin,
  validateBookingAccess,
  getOwnProviderProfileId,
} from '../../lib/auth'
import { context } from '@redwoodjs/graphql-server'

/**
 * Optimistic locking helper with automatic retry for concurrency conflicts.
 */
const withOptimisticLock = async <T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      const isConcurrencyConflict =
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          [
            'P2025', // Record not found (stale version)
            'P2002', // Unique constraint failed (race on slot)
            'P2033', // Large number (unexpected lock state)
            'P2024', // Pool timeout (connection peak)
            'P2034', // Transaction write conflict
            'P2028', // Transaction failed/closed
          ].includes(error.code)) ||
        (error instanceof Error &&
          (error.message.includes('Transaction closed') ||
            error.message.includes('Database is locked')))

      if (isConcurrencyConflict && attempt < maxRetries - 1) {
        // Jittered exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 100 + Math.random() * 50)
        )
        continue
      }
      throw error
    }
  }
  throw new Error('Max retries exceeded for optimistic lock')
}

export const bookings = async ({
  providerId,
  startISO,
  endISO,
}: {
  providerId?: number
  startISO?: string
  endISO?: string
}) => {
  const user = getAuthenticatedUser()

  const where: any = {}
  if (startISO || endISO) {
    where.startUtc = {}
    if (startISO) where.startUtc.gte = new Date(startISO)
    if (endISO) where.startUtc.lte = new Date(endISO)
  }

  // 1. Admins can see any bookings filter
  if (isAdmin(user)) {
    if (providerId) where.providerId = providerId
    return db.booking.findMany({ where })
  }

  // 2. Providers see only their own bookings
  if (user.role === 'PROVIDER' || user.roles?.includes('PROVIDER')) {
    const profileId = await getOwnProviderProfileId()
    where.providerId = profileId
    return db.booking.findMany({ where })
  }

  // 3. Customers see only bookings they created
  where.userId = user.id
  return db.booking.findMany({ where })
}

export const booking = async ({ id }: { id: number }) => {
  return validateBookingAccess(id)
}

export const createBooking = async ({
  input,
}: {
  input: {
    providerId: number
    serviceId: number
    startUtcISO: string
    endUtcISO: string
    customerEmail: string
  }
}) => {
  const { providerId, serviceId, startUtcISO, endUtcISO, customerEmail } = input
  const user = getAuthenticatedUser()
  const now = DateTime.utc()

  const svc = await db.service.findUnique({ where: { id: serviceId } })
  if (!svc) throw new Error('Service not found')

  const profile = await db.providerProfile.findUnique({
    where: { id: providerId },
  })
  if (!profile) throw new Error('Provider profile not found')

  return withOptimisticLock(async () => {
    const result = await db.$transaction(
      async (tx) => {

        // 1. Lead-time Enforcement
        const startDt = DateTime.fromISO(startUtcISO, { zone: 'utc' })
        const leadTime = (profile as any)?.bookingLeadTimeHours ?? 1
        const cutoffHours = leadTime
        if (startDt <= now.plus({ hours: cutoffHours })) {
          throw new Error(`Must book at least ${cutoffHours} hour(s) in advance`)
        }

        // 2. Capacity & Overlap Validation
        const endDt = DateTime.fromISO(endUtcISO, { zone: 'utc' })
        const bufferBefore = svc.bufferBeforeMinutes ?? 0
        const bufferAfter = svc.bufferAfterMinutes ?? 0

        const effectiveStart = startDt.minus({ minutes: bufferBefore })
        const effectiveEnd = endDt.plus({ minutes: bufferAfter })

        const existingBookings = await tx.booking.findMany({
          where: {
            providerId,
            canceledAt: null,
            startUtc: { lt: effectiveEnd.toJSDate() },
            endUtc: { gt: effectiveStart.toJSDate() },
          },
        })

        const capacity = svc.capacity ?? 1
        const usedSlots = new Set(
          existingBookings
            .filter((b) => b.serviceId === serviceId)
            .map((b) => (b as any).capacitySlot as number ?? -1)
        )

        let availableSlot = -1
        for (let i = 0; i < capacity; i++) {
          if (!usedSlots.has(i)) {
            availableSlot = i
            break
          }
        }

        if (availableSlot === -1) {
          throw new Error('Capacity exceeded')
        }

        if (profile?.maxBookingsPerDay && profile.maxBookingsPerDay > 0) {
          const dayStart = startDt.startOf('day').toJSDate()
          const dayEnd = startDt.endOf('day').toJSDate()
          const countThatDay = await tx.booking.count({
            where: {
              providerId,
              startUtc: { gte: dayStart, lte: dayEnd },
              canceledAt: null,
            },
          })
          if (countThatDay >= profile.maxBookingsPerDay) {
            throw new Error('Maximum bookings per day reached for this provider')
          }
        }

        // 4. Persistence
        const reference = uuidv4()
        const result = await (tx.booking as any).create({
          data: {
            provider: { connect: { id: providerId } },
            service: { connect: { id: serviceId } },
            user: { connect: { id: user.id } },
            startUtc: startDt.toJSDate(),
            endUtc: endDt.toJSDate(),
            customerEmail,
            capacitySlot: availableSlot,
            reference,
            status: 'pending',
            notes: '',
            version: 1,
          },
        })

        return result
      },
      { maxWait: 15000, timeout: 20000 }
    )

      // Notify subscribers AFTER successful transaction commit
      ; (context as any).pubSub?.publish('availabilityUpdated', providerId)

    return result
  })
}

export const cancelBooking = async ({ id }: { id: number }) => {
  const booking = await validateBookingAccess(id)
  if (booking.canceledAt) throw new Error('Booking already canceled')

  const provider = await db.providerProfile.findUnique({
    where: { id: booking.providerId },
  })
  const now = DateTime.utc()
  const startDt = DateTime.fromJSDate(booking.startUtc)

  const windowHours = provider?.cancellationWindowHours ?? 24
  const penaltiesApply = provider?.penaltiesApplyForLateCancel ?? false
  const cancellationFee = provider?.cancellationFeeCents ?? 0
  const isLate = now.plus({ hours: windowHours }) > startDt

  let fee = isLate && penaltiesApply ? cancellationFee : 0

  return withOptimisticLock(async () => {
    const result = await (db.booking as any).update({
      where: { id, version: booking.version },
      data: {
        canceledAt: new Date(),
        status: 'cancelled',
        capacitySlot: null,
        penaltyFeeCents: fee,
        version: { increment: 1 },
        notes:
          fee > 0
            ? `Late cancellation penalty applied (within ${windowHours}h window): ${fee} cents`
            : booking.notes,
      },
    })

      ; (context as any).pubSub?.publish('availabilityUpdated', booking.providerId)

    return result
  })
}

export const rescheduleBooking = async ({
  id,
  newStartUtcISO,
  newEndUtcISO,
}: {
  id: number
  newStartUtcISO: string
  newEndUtcISO: string
}) => {
  const original = await validateBookingAccess(id)
  if (original.canceledAt) throw new Error('Booking already canceled')

  const provider = await db.providerProfile.findUnique({
    where: { id: original.providerId },
  })
  if (!provider) throw new Error('Provider not found')

  const svc = await db.service.findUnique({ where: { id: original.serviceId } })
  if (!svc) throw new Error('Service not found')

  const newStart = DateTime.fromISO(newStartUtcISO, { zone: 'utc' })
  const newEnd = DateTime.fromISO(newEndUtcISO, { zone: 'utc' })
  const now = DateTime.utc()

  const leadTime = (provider as any).bookingLeadTimeHours ?? 1
  if (newStart <= now.plus({ hours: leadTime })) {
    throw new Error(`Must reschedule at least ${leadTime} hour(s) in advance`)
  }

  const windowHours = provider.rescheduleWindowHours ?? 24
  const penaltiesApply = provider.penaltiesApplyForLateCancel ?? false
  const rescheduleFee = provider.rescheduleFeeCents ?? 0
  const originalStart = DateTime.fromJSDate(original.startUtc)
  const isLate = now.plus({ hours: windowHours }) > originalStart

  let fee = isLate && penaltiesApply ? rescheduleFee : 0

  return withOptimisticLock(async () => {
    const result = await db.$transaction(
      async (tx) => {
        const bufferBefore = svc.bufferBeforeMinutes ?? 0
        const bufferAfter = svc.bufferAfterMinutes ?? 0
        const effectiveStart = newStart.minus({ minutes: bufferBefore })
        const effectiveEnd = newEnd.plus({ minutes: bufferAfter })

        const overlapping = await tx.booking.findMany({
          where: {
            id: { not: id },
            providerId: original.providerId,
            canceledAt: null,
            startUtc: { lt: effectiveEnd.toJSDate() },
            endUtc: { gt: effectiveStart.toJSDate() },
          },
        })

        const capacity = svc.capacity ?? 1
        const usedSlots = new Set(
          overlapping
            .filter((b) => b.serviceId === original.serviceId)
            .map((b) => (b as any).capacitySlot ?? -1)
        )

        let availableSlot = -1
        for (let i = 0; i < capacity; i++) {
          if (!usedSlots.has(i)) {
            availableSlot = i
            break
          }
        }

        if (availableSlot === -1) {
          throw new Error('Capacity exceeded at new slot')
        }

        const result = await (tx.booking as any).update({
          where: { id, version: original.version },
          data: {
            startUtc: newStart.toJSDate(),
            endUtc: newEnd.toJSDate(),
            status: 'confirmed',
            capacitySlot: availableSlot,
            penaltyFeeCents: fee,
            version: { increment: 1 },
            notes:
              fee > 0
                ? `Late rescheduling penalty applied (within ${windowHours}h window): ${fee} cents`
                : original.notes,
          },
        })

        return result
      },
      { maxWait: 15000, timeout: 20000 }
    )

      // Notify subscribers AFTER successful transaction commit
      ; (context as any).pubSub?.publish('availabilityUpdated', original.providerId)

    return result
  })
}

export const updateBooking = async ({
  id,
  input,
}: {
  id: number
  input: { status?: string; notes?: string }
}) => {
  const booking = await validateBookingAccess(id)

  return withOptimisticLock(async () => {
    return (db.booking as any).update({
      where: { id, version: booking.version },
      data: {
        status: input.status,
        notes: input.notes,
        version: { increment: 1 },
      },
    })
  })
}
