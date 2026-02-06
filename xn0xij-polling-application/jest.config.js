module.exports = {
  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/api.test.js', '<rootDir>/tests/frontend.test.js'],
      setupFiles: ['<rootDir>/jest.setup.js'],
      coveragePathIgnorePatterns: ['/node_modules/', '/repository_after/client/']
    },
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/Poll.test.js', '<rootDir>/tests/CreatePoll.test.js'],
      setupFilesAfterEnv: ['<rootDir>/repository_after/client/src/setupTests.js'],
      moduleNameMapper: {
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
      },
      transform: {
        '^.+\\.(js|jsx)$': ['babel-jest', { presets: ['@babel/preset-env', '@babel/preset-react'] }]
      },
      coveragePathIgnorePatterns: ['/node_modules/'],
      moduleDirectories: ['node_modules', 'repository_after/client/node_modules']
    }
  ]
};
