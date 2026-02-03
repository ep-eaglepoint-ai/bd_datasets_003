import { 
  createBooking, 
  cancelBooking, 
  rescheduleBooking 
} from '../../repository_after/api/src/services/bookings/bookings';
import { 
  createRecurringAvailability,
  createCustomDayAvailability
} from '../../repository_after/api/src/services/availability/availability';
import { Role, User } from '../../repository_after/api/src/lib/auth';
import { DateTime } from 'luxon';

// Mock Prisma client for testing
const buildMockPrisma = () => {
  const state: any = {
    providerProfiles: [],
    services: [],
    recurringAvailability: [],
    customDayAvailability: [],
    manualBlocks: [],
    bookings: [],
    availabilityExceptions: []
  };
  
  let idSeq = 1;
  const lock = { inFlight: 0 };

  return {
    providerProfile: {
      create: async ({ data }: any) => {
        const profile = { id: idSeq++, ...data, createdAt: new Date(), updatedAt: new Date() };
        state.providerProfiles.push(profile);
        return profile;
      },
      findUnique: async ({ where }: any) => {
        if (where.userId) {
          return state.providerProfiles.find((p: any) => p.userId === where.userId) || null;
        }
        if (where.id) {
          return state.providerProfiles.find((p: any) => p.id === where.id) || null;
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
      findMany: async ({ where }: any) => {
        if (where?.providerId) {
          return state.recurringAvailability.filter((r: any) => r.providerId === where.providerId);
        }
        return state.recurringAvailability;
      },
    },
    customDayAvailability: {
      create: async ({ data }: any) => {
        const custom = { id: idSeq++, ...data, createdAt: new Date(), updatedAt: new Date() };
        state.customDayAvailability.push(custom);
        return custom;
      },
      findMany: async ({ where }: any) => {
        if (where?.providerId) {
          return state.customDayAvailability.filter((c: any) => c.providerId === where.providerId);
        }
        return state.customDayAvailability;
      },
    },
    manualBlock: {
      create: async ({ data }: any) => {
        const block = { id: idSeq++, ...data, createdAt: new Date(), updatedAt: new Date() };
        state.manualBlocks.push(block);
        return block;
      },
      findMany: async ({ where }: any) => {
        if (where?.providerId) {
          return state.manualBlocks.filter((b: any) => b.providerId === where.providerId);
        }
        return state.manualBlocks;
      },
    },
    booking: {
      create: async ({ data }: any) => {
        const booking = { id: idSeq++, ...data, createdAt: new Date(), updatedAt: new Date() };
        state.bookings.push(booking);
        return booking;
      },
      findUnique: async ({ where }: any) => 
        state.bookings.find((b: any) => b.id === where.id) || null,
      update: async ({ where, data }: any) => {
        const idx = state.bookings.findIndex((b: any) => b.id === where.id);
        if (idx === -1) throw new Error('Not found');
        state.bookings[idx] = { ...state.bookings[idx], ...data };
        return state.bookings[idx];
      },
      count: async ({ where }: any) => {
        return state.bookings.filter((b: any) => {
          if (where.serviceId && b.serviceId !== where.serviceId) return false;
          if (where.startUtc && b.startUtc.getTime() !== where.startUtc.getTime()) return false;
          if (where.canceledAt === false && b.canceledAt) return false;
          return true;
        }).length;
      },
    },
    availabilityException: {
      create: async ({ data }: any) => {
        const exception = { id: idSeq++, ...data, createdAt: new Date(), updatedAt: new Date() };
        state.availabilityExceptions.push(exception);
        return exception;
      },
      findMany: async ({ where }: any) => {
        if (where?.providerId) {
          return state.availabilityExceptions.filter((e: any) => e.providerId === where.providerId);
        }
        return state.availabilityExceptions;
      },
    },
    $transaction: async (cb: any) => {
      while (lock.inFlight > 0) {
        await new Promise(res => setTimeout(res, 1));
      }
      lock.inFlight++;
      try {
        const tx = buildMockPrisma();
        const r = await cb(tx);
        return r;
      } finally {
        lock.inFlight--;
      }
    },
    $disconnect: async () => {},
  };
};

// Helper functions for creating profiles and services
async function createProviderProfile(user: User, input: any, prisma: any) {
  return prisma.providerProfile.create({ 
    data: { 
      userId: user.id, 
      name: input.name, 
      bio: input.bio,
      timezone: input.timezone || 'UTC'
    } 
  });
}

async function createService(user: User, input: any, prisma: any) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new Error('Provider profile does not exist');

  return prisma.service.create({ 
    data: {
      providerId: profile.id,
      name: input.name,
      durationMinutes: input.durationMinutes,
      capacity: input.capacity || 1,
      bufferBeforeMinutes: input.bufferBeforeMinutes || 0,
      bufferAfterMinutes: input.bufferAfterMinutes || 0
    }
  });
}

async function createManualBlock(user: User, input: any, prisma: any) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new Error('Provider profile does not exist');

  return prisma.manualBlock.create({
    data: {
      providerId: profile.id,
      startUtc: new Date(input.startUtcISO),
      endUtc: new Date(input.endUtcISO),
      reason: input.reason
    }
  });
}

