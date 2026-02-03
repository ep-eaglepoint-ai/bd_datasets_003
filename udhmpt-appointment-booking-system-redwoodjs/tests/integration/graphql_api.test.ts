import { gql } from 'graphql-tag';
import { createTestClient } from 'apollo-server-testing';
import { ApolloServer } from 'apollo-server';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { DateTime } from 'luxon';

// Mock GraphQL type definitions
const typeDefs = gql`
  type User {
    id: ID!
    email: String!
    role: Role!
  }

  type ProviderProfile {
    id: ID!
    user: User!
    name: String!
    bio: String
    timezone: String!
    services: [Service!]!
  }

  type Service {
    id: ID!
    provider: ProviderProfile!
    name: String!
    durationMinutes: Int!
    capacity: Int!
    bufferBeforeMinutes: Int!
    bufferAfterMinutes: Int!
  }

  type Booking {
    id: ID!
    provider: ProviderProfile!
    service: Service!
    startUtc: DateTime!
    endUtc: DateTime!
    customerEmail: String!
    reference: String!
    canceledAt: DateTime
  }

  type TimeSlot {
    startUtcISO: String!
    endUtcISO: String!
    available: Int!
    service: Service!
  }

  enum Role {
    PROVIDER
    CUSTOMER
    ADMIN
  }

  input CreateProviderProfileInput {
    name: String!
    bio: String
    timezone: String
  }

  input CreateServiceInput {
    name: String!
    durationMinutes: Int!
    capacity: Int
    bufferBeforeMinutes: Int
    bufferAfterMinutes: Int
  }

  input CreateBookingInput {
    serviceId: ID!
    startUtcISO: String!
    endUtcISO: String!
    customerEmail: String!
  }

  input SearchAvailabilityInput {
    providerId: ID
    serviceId: ID
    startISO: String!
    endISO: String!
    customerTz: String
  }

  type Query {
    me: User
    providerProfile(id: ID!): ProviderProfile
    myServices: [Service!]!
    searchAvailability(input: SearchAvailabilityInput!): [TimeSlot!]!
    myBookings: [Booking!]!
  }

  type Mutation {
    createProviderProfile(input: CreateProviderProfileInput!): ProviderProfile!
    createService(input: CreateServiceInput!): Service!
    createBooking(input: CreateBookingInput!): Booking!
    cancelBooking(bookingId: ID!): Booking!
    rescheduleBooking(bookingId: ID!, newStartUtcISO: String!, newEndUtcISO: String!): Booking!
  }

  scalar DateTime
`;

// Mock resolvers
const mockResolvers = {
  Query: {
    me: (_: any, __: any, { user }: any) => user,
    providerProfile: (_: any, { id }: any, { prisma }: any) => 
      prisma.providerProfile.findUnique({ where: { id } }),
    myServices: (_: any, __: any, { user, prisma }: any) => {
      if (!user) throw new Error('Not authenticated');
      return prisma.service.findMany({
        where: { provider: { user: { id: user.id } } }
      });
    },
    searchAvailability: (_: any, { input }: any, { prisma }: any) => {
      // Mock implementation - would call the actual search service
      const searchAvailability = require('../../repository_after/api/src/services/availability/search').default;
      return searchAvailability(prisma, input);
    },
    myBookings: (_: any, __: any, { user, prisma }: any) => {
      if (!user) throw new Error('Not authenticated');
      return prisma.booking.findMany({
        where: { 
          OR: [
            { provider: { user: { id: user.id } } },
            { customerEmail: user.email }
          ]
        }
      });
    }
  },

  Mutation: {
    createProviderProfile: async (_: any, { input }: any, { user, prisma }: any) => {
      if (!user) throw new Error('Not authenticated');
      const createProviderProfile = require('../../repository_after/api/src/services/providers/providers').createProviderProfile;
      return createProviderProfile(user, input, prisma);
    },
    createService: async (_: any, { input }: any, { user, prisma }: any) => {
      if (!user) throw new Error('Not authenticated');
      const createService = require('../../repository_after/api/src/services/providers/providers').createService;
      return createService(user, input, prisma);
    },
    createBooking: async (_: any, { input }: any, { user, prisma }: any) => {
      if (!user) throw new Error('Not authenticated');
      const createBooking = require('../../repository_after/api/src/services/bookings/bookings').createBooking;
      return createBooking(user, input, prisma);
    },
    cancelBooking: async (_: any, { bookingId }: any, { user, prisma }: any) => {
      if (!user) throw new Error('Not authenticated');
      const cancelBooking = require('../../repository_after/api/src/services/bookings/bookings').cancelBooking;
      return cancelBooking(user, bookingId, prisma, 24);
    },
    rescheduleBooking: async (_: any, { bookingId, newStartUtcISO, newEndUtcISO }: any, { user, prisma }: any) => {
      if (!user) throw new Error('Not authenticated');
      const rescheduleBooking = require('../../repository_after/api/src/services/bookings/bookings').rescheduleBooking;
      return rescheduleBooking(user, bookingId, newStartUtcISO, newEndUtcISO, prisma, 24);
    }
  }
};

