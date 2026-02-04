/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src", "<rootDir>/../tests"],
  testMatch: [
    "<rootDir>/../tests/**/*.test.ts",
    "<rootDir>/../tests/**/*.test.tsx",
  ],
  setupFilesAfterEnv: ["<rootDir>/../tests/setupTests.ts"],
  modulePaths: ["<rootDir>/node_modules"],
  transform: {
    "^.+\\.(t|j)sx?$": [
      "ts-jest",
      { tsconfig: "<rootDir>/tsconfig.jest.json" },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};
