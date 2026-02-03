export const schema = `
type ProviderProfile {
  id: Int!
  userId: Int!
  name: String!
  bio: String
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

input CreateProviderProfileInput {
  name: String!
  bio: String
}

input CreateServiceInput {
  name: String!
  durationMinutes: Int!
  capacity: Int
  bufferBeforeMinutes: Int
  bufferAfterMinutes: Int
}

type Mutation {
  createProviderProfile(input: CreateProviderProfileInput!): ProviderProfile!
  createService(input: CreateServiceInput!): Service!
}
`;
