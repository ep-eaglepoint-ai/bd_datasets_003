const WebSocket = require('ws');

const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:8080';
const PING_INTERVAL = 2000; // Send ping every 2 seconds (well within 3-second timeout)

class WebSocketClient {
    constructor(serverUrl, options = {}) {
        this.serverUrl = serverUrl;
        this.ws = null;
        this.pingInterval = null;
        this.currentStatus = null;
        this.currentPosition = null;
        this.autoPing = options.autoPing !== false; // Default to true
        this.onStatusChange = options.onStatusChange || null;
        this.onError = options.onError || null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.serverUrl);
                let isConnected = false;

                this.ws.once('open', () => {
                    isConnected = true;
                    console.log('Connected to server');
                    if (this.autoPing) {
                        this.startPinging();
                    }
                    resolve();
                });

                this.ws.once('error', (error) => {
                    if (!isConnected) {
                        console.error('WebSocket connection error:', error.message);
                        reject(error);
                    }
                });

                this.ws.on('message', (data) => {
                    this.handleMessage(data.toString());
                });

                this.ws.on('close', () => {
                    console.log('Disconnected from server');
                    this.stopPinging();
                });

                this.ws.on('error', (error) => {
                    if (isConnected) {
                        console.error('WebSocket error:', error.message);
                        if (this.onError) {
                            this.onError(error);
                        }
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    handleMessage(message) {
        try {
            const parsed = JSON.parse(message);

            if (parsed.status === 'queued') {
                this.currentStatus = 'queued';
                this.currentPosition = parsed.position;
                console.log(`Status: QUEUED at position ${parsed.position}`);
                if (this.onStatusChange) {
                    this.onStatusChange('queued', parsed.position);
                }
            } else if (parsed.status === 'active') {
                this.currentStatus = 'active';
                this.currentPosition = null;
                console.log('Status: ACTIVE');
                if (this.onStatusChange) {
                    this.onStatusChange('active');
                }
            } else if (parsed.type === 'pong') {
                // Server acknowledged our ping
            }
        } catch (error) {
            console.error('Failed to parse message:', error.message);
        }
    }

    startPinging() {
        if (this.pingInterval) {
            return; // Already pinging
        }

        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendPing();
            }
        }, PING_INTERVAL);
    }

    stopPinging() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    sendPing() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
        }
    }

    disconnect() {
        this.stopPinging();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    getStatus() {
        return {
            status: this.currentStatus,
            position: this.currentPosition
        };
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
}

// Run as standalone client if executed directly
if (require.main === module) {
    const client = new WebSocketClient(SERVER_URL);

    client.connect()
        .then(() => {
            console.log('Client connected successfully');
        })
        .catch((error) => {
            console.error('Failed to connect:', error.message);
            process.exit(1);
        });

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nDisconnecting...');
        client.disconnect();
        process.exit(0);
    });
}

module.exports = WebSocketClient;
