module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ["**/tests/**/*.test.ts", "**/tests/**/*.spec.ts", "**/tests/**/*.test.tsx"],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^react$': '<rootDir>/node_modules/react',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
    '^@redwoodjs/graphql-server$': '<rootDir>/tests/mocks/redwood.ts',
    '^@redwoodjs/api$': '<rootDir>/tests/mocks/redwood.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // Suppress console output for clean test runs
  reporters: ['default'],
  verbose: false
};
