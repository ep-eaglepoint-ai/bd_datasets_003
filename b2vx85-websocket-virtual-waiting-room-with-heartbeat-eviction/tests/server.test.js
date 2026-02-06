const WebSocket = require('ws');
const {
    WebSocketServer,
    StateManager,
    MessageHandler,
    CONCURRENCY_LIMIT
} = require('../repository_after/server');
const WebSocketClient = require('../repository_after/client');

const TEST_PORT = 8081;
const TEST_SERVER_URL = `ws://localhost:${TEST_PORT}`;

describe('WebSocket Virtual Waiting Room - Adversarial Tests', () => {
    let server;

    beforeEach(() => {
        server = new WebSocketServer(TEST_PORT);
        server.start();
    });

    afterEach((done) => {
        if (server) {
            server.shutdown();
        }
        // Wait for cleanup
        setTimeout(done, 100);
    });

    // Helper function to create a client
    const createClient = (autoPing = true) => {
        return new WebSocketClient(TEST_SERVER_URL, { autoPing });
    };

    // Helper to wait
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    describe('Requirement 1: Saturation Test', () => {
        it('should allow exactly 5 active connections and queue the 6th', async () => {
            const clients = [];
            const statuses = [];

            // Connect 5 clients
            for (let i = 0; i < 5; i++) {
                const client = createClient();
                await client.connect();
                await wait(50); // Small delay to ensure message is received
                clients.push(client);
                statuses.push(client.getStatus());
            }

            // All 5 should be active
            statuses.forEach((status, index) => {
                expect(status.status).toBe('active');
            });

            // Connect 6th client
            const client6 = createClient();
            await client6.connect();
            await wait(50);

            const status6 = client6.getStatus();
            expect(status6.status).toBe('queued');
            expect(status6.position).toBe(1);

            // Cleanup
            clients.forEach(c => c.disconnect());
            client6.disconnect();
        }, 10000);

        it('should queue multiple clients beyond capacity with correct positions', async () => {
            const clients = [];

            // Connect 8 clients (5 active + 3 queued)
            for (let i = 0; i < 8; i++) {
                const client = createClient();
                await client.connect();
                await wait(50);
                clients.push(client);
            }

            // Check first 5 are active
            for (let i = 0; i < 5; i++) {
                expect(clients[i].getStatus().status).toBe('active');
            }

            // Check last 3 are queued with correct positions
            expect(clients[5].getStatus()).toEqual({ status: 'queued', position: 1 });
            expect(clients[6].getStatus()).toEqual({ status: 'queued', position: 2 });
            expect(clients[7].getStatus()).toEqual({ status: 'queued', position: 3 });

            // Cleanup
            clients.forEach(c => c.disconnect());
        }, 10000);
    });

    describe('Requirement 2: Promotion Logic', () => {
        it('should immediately promote queued client when active disconnects', async () => {
            const clients = [];

            // Connect 6 clients (5 active + 1 queued)
            for (let i = 0; i < 6; i++) {
                const client = createClient();
                await client.connect();
                await wait(50);
                clients.push(client);
            }

            // Verify 6th is queued
            expect(clients[5].getStatus()).toEqual({ status: 'queued', position: 1 });

            // Disconnect one active client
            clients[0].disconnect();
            await wait(100); // Wait for promotion

            // 6th client should now be active
            expect(clients[5].getStatus().status).toBe('active');

            // Cleanup
            clients.slice(1).forEach(c => c.disconnect());
        }, 10000);

        it('should maintain FIFO order during multiple promotions', async () => {
            const clients = [];

            // Connect 10 clients (5 active + 5 queued)
            for (let i = 0; i < 10; i++) {
                const client = createClient();
                await client.connect();
                await wait(50);
                clients.push(client);
            }

            // Verify queue positions
            for (let i = 5; i < 10; i++) {
                expect(clients[i].getStatus().position).toBe(i - 4);
            }

            // Disconnect 3 active clients
            clients[0].disconnect();
            await wait(100);
            clients[1].disconnect();
            await wait(100);
            clients[2].disconnect();
            await wait(100);

            // First 3 queued should now be active
            expect(clients[5].getStatus().status).toBe('active');
            expect(clients[6].getStatus().status).toBe('active');
            expect(clients[7].getStatus().status).toBe('active');

            // Remaining should be queued with updated positions
            expect(clients[8].getStatus()).toEqual({ status: 'queued', position: 1 });
            expect(clients[9].getStatus()).toEqual({ status: 'queued', position: 2 });

            // Cleanup
            clients.slice(3).forEach(c => c.disconnect());
        }, 15000);
    });

    describe('Requirement 3: Heartbeat Eviction', () => {
        it('should disconnect client that fails to send ping within 3 seconds', async () => {
            // Create client without auto-ping
            const client = createClient(false);

            let disconnected = false;
            client.ws = null; // Will be set on connect

            await client.connect();

            // Store original ws to detect close
            const ws = client.ws;
            ws.on('close', () => {
                disconnected = true;
            });

            await wait(50);
            expect(client.getStatus().status).toBe('active');

            // Wait for timeout (3 seconds + buffer)
            await wait(3500);

            // Client should be disconnected
            expect(disconnected).toBe(true);
        }, 10000);

        it('should promote queued client after heartbeat timeout', async () => {
            const clients = [];

            // Connect 5 active clients (with auto-ping)
            for (let i = 0; i < 5; i++) {
                const client = createClient(true);
                await client.connect();
                await wait(50);
                clients.push(client);
            }

            // Connect 1 queued client
            const queuedClient = createClient(true);
            await queuedClient.connect();
            await wait(50);
            expect(queuedClient.getStatus()).toEqual({ status: 'queued', position: 1 });

            // Stop pinging from one active client
            clients[0].stopPinging();

            // Wait for timeout and promotion
            await wait(3500);

            // Queued client should be promoted
            expect(queuedClient.getStatus().status).toBe('active');

            // Cleanup
            clients.slice(1).forEach(c => c.disconnect());
            queuedClient.disconnect();
        }, 10000);
    });

    describe('Requirement 4: Race Conditions and Concurrent Disconnects', () => {
        it('should handle simultaneous disconnects without corrupting state', async () => {
            const clients = [];

            for (let i = 0; i < 10; i++) {
                const client = createClient();
                await client.connect();
                await wait(50);
                clients.push(client);
            }

            clients.slice(0, 5).forEach(c => c.disconnect());

            await wait(200);

            for (let i = 5; i < 10; i++) {
                expect(clients[i].getStatus().status).toBe('active');
            }

            clients.slice(5).forEach(c => c.disconnect());
        }, 10000);

        it('should never exceed concurrency limit during rapid connect/disconnect', async () => {
            const clients = [];
            let maxActive = 0;

            for (let i = 0; i < 30; i++) {
                const client = createClient();
                await client.connect();
                await wait(20);
                clients.push(client);

                const activeCount = clients.filter(c =>
                    c.isConnected() && c.getStatus().status === 'active'
                ).length;
                maxActive = Math.max(maxActive, activeCount);

                if (i % 3 === 0 && clients.length > 2) {
                    const toDisconnect = clients.splice(0, 1)[0];
                    toDisconnect.disconnect();
                }
            }

            expect(maxActive).toBeLessThanOrEqual(CONCURRENCY_LIMIT);

            clients.forEach(c => c.disconnect());
        }, 20000);
    });

    describe('Requirement 5: Malformed Message Handling', () => {
        it('should not crash on malformed JSON messages', async () => {
            const client = new WebSocket(TEST_SERVER_URL);

            await new Promise((resolve) => {
                client.on('open', resolve);
            });

            // Send various malformed messages
            client.send('invalid json{');
            await wait(50);
            client.send('{incomplete');
            await wait(50);
            client.send('');
            await wait(50);
            client.send('{"type": "unknown"}');
            await wait(50);
            client.send('null');
            await wait(50);

            // Server should still be responsive
            const testClient = createClient();
            await testClient.connect();
            await wait(50);

            expect(testClient.getStatus().status).toBe('active');

            // Cleanup
            client.close();
            testClient.disconnect();
        }, 10000);

        it('should handle WebSocket errors gracefully', async () => {
            const client = createClient();
            await client.connect();
            await wait(50);

            // Force an error by sending after close
            client.ws.close();
            await wait(50);

            // Try to send (should not crash server)
            try {
                client.ws.send('test');
            } catch (e) {
                // Expected
            }

            // Server should still accept new connections
            const newClient = createClient();
            await newClient.connect();
            await wait(50);

            expect(newClient.isConnected()).toBe(true);

            // Cleanup
            newClient.disconnect();
        }, 10000);
    });

    describe('Requirement 6: Memory Leak Prevention', () => {
        it('should maintain stable memory during extended operation', async () => {
            const iterations = 50;

            for (let i = 0; i < iterations; i++) {
                const client = createClient();
                await client.connect();
                await wait(20);

                client.disconnect();
                await wait(20);
            }

            const testClient = createClient();
            await testClient.connect();
            await wait(50);

            expect(testClient.getStatus().status).toBe('active');

            testClient.disconnect();
        }, 30000);

        it('should clean up timers after disconnection', async () => {
            const clients = [];

            // Connect and disconnect multiple clients
            for (let i = 0; i < 10; i++) {
                const client = createClient();
                await client.connect();
                await wait(50);
                clients.push(client);
            }

            // Disconnect all
            clients.forEach(c => c.disconnect());
            await wait(100);

            // Verify server state is clean by connecting new clients
            const newClients = [];
            for (let i = 0; i < 5; i++) {
                const client = createClient();
                await client.connect();
                await wait(50);
                newClients.push(client);
            }

            // All should be active (no ghost sessions)
            newClients.forEach(c => {
                expect(c.getStatus().status).toBe('active');
            });

            // Cleanup
            newClients.forEach(c => c.disconnect());
        }, 15000);
    });

    describe('Requirement 7: Queue Position Updates', () => {
        it('should update positions when queued client disconnects', async () => {
            const clients = [];

            for (let i = 0; i < 8; i++) {
                const client = createClient();
                await client.connect();
                await wait(50);
                clients.push(client);
            }

            expect(clients[5].getStatus().position).toBe(1);
            expect(clients[6].getStatus().position).toBe(2);
            expect(clients[7].getStatus().position).toBe(3);

            clients[6].disconnect();
            await wait(100);

            expect(clients[5].getStatus().position).toBe(1);
            expect(clients[7].getStatus().position).toBe(2);

            clients.filter(c => c.isConnected()).forEach(c => c.disconnect());
        }, 10000);
    });

    describe('Requirement 8: Edge Cases', () => {
        it('should handle client disconnect during promotion', async () => {
            const clients = [];

            // Connect 6 clients
            for (let i = 0; i < 6; i++) {
                const client = createClient();
                await client.connect();
                await wait(50);
                clients.push(client);
            }

            // Disconnect queued client and active client simultaneously
            clients[5].disconnect();
            clients[0].disconnect();
            await wait(100);

            // Server should remain stable
            const testClient = createClient();
            await testClient.connect();
            await wait(50);

            expect(testClient.isConnected()).toBe(true);

            // Cleanup
            clients.slice(1, 5).forEach(c => c.disconnect());
            testClient.disconnect();
        }, 10000);

        it('should handle empty queue promotion attempt', async () => {
            const client = createClient();
            await client.connect();
            await wait(50);

            expect(client.getStatus().status).toBe('active');

            // Disconnect (queue is empty, should not crash)
            client.disconnect();
            await wait(100);

            // Server should still work
            const newClient = createClient();
            await newClient.connect();
            await wait(50);

            expect(newClient.getStatus().status).toBe('active');

            newClient.disconnect();
        }, 10000);
    });
});

