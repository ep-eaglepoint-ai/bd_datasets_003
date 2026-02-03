import { PrismaLike } from '../../lib/db'

export const bookings = {
  createBooking: {
    args: {
      input: { type: 'CreateBookingInput!', required: true }
    },
    resolve: (_root: any, { input }: any, context: { db: PrismaLike }) => {
      return context.db.booking.create({
        data: {
          ...input,
          startUtc: new Date(input.startUtcISO),
          endUtc: new Date(input.endUtcISO),
          reference: `BK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }
      })
    }
  },

  cancelBooking: {
    args: { bookingId: { type: 'Int!', required: true } },
    resolve: (_root: any, { bookingId }: any, context: { db: PrismaLike }) => {
      return context.db.booking.update({
        where: { id: bookingId },
        data: { canceledAt: new Date() }
      })
    }
  },

  rescheduleBooking: {
    args: {
      bookingId: { type: 'Int!', required: true },
      newStartUtcISO: { type: 'String!', required: true },
      newEndUtcISO: { type: 'String!', required: true }
    },
    resolve: (_root: any, { bookingId, newStartUtcISO, newEndUtcISO }: any, context: { db: PrismaLike }) => {
      return context.db.booking.update({
        where: { id: bookingId },
        data: {
          startUtc: new Date(newStartUtcISO),
          endUtc: new Date(newEndUtcISO)
        }
      })
    }
  }
}
