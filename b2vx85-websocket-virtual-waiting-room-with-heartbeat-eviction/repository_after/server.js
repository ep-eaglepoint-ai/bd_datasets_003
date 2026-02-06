const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 8080;
const CONCURRENCY_LIMIT = 5;
const HEARTBEAT_TIMEOUT = 3000; // 3 seconds

class StateManager {
    constructor() {
        this.activePool = new Map(); // sessionId -> SessionData
        this.queue = []; // Array of sessionIds (FIFO)
        this.sessionRegistry = new Map(); // sessionId -> WebSocket
    }

    addToActivePool(sessionId, ws) {
        if (this.activePool.size >= CONCURRENCY_LIMIT) {
            throw new Error('Active pool at capacity');
        }
        this.activePool.set(sessionId, {
            sessionId,
            ws,
            state: 'active',
            connectedAt: Date.now()
        });
        this.sessionRegistry.set(sessionId, ws);
    }

    removeFromActivePool(sessionId) {
        this.activePool.delete(sessionId);
    }

    addToQueue(sessionId, ws) {
        this.queue.push(sessionId);
        this.sessionRegistry.set(sessionId, ws);
    }

    removeFromQueue(sessionId) {
        const index = this.queue.indexOf(sessionId);
        if (index > -1) {
            this.queue.splice(index, 1);
        }
    }

    getActivePoolSize() {
        return this.activePool.size;
    }

    getQueueSize() {
        return this.queue.length;
    }

    getQueuePosition(sessionId) {
        const index = this.queue.indexOf(sessionId);
        return index === -1 ? null : index + 1; // 1-indexed
    }

    getAllQueuedSessions() {
        return [...this.queue];
    }

    getWebSocket(sessionId) {
        return this.sessionRegistry.get(sessionId);
    }

    removeSession(sessionId) {
        this.removeFromActivePool(sessionId);
        this.removeFromQueue(sessionId);
        this.sessionRegistry.delete(sessionId);
    }
}

class QueueManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
    }

    enqueue(sessionId, ws) {
        this.stateManager.addToQueue(sessionId, ws);
        return this.stateManager.getQueuePosition(sessionId);
    }

    dequeue() {
        if (this.stateManager.queue.length === 0) {
            return null;
        }
        return this.stateManager.queue.shift();
    }

    remove(sessionId) {
        this.stateManager.removeFromQueue(sessionId);
    }

    getPosition(sessionId) {
        return this.stateManager.getQueuePosition(sessionId);
    }

    getSize() {
        return this.stateManager.getQueueSize();
    }

    updateAllPositions(messageHandler) {
        const queuedSessions = this.stateManager.getAllQueuedSessions();
        queuedSessions.forEach((sessionId, index) => {
            const ws = this.stateManager.getWebSocket(sessionId);
            if (ws && ws.readyState === WebSocket.OPEN) {
                messageHandler.sendPositionUpdate(ws, index + 1);
            }
        });
    }
}

class MessageHandler {
    sendQueued(ws, position) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ status: 'queued', position }));
        }
    }

    sendActive(ws) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ status: 'active' }));
        }
    }

    sendPositionUpdate(ws, position) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ status: 'queued', position }));
        }
    }

    parseIncoming(message) {
        try {
            return JSON.parse(message);
        } catch (error) {
            console.error('Failed to parse message:', error.message);
            return null;
        }
    }

    handleError(error) {
        console.error('Message handler error:', error.message);
    }
}

class HeartbeatMonitor {
    constructor(stateManager, onTimeout) {
        this.stateManager = stateManager;
        this.heartbeatTimers = new Map();
        this.onTimeout = onTimeout;
    }

    startMonitoring(sessionId, ws) {
        this.stopMonitoring(sessionId); // Clear any existing timer

        const timer = setTimeout(() => {
            console.log(`Heartbeat timeout for session ${sessionId}`);
            this.forceDisconnect(sessionId);
        }, HEARTBEAT_TIMEOUT);

        this.heartbeatTimers.set(sessionId, timer);
    }