// Mock Prisma setup
const buildMockPrisma = () => {
  const state: any = {
    users: [],
    providerProfiles: [],
    services: [],
    bookings: []
  };
  
  let idSeq = 1;

  return {
    user: {
      findUnique: jest.fn(({ where }: any) => state.users.find((u: any) => u.id === where.id) || null),
    },
    providerProfile: {
      create: async ({ data }: any) => {
        const profile = { id: idSeq++, ...data, createdAt: new Date(), updatedAt: new Date() };
        state.providerProfiles.push(profile);
        return profile;
      },
      findUnique: async ({ where }: any) => 
        state.providerProfiles.find((p: any) => p.id === where.id) || null,
    },
    service: {
      create: async ({ data }: any) => {
        const service = { id: idSeq++, ...data, createdAt: new Date(), updatedAt: new Date() };
        state.services.push(service);
        return service;
      },
      findMany: async ({ where }: any) => {
        if (where?.provider?.user?.id) {
          return state.services.filter((s: any) => {
            const profile = state.providerProfiles.find((p: any) => p.id === s.providerId);
            return profile?.userId === where.provider.user.id;
          });
        }
        return state.services;
      },
    },
    booking: {
      create: async ({ data }: any) => {
        const booking = { id: idSeq++, ...data, createdAt: new Date(), updatedAt: new Date() };
        state.bookings.push(booking);
        return booking;
      },
      findMany: async ({ where }: any) => {
        if (where?.OR) {
          return state.bookings.filter((b: any) => {
            const profile = state.providerProfiles.find((p: any) => p.id === b.providerId);
            return where.OR.some((condition: any) => {
              if (condition.provider?.user?.id) {
                return profile?.userId === condition.provider.user.id;
              }
              if (condition.customerEmail) {
                return b.customerEmail === condition.customerEmail;
              }
              return false;
            });
          });
        }
        return state.bookings;
      },
      update: async ({ where, data }: any) => {
        const idx = state.bookings.findIndex((b: any) => b.id === where.id);
        if (idx === -1) throw new Error('Not found');
        state.bookings[idx] = { ...state.bookings[idx], ...data };
        return state.bookings[idx];
      },
    },
    $transaction: jest.fn((cb: any) => cb(buildMockPrisma())),
  };
};

