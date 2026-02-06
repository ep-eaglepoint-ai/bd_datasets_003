const path = require('path');

module.exports = {
  rootDir: path.resolve(__dirname, '..'),
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/repository_after/setupTests.js'],
  testMatch: ['<rootDir>/repository_after/**/*.test.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^@testing-library/jest-dom$': '<rootDir>/node_modules/@testing-library/jest-dom',
    '^@testing-library/user-event$': '<rootDir>/repository_after/node_modules/@testing-library/user-event',
  },
  moduleDirectories: ['<rootDir>/node_modules', '<rootDir>/repository_after/node_modules', 'node_modules'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/'],
  verbose: true,
  transform: {
    '^.+\\.(js|jsx)$': ['babel-jest', {
      configFile: path.resolve(__dirname, '../babel.config.js')
    }],
  },
  transformIgnorePatterns: [
    '/node_modules/'
  ],
};
