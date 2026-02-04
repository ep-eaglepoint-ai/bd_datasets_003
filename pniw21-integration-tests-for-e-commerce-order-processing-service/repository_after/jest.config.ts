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
  collectCoverage: false,
};

export default config;