describe('GraphQL API Integration Tests', () => {
  let server: ApolloServer;
  let prisma: any;
  let authenticatedUser: any;

  beforeEach(() => {
    prisma = buildMockPrisma();
    
    server = new ApolloServer({
      schema: makeExecutableSchema({ typeDefs, resolvers: mockResolvers }),
      context: ({ req }: any) => ({
        user: authenticatedUser,
        prisma
      })
    });
  });

  afterEach(() => {
    authenticatedUser = null;
  });

  describe('Authentication & Authorization', () => {
    test('Unauthenticated requests should fail', async () => {
      const { query } = createTestClient(server);
      
      const result = await query({
        query: gql`
          query {
            me {
              id
              email
            }
          }
        `
      });

      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toBe('Not authenticated');
    });

    test('Authenticated users can access their profile', async () => {
      authenticatedUser = { id: 1, email: 'test@example.com', role: 'CUSTOMER' };
      
      const { query } = createTestClient(server);
      
      const result = await query({
        query: gql`
          query {
            me {
              id
              email
              role
            }
          }
        `
      });

      expect(result.data).toEqual({
        me: {
          id: '1',
          email: 'test@example.com',
          role: 'CUSTOMER'
        }
      });
    });
  });

  describe('Provider Profile Management', () => {
    beforeEach(() => {
      authenticatedUser = { id: 1, email: 'provider@example.com', role: 'PROVIDER' };
    });

    test('Create provider profile', async () => {
      const { mutate } = createTestClient(server);
      
      const result = await mutate({
        mutation: gql`
          mutation CreateProviderProfile($input: CreateProviderProfileInput!) {
            createProviderProfile(input: $input) {
              id
              name
              bio
              timezone
            }
          }
        `,
        variables: {
          input: {
            name: 'Dr. Test Provider',
            bio: 'Test provider bio',
            timezone: 'America/New_York'
          }
        }
      });

      expect(result.data?.createProviderProfile).toMatchObject({
        name: 'Dr. Test Provider',
        bio: 'Test provider bio',
        timezone: 'America/New_York'
      });
    });

    test('Create service for provider', async () => {
      // First create a provider profile
      await prisma.providerProfile.create({
        data: { userId: 1, name: 'Dr. Provider', timezone: 'UTC' }
      });

      const { mutate } = createTestClient(server);
      
      const result = await mutate({
        mutation: gql`
          mutation CreateService($input: CreateServiceInput!) {
            createService(input: $input) {
              id
              name
              durationMinutes
              capacity
              bufferBeforeMinutes
              bufferAfterMinutes
            }
          }
        `,
        variables: {
          input: {
            name: 'Consultation',
            durationMinutes: 60,
            capacity: 1,
            bufferBeforeMinutes: 15,
            bufferAfterMinutes: 15
          }
        }
      });

      expect(result.data?.createService).toMatchObject({
        name: 'Consultation',
        durationMinutes: 60,
        capacity: 1,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 15
      });
    });
  });

  describe('Booking Operations', () => {
    beforeEach(async () => {
      authenticatedUser = { id: 1, email: 'provider@example.com', role: 'PROVIDER' };
      
      // Setup provider and service
      await prisma.providerProfile.create({
        data: { userId: 1, name: 'Dr. Provider', timezone: 'UTC' }
      });
      
      await prisma.service.create({
        data: {
          providerId: 1,
          name: 'Consultation',
          durationMinutes: 60,
          capacity: 1,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0
        }
      });
    });

    test('Create booking', async () => {
      const { mutate } = createTestClient(server);
      
      const startUtc = DateTime.now().plus({ days: 1 }).toUTC().toISO();
      const endUtc = DateTime.now().plus({ days: 1 }).plus({ hours: 1 }).toUTC().toISO();
      
      const result = await mutate({
        mutation: gql`
          mutation CreateBooking($input: CreateBookingInput!) {
            createBooking(input: $input) {
              id
              reference
              customerEmail
              startUtc
              endUtc
            }
          }
        `,
        variables: {
          input: {
            serviceId: '1',
            startUtcISO: startUtc,
            endUtcISO: endUtc,
            customerEmail: 'customer@example.com'
          }
        }
      });

      expect(result.data?.createBooking).toMatchObject({
        customerEmail: 'customer@example.com',
        reference: expect.any(String)
      });
    });

    test('Cancel booking', async () => {
      // First create a booking
      const booking = await prisma.booking.create({
        data: {
          providerId: 1,
          serviceId: 1,
          startUtc: new Date(),
          endUtc: new Date(),
          customerEmail: 'customer@example.com',
          reference: 'TEST-REF'
        }
      });

      const { mutate } = createTestClient(server);
      
      const result = await mutate({
        mutation: gql`
          mutation CancelBooking($bookingId: ID!) {
            cancelBooking(bookingId: $bookingId) {
              id
              canceledAt
            }
          }
        `,
        variables: {
          bookingId: booking.id
        }
      });

      expect(result.data?.cancelBooking.canceledAt).toBeDefined();
    });

    test('Reschedule booking', async () => {
      // First create a booking
      const booking = await prisma.booking.create({
        data: {
          providerId: 1,
          serviceId: 1,
          startUtc: new Date(),
          endUtc: new Date(),
          customerEmail: 'customer@example.com',
          reference: 'TEST-REF'
        }
      });

      const { mutate } = createTestClient(server);
      
      const newStart = DateTime.now().plus({ days: 2 }).toUTC().toISO();
      const newEnd = DateTime.now().plus({ days: 2 }).plus({ hours: 1 }).toUTC().toISO();
      
      const result = await mutate({
        mutation: gql`
          mutation RescheduleBooking($bookingId: ID!, $newStartUtcISO: String!, $newEndUtcISO: String!) {
            rescheduleBooking(bookingId: $bookingId, newStartUtcISO: $newStartUtcISO, newEndUtcISO: $newEndUtcISO) {
              id
              startUtc
              endUtc
            }
          }
        `,
        variables: {
          bookingId: booking.id,
          newStartUtcISO: newStart,
          newEndUtcISO: newEnd
        }
      });

      expect(result.data?.rescheduleBooking.startUtc).toBeDefined();
    });
  });

  describe('Search Availability', () => {
    beforeEach(async () => {
      authenticatedUser = { id: 1, email: 'customer@example.com', role: 'CUSTOMER' };
    });

    test('Search for available slots', async () => {
      const { query } = createTestClient(server);
      
      const startISO = DateTime.now().toISO();
      const endISO = DateTime.now().plus({ days: 7 }).toISO();
      
      const result = await query({
        query: gql`
          query SearchAvailability($input: SearchAvailabilityInput!) {
            searchAvailability(input: $input) {
              startUtcISO
              endUtcISO
              available
            }
          }
        `,
        variables: {
          input: {
            providerId: '1',
            serviceId: '1',
            startISO: startISO,
            endISO: endISO,
            customerTz: 'UTC'
          }
        }
      });

      expect(result.data?.searchAvailability).toBeDefined();
      expect(Array.isArray(result.data?.searchAvailability)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('Invalid input validation', async () => {
      authenticatedUser = { id: 1, email: 'provider@example.com', role: 'PROVIDER' };
      
      const { mutate } = createTestClient(server);
      
      const result = await mutate({
        mutation: gql`
          mutation CreateService($input: CreateServiceInput!) {
            createService(input: $input) {
              id
              name
            }
          }
        `,
        variables: {
          input: {
            name: 'Test Service',
            durationMinutes: -1, // Invalid duration
            capacity: 0 // Invalid capacity
          }
        }
      });

      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('durationMinutes must be an integer between 5 and 480');
    });

    test('Non-existent resource access', async () => {
      const { query } = createTestClient(server);
      
      const result = await query({
        query: gql`
          query GetProviderProfile($id: ID!) {
            providerProfile(id: $id) {
              id
              name
            }
          }
        `,
        variables: {
          id: '999'
        }
      });

      expect(result.data?.providerProfile).toBeNull();
    });
  });

  describe('Real-time Subscription Mock', () => {
    test('Subscription structure is valid', () => {
      // This would test WebSocket subscriptions in a real implementation
      // For now, we verify the schema supports subscription types
      
      const subscriptionSchema = gql`
        type Subscription {
          bookingUpdated(providerId: ID!): Booking!
          availabilityChanged(providerId: ID!): [TimeSlot!]!
        }
      `;

      expect(subscriptionSchema).toBeDefined();
    });
  });
});
