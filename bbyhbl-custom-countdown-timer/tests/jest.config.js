module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: [
    '<rootDir>/**/*.test.ts',
    '<rootDir>/**/*.test.tsx',
  ],
 
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../repository_after/frontend/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },

  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
      isolatedModules: true,
    }],
  },

  setupFilesAfterEnv: [
    '<rootDir>/setupTests.ts',
    '@testing-library/jest-dom',
  ],

  testTimeout: 30000,

  collectCoverageFrom: [
    '../repository_after/**/*.{ts,tsx}',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/build/**',
    '!**/*.d.ts',
  ],

  moduleDirectories: ['node_modules', '<rootDir>/../node_modules'],

  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};