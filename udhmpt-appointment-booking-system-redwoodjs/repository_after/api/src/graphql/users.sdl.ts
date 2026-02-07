/*
  Minimal SDL placeholder that references Role enum conceptually.
  No business logic implemented here — scaffold only.
*/

export const schema = gql`
  type User {
    id: Int!
    email: String!
    name: String
    role: String!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  enum Role {
    PROVIDER
    CUSTOMER
    ADMIN
  }

  type Query {
    currentUser: User @requireAuth
  }
`
