module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  rootDir: '.', // root is repository_after
  // tests are mounted at /app/tests, which is inside rootDir in the container
};
