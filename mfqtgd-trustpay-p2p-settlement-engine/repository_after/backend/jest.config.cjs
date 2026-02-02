const path = require("path");

module.exports = {
  // Run tests from the dataset root `tests/` folder (this is what instance.json points at).
  rootDir: path.resolve(__dirname, "..", ".."),
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  moduleDirectories: [
    // Allow tests under <rootDir>/tests to resolve deps installed in backend/
    "node_modules",
    path.resolve(__dirname, "node_modules"),
  ],
  clearMocks: true,
};

