import { PrismaLike } from './lib/db'
import { Role } from './lib/auth'

// Simple GraphQL server using existing patterns
const createGraphQLServer = (db: PrismaLike) => {
  const typeDefs = `
    scalar DateTime

    type Booking {
      id: Int!
      providerId: Int!
      serviceId: Int!
      startUtc: DateTime!
      endUtc: DateTime!
      customerEmail: String!
      reference: String!
      canceledAt: DateTime
      createdAt: DateTime!
      updatedAt: DateTime!
    }

    type Slot {
      startUtcISO: String!
      endUtcISO: String!
      startLocalISO: String!
      endLocalISO: String!
    }

    type Service {
      id: Int!
      providerId: Int!
      name: String!
      durationMinutes: Int!
      capacity: Int!
      bufferBeforeMinutes: Int!
      bufferAfterMinutes: Int!
    }

    input CreateBookingInput {
      providerId: Int!
      serviceId: Int!
      startUtcISO: String!
      endUtcISO: String!
      customerEmail: String!
      cutoffHours: Int
    }

    input SearchAvailabilityInput {
      providerId: Int!
      serviceId: Int
      startISO: String!
      endISO: String!
      customerTz: String!
    }

    type Query {
      bookings(providerId: Int, startISO: String, endISO: String): [Booking!]!
      searchAvailability(input: SearchAvailabilityInput!): [Slot!]!
    }

    type Mutation {
      createBooking(input: CreateBookingInput!): Booking!
      cancelBooking(bookingId: Int!): Booking!
    }
  `

  const resolvers = {
    Query: {
      bookings: async (_: any, { providerId, startISO, endISO }: any) => {
        const where: any = {}
        if (providerId) where.providerId = providerId
        if (startISO || endISO) {
          where.startUtc = {}
          if (startISO) where.startUtc.gte = new Date(startISO)
          if (endISO) where.startUtc.lte = new Date(endISO)
        }
        return db.booking.findMany({ where })
      },

      searchAvailability: async (_: any, { input }: any) => {
        const { searchAvailability } = await import('./services/availability/search')
        return searchAvailability(db, input)
      }
    },

    Mutation: {
      createBooking: async (_: any, { input }: any) => {
        const { createBooking } = await import('./services/bookings/bookings')
        const user = { id: 1, email: input.customerEmail, role: Role.CUSTOMER }
        return createBooking(user, input, db)
      },

      cancelBooking: async (_: any, { bookingId }: any) => {
        const { cancelBooking } = await import('./services/bookings/bookings')
        const user = { id: 1, email: 'user@example.com', role: Role.CUSTOMER }
        return cancelBooking(user, bookingId, db)
      }
    }
  }

  return { typeDefs, resolvers }
}

export { createGraphQLServer }
