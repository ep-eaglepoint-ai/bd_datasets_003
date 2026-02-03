export const schema = `
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
  rescheduleBooking(bookingId: Int!, newStartUtcISO: String!, newEndUtcISO: String!): Booking!
}
`;
