const nextJest = require('next/jest')
const path = require('path')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: path.resolve(__dirname, 'repository_after'),
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': path.resolve(__dirname, 'repository_after/$1'),
    '^react$': path.resolve(__dirname, 'repository_after/node_modules/react'),
    '^react-dom$': path.resolve(__dirname, 'repository_after/node_modules/react-dom'),
  },
  testMatch: ['<rootDir>/tests/**/*.test.[jt]s?(x)', '<rootDir>/tests/**/*.spec.[jt]s?(x)'],
  rootDir: __dirname,
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)

