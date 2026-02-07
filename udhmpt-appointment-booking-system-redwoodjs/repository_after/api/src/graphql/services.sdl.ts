export const schema = gql`
  type Service {
    id: Int!
    providerId: Int!
    name: String!
    durationMinutes: Int!
    capacity: Int!
    bufferBeforeMinutes: Int!
    bufferAfterMinutes: Int!
  }

  type Query {
    services(providerId: Int): [Service!]! @skipAuth
    service(id: Int!): Service @skipAuth
  }
`
