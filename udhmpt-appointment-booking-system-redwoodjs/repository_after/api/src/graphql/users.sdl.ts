/*
  Minimal SDL placeholder that references Role enum conceptually.
  No business logic implemented here — scaffold only.
*/

export const schema = `
type Query {
  _empty: String
}

enum Role {
  PROVIDER
  CUSTOMER
  ADMIN
}
`;
