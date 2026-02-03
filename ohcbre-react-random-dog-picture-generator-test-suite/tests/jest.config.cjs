module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/mocks/fileMock.cjs'
  },
  testMatch: [
    '<rootDir>/**/*.test.js'
  ],
  verbose: true,
  testTimeout: 10000
};