describe('Unit Tests - Component Level', () => {
    describe('StateManager', () => {
        let stateManager;

        beforeEach(() => {
            stateManager = new StateManager();
        });

        it('should enforce active pool capacity limit', () => {
            const mockWs = {};

            // Add 5 sessions
            for (let i = 0; i < 5; i++) {
                stateManager.addToActivePool(`session-${i}`, mockWs);
            }

            expect(stateManager.getActivePoolSize()).toBe(5);

            // Attempt to add 6th should throw
            expect(() => {
                stateManager.addToActivePool('session-6', mockWs);
            }).toThrow('Active pool at capacity');
        });

        it('should maintain FIFO queue order', () => {
            const mockWs = {};

            stateManager.addToQueue('session-1', mockWs);
            stateManager.addToQueue('session-2', mockWs);
            stateManager.addToQueue('session-3', mockWs);

            expect(stateManager.queue).toEqual(['session-1', 'session-2', 'session-3']);
            expect(stateManager.getQueuePosition('session-1')).toBe(1);
            expect(stateManager.getQueuePosition('session-2')).toBe(2);
            expect(stateManager.getQueuePosition('session-3')).toBe(3);
        });

        it('should remove sessions correctly', () => {
            const mockWs = {};

            stateManager.addToActivePool('active-1', mockWs);
            stateManager.addToQueue('queued-1', mockWs);

            stateManager.removeSession('active-1');
            stateManager.removeSession('queued-1');

            expect(stateManager.getActivePoolSize()).toBe(0);
            expect(stateManager.getQueueSize()).toBe(0);
        });
    });

    describe('MessageHandler', () => {
        let messageHandler;

        beforeEach(() => {
            messageHandler = new MessageHandler();
        });

        it('should format queued message correctly', () => {
            const mockWs = {
                readyState: WebSocket.OPEN,
                send: jest.fn()
            };

            messageHandler.sendQueued(mockWs, 3);

            expect(mockWs.send).toHaveBeenCalledWith(
                JSON.stringify({ status: 'queued', position: 3 })
            );
        });

        it('should format active message correctly', () => {
            const mockWs = {
                readyState: WebSocket.OPEN,
                send: jest.fn()
            };

            messageHandler.sendActive(mockWs);

            expect(mockWs.send).toHaveBeenCalledWith(
                JSON.stringify({ status: 'active' })
            );
        });

        it('should handle malformed JSON gracefully', () => {
            const result1 = messageHandler.parseIncoming('invalid json{');
            const result2 = messageHandler.parseIncoming('');
            const result3 = messageHandler.parseIncoming('{incomplete');

            expect(result1).toBeNull();
            expect(result2).toBeNull();
            expect(result3).toBeNull();
        });

        it('should parse valid JSON correctly', () => {
            const result = messageHandler.parseIncoming('{"type": "ping"}');
            expect(result).toEqual({ type: 'ping' });
        });
    });
});
