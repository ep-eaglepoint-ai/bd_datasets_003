module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/setupTests.js'],
  testMatch: ['**/*.test.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  testPathIgnorePatterns: ['/node_modules/', '/repository_before/', '/tests/'],
  verbose: true,
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
};