    stopMonitoring(sessionId) {
        const timer = this.heartbeatTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            this.heartbeatTimers.delete(sessionId);
        }
    }

    handlePing(sessionId) {
        const ws = this.stateManager.getWebSocket(sessionId);
        if (ws && this.stateManager.activePool.has(sessionId)) {
            this.startMonitoring(sessionId, ws);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'pong' }));
            }
        }
    }

    resetTimer(sessionId) {
        const ws = this.stateManager.getWebSocket(sessionId);
        if (ws && this.stateManager.activePool.has(sessionId)) {
            this.startMonitoring(sessionId, ws);
        }
    }

    forceDisconnect(sessionId) {
        const ws = this.stateManager.getWebSocket(sessionId);
        if (ws) {
            ws.terminate();
            this.onTimeout(sessionId);
        }
    }
}

class PromotionManager {
    constructor(stateManager, queueManager, messageHandler, heartbeatMonitor) {
        this.stateManager = stateManager;
        this.queueManager = queueManager;
        this.messageHandler = messageHandler;
        this.heartbeatMonitor = heartbeatMonitor;
    }

    promoteNext() {
        while (this.canPromote()) {
            const sessionId = this.queueManager.dequeue();
            if (!sessionId) {
                return false;
            }

            const ws = this.stateManager.getWebSocket(sessionId);
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                this.stateManager.removeSession(sessionId);
                continue;
            }

            this.stateManager.addToActivePool(sessionId, ws);
            this.heartbeatMonitor.startMonitoring(sessionId, ws);
            this.messageHandler.sendActive(ws);

            this.queueManager.updateAllPositions(this.messageHandler);

            console.log(`Promoted session ${sessionId} to active pool`);
            return true;
        }
        return false;
    }

    canPromote() {
        return this.stateManager.getActivePoolSize() < CONCURRENCY_LIMIT &&
            this.queueManager.getSize() > 0;
    }
}

class ConnectionManager {
    constructor(stateManager, queueManager, messageHandler, heartbeatMonitor, promotionManager) {
        this.stateManager = stateManager;
        this.queueManager = queueManager;
        this.messageHandler = messageHandler;
        this.heartbeatMonitor = heartbeatMonitor;
        this.promotionManager = promotionManager;
    }

    handleNewConnection(ws) {
        const sessionId = uuidv4();
        console.log(`New connection: ${sessionId}`);

        if (this.stateManager.getActivePoolSize() < CONCURRENCY_LIMIT) {
            // Add to active pool
            this.stateManager.addToActivePool(sessionId, ws);
            this.heartbeatMonitor.startMonitoring(sessionId, ws);
            this.messageHandler.sendActive(ws);
            console.log(`Session ${sessionId} added to active pool`);
        } else {
            // Add to queue
            const position = this.queueManager.enqueue(sessionId, ws);
            this.messageHandler.sendQueued(ws, position);
            console.log(`Session ${sessionId} added to queue at position ${position}`);
        }

        return sessionId;
    }

    removeConnection(sessionId) {
        const wasActive = this.stateManager.activePool.has(sessionId);

        // Stop heartbeat monitoring
        this.heartbeatMonitor.stopMonitoring(sessionId);

        // Remove from state
        this.stateManager.removeSession(sessionId);

        console.log(`Session ${sessionId} removed (was ${wasActive ? 'active' : 'queued'})`);

        // If was active, try to promote from queue
        if (wasActive) {
            this.promotionManager.promoteNext();
        } else {
            // If was queued, update positions for remaining queued sessions
            this.queueManager.updateAllPositions(this.messageHandler);
        }
    }

