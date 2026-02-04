import type { Config } from "jest";

const config: Config = {
  rootDir: "..",
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  testTimeout: 60000,
};

export default config;
