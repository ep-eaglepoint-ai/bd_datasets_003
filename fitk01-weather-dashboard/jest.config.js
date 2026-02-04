module.exports = {
  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/backend.test.js'],
      testTimeout: 10000
    },
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/frontend.test.js'],
      testTimeout: 10000
    }
  ],
  verbose: true,
  forceExit: true
};
