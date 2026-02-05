const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  roots: ['<rootDir>'],
  testMatch: [
    '**/integration/**/*.test.ts',
    '**/integration/**/*.test.tsx',
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

// Set environment variables for tests
process.env.DATABASE_URL = 'file:./test.db';
process.env.UNSPLASH_ACCESS_KEY = 'DpjbQKrPNzvzAbwK7AWplLI2HeZUmIn9RPvrLJhlnoo';
process.env.SESSION_SECRET = '03b60940baeb78947902fca9c6129829580ea77224e370565fc1f24ad5c5ec76';
process.env.NODE_ENV = 'development';
process.env.PORT = '3001';
