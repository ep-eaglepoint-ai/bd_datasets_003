const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  roots: ['<rootDir>'],
  testMatch: [
    '**/backend/**/*.test.ts',
    '**/requirement-mapping.test.ts',
  ],
  
   transform: {
    ...tsJestTransformCfg,
  },
  
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  setupFilesAfterEnv: ['<rootDir>/setupTests.ts'],
  
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/__mocks__/fileMock.js',
    'nanoid': '<rootDir>/__mocks__/nanoid.js'
  },
  
  // Exclude TypeScript declaration files
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.d\\.ts$',
  ],
  
  // Transform ES modules
  transformIgnorePatterns: [
    'node_modules/(?!(nanoid)/)'
  ],
  
  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};

// Set defaults for tests (docker-compose can override)
process.env.UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || 'test_unsplash_key';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || '03b60940baeb78947902fca9c6129829580ea77224e370565fc1f24ad5c5ec76';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.PORT = process.env.PORT || '3001';