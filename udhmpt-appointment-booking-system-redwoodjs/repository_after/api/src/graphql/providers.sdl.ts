export const schema = gql`
  type ProviderProfile {
    id: Int!
    userId: Int!
    name: String!
    bio: String
    timezone: String!
    maxBookingsPerDay: Int
    cancellationFeeCents: Int
    rescheduleFeeCents: Int
    penaltiesApplyForLateCancel: Boolean!
    cancellationWindowHours: Int!
    rescheduleWindowHours: Int!
    bookingLeadTimeHours: Int!
  }

  input CreateProviderProfileInput {
    name: String!
    bio: String
    timezone: String
    bookingLeadTimeHours: Int
    maxBookingsPerDay: Int
    cancellationWindowHours: Int
    rescheduleWindowHours: Int
    cancellationFeeCents: Int
    rescheduleFeeCents: Int
    penaltiesApplyForLateCancel: Boolean
  }

  input UpdateProviderProfileInput {
    name: String
    bio: String
    timezone: String
    bookingLeadTimeHours: Int
    maxBookingsPerDay: Int
    cancellationWindowHours: Int
    rescheduleWindowHours: Int
    cancellationFeeCents: Int
    rescheduleFeeCents: Int
    penaltiesApplyForLateCancel: Boolean
  }

  input CreateServiceInput {
    name: String!
    durationMinutes: Int!
    capacity: Int
    bufferBeforeMinutes: Int
    bufferAfterMinutes: Int
  }

  type Query {
    myProviderProfile: ProviderProfile @requireAuth(roles: ["PROVIDER"])
    providerProfiles: [ProviderProfile!]! @skipAuth
  }

  type Mutation {
    createProviderProfile(input: CreateProviderProfileInput!): ProviderProfile! @requireAuth(roles: ["PROVIDER"])
    updateProviderProfile(input: UpdateProviderProfileInput!): ProviderProfile! @requireAuth(roles: ["PROVIDER"])
    createService(input: CreateServiceInput!): Service! @requireAuth(roles: ["PROVIDER"])
  }
`
