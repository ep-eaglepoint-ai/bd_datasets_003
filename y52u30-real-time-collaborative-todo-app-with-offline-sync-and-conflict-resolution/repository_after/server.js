/**
 * Custom Node.js Server for Next.js with WebSocket Support
 *
 * Requirement 3: Must use custom Node.js server or separate WebSocket process
 * The App Router does not support WebSocket upgrades in API routes.
 * request.socket.server doesn't exist in the App Router runtime.
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Initialize Next.js
const app = next({ dev, hostname, port, dir: __dirname });
const handle = app.getRequestHandler();

/**
 * In-memory storage for todos and presence
 * In production, this would be backed by a database
 */
const todoStorage = new Map();
const clients = new Map();
const presenceTimers = new Map();
const presenceState = new Map();

// Throttle state for presence broadcasts
let lastPresenceBroadcast = 0;
let pendingPresenceBroadcast = null;
const PRESENCE_THROTTLE_MS = 100; // Requirement 9: max 1 per 100ms
const PRESENCE_CLEANUP_DELAY_MS = 5000; // Requirement 5: 5 second delay

/**
 * Filter todos since a timestamp
 * Requirement 11: Only send changes since lastSyncTimestamp
 */
function filterTodosSinceTimestamp(todos, lastSyncTimestamp) {
  if (!lastSyncTimestamp) {
    return todos;
  }
  const timestamp = new Date(lastSyncTimestamp);
  return todos.filter(todo => new Date(todo.updatedAt) > timestamp);
}

/**
 * Broadcast message to all connected clients
 */
function broadcast(wss, message, excludeUserId) {
  const data = JSON.stringify(message);
  for (const [userId, client] of clients) {
    if (userId !== excludeUserId && client.readyState === 1) { // WebSocket.OPEN
      client.send(data);
    }
  }
}

/**
 * Broadcast presence with throttling
 * Requirement 9: Throttle to max 1 per 100ms
 */
function broadcastPresence(wss) {
  const now = Date.now();
  const presence = Array.from(presenceState.values());

  if (now - lastPresenceBroadcast >= PRESENCE_THROTTLE_MS) {
    lastPresenceBroadcast = now;
    if (pendingPresenceBroadcast) {
      clearTimeout(pendingPresenceBroadcast);
      pendingPresenceBroadcast = null;
    }
    broadcast(wss, { type: 'presence:changed', presence });
  } else {
    // Schedule broadcast for later
    if (!pendingPresenceBroadcast) {
      pendingPresenceBroadcast = setTimeout(() => {
        pendingPresenceBroadcast = null;
        lastPresenceBroadcast = Date.now();
        const currentPresence = Array.from(presenceState.values());
        broadcast(wss, { type: 'presence:changed', presence: currentPresence });
      }, PRESENCE_THROTTLE_MS - (now - lastPresenceBroadcast));
    }
  }
}

/**
 * Handle WebSocket connection
 */
function handleConnection(wss, ws, req) {
  // Extract user ID from query params
  const url = new URL(req.url, `http://${req.headers.host}`);
  const userId = url.searchParams.get('userId') || `user_${Date.now()}`;

  console.log(`Client connected: ${userId}`);

  // Store client connection
  clients.set(userId, ws);

  // Cancel any pending cleanup timer (Requirement 5)
  if (presenceTimers.has(userId)) {
    clearTimeout(presenceTimers.get(userId));
    presenceTimers.delete(userId);
  }

  // Update presence
  presenceState.set(userId, {
    userId,
    currentTodoId: null,
    lastSeen: new Date()
  });
  broadcastPresence(wss);

  // Send initial sync state
  const allTodos = Array.from(todoStorage.values());
  ws.send(JSON.stringify({
    type: 'sync:state',
    todos: allTodos,
    syncTimestamp: new Date()
  }));

  // Handle messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(wss, userId, message);
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    console.log(`Client disconnected: ${userId}`);
    clients.delete(userId);

    // Requirement 5: Delay cleanup by 5 seconds
    const timer = setTimeout(() => {
      presenceState.delete(userId);
      presenceTimers.delete(userId);
      broadcastPresence(wss);
    }, PRESENCE_CLEANUP_DELAY_MS);

    presenceTimers.set(userId, timer);
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for user ${userId}:`, error);
  });
}

/**
 * Handle client message
 */
function handleMessage(wss, userId, message) {
  switch (message.type) {
    case 'todo:create': {
      const now = new Date();
      const todo = {
        ...message.todo,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      };
      todoStorage.set(todo.id, todo);
      broadcast(wss, { type: 'todo:created', todo }, userId);
      break;
    }

    case 'todo:update': {
      const existing = todoStorage.get(message.todoId);
      if (existing) {
        const updated = {
          ...existing,
          ...message.changes,
          vectorClock: message.vectorClock,
          updatedAt: new Date(),
          updatedBy: userId
        };
        todoStorage.set(message.todoId, updated);
        broadcast(wss, { type: 'todo:updated', todo: updated }, userId);
      }
      break;
    }

    case 'todo:delete': {
      // Requirement 7: Soft delete with deleted_at
      const existing = todoStorage.get(message.todoId);
      if (existing) {
        const deletedAt = new Date();
        const deleted = {
          ...existing,
          deletedAt,
          updatedAt: deletedAt,
          updatedBy: userId
        };
        todoStorage.set(message.todoId, deleted);
        broadcast(wss, { type: 'todo:deleted', todoId: message.todoId, deletedAt }, userId);
      }
      break;
    }

    case 'todo:reorder': {
      const todo = todoStorage.get(message.todoId);
      if (todo) {
        const updated = {
          ...todo,
          position: message.toPosition,
          updatedAt: new Date()
        };
        todoStorage.set(message.todoId, updated);
        broadcast(wss, { type: 'todo:updated', todo: updated }, userId);
      }
      break;
    }

    case 'presence:update': {
      // Update presence state
      presenceState.set(userId, {
        userId,
        currentTodoId: message.todoId,
        lastSeen: new Date()
      });
      broadcastPresence(wss);
      break;
    }

    case 'sync:request': {
      // Requirement 11: Only send changes since lastSyncTimestamp
      const allTodos = Array.from(todoStorage.values());
      const filteredTodos = filterTodosSinceTimestamp(allTodos, message.lastSyncTimestamp);
      const client = clients.get(userId);
      if (client && client.readyState === 1) {
        client.send(JSON.stringify({
          type: 'sync:state',
          todos: filteredTodos,
          syncTimestamp: new Date()
        }));
      }
      break;
    }
  }
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // Requirement 3: Attach WebSocket server to HTTP server
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    handleConnection(wss, ws, req);
  });

  wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket server on ws://${hostname}:${port}/ws`);
  });
});
