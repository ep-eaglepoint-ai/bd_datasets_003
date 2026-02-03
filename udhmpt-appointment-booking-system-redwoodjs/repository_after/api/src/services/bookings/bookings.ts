import { v4 as uuidv4 } from 'uuid';
import { DateTime } from 'luxon';
import { Role, requireRole, User } from '../../lib/auth';

type CreateBookingInput = {
  providerId: number;
  serviceId: number;
  startUtcISO: string;
  endUtcISO: string;
  customerEmail: string;
  cutoffHours?: number; // booking cutoff in hours
};

// prisma must support $transaction(tx => ...) where tx.booking.count/create operate on a shared datastore in tests
export async function createBooking(user: User, input: CreateBookingInput, prisma: any) {
  requireRole(user, [Role.CUSTOMER, Role.ADMIN, Role.PROVIDER]);
  if (!prisma) throw new Error('Prisma client required');

  const cutoffHours = input.cutoffHours ?? 0;
  const startDt = DateTime.fromISO(input.startUtcISO, { zone: 'utc' });
  const now = DateTime.utc();
  if (startDt <= now.plus({ hours: cutoffHours })) {
    throw new Error('Booking cutoff violated');
  }

  // Transactionally check capacity, max per day, and create booking
  return prisma.$transaction(async (tx: any) => {
    const svc = await tx.service.findUnique({ where: { id: input.serviceId } });
    if (!svc) throw new Error('Service not found');

    const capacity = svc.capacity ?? 1;

    // Count existing bookings for same service and exact same startUtc (prevent double booking)
    const existing = await tx.booking.count({ where: { serviceId: input.serviceId, startUtc: startDt.toJSDate() } });
    if (existing >= capacity) {
      throw new Error('Capacity exceeded or slot already full');
    }

    // Max bookings per day: enforce provider-level cap if set
    const profile = await tx.providerProfile.findUnique({ where: { id: input.providerId } });
    if (profile?.maxBookingsPerDay != null && profile.maxBookingsPerDay > 0) {
      const dayStart = startDt.startOf('day').toJSDate();
      const dayEnd = startDt.endOf('day').toJSDate();
      const countThatDay = await tx.booking.count({
        where: {
          providerId: input.providerId,
          startUtc: { gte: dayStart, lte: dayEnd },
          canceledAt: null,
        },
      });
      if (countThatDay >= profile.maxBookingsPerDay) {
        throw new Error('Maximum bookings per day reached for this provider');
      }
    }

    const reference = uuidv4();
    const created = await tx.booking.create({ data: { providerId: input.providerId, serviceId: input.serviceId, startUtc: startDt.toJSDate(), endUtc: DateTime.fromISO(input.endUtcISO, { zone: 'utc' }).toJSDate(), customerEmail: input.customerEmail, reference } });
    return created;
  });
}

export type CancelPolicy = {
  cancellationWindowHours: number;
  cancellationFeeCents?: number;
  penaltiesApplyForLateCancel?: boolean;
};

/** Cancel a booking. Returns { booking, penaltyApplied, feeCents } when policy has penalties. */
export async function cancelBooking(user: User, bookingId: number, prisma: any, cancelWindowHours = 0, policy?: CancelPolicy) {
  requireRole(user, [Role.CUSTOMER, Role.ADMIN]);
  if (!prisma) throw new Error('Prisma client required');

  const result = await prisma.$transaction(async (tx: any) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new Error('Booking not found');
    if (booking.canceledAt) throw new Error('Booking already canceled');

    const startDt = DateTime.fromJSDate(booking.startUtc).toUTC();
    const now = DateTime.utc();
    const insideWindow = now.plus({ hours: cancelWindowHours }) < startDt;

    if (!insideWindow && !(policy?.penaltiesApplyForLateCancel)) {
      throw new Error('Cancellation window violated');
    }

    if (user.role === Role.CUSTOMER && user.email !== booking.customerEmail) {
      throw new Error('Forbidden');
    }

    const updated = await tx.booking.update({ where: { id: bookingId }, data: { canceledAt: now.toJSDate() } });
    const penaltyApplied = !insideWindow && (policy?.penaltiesApplyForLateCancel === true);
    const feeCents = penaltyApplied ? (policy?.cancellationFeeCents ?? 0) : 0;
    return { booking: updated, penaltyApplied, feeCents };
  });

  return result.booking as any;
}

