/**
 * WebSocket Server Tests
 *
 * Tests for Requirement 3:
 * - Must use custom Node.js server or separate WebSocket process
 * - App Router does not support WebSocket upgrades in API routes
 */

import {
  CollaborativeTodoWebSocketServer,
  createWebSocketServer,
  validateWebSocketSupport,
  APP_ROUTER_WEBSOCKET_WARNING
} from '../repository_after/src/server/websocket-server';

describe('WebSocket Server - Requirement 3: Custom Node.js Server', () => {
  describe('validateWebSocketSupport', () => {
    test('should return supported true in Node.js environment', () => {
      const result = validateWebSocketSupport();
      expect(result.supported).toBe(true);
    });

    test('should not have a reason when supported', () => {
      const result = validateWebSocketSupport();
      if (result.supported) {
        expect(result.reason).toBeUndefined();
      }
    });
  });

  describe('APP_ROUTER_WEBSOCKET_WARNING', () => {
    test('should contain warning about App Router limitation', () => {
      expect(APP_ROUTER_WEBSOCKET_WARNING).toContain('App Router');
      expect(APP_ROUTER_WEBSOCKET_WARNING).toContain('WebSocket');
    });

    test('should mention request.socket.server does not exist', () => {
      expect(APP_ROUTER_WEBSOCKET_WARNING).toContain('request.socket.server');
      expect(APP_ROUTER_WEBSOCKET_WARNING).toContain('does not exist');
    });

    test('should recommend custom Node.js server', () => {
      expect(APP_ROUTER_WEBSOCKET_WARNING).toContain('custom Node.js server');
    });
  });

  describe('createWebSocketServer', () => {
    test('should create server instance', () => {
      const server = createWebSocketServer();
      expect(server).toBeInstanceOf(CollaborativeTodoWebSocketServer);
    });

    test('should accept configuration options', () => {
      const server = createWebSocketServer({
        presenceCleanupDelayMs: 3000,
        presenceThrottleMs: 200
      });
      expect(server).toBeInstanceOf(CollaborativeTodoWebSocketServer);
    });
  });

  describe('CollaborativeTodoWebSocketServer', () => {
    let server: CollaborativeTodoWebSocketServer;

    beforeEach(() => {
      server = new CollaborativeTodoWebSocketServer();
    });

    afterEach(async () => {
      if (server.isServerRunning()) {
        await server.stop();
      }
    });

    test('should not be running initially', () => {
      expect(server.isServerRunning()).toBe(false);
    });

    test('should report zero clients initially', () => {
      expect(server.getClientCount()).toBe(0);
    });

    test('should have presence manager', () => {
      const presenceManager = server.getPresenceManager();
      expect(presenceManager).toBeDefined();
    });

    test('should throw if started twice', async () => {
      server.startStandalone(0); // Use port 0 for random available port

      expect(() => {
        server.startStandalone(0);
      }).toThrow('WebSocket server is already running');
    });

    test('should be running after start', () => {
      server.startStandalone(0);
      expect(server.isServerRunning()).toBe(true);
    });

    test('should stop gracefully', async () => {
      server.startStandalone(0);
      expect(server.isServerRunning()).toBe(true);

      await server.stop();
      expect(server.isServerRunning()).toBe(false);
    });

    test('should handle stop when not running', async () => {
      expect(server.isServerRunning()).toBe(false);
      await expect(server.stop()).resolves.toBeUndefined();
    });
  });
});

describe('WebSocket Server - Architecture Validation', () => {
  test('should not use API route pattern', () => {
    // This test validates that we're using a custom server pattern
    // not the API route pattern that doesn't work in App Router

    const server = createWebSocketServer();

    // Custom server should have start method (not export handler)
    expect(typeof server.startStandalone).toBe('function');
    expect(typeof server.stop).toBe('function');
  });

  test('should support attaching to HTTP server', () => {
    const server = createWebSocketServer();

    // Should have method to attach to existing HTTP server
    expect(typeof server.start).toBe('function');
  });

  test('warning message should be informative', () => {
    // The warning should explain:
    // 1. What doesn't work
    // 2. Why it doesn't work
    // 3. What to do instead

    expect(APP_ROUTER_WEBSOCKET_WARNING.length).toBeGreaterThan(100);

    const lines = APP_ROUTER_WEBSOCKET_WARNING.split('\n').filter(l => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});

describe('WebSocket Server - Configuration', () => {
  test('should use default configuration', () => {
    const server = createWebSocketServer();
    expect(server).toBeDefined();
  });

  test('should accept custom presence cleanup delay', () => {
    const server = createWebSocketServer({
      presenceCleanupDelayMs: 10000 // 10 seconds
    });
    expect(server).toBeDefined();
  });

  test('should accept custom presence throttle', () => {
    const server = createWebSocketServer({
      presenceThrottleMs: 50 // 50ms
    });
    expect(server).toBeDefined();
  });

  test('should accept path configuration', () => {
    const server = createWebSocketServer({
      path: '/custom-ws'
    });
    expect(server).toBeDefined();
  });
});

describe('WebSocket Server - Presence Integration', () => {
  let server: CollaborativeTodoWebSocketServer;

  beforeEach(() => {
    server = createWebSocketServer({
      presenceCleanupDelayMs: 5000, // Requirement 5
      presenceThrottleMs: 100 // Requirement 9
    });
  });

  afterEach(async () => {
    if (server.isServerRunning()) {
      await server.stop();
    }
  });

  test('should integrate presence manager', () => {
    const presenceManager = server.getPresenceManager();

    expect(presenceManager).toBeDefined();
    expect(typeof presenceManager.updatePresence).toBe('function');
    expect(typeof presenceManager.markDisconnected).toBe('function');
  });

  test('should get empty presence initially', () => {
    const presenceManager = server.getPresenceManager();
    const presence = presenceManager.getPresence();

    expect(Array.isArray(presence)).toBe(true);
    expect(presence.length).toBe(0);
  });
});
