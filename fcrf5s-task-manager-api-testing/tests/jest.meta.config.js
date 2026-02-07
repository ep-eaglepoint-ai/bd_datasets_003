module.exports = {
	testEnvironment: 'node',

	rootDir: '/app',

	testMatch: ['/app/tests/**/*.test.js'],
	testPathIgnorePatterns: ['/node_modules/'],

	collectCoverage: true,
	coverageProvider: 'babel',
	collectCoverageFrom: [
		'/app/repository_after/src/**/*.js',
		'!**/node_modules/**',
	],

	coverageDirectory: '/app/coverage',
	coverageReporters: ['json-summary', 'json', 'text', 'lcov'],

	clearMocks: true,
	testTimeout: 30000,
}
