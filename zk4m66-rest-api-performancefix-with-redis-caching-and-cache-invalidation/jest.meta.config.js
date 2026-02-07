export default {
	rootDir: '/app/tests',
	testEnvironment: 'node',
	testMatch: ['**/*.test.ts', '**/test_*.ts'],
	transform: {
		'^.+\\.(t|j)sx?$': ['@swc/jest'],
	},
	moduleFileExtensions: ['ts', 'js', 'json'],
	testTimeout: 20000,
}
