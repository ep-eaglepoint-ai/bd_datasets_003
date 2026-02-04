module.exports = {
  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      testMatch: ['**/tests/backend.test.js'],
      testTimeout: 10000
    },
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      testMatch: ['**/tests/frontend.test.js'],
      testTimeout: 10000
    }
  ],
  verbose: true,
  forceExit: true
};
