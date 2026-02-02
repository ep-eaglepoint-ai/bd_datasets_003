// Jest setup file for root-level tests
// Sets up test environment variables before any test files load

const path = require('path');
const testDbPath = path.join(__dirname, 'repository_after/prisma/test.db');
// Use absolute path for DATABASE_URL - this ensures API routes use test database
// Convert to forward slashes for Prisma (works on Windows)
const testDbUrl = `file:${path.resolve(testDbPath).replace(/\\/g, '/')}`;
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
