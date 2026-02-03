export const schema = `
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
  date: String! # YYYY-MM-DD
  startUtc: String!
  endUtc: String!
  tz: String!
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

type Mutation {
  createRecurringAvailability(input: RecurringAvailabilityInput!): RecurringAvailability!
  createCustomDayAvailability(input: CustomDayAvailabilityInput!): CustomDayAvailability!
}
`;
