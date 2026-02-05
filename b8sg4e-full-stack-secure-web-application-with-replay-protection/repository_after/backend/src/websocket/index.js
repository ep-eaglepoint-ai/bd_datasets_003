const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');

class WebSocketServer {
    constructor() {
        this.wss = null;
        this.clients = new Map();
    }

    initialize(server) {
        this.wss = new WebSocket.Server({
            server,
            path: '/ws',
        });

        this.wss.on('connection', (ws, req) => {
            this.handleConnection(ws, req);
        });

        logger.info('WebSocket server initialized');
    }

    handleConnection(ws, req) {
        const token = new URL(req.url, 'ws://localhost').searchParams.get('token');

        if (!token) {
            ws.close(4001, 'Authentication required');
            return;
        }

        try {
            const decoded = jwt.verify(token, config.jwt.secret);
            const userId = decoded.id;

            if (!this.clients.has(userId)) {
                this.clients.set(userId, new Set());
            }
            this.clients.get(userId).add(ws);

            logger.info('WebSocket client connected', { userId });

            ws.on('message', (message) => {
                this.handleMessage(ws, userId, message);
            });

            ws.on('close', () => {
                this.clients.get(userId)?.delete(ws);
                if (this.clients.get(userId)?.size === 0) {
                    this.clients.delete(userId);
                }
                logger.info('WebSocket client disconnected', { userId });
            });

            ws.on('error', (error) => {
                logger.error('WebSocket error', { userId, error: error.message });
            });

            ws.send(JSON.stringify({
                type: 'CONNECTION_ESTABLISHED',
                message: 'Connected to real-time updates',
                timestamp: new Date().toISOString(),
            }));
        } catch (error) {
            logger.warn('WebSocket authentication failed', { error: error.message });
            ws.close(4002, 'Invalid token');
        }
    }

    handleMessage(ws, userId, message) {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'PING':
                    ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
                    break;
                default:
                    logger.debug('Unknown WebSocket message type', { userId, type: data.type });
            }
        } catch (error) {
            logger.error('WebSocket message parsing error', { userId, error: error.message });
        }
    }

    sendToUser(userId, message) {
        const userClients = this.clients.get(userId.toString());
        if (userClients) {
            const payload = JSON.stringify({
                ...message,
                timestamp: new Date().toISOString(),
            });
            userClients.forEach(ws => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(payload);
                }
            });
        }
    }

    broadcast(message, excludeUserId = null) {
        const payload = JSON.stringify({
            ...message,
            timestamp: new Date().toISOString(),
        });

        this.clients.forEach((clients, userId) => {
            if (userId !== excludeUserId) {
                clients.forEach(ws => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(payload);
                    }
                });
            }
        });
    }

    notifyPaymentUpdate(userId, payment) {
        this.sendToUser(userId, {
            type: 'PAYMENT_UPDATE',
            data: payment,
        });
    }

    notifyProfileUpdate(userId) {
        this.sendToUser(userId, {
            type: 'PROFILE_UPDATED',
            message: 'Your profile has been updated',
        });
    }

    notifySecurityAlert(userId, alert) {
        this.sendToUser(userId, {
            type: 'SECURITY_ALERT',
            data: alert,
        });
    }
}

const wsServer = new WebSocketServer();
module.exports = wsServer;
