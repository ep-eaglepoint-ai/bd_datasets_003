export default {
  testEnvironment: "jsdom",
  testEnvironmentOptions: {
    url: "http://localhost/",
  },
  roots: ["<rootDir>", "<rootDir>/../../tests/client"],
  moduleDirectories: ["node_modules", "<rootDir>/node_modules"],
  modulePaths: ["<rootDir>/node_modules"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testMatch: ["**/*.test.jsx"],
  transform: {
    "^.+\\.[jt]sx?$": "babel-jest",
  },
  extensionsToTreatAsEsm: [".jsx"],
};
