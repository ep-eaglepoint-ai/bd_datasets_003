import { createBooking } from '../../repository_after/api/src/services/bookings/bookings';
import { createProviderProfile, createService } from '../../repository_after/api/src/services/providers/providers';
import { createRecurringAvailability } from '../../repository_after/api/src/services/availability/availability';
import { Role, User } from '../../repository_after/api/src/lib/auth';
import { DateTime } from 'luxon';

// Simple mock Prisma for testing
const buildSimpleMockPrisma = () => {
  const state: any = {
    providerProfiles: [],
    services: [],
    recurringAvailability: [],
    bookings: []
  };
  
  let idSeq = 1;

  return {
    providerProfile: {
      create: async ({ data }: any) => {
        const profile = { id: idSeq++, ...data, createdAt: new Date(), updatedAt: new Date() };
        state.providerProfiles.push(profile);
        return profile;
      },
      findUnique: async ({ where }: any) => {
        if (where.id) {
          return state.providerProfiles.find((p: any) => p.id === where.id) || null;
        }
        if (where.userId) {
          return state.providerProfiles.find((p: any) => p.userId === where.userId) || null;
        }
        return null;
      },
      findMany: async ({ where }: any) => {
        if (where?.userId) {
          return state.providerProfiles.filter((p: any) => p.userId === where.userId);
        }
        return state.providerProfiles;
      },
    },
    service: {
      create: async ({ data }: any) => {
        const service = { id: idSeq++, ...data, createdAt: new Date(), updatedAt: new Date() };
        state.services.push(service);
        return service;
      },
      findUnique: async ({ where }: any) => 
        state.services.find((s: any) => s.id === where.id) || null,
      findMany: async ({ where }: any) => {
        if (where?.providerId) {
          return state.services.filter((s: any) => s.providerId === where.providerId);
        }
        return state.services;
      },
    },
    recurringAvailability: {
      create: async ({ data }: any) => {
        const recurring = { id: idSeq++, ...data, createdAt: new Date(), updatedAt: new Date() };
        state.recurringAvailability.push(recurring);
        return recurring;
      },
      findMany: async ({ where }: any) => {
        if (where?.providerId) {
          return state.recurringAvailability.filter((r: any) => r.providerId === where.providerId);
        }
        return state.recurringAvailability;
      },
    },
    booking: {
      create: async ({ data }: any) => {
        const booking = { id: idSeq++, ...data, createdAt: new Date(), updatedAt: new Date() };
        state.bookings.push(booking);
        return booking;
      },
      count: async ({ where }: any) => {
        return state.bookings.filter((b: any) => {
          if (where?.serviceId && b.serviceId !== where.serviceId) return false;
          if (where?.startUtc && b.startUtc.getTime() !== where.startUtc.getTime()) return false;
          if (where?.canceledAt === false && b.canceledAt) return false;
          return true;
        }).length;
      },
      findMany: async ({ where }: any) => {
        return state.bookings.filter((b: any) => {
          if (where?.serviceId && b.serviceId !== where.serviceId) return false;
          return true;
        });
      },
    },
    $transaction: async (cb: any) => cb(buildSimpleMockPrisma()),
    $disconnect: async () => {},
  };
};

describe('Large Dataset Handling Tests - Simple', () => {
  let prisma: any;

  beforeEach(() => {
    prisma = buildSimpleMockPrisma();
  });

  test('Should create provider profile and service successfully', async () => {
    const provider = { id: 1, email: 'provider@test.com', role: Role.PROVIDER };
    
    // Create provider profile
    const profile = await createProviderProfile(provider, {
      name: 'Test Provider',
      bio: 'Provider for testing'
    }, prisma);
    
    expect(profile).toBeDefined();
    expect(profile.name).toBe('Test Provider');
    expect(profile.userId).toBe(provider.id);
    
    // Create service
    const service = await createService(provider, {
      name: 'Test Service',
      durationMinutes: 30
    }, prisma);
    
    expect(service).toBeDefined();
    expect(service.name).toBe('Test Service');
    expect(service.durationMinutes).toBe(30);
  });

  test('Should handle multiple services efficiently', async () => {
    const provider = { id: 1, email: 'provider@test.com', role: Role.PROVIDER };
    
    // Create provider profile
    const profile = await createProviderProfile(provider, {
      name: 'Multi Service Provider',
      bio: 'Provider with multiple services'
    }, prisma);
    
    // Create 100 services
    const servicePromises = [];
    for (let i = 0; i < 100; i++) {
      servicePromises.push(
        createService(provider, {
          name: `Service ${i}`,
          durationMinutes: 30 + (i % 8) * 15,
          capacity: 1 + (i % 5)
        }, prisma)
      );
    }
    
    const services = await Promise.all(servicePromises);
    
    expect(services).toHaveLength(100);
    expect(services[0].name).toBe('Service 0');
    expect(services[99].name).toBe('Service 99');
  });
});
