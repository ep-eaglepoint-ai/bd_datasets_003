export const schema = gql`
  type Query {
    solveCube(scramble: String!): [String!]! @skipAuth
  }
`
