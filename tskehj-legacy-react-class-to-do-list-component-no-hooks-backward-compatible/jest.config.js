module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest'
  },
  collectCoverageFrom: [
    'repository_after/src/**/*.{js,jsx}',
    '!repository_after/src/index.js'
  ],
  testMatch: ['**/tests/**/*.test.js'],
  verbose: true
};