// Jest setup file
import 'jest-environment-jsdom';

// Define Redwood global env
(global as any).RWJS_ENV = {};

// Real luxon is used to allow DST/timezone validation
jest.mock('@redwoodjs/graphql-server', () => ({
  context: {
    currentUser: { id: 1, email: 'provider@test.com', role: 'PROVIDER' },
    pubSub: {
      publish: () => { },
      subscribe: () => { },
    }
  }
}));

// React components should NOT be mocked globally as it breaks hooks

// Global test utilities
const originalError = console.error;
global.console = {
  ...console,
  error: (...args: any[]) => {
    const msg = args[0]?.toString() || '';
    // Silence expected error boundary noise
    if (msg.includes('ErrorBoundary') || msg.includes('The above error occurred')) {
      return;
    }
    originalError(...args);
  },
};
