import '@testing-library/jest-dom';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let consoleErrorSpy: jest.SpyInstance | undefined;
const originalConsoleError = console.error;
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

const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

beforeEach(() => {
  jest.clearAllMocks();
  const filteredConsoleError = (...args: any[]) => {
    const firstArg = args[0];
    if (typeof firstArg === 'string' && firstArg.includes('not wrapped in act')) {
      return;
    }
    originalConsoleError(...args);
  };

  if (jest.isMockFunction(console.error)) {
    (console.error as unknown as jest.Mock).mockImplementation(filteredConsoleError);
  } else {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(filteredConsoleError);
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});