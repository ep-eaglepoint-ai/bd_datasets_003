// Jest setup file
import 'jest-environment-jsdom';

// Mock luxon for consistent testing
jest.mock('luxon', () => ({
  DateTime: {
    fromISO: jest.fn((iso: string, opts?: any) => {
      const date = new Date(iso);
      return {
        toISO: () => iso,
        toUTC: () => ({ toISO: () => iso, toFormat: () => 'UTC' }),
        setZone: (tz: string) => ({ toISO: () => iso, toFormat: () => tz }),
        toFormat: (fmt: string) => date.toLocaleString(),
        plus: (obj: any) => ({ toISO: () => iso }),
        minus: (obj: any) => ({ toISO: () => iso }),
        diff: (other: any) => ({ as: () => 0 }),
        startOf: () => ({ toISODate: () => iso.split('T')[0] }),
        endOf: () => ({ toISO: () => iso }),
        isValid: true,
        offset: 0,
        offsetNameLong: null,
        isOffsetFixed: false,
        hour: date.getHours(),
        minute: date.getMinutes(),
        day: date.getDate(),
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        weekday: date.getDay() || 7
      };
    }),
    utc: () => ({
      toISO: () => new Date().toISOString(),
      toFormat: () => 'UTC'
    }),
    local: () => ({
      toISO: () => new Date().toISOString(),
      toFormat: () => 'Local'
    }),
    now: () => ({
      toISO: () => new Date().toISOString(),
      toFormat: () => 'Now'
    })
  }
}));

// Mock React components for testing
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: jest.fn(),
  useEffect: jest.fn(),
  useCallback: jest.fn(),
  useMemo: jest.fn()
}));

// Global test utilities
global.console = {
  ...console,
  // Uncomment to ignore a specific log level
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};
