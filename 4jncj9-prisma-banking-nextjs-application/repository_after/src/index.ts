/**
 * Public API exports for WealthWire Banking Application
 *
 * Note: Server-side modules (prisma, refund-service) should only be imported
 * in server contexts (Server Components, API Routes, Server Actions).
 */

// Types - safe to import anywhere
export * from './types';

// Components - client-side only, no Prisma imports
export * from './components';

// Re-export service functions for server-side use
export {
  validateRefundAmount,
  calculateTotalRefunded,
  calculateRemainingBalance,
  determineTransactionStatus,
  validateRefundAgainstBalance,
  validateRefundRequest,
  processRefundAtomic,
  toTransactionWithBalance,
  getHttpStatusForError,
} from './lib/refund-service';
