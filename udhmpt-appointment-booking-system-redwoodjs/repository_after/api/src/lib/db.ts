// DB placeholder for dependency injection in services.
// In production this should export an instantiated PrismaClient from @prisma/client.
export type PrismaLike = any;

export const dbPlaceholder: PrismaLike = {
  // Intentionally empty; services accept a prisma argument for tests.
};

export default dbPlaceholder;
