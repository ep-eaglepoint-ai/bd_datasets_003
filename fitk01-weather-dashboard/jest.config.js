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
    },
    {
      displayName: 'react-components',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/react-components.test.js'],
      testTimeout: 15000,
      moduleNameMapper: {
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setupTests.js'],
      transform: {
        '^.+\\.(js|jsx)$': 'babel-jest'
      },
      transformIgnorePatterns: [
        '/node_modules/(?!(@testing-library)/)'
      ]
    }
  ],
  verbose: true,
  forceExit: true
};
