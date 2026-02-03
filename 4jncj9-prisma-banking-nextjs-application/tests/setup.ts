/**
 * Jest Test Setup
 *
 * Configures the test environment and mocks.
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';

// Mock Next.js cache functions
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));

// Global test utilities
declare global {
  function sleep(ms: number): Promise<void>;
}

global.sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
