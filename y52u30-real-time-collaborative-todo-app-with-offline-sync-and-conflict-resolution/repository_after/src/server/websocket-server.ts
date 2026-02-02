/**
 * WebSocket Server
 *
 * Requirement 3: Must use custom Node.js server or separate WebSocket process
 * The App Router does not support WebSocket upgrades in API routes
 */

import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { PresenceManager } from '../lib/presence';
import { Todo, ClientMessage, ServerMessage, UserPresence } from '../types';
import { filterTodosSinceTimestamp } from '../lib/sync';

/**
 * Configuration for the WebSocket server
 */
export interface WebSocketServerConfig {
  port?: number;
  path?: string;
  presenceCleanupDelayMs?: number;
  presenceThrottleMs?: number;
}

/**
 * Client connection info
 */
interface ClientConnection {
  ws: WebSocket;
  userId: string;
  lastSeen: Date;
}

/**
 * Custom WebSocket Server for Next.js 14
 *
 * Requirement 3: This is a separate process from the Next.js App Router
 * because request.socket.server doesn't exist in the App Router runtime
 */
export class CollaborativeTodoWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientConnection> = new Map();
  private presenceManager: PresenceManager;
  private todoStorage: Map<string, Todo> = new Map();
  private httpServer: HTTPServer | null = null;
  private isRunning: boolean = false;

  constructor(config: WebSocketServerConfig = {}) {
    this.presenceManager = new PresenceManager(
      config.presenceCleanupDelayMs,
      config.presenceThrottleMs
    );

    // Set up presence change broadcasting
    this.presenceManager.setOnPresenceChange((presence) => {
      this.broadcastPresence(presence);
    });
  }

  /**
   * Start the WebSocket server
   *
   * Requirement 3: Use custom Node.js server
   */
  start(httpServer: HTTPServer, path: string = '/ws'): void {
    if (this.isRunning) {
      throw new Error('WebSocket server is already running');
    }

    this.httpServer = httpServer;

    // Create WebSocket server attached to HTTP server
    this.wss = new WebSocketServer({
      server: httpServer,
      path
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    this.isRunning = true;
  }

  /**
   * Start standalone WebSocket server (for testing)
   */
  startStandalone(port: number): void {
    if (this.isRunning) {
      throw new Error('WebSocket server is already running');
    }

    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    this.isRunning = true;
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: unknown): void {
    // Extract user ID from query params or generate one
    const userId = this.extractUserId(req) || `user_${Date.now()}`;

    // Store client connection
    this.clients.set(userId, {
      ws,
      userId,
      lastSeen: new Date()
    });

    // Update presence
    this.presenceManager.updatePresence(userId, null);

    // Handle messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        this.handleMessage(userId, message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      this.handleDisconnect(userId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for user ${userId}:`, error);
    });

    // Send initial state
    this.sendSyncState(userId, null);
  }

  /**
   * Extract user ID from request
   */
  private extractUserId(req: unknown): string | null {
    // Type guard for request with url property
    if (req && typeof req === 'object' && 'url' in req) {
      const reqWithUrl = req as { url?: string };
      if (reqWithUrl.url) {
        const url = new URL(reqWithUrl.url, 'http://localhost');
        return url.searchParams.get('userId');
      }
    }
    return null;
  }

  /**
   * Handle client message
   */
  private handleMessage(userId: string, message: ClientMessage): void {
    // Update last seen
    const client = this.clients.get(userId);
    if (client) {
      client.lastSeen = new Date();
    }

    switch (message.type) {
      case 'todo:create':
        this.handleTodoCreate(userId, message);
        break;
      case 'todo:update':
        this.handleTodoUpdate(userId, message);
        break;
      case 'todo:delete':
        this.handleTodoDelete(userId, message);
        break;
      case 'todo:reorder':
        this.handleTodoReorder(userId, message);
        break;
      case 'presence:update':
        this.handlePresenceUpdate(userId, message);
        break;
      case 'sync:request':
        this.handleSyncRequest(userId, message);
        break;
    }
  }

  /**
   * Handle todo creation
   */
  private handleTodoCreate(
    userId: string,
    message: Extract<ClientMessage, { type: 'todo:create' }>
  ): void {
    const now = new Date();
    const todo: Todo = {
      ...message.todo,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };

    this.todoStorage.set(todo.id, todo);
    this.broadcast({ type: 'todo:created', todo }, userId);
  }

  /**
   * Handle todo update
   */
  private handleTodoUpdate(
    userId: string,
    message: Extract<ClientMessage, { type: 'todo:update' }>
  ): void {
    const existing = this.todoStorage.get(message.todoId);
    if (!existing) {
      return;
    }

    // Check for conflicts using vector clocks
    // For now, accept all updates (real implementation would check vector clocks)
    const updated: Todo = {
      ...existing,
      ...message.changes,
      vectorClock: message.vectorClock,
      updatedAt: new Date(),
      updatedBy: userId
    };

    this.todoStorage.set(message.todoId, updated);
    this.broadcast({ type: 'todo:updated', todo: updated }, userId);
  }

  /**
   * Handle todo deletion (soft delete)
   * Requirement 7: Soft delete with deleted_at
   */
  private handleTodoDelete(
    userId: string,
    message: Extract<ClientMessage, { type: 'todo:delete' }>
  ): void {
    const existing = this.todoStorage.get(message.todoId);
    if (!existing) {
      return;
    }

    const deletedAt = new Date();
    const deleted: Todo = {
      ...existing,
      deletedAt,
      updatedAt: deletedAt,
      updatedBy: userId
    };

    this.todoStorage.set(message.todoId, deleted);
    this.broadcast(
      { type: 'todo:deleted', todoId: message.todoId, deletedAt },
      userId
    );
  }

  /**
   * Handle todo reorder
   */
  private handleTodoReorder(
    userId: string,
    message: Extract<ClientMessage, { type: 'todo:reorder' }>
  ): void {
    // Implementation would update positions
    // For now, just acknowledge
    const todo = this.todoStorage.get(message.todoId);
    if (todo) {
      const updated = { ...todo, position: message.toPosition, updatedAt: new Date() };
      this.todoStorage.set(message.todoId, updated);
      this.broadcast({ type: 'todo:updated', todo: updated }, userId);
    }
  }

  /**
   * Handle presence update
   * Requirement 9: Updates are throttled by PresenceManager
   */
  private handlePresenceUpdate(
    userId: string,
    message: Extract<ClientMessage, { type: 'presence:update' }>
  ): void {
    this.presenceManager.updatePresence(userId, message.todoId);
  }

  /**
   * Handle sync request
   * Requirement 11: Only send changes since lastSyncTimestamp
   */
  private handleSyncRequest(
    userId: string,
    message: Extract<ClientMessage, { type: 'sync:request' }>
  ): void {
    this.sendSyncState(userId, message.lastSyncTimestamp);
  }

  /**
   * Send sync state to a client
   * Requirement 11: Filter by lastSyncTimestamp
   */
  private sendSyncState(userId: string, lastSyncTimestamp: Date | null): void {
    const client = this.clients.get(userId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const allTodos = Array.from(this.todoStorage.values());
    const filteredTodos = filterTodosSinceTimestamp(allTodos, lastSyncTimestamp);

    const message: ServerMessage = {
      type: 'sync:state',
      todos: filteredTodos,
      syncTimestamp: new Date()
    };

    client.ws.send(JSON.stringify(message));
  }

  /**
   * Handle client disconnect
   * Requirement 5: Delay cleanup by 5 seconds
   */
  private handleDisconnect(userId: string): void {
    this.clients.delete(userId);
    // PresenceManager handles the 5-second delay (Requirement 5)
    this.presenceManager.markDisconnected(userId);
  }

  /**
   * Broadcast message to all clients except sender
   */
  private broadcast(message: ServerMessage, excludeUserId?: string): void {
    const data = JSON.stringify(message);
    for (const [userId, client] of this.clients) {
      if (userId !== excludeUserId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  /**
   * Broadcast presence changes
   */
  private broadcastPresence(presence: UserPresence[]): void {
    this.broadcast({ type: 'presence:changed', presence });
  }

  /**
   * Stop the WebSocket server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }

      // Close all client connections
      for (const client of this.clients.values()) {
        client.ws.close();
      }
      this.clients.clear();

      this.wss.close(() => {
        this.wss = null;
        this.isRunning = false;
        resolve();
      });
    });
  }

  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get presence manager (for testing)
   */
  getPresenceManager(): PresenceManager {
    return this.presenceManager;
  }
}

/**
 * Validate that WebSocket is supported in this environment
 *
 * Requirement 3: App Router doesn't support WebSocket in API routes
 */
export function validateWebSocketSupport(): { supported: boolean; reason?: string } {
  // In Node.js environment, WebSocket is supported via 'ws' package
  try {
    // Check if we can create a WebSocketServer
    if (typeof WebSocketServer !== 'function') {
      return {
        supported: false,
        reason: 'WebSocketServer not available'
      };
    }
    return { supported: true };
  } catch {
    return {
      supported: false,
      reason: 'WebSocket module not found'
    };
  }
}

/**
 * Create a WebSocket server instance
 */
export function createWebSocketServer(
  config: WebSocketServerConfig = {}
): CollaborativeTodoWebSocketServer {
  return new CollaborativeTodoWebSocketServer(config);
}

/**
 * Note about Next.js App Router limitation
 *
 * Requirement 3: The following code would NOT work in Next.js App Router API routes:
 *
 * // This throws: TypeError: Cannot read properties of undefined (reading 'server')
 * export async function GET(request: Request) {
 *   const server = (request as any).socket?.server;
 *   // server is undefined in App Router!
 * }
 *
 * The solution is to use a custom Node.js server (server.ts) that:
 * 1. Creates an HTTP server
 * 2. Attaches the WebSocket server to it
 * 3. Passes requests to Next.js for regular HTTP handling
 */
export const APP_ROUTER_WEBSOCKET_WARNING = `
WebSocket connections cannot be handled in Next.js App Router API routes.
The request.socket.server property does not exist in the App Router runtime.
Use a custom Node.js server or a separate WebSocket process instead.
`;
