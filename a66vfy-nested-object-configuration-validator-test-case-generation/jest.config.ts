import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/repository_after"],
  testMatch: ["**/testConfigValidator.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  // Disable cache so swapped files are always re-read
  cache: false,
  // Disable watchman to avoid permission issues
  watchman: false,
};

export default config;