describe('End-to-End User Workflows', () => {
  let prisma: any;
  let provider: User;
  let customer: User;
  let providerProfile: any;
  let service: any;

  beforeEach(() => {
    prisma = buildMockPrisma();
    provider = { id: 1, email: 'provider@test.com', role: Role.PROVIDER };
    customer = { id: 2, email: 'customer@test.com', role: Role.CUSTOMER };
  });

  describe('Complete Provider Setup Workflow', () => {
    test('Provider sets up availability and manages bookings', async () => {
      // Create provider profile
      providerProfile = await createProviderProfile(provider, {
        name: 'Dr. Test Provider',
        bio: 'Test provider for integration tests',
        timezone: 'America/New_York'
      }, prisma);
      
      // Create service
      service = await createService(provider, {
        name: 'Consultation',
        durationMinutes: 60,
        capacity: 1,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 15
      }, prisma);

      // 1. Set recurring availability
      const recurring = await createRecurringAvailability(provider, {
        weekday: 1, // Monday
        startLocal: '09:00',
        endLocal: '17:00'
      }, prisma);

      // 2. Add custom day availability
      const customDay = await createCustomDayAvailability(provider, {
        date: DateTime.now().plus({ days: 7 }).toISODate()!,
        startLocal: '13:00',
        endLocal: '17:00'
      }, prisma);

      // 3. Block vacation time
      const vacation = await createManualBlock(provider, {
        startUtcISO: DateTime.now().plus({ days: 14 }).toUTC().toISO()!,
        endUtcISO: DateTime.now().plus({ days: 21 }).toUTC().toISO()!,
        reason: 'Vacation'
      }, prisma);

      expect(recurring).toBeDefined();
      expect(customDay).toBeDefined();
      expect(vacation).toBeDefined();
    });
  });

  describe('Complete Customer Booking Workflow', () => {
    beforeEach(async () => {
      providerProfile = await createProviderProfile(provider, {
        name: 'Dr. Test Provider',
        bio: 'Test provider',
        timezone: 'America/New_York'
      }, prisma);
      
      service = await createService(provider, {
        name: 'Consultation',
        durationMinutes: 60,
        capacity: 1,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 15
      }, prisma);
    });

    test('Customer searches, books, and manages appointment', async () => {
      // Setup availability for next week
      const nextMonday = DateTime.now().plus({ weeks: 1 }).set({ weekday: 1 });
      await createRecurringAvailability(provider, {
        weekday: 1,
        startLocal: '09:00',
        endLocal: '12:00'
      }, prisma);

      // 1. Search for available slots
      const searchAvailability = await import('../../repository_after/api/src/services/availability/search');
      const slots = await searchAvailability.default(prisma, {
        providerId: providerProfile.id,
        serviceId: service.id,
        startISO: nextMonday.startOf('day').toISO()!,
        endISO: nextMonday.endOf('day').toISO()!,
        customerTz: 'America/New_York'
      });

      expect(slots.length).toBeGreaterThan(0);

      // 2. Book first available slot
      const booking = await createBooking(customer, {
        providerId: providerProfile.id,
        serviceId: service.id,
        startUtcISO: slots[0].startUtcISO,
        endUtcISO: slots[0].endUtcISO,
        customerEmail: customer.email,
        cutoffHours: 24
      }, prisma);

      expect(booking.reference).toBeDefined();
      expect(booking.customerEmail).toBe(customer.email);

      // 3. Attempt to book same slot (should fail due to capacity)
      await expect(createBooking(customer, {
        providerId: providerProfile.id,
        serviceId: service.id,
        startUtcISO: slots[0].startUtcISO,
        endUtcISO: slots[0].endUtcISO,
        customerEmail: 'another@test.com',
        cutoffHours: 24
      }, prisma)).rejects.toThrow();

      // 4. Reschedule booking
      if (slots.length > 1) {
        const newSlot = slots[1]; // Use next available slot
        const rescheduled = await rescheduleBooking(customer, booking.id!, newSlot.startUtcISO, newSlot.endUtcISO, prisma, 24);
        
        expect(DateTime.fromJSDate(rescheduled.startUtc).toISO()).toBe(newSlot.startUtcISO);
      }

      // 5. Cancel booking
      const canceled = await cancelBooking(customer, booking.id!, prisma, 24);
      expect(canceled.canceledAt).toBeDefined();
    });
  });

  describe('Multi-Provider Workflow', () => {
    test('Customer books with different providers', async () => {
      // Create first provider
      const provider1Profile = await createProviderProfile(provider, {
        name: 'Dr. First Provider',
        bio: 'First test provider',
        timezone: 'America/New_York'
      }, prisma);

      const service1 = await createService(provider, {
        name: 'General Consultation',
        durationMinutes: 60,
        capacity: 1,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 15
      }, prisma);

      // Create second provider
      const provider2 = { id: 3, email: 'provider2@test.com', role: Role.PROVIDER };
      const provider2Profile = await createProviderProfile(provider2, {
        name: 'Dr. Second Provider',
        bio: 'Second test provider',
        timezone: 'Europe/London'
      }, prisma);

      const service2 = await createService(provider2, {
        name: 'Specialist Consultation',
        durationMinutes: 45,
        capacity: 2,
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 10
      }, prisma);

      // Set availability for both providers
      const tomorrow = DateTime.now().plus({ days: 1 });
      
      await createRecurringAvailability(provider, {
        weekday: tomorrow.weekday,
        startLocal: '10:00',
        endLocal: '12:00'
      }, prisma);

      await createRecurringAvailability(provider2, {
        weekday: tomorrow.weekday,
        startLocal: '14:00',
        endLocal: '16:00'
      }, prisma);

      // Search availability across both providers
      const searchAvailability = await import('../../repository_after/api/src/services/availability/search');
      
      const slots1 = await searchAvailability.default(prisma, {
        providerId: provider1Profile.id,
        serviceId: service1.id,
        startISO: tomorrow.startOf('day').toISO()!,
        endISO: tomorrow.endOf('day').toISO()!,
        customerTz: 'UTC'
      });

      const slots2 = await searchAvailability.default(prisma, {
        providerId: provider2Profile.id,
        serviceId: service2.id,
        startISO: tomorrow.startOf('day').toISO()!,
        endISO: tomorrow.endOf('day').toISO()!,
        customerTz: 'UTC'
      });

      expect(slots1.length).toBeGreaterThan(0);
      expect(slots2.length).toBeGreaterThan(0);

      // Book with both providers
      const booking1 = await createBooking(customer, {
        providerId: provider1Profile.id,
        serviceId: service1.id,
        startUtcISO: slots1[0].startUtcISO,
        endUtcISO: slots1[0].endUtcISO,
        customerEmail: customer.email,
        cutoffHours: 24
      }, prisma);

      const booking2 = await createBooking(customer, {
        providerId: provider2Profile.id,
        serviceId: service2.id,
        startUtcISO: slots2[0].startUtcISO,
        endUtcISO: slots2[0].endUtcISO,
        customerEmail: customer.email,
        cutoffHours: 24
      }, prisma);

      expect(booking1.providerId).toBe(provider1Profile.id);
      expect(booking2.providerId).toBe(provider2Profile.id);
      expect(booking1.reference).not.toBe(booking2.reference);
    });
  });

  describe('Error Handling Workflow', () => {
    test('Graceful handling of conflicts and edge cases', async () => {
      providerProfile = await createProviderProfile(provider, {
        name: 'Dr. Test Provider',
        bio: 'Test provider',
        timezone: 'America/New_York'
      }, prisma);
      
      // Create service with limited capacity
      const groupService = await createService(provider, {
        name: 'Group Session',
        durationMinutes: 90,
        capacity: 3,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0
      }, prisma);

      // Set up availability
      const tomorrow = DateTime.now().plus({ days: 1 });
      await createRecurringAvailability(provider, {
        weekday: tomorrow.weekday,
        startLocal: '15:00',
        endLocal: '17:00'
      }, prisma);

      const searchAvailability = await import('../../repository_after/api/src/services/availability/search');
      const slots = await searchAvailability.default(prisma, {
        providerId: providerProfile.id,
        serviceId: groupService.id,
        startISO: tomorrow.startOf('day').toISO()!,
        endISO: tomorrow.endOf('day').toISO()!,
        customerTz: 'America/New_York'
      });

      expect(slots.length).toBeGreaterThan(0);

      // Book up to capacity
      const bookings = [];
      for (let i = 0; i < 3; i++) {
        const booking = await createBooking({
          ...customer,
          email: `customer${i}@test.com`
        }, {
          providerId: providerProfile.id,
          serviceId: groupService.id,
          startUtcISO: slots[0].startUtcISO,
          endUtcISO: slots[0].endUtcISO,
          customerEmail: `customer${i}@test.com`,
          cutoffHours: 24
        }, prisma);
        bookings.push(booking);
      }

      // 4th booking should fail
      await expect(createBooking({
        ...customer,
        email: 'customer4@test.com'
      }, {
        providerId: providerProfile.id,
        serviceId: groupService.id,
        startUtcISO: slots[0].startUtcISO,
        endUtcISO: slots[0].endUtcISO,
        customerEmail: 'customer4@test.com',
        cutoffHours: 24
      }, prisma)).rejects.toThrow();

      // Cancel one booking and try again
      await cancelBooking(bookings[0].id!, prisma, 24);
      
      const newBooking = await createBooking({
        ...customer,
        email: 'customer4@test.com'
      }, {
        providerId: providerProfile.id,
        serviceId: groupService.id,
        startUtcISO: slots[0].startUtcISO,
        endUtcISO: slots[0].endUtcISO,
        customerEmail: 'customer4@test.com',
        cutoffHours: 24
      }, prisma);

      expect(newBooking.reference).toBeDefined();
    });
  });
});