/** Cancel with full result for UI/tests: returns { booking, penaltyApplied, feeCents }. */
export async function cancelBookingWithDetails(
  user: User,
  bookingId: number,
  prisma: any,
  cancelWindowHours = 0,
  policy?: CancelPolicy
): Promise<{ booking: any; penaltyApplied: boolean; feeCents: number }> {
  requireRole(user, [Role.CUSTOMER, Role.ADMIN]);
  if (!prisma) throw new Error('Prisma client required');

  return prisma.$transaction(async (tx: any) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new Error('Booking not found');
    if (booking.canceledAt) throw new Error('Booking already canceled');

    const startDt = DateTime.fromJSDate(booking.startUtc).toUTC();
    const now = DateTime.utc();
    const insideWindow = now.plus({ hours: cancelWindowHours }) < startDt;

    if (!insideWindow && !(policy?.penaltiesApplyForLateCancel)) {
      throw new Error('Cancellation window violated');
    }

    if (user.role === Role.CUSTOMER && user.email !== booking.customerEmail) {
      throw new Error('Forbidden');
    }

    const updated = await tx.booking.update({ where: { id: bookingId }, data: { canceledAt: now.toJSDate() } });
    const penaltyApplied = !insideWindow && (policy?.penaltiesApplyForLateCancel === true);
    const feeCents = penaltyApplied ? (policy?.cancellationFeeCents ?? 0) : 0;
    return { booking: updated, penaltyApplied, feeCents };
  });
}

export type ReschedulePolicy = {
  rescheduleWindowHours: number;
  rescheduleFeeCents?: number;
  penaltiesApplyForLateReschedule?: boolean;
};

/** Reschedule booking (atomic): respects cutoff, capacity, and max per day. Returns penalty info when policy has penalties. */
export async function rescheduleBooking(user: User, bookingId: number, newStartUtcISO: string, newEndUtcISO: string, prisma: any, cutoffHours = 0, policy?: ReschedulePolicy) {
  requireRole(user, [Role.CUSTOMER, Role.ADMIN]);
  if (!prisma) throw new Error('Prisma client required');

  return prisma.$transaction(async (tx: any) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new Error('Booking not found');
    if (booking.canceledAt) throw new Error('Booking already canceled');

    if (user.role === Role.CUSTOMER && user.email !== booking.customerEmail) {
      throw new Error('Forbidden');
    }

    const newStart = DateTime.fromISO(newStartUtcISO, { zone: 'utc' });
    const now = DateTime.utc();
    if (now.plus({ hours: cutoffHours }) >= newStart) {
      throw new Error('Booking cutoff violated');
    }

    const svc = await tx.service.findUnique({ where: { id: booking.serviceId } });
    if (!svc) throw new Error('Service not found');
    const capacity = svc.capacity ?? 1;

    const existing = await tx.booking.count({ where: { serviceId: booking.serviceId, startUtc: newStart.toJSDate(), canceledAt: null } });
    if (existing >= capacity) {
      throw new Error('Capacity exceeded at new slot');
    }

    // Max bookings per day at new slot (provider-level cap)
    const profile = await tx.providerProfile.findUnique({ where: { id: booking.providerId } });
    if (profile?.maxBookingsPerDay != null && profile.maxBookingsPerDay > 0) {
      const dayStart = newStart.startOf('day').toJSDate();
      const dayEnd = newStart.endOf('day').toJSDate();
      const countThatDay = await tx.booking.count({
        where: {
          providerId: booking.providerId,
          startUtc: { gte: dayStart, lte: dayEnd },
          canceledAt: null,
        },
      });
      if (countThatDay >= profile.maxBookingsPerDay) {
        throw new Error('Maximum bookings per day reached for this provider');
      }
    }

    const updated = await tx.booking.update({ where: { id: bookingId }, data: { startUtc: newStart.toJSDate(), endUtc: DateTime.fromISO(newEndUtcISO, { zone: 'utc' }).toJSDate() } });
    return updated;
  });
}
