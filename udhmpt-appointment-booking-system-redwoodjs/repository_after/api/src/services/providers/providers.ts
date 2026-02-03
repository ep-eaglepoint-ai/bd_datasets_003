import { Role, requireRole, User } from '../../lib/auth';
import { PrismaLike } from '../../lib/db';

type CreateProfileInput = {
  name: string;
  bio?: string;
  timezone?: string;
};

type CreateServiceInput = {
  name: string;
  durationMinutes: number;
  capacity?: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
};

export async function createProviderProfile(user: User, input: CreateProfileInput, prisma?: PrismaLike) {
  requireRole(user, [Role.PROVIDER]);
  if (!prisma) throw new Error('Prisma client required');

  // Simple create; no additional business logic allowed in this chunk
  return prisma.providerProfile.create({ 
    data: { 
      userId: user.id, 
      name: input.name, 
      bio: input.bio,
      timezone: input.timezone || 'UTC'
    } 
  });
}

export async function createService(user: User, input: CreateServiceInput, prisma?: PrismaLike) {
  requireRole(user, [Role.PROVIDER]);
  if (!prisma) throw new Error('Prisma client required');

  // Validate provider profile exists
  const profile = await prisma.providerProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new Error('Provider profile does not exist');

  // Duration validation: realistic bounds (5 - 480 minutes)
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 480) {
    throw new Error('durationMinutes must be an integer between 5 and 480');
  }

  const capacity = input.capacity ?? 1;
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error('capacity must be an integer >= 1');
  }

  // Buffer time validation: non-negative integers, reasonable bounds
  const bufferBefore = input.bufferBeforeMinutes ?? 0;
  const bufferAfter = input.bufferAfterMinutes ?? 0;
  
  if (!Number.isInteger(bufferBefore) || bufferBefore < 0 || bufferBefore > 120) {
    throw new Error('bufferBeforeMinutes must be an integer between 0 and 120');
  }
  
  if (!Number.isInteger(bufferAfter) || bufferAfter < 0 || bufferAfter > 120) {
    throw new Error('bufferAfterMinutes must be an integer between 0 and 120');
  }

  return prisma.service.create({ 
    data: { 
      providerId: profile.id, 
      name: input.name, 
      durationMinutes: input.durationMinutes, 
      capacity,
      bufferBeforeMinutes: bufferBefore,
      bufferAfterMinutes: bufferAfter
    } 
  });
}
