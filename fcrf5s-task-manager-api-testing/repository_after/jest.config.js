module.exports = {
	testEnvironment: 'node',

	roots: ['<rootDir>/src', '<rootDir>/../tests'],

	testMatch: ['**/*.test.js'],

	collectCoverage: true,

	collectCoverageFrom: ['<rootDir>/src/**/*.js'],

	coverageDirectory: '<rootDir>/../coverage',

	coverageReporters: ['json', 'text', 'lcov'],

	coverageThreshold: {
		global: {
			lines: 80,
			branches: 75,
		},
	},

	clearMocks: true,

	testTimeout: 30000,
}
