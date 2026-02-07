// jest.meta.config.js
module.exports = {
	rootDir: '/app',
	testEnvironment: 'node',

	// Only run the meta test file (stable glob)
	testMatch: ['<rootDir>/tests/test_kanban_meta.test.js'],

	// Don’t ignore repository_after; meta test reads from it.
	testPathIgnorePatterns: ['/node_modules/'],

	verbose: false,

	// Reduce overhead
	cache: false,
	maxWorkers: 1,

	// Meta tests can take long because each one spawns an inner Jest run
	testTimeout: 15 * 60 * 1000,
}
