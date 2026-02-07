export const schema = gql`
  type Booking {
    id: Int!
    providerId: Int!
    serviceId: Int!
    startUtc: DateTime!
    endUtc: DateTime!
    customerEmail: String!
    reference: String!
    canceledAt: DateTime
    status: String!
    notes: String
    penaltyFeeCents: Int
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input CreateBookingInput {
    providerId: Int!
    serviceId: Int!
    startUtcISO: String!
    endUtcISO: String!
    customerEmail: String!
  }

  type Query {
    bookings(
      providerId: Int
      startISO: String
      endISO: String
    ): [Booking!]! @requireAuth
    booking(id: Int!): Booking @requireAuth
  }

  input UpdateBookingInput {
    status: String
    notes: String
  }

  type Mutation {
    createBooking(input: CreateBookingInput!): Booking! @requireAuth
    updateBooking(id: Int!, input: UpdateBookingInput!): Booking! @requireAuth
    cancelBooking(id: Int!): Booking! @requireAuth
    rescheduleBooking(
      id: Int!
      newStartUtcISO: String!
      newEndUtcISO: String!
    ): Booking! @requireAuth
  }
`
