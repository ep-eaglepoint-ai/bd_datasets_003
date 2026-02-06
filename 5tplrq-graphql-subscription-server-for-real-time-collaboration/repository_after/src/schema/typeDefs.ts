import { gql } from 'apollo-server-express';

export const typeDefs = gql`
  type User {
    id: ID!
    email: String!
    name: String!
    created_at: String!
  }

  type Document {
    id: ID!
    title: String!
    content: String
    owner_id: ID!
    created_at: String!
    updated_at: String!
  }

  type Presence {
    userId: ID!
    documentId: ID!
    cursor: CursorPosition!
    lastSeen: Float!
  }

  type CursorPosition {
    line: Int!
    column: Int!
  }

  input CursorPositionInput {
    line: Int!
    column: Int!
  }

  type DocumentChange {
    documentId: ID!
    title: String
    content: String
    updatedBy: ID!
  }

  type PresenceUpdate {
    documentId: ID!
    userId: ID!
    action: String! # "join", "leave", "update"
    presence: Presence
  }

  type CursorUpdate {
    documentId: ID!
    userId: ID!
    position: CursorPosition!
  }

  type Query {
    document(id: ID!): Document
    documents: [Document!]!
    documentPresence(documentId: ID!): [Presence!]!
    me: User
  }

  type Mutation {
    createDocument(title: String!, content: String): Document!
    updateDocument(id: ID!, title: String, content: String): Document!
    deleteDocument(id: ID!): Boolean!
    updateCursor(documentId: ID!, position: CursorPositionInput!): Boolean!
    grantAccess(documentId: ID!, userId: ID!, permission: String!): Boolean!
    login(email: String!, name: String!): String! # Simple login for testing
  }

  type Subscription {
    documentChanged(documentId: ID!): DocumentChange!
    presenceUpdated(documentId: ID!): PresenceUpdate!
    cursorMoved(documentId: ID!): CursorUpdate!
  }
`;
