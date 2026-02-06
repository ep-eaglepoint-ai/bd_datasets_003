import "@testing-library/jest-dom";

// Prevent the Vite entry file from auto-mounting during tests.
globalThis.__DISABLE_AUTO_MOUNT__ = true;

// Provide a default fetch mock; individual tests can override.
if (!globalThis.fetch) {
  globalThis.fetch = () => {
    throw new Error("fetch was not mocked");
  };
}
