module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  verbose: true,
  collectCoverageFrom: [
    'tests/**/*.js',
    '!tests/**/*.test.js'
  ],
  coverageDirectory: 'coverage-meta',
  moduleFileExtensions: ['js', 'json'],
  // Meta-test specific setup
  setupFilesAfterEnv: ['<rootDir>/tests/setupMetaTests.js'],
};
