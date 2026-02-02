// Jest configuration for root-level tests
// Tests import from repository_after directory

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/tests/**/*.test.ts'],
  maxWorkers: 1,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/repository_after/$1',
    // Map @prisma/client to repository_after's generated client
    '^@prisma/client$': '<rootDir>/repository_after/node_modules/@prisma/client',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  globals: {
    'ts-jest': {
      tsconfig: {
        paths: {
          '@/*': ['./repository_after/*'],
        },
      },
    },
  },
  collectCoverageFrom: [
    'repository_after/**/*.{ts,tsx}',
    '!repository_after/**/*.d.ts',
    '!repository_after/node_modules/**',
  ],
};
