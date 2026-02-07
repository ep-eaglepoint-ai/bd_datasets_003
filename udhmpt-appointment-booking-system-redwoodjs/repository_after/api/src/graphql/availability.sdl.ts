export const schema = gql`
  type RecurringAvailability {
    id: Int!
    providerId: Int!
    weekday: Int!
    startLocal: String!
    endLocal: String!
    tz: String!
  }

  type CustomDayAvailability {
    id: Int!
    providerId: Int!
    date: DateTime!
    startUtc: DateTime!
    endUtc: DateTime!
    tz: String!
  }

  type Slot {
    startUtcISO: String!
    endUtcISO: String!
    startLocalISO: String!
    endLocalISO: String!
  }

  type ManualBlock {
    id: Int!
    providerId: Int!
    startUtc: DateTime!
    endUtc: DateTime!
    reason: String
  }

  type AvailabilityException {
    id: Int!
    providerId: Int!
    startUtc: DateTime!
    endUtc: DateTime!
    reason: String
  }

  input ManualBlockInput {
    startUtcISO: String!
    endUtcISO: String!
    reason: String
  }

  input RecurringAvailabilityInput {
    weekday: Int!
    startLocal: String!
    endLocal: String!
  }

  input CustomDayAvailabilityInput {
    date: String!
    startLocal: String!
    endLocal: String!
  }

  input AvailabilityExceptionInput {
    startUtcISO: String!
    endUtcISO: String!
    reason: String
  }

  input SearchAvailabilityInput {
    providerId: Int!
    serviceId: Int!
    startISO: String!
    endISO: String!
    customerTz: String!
  }

  type Query {
    searchAvailability(input: SearchAvailabilityInput!): [Slot!]! @skipAuth
    recurringAvailabilities(providerId: Int!): [RecurringAvailability!]! @requireAuth(roles: ["PROVIDER"])
    customDayAvailabilities(providerId: Int!): [CustomDayAvailability!]! @requireAuth(roles: ["PROVIDER"])
    availabilityExceptions(providerId: Int!): [AvailabilityException!]! @requireAuth(roles: ["PROVIDER"])
  }

  type Mutation {
    createRecurringAvailability(
      input: RecurringAvailabilityInput!
    ): RecurringAvailability! @requireAuth(roles: ["PROVIDER"])
    createCustomDayAvailability(
      input: CustomDayAvailabilityInput!
    ): CustomDayAvailability! @requireAuth(roles: ["PROVIDER"])
    createAvailabilityException(
      input: AvailabilityExceptionInput!
    ): AvailabilityException! @requireAuth(roles: ["PROVIDER"])
    deleteAvailabilityException(id: Int!): AvailabilityException! @requireAuth(roles: ["PROVIDER"])
    createManualBlock(input: ManualBlockInput!): ManualBlock!
      @requireAuth(roles: ["PROVIDER"])
    deleteManualBlock(id: Int!): ManualBlock! @requireAuth(roles: ["PROVIDER"])
  }

  type Subscription {
    availabilityUpdated(input: SearchAvailabilityInput!): [Slot!]! @skipAuth
  }
`
