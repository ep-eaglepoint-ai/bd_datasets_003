module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/setupTests.js'],
  roots: ['<rootDir>'],
  modulePaths: ['<rootDir>'],
  moduleDirectories: ['node_modules', '<rootDir>'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/mocks/fileMock.cjs',
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))'
  ],
  testMatch: [
    '<rootDir>/__tests__/**/*.test.{js,jsx}'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/test-suite/'
  ],
  modulePathIgnorePatterns: [
    '/test-suite/'
  ],
  moduleFileExtensions: ['js', 'jsx', 'json', 'node'],
  verbose: true,
  testTimeout: 15000,
  resolver: undefined
};