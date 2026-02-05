module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/*.test.js'],
    collectCoverageFrom: ['**/*.js', '!node_modules/**', '!coverage/**'],
    coverageDirectory: 'coverage',
    verbose: true,
    testTimeout: 30000,
    forceExit: true,
    detectOpenHandles: true,
};
