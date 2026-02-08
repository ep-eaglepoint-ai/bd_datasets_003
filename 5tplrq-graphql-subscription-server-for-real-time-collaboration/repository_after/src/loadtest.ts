import WebSocket from 'ws';
import { performance } from 'perf_hooks';

const SERVER_URL = process.env.WS_URL || 'ws://localhost:4000/graphql';
const TARGET_CONNECTIONS = parseInt(process.env.TARGET_CONNECTIONS || '1000');
const RAMP_UP_TIME = parseInt(process.env.RAMP_UP_TIME || '30000'); // 30 seconds

interface LoadTestMetrics {
    totalConnections: number;
    successfulConnections: number;
    failedConnections: number;
    avgConnectionTime: number;
    avgMessageLatency: number;
    messagesSent: number;
    messagesReceived: number;
    errors: string[];
}

const metrics: LoadTestMetrics = {
    totalConnections: 0,
    successfulConnections: 0,
    failedConnections: 0,
    avgConnectionTime: 0,
    avgMessageLatency: 0,
    messagesSent: 0,
    messagesReceived: 0,
    errors: [],
};

const connectionTimes: number[] = [];
const messageLatencies: number[] = [];

async function createConnection(userId: string, token: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const startTime = performance.now();
        
        const ws = new WebSocket(SERVER_URL, {
            headers: {
                'Sec-WebSocket-Protocol': 'graphql-transport-ws',
            },
        });

        ws.on('open', () => {
            // Send connection_init with auth
            ws.send(JSON.stringify({
                type: 'connection_init',
                payload: {
                    Authorization: `Bearer ${token}`,
                },
            }));
        });

        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            
            if (msg.type === 'connection_ack') {
                const connectionTime = performance.now() - startTime;
                connectionTimes.push(connectionTime);
                metrics.successfulConnections++;
                resolve(ws);
            } else if (msg.type === 'error') {
                metrics.failedConnections++;
                metrics.errors.push(msg.payload?.message || 'Unknown error');
                reject(new Error(msg.payload?.message));
            } else if (msg.type === 'next') {
                metrics.messagesReceived++;
                const latency = performance.now() - (ws as any).lastSendTime;
                messageLatencies.push(latency);
            }
        });

        ws.on('error', (error) => {
            metrics.failedConnections++;
            metrics.errors.push(error.message);
            reject(error);
        });

        setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) {
                metrics.failedConnections++;
                reject(new Error('Connection timeout'));
            }
        }, 10000);
    });
}

async function subscribeToDocument(ws: WebSocket, documentId: string) {
    const subscriptionId = Math.random().toString(36).substring(7);
    
    ws.send(JSON.stringify({
        id: subscriptionId,
        type: 'subscribe',
        payload: {
            query: `
                subscription CursorMoved($documentId: ID!) {
                    cursorMoved(documentId: $documentId) {
                        documentId
                        userId
                        position {
                            line
                            column
                        }
                    }
                }
            `,
            variables: { documentId },
        },
    }));

    (ws as any).lastSendTime = performance.now();
    metrics.messagesSent++;
}

async function runLoadTest() {
    console.log(`Starting load test: ${TARGET_CONNECTIONS} connections over ${RAMP_UP_TIME}ms`);
    
    const connections: WebSocket[] = [];
    const delayBetweenConnections = RAMP_UP_TIME / TARGET_CONNECTIONS;
    
    // Mock token (in real test, generate valid JWT)
    const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXIiLCJlbWFpbCI6InRlc3RAdGVzdC5jb20iLCJpYXQiOjE2MDk0NTkyMDB9.test';
    
    for (let i = 0; i < TARGET_CONNECTIONS; i++) {
        metrics.totalConnections++;
        
        try {
            const ws = await createConnection(`user-${i}`, mockToken);
            connections.push(ws);
            
            // Subscribe to a document
            await subscribeToDocument(ws, 'test-doc-1');
            
            if (i % 100 === 0) {
                console.log(`Progress: ${i}/${TARGET_CONNECTIONS} connections established`);
            }
        } catch (error) {
            console.error(`Failed to create connection ${i}:`, (error as Error).message);
        }
        
        // Ramp up gradually
        await new Promise(resolve => setTimeout(resolve, delayBetweenConnections));
    }
    
    console.log('\n=== Load Test Results ===');
    console.log(`Total Connections Attempted: ${metrics.totalConnections}`);
    console.log(`Successful Connections: ${metrics.successfulConnections}`);
    console.log(`Failed Connections: ${metrics.failedConnections}`);
    console.log(`Success Rate: ${((metrics.successfulConnections / metrics.totalConnections) * 100).toFixed(2)}%`);
    
    if (connectionTimes.length > 0) {
        const avgConnTime = connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length;
        console.log(`Average Connection Time: ${avgConnTime.toFixed(2)}ms`);
    }
    
    if (messageLatencies.length > 0) {
        const avgLatency = messageLatencies.reduce((a, b) => a + b, 0) / messageLatencies.length;
        console.log(`Average Message Latency: ${avgLatency.toFixed(2)}ms`);
    }
    
    console.log(`Messages Sent: ${metrics.messagesSent}`);
    console.log(`Messages Received: ${metrics.messagesReceived}`);
    
    if (metrics.errors.length > 0) {
        console.log(`\nErrors (first 10):`);
        metrics.errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
    }
    
    // Keep connections alive for monitoring
    console.log('\nKeeping connections alive for 60 seconds...');
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    // Cleanup
    console.log('Closing all connections...');
    connections.forEach(ws => ws.close());
    
    process.exit(0);
}

runLoadTest().catch(console.error);
