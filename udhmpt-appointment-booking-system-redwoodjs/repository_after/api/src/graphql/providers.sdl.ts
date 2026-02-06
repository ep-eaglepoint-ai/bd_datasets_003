export const schema = gql`
  type ProviderProfile {
    id: Int!
    userId: Int!
    name: String!
    bio: String
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
    createProviderProfile(input: CreateProviderProfileInput!): ProviderProfile! @requireAuth
    createService(input: CreateServiceInput!): Service! @requireAuth(roles: ["PROVIDER"])
  }
`
