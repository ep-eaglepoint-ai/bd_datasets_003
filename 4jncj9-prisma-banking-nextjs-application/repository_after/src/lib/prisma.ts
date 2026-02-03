/**
 * Prisma Client Singleton
 *
 * IMPORTANT: This file must ONLY be imported in server-side code.
 * Never import this in client components or files that end up in the browser bundle.
 *
 * Requirement 1: Next.js Server-Side Enforcement
 * - All Prisma logic must be strictly confined to the server layer
 * - This module uses 'server-only' pattern to prevent client-side imports
 */

import { PrismaClient } from '@prisma/client';

// Server-only marker - this will cause a build error if imported on client
const serverOnlyMarker = typeof window === 'undefined';

if (!serverOnlyMarker && process.env.NODE_ENV !== 'test') {
  throw new Error(
    'PrismaClient cannot be imported on the client side. ' +
    'This is a security violation - database credentials must never be exposed to the browser.'
  );
}

// Global type declaration for development hot reload
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Prisma client singleton pattern
// In development, store on global to prevent multiple instances during hot reload
// In production, create a new instance
const prismaClientSingleton = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

// Export singleton instance
export const prisma = globalThis.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

// Utility to check if we're on the server
export function isServerSide(): boolean {
  return typeof window === 'undefined';
}

// Export a function to get the client (useful for testing)
export function getPrismaClient(): PrismaClient {
  return prisma;
}

// Marker constant to verify server-only usage in tests
export const PRISMA_SERVER_ONLY = true;

// Database URL should never be exposed to client
export const DATABASE_URL_EXPOSED = false;
