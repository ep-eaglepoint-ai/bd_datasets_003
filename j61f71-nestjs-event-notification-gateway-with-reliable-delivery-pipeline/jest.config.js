const path = require("path");

module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  roots: ["<rootDir>/tests"],
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": [
      require.resolve("ts-jest", {
        paths: [path.join(__dirname, "repository_after")],
      }),
      {
        tsconfig: "<rootDir>/repository_after/tsconfig.json",
      },
    ],
  },
  moduleNameMapper: {
    "^../repository_after/src/(.*)$": "<rootDir>/repository_after/src/$1",
  },
  moduleDirectories: [
    "node_modules",
    "<rootDir>/repository_after/node_modules",
  ],
  collectCoverageFrom: ["<rootDir>/repository_after/src/**/*.(t|j)s"],
  coverageDirectory: "<rootDir>/coverage",
  testEnvironment: "node",
};
