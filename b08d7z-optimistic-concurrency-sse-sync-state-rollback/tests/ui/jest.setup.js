// Jest setup file
// Configure testing environment

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock EventSource for testing
global.EventSource = class MockEventSource {
  constructor(url) {
    this.url = url;
  }
  close() {}
};