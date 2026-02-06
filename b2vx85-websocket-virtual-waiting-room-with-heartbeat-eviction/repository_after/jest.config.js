module.exports = {
    testEnvironment: 'node',
    rootDir: '..',
    testMatch: ['<rootDir>/tests/**/*.test.js'],
    testTimeout: 30000,
    verbose: true,
    collectCoverage: false,
    coverageDirectory: 'coverage',
    coveragePathIgnorePatterns: ['/node_modules/'],
    setupFilesAfterEnv: [],
    moduleFileExtensions: ['js', 'json'],
    testPathIgnorePatterns: ['/node_modules/'],
    modulePaths: ['<rootDir>/repository_after/node_modules']
};
