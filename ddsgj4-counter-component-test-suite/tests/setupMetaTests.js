// Meta-test setup file
// This file contains utilities for meta-testing the test suite

// Extend Jest with custom matchers if needed
expect.extend({
  toContainTest(received, testName) {
    const pass = received.some(test => test.name === testName);
    return {
      pass,
      message: () =>
        pass
          ? `Expected test suite not to contain test "${testName}"`
          : `Expected test suite to contain test "${testName}"`,
    };
  },
});
