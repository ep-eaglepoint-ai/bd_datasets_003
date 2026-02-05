import type { Config } from "jest";

const config: Config = {
  rootDir: "..",
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/repository_after/**/*.test.ts"],
  setupFilesAfterEnv: ["<rootDir>/repository_after/testUtils/jest.preload.ts"],
  clearMocks: true,
  restoreMocks: true,
  resetMocks: false,
  moduleNameMapper: {
    "^@sut/(.*)$": "<rootDir>/repository_before/services/$1",
  },
  testTimeout: 15000,
  collectCoverage: true,
  coverageProvider: "v8",
  coverageReporters: ["json-summary", "json", "lcov", "text", "clover"],
  collectCoverageFrom: ["<rootDir>/repository_before/services/**/*.ts"],
  coverageDirectory: "<rootDir>/repository_after/coverage",
  coverageThreshold: {
    global: {
      statements: 85,
      branches: 85,
      functions: 85,
      lines: 85,
    },
  },
};

export default config;