    getSessionState(sessionId) {
        if (this.stateManager.activePool.has(sessionId)) {
            return this.stateManager.activePool.get(sessionId);
        }
        const position = this.stateManager.getQueuePosition(sessionId);
        if (position !== null) {
            return {
                sessionId,
                state: 'queued',
                queuePosition: position
            };
        }
        return null;
    }
}

class WebSocketServer {
    constructor(port) {
        this.port = port;
        this.wss = null;
        this.sessionToId = new WeakMap(); // ws -> sessionId

        // Initialize components
        this.stateManager = new StateManager();
        this.queueManager = new QueueManager(this.stateManager);
        this.messageHandler = new MessageHandler();
        this.heartbeatMonitor = new HeartbeatMonitor(
            this.stateManager,
            (sessionId) => this.handleTimeout(sessionId)
        );
        this.promotionManager = new PromotionManager(
            this.stateManager,
            this.queueManager,
            this.messageHandler,
            this.heartbeatMonitor
        );
        this.connectionManager = new ConnectionManager(
            this.stateManager,
            this.queueManager,
            this.messageHandler,
            this.heartbeatMonitor,
            this.promotionManager
        );
    }

    start() {
        this.wss = new WebSocket.Server({ port: this.port });

        this.wss.on('connection', (ws) => {
            this.handleConnection(ws);
        });

        console.log(`WebSocket server started on port ${this.port}`);
    }

    handleConnection(ws) {
        let sessionId = null;
        let cleanedUp = false;

        const safeDisconnect = () => {
            if (cleanedUp) {
                return;
            }
            cleanedUp = true;
            if (sessionId) {
                this.handleDisconnection(sessionId);
            }
        };

        ws.on('message', (message) => {
            if (!sessionId) {
                return;
            }
            this.handleMessage(sessionId, message.toString());
        });

        ws.on('close', () => {
            safeDisconnect();
        });

        ws.on('error', (error) => {
            console.error(`WebSocket error for session ${sessionId || 'unknown'}:`, error.message);
            safeDisconnect();
        });

        try {
            sessionId = this.connectionManager.handleNewConnection(ws);
            this.sessionToId.set(ws, sessionId);
        } catch (error) {
            console.error('Error handling connection:', error.message);
            ws.terminate();
        }
    }

    handleMessage(sessionId, message) {
        try {
            const parsed = this.messageHandler.parseIncoming(message);
            if (!parsed) {
                return; // Malformed message, ignore
            }

            if (parsed.type === 'ping') {
                this.heartbeatMonitor.handlePing(sessionId);
            } else if (parsed.type === 'pong') {
                this.heartbeatMonitor.resetTimer(sessionId);
            }
        } catch (error) {
            console.error(`Error handling message from ${sessionId}:`, error.message);
        }
    }

    handleDisconnection(sessionId) {
        try {
            this.connectionManager.removeConnection(sessionId);
        } catch (error) {
            console.error(`Error handling disconnection for ${sessionId}:`, error.message);
        }
    }

    handleTimeout(sessionId) {
        try {
            this.connectionManager.removeConnection(sessionId);
        } catch (error) {
            console.error(`Error handling timeout for ${sessionId}:`, error.message);
        }
    }

    shutdown() {
        if (this.wss) {
            this.wss.clients.forEach(ws => {
                ws.terminate();
            });

            this.heartbeatMonitor.heartbeatTimers.forEach((timer, sessionId) => {
                clearTimeout(timer);
            });
            this.heartbeatMonitor.heartbeatTimers.clear();

            this.wss.close();
            console.log('WebSocket server shut down');
        }
    }
}

// Start server if run directly
if (require.main === module) {
    const server = new WebSocketServer(PORT);
    server.start();

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nShutting down gracefully...');
        server.shutdown();
        process.exit(0);
    });
}

module.exports = {
    WebSocketServer,
    StateManager,
    QueueManager,
    MessageHandler,
    HeartbeatMonitor,
    PromotionManager,
    ConnectionManager,
    CONCURRENCY_LIMIT,
    HEARTBEAT_TIMEOUT
};
