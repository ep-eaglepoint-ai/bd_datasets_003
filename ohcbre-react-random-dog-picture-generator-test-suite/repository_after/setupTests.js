import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index) => Object.keys(store)[index] || null)
  };
})();

global.localStorage = localStorageMock;

// Mock fetch globally
global.fetch = jest.fn();

// Suppress console in tests
const originalError = console.error;
const originalWarn = console.warn;
const originalLog = console.log;

global.beforeAll(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
  console.log = jest.fn();
});

global.afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
  console.log = originalLog;
});

// Reset mocks before each test
global.beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  global.fetch.mockReset();
});

global.afterEach(() => {
  jest.restoreAllMocks();
});