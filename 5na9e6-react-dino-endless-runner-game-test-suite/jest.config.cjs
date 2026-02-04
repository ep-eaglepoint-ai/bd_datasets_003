module.exports = {
	testEnvironment: 'jsdom',
	setupFilesAfterEnv: ['<rootDir>/setupTests.js'],
	moduleNameMapper: {
		'\\.(css|less|scss|sass)$': 'identity-obj-proxy',
	},
	transform: {
		'^.+\\.(js|jsx)$': 'babel-jest',
	},
	testMatch: [
		'<rootDir>/repository_before/src/**/*.test.js',
		'<rootDir>/repository_before/src/**/*.test.jsx',
	],
	collectCoverageFrom: [
		'repository_before/src/**/*.{js,jsx}',
		'!repository_before/src/**/*.test.{js,jsx}',
		'!repository_before/src/reportWebVitals.js',
		'!repository_before/src/index.js',
	],
	coverageThreshold: {
		global: {
			branches: 70,
			functions: 70,
			lines: 70,
			statements: 70,
		},
	},
}
