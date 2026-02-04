export const typeDefs = `#graphql
  type User {
    id: ID!
    name: String!
    email: String!
    posts: [Post!]!
    followers: [User!]!
    following: [User!]!
  }

  type Post {
    id: ID!
    title: String!
    content: String!
    author: User!
    comments: [Comment!]!
    likeCount: Int!
    createdAt: String!
  }

  type Comment {
    id: ID!
    content: String!
    author: User!
    post: Post!
    createdAt: String!
  }

  type Query {
    posts(limit: Int, offset: Int): [Post!]!
    post(id: ID!): Post
    user(id: ID!): User
    feed(userId: ID!, limit: Int): [Post!]!
  }
`;
