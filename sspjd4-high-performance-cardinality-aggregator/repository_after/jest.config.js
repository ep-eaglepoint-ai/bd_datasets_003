export default {
  testEnvironment: "node",
  roots: ["<rootDir>/../tests"],
  testMatch: ["**/*.test.js"],
  // No transforms needed; we rely on native ESM support
  transform: {},
  moduleFileExtensions: ["js"],
  verbose: true,
  maxWorkers: 1,
  modulePaths: ["<rootDir>/node_modules"],
  // Ensure Jest resolves the ESM build of uuid correctly in Node 20
  moduleNameMapper: {
    "^uuid$": "<rootDir>/uuid.js",
  },
};
