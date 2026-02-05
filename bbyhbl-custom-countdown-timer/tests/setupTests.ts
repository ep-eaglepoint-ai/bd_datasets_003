import '@testing-library/jest-dom';

const createLocalStorageMock = () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
});

if (typeof window !== 'undefined') {
  const localStorageMock = createLocalStorageMock();
  
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
  });

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

global.fetch = jest.fn();

// Add Node.js polyfills
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

beforeEach(() => {
  jest.clearAllMocks();

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});