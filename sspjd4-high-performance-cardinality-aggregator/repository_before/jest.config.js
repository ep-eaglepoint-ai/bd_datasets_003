export default {
  testEnvironment: "node",
  roots: ["<rootDir>/../tests"],
  testMatch: ["**/*.test.js"],
  verbose: true,
  maxWorkers: 1,
  extensionsToTreatAsEsm: [".js"], // This tells Jest to treat .js files as ES modules
  moduleNameMapper: {
    "^uuid$": "<rootDir>/node_modules/uuid/dist/esm-node/index.js",
  },
};
