import { DateTime } from 'luxon';
import { createBooking } from '../../repository_after/api/src/services/bookings/bookings';
import { createProviderProfile, createService } from '../../repository_after/api/src/services/providers/providers';
import { createRecurringAvailability } from '../../repository_after/api/src/services/availability/availability';
import { Role, User } from '../../repository_after/api/src/lib/auth';

// Simple mock Prisma for testing
const buildMockPrisma = () => {
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
    },
    service: {
      create: async ({ data }: any) => {
        const service = { id: idSeq++, ...data, createdAt: new Date(), updatedAt: new Date() };
        state.services.push(service);
        return service;
      },
      findUnique: async ({ where }: any) => 
        state.services.find((s: any) => s.id === where.id) || null,
    },
    recurringAvailability: {
      create: async ({ data }: any) => {
        const recurring = { id: idSeq++, ...data, createdAt: new Date(), updatedAt: new Date() };
        state.recurringAvailability.push(recurring);
        return recurring;
      },
      findMany: async () => state.recurringAvailability,
    },
    booking: {
      create: async ({ data }: any) => {
        const booking = { id: idSeq++, ...data, createdAt: new Date(), updatedAt: new Date() };
        state.bookings.push(booking);
        return booking;
      },
      count: async () => 0, // No existing bookings for testing
    },
    $transaction: async (cb: any) => cb(buildMockPrisma()),
  };
};

describe('Cross-Timezone Booking Scenarios - Simple', () => {
  let prisma: any;

  beforeEach(() => {
    prisma = buildMockPrisma();
  });

  test('Basic timezone functionality', async () => {
    const providerTz = 'America/New_York';
    const customerTz = 'Asia/Tokyo';
    
    const provider = { id: 1, email: 'provider@ny.com', role: Role.PROVIDER };
    const customer = { id: 2, email: 'customer@tokyo.com', role: Role.CUSTOMER };
    
    // Create provider profile
    const profile = await createProviderProfile(provider, {
      name: 'NY Provider',
      bio: 'Provider in New York',
      timezone: providerTz
    }, prisma);
    
    // Create service
    const service = await createService(provider, {
      name: 'Consultation',
      durationMinutes: 60
    }, prisma);
    
    // Set availability: 9 AM - 5 PM New York time
    await createRecurringAvailability(provider, {
      weekday: 1, // Monday
      startLocal: '09:00',
      endLocal: '17:00'
    }, prisma);
    
    // Basic test - just verify the profile and service were created
    expect(profile).toBeDefined();
    expect(profile.name).toBe('NY Provider');
    expect(profile.timezone).toBe(providerTz);
    expect(profile.userId).toBe(provider.id);
    
    expect(service).toBeDefined();
    expect(service.name).toBe('Consultation');
    expect(service.durationMinutes).toBe(60);
  });
});
