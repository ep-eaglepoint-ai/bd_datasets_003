module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  rootDir: ".",
  collectCoverage: true,
  coverageDirectory: "tests/coverage",
  coverageReporters: ["text", "json-summary"],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
