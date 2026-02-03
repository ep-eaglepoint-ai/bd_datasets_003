/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/repository_after/src/$1',
    '^@/lib/(.*)$': '<rootDir>/repository_after/src/lib/$1',
    '^@/components/(.*)$': '<rootDir>/repository_after/src/components/$1',
    '^@/actions/(.*)$': '<rootDir>/repository_after/src/actions/$1'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }]
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  forceExit: true,
  detectOpenHandles: true,
  verbose: true
};

module.exports = config;
