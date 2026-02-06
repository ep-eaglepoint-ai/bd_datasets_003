module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/repository_after/__tests__/**/*.test.js',
    '**/tests/**/*.test.js'
  ],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'repository_after/**/*.js',
    '!repository_after/__tests__/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  verbose: true
};
