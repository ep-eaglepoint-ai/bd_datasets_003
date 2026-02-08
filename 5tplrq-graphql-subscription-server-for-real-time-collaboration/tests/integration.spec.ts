import { createClient } from 'graphql-ws';
import WebSocket from 'ws';
import axios from 'axios';

const GRAPHQL_URL = process.env.GRAPHQL_URL || 'http://app:4000/graphql';
const WS_URL = process.env.WS_URL || 'ws://app:4000/graphql';

describe('GraphQL Subscription Server Collaboration Flow', () => {
    let tokenAlice: string;
    let tokenBob: string;
    let aliceId: string;
    let bobId: string;
    let docId: string;

    beforeAll(async () => {
        // Login Alice
        const resAlice = await axios.post(GRAPHQL_URL, {
            query: 'mutation { login(email: "alice@example.com", name: "Alice") }'
        });
        tokenAlice = resAlice.data.data.login;

        // Login Bob
        const resBob = await axios.post(GRAPHQL_URL, {
            query: 'mutation { login(email: "bob@example.com", name: "Bob") }'
        });
        tokenBob = resBob.data.data.login;

        // Get User IDs
        const meAlice = await axios.post(GRAPHQL_URL, { query: '{ me { id } }' }, {
            headers: { Authorization: `Bearer ${tokenAlice}` }
        });
        aliceId = meAlice.data.data.me.id;

        const meBob = await axios.post(GRAPHQL_URL, { query: '{ me { id } }' }, {
            headers: { Authorization: `Bearer ${tokenBob}` }
        });
        bobId = meBob.data.data.me.id;

        // Alice creates a document
        const resDoc = await axios.post(GRAPHQL_URL, {
            query: 'mutation { createDocument(title: "Shared Work") { id } }'
        }, {
            headers: { Authorization: `Bearer ${tokenAlice}` }
        });
        docId = resDoc.data.data.createDocument.id;

        // Alice grants Bob access
        await axios.post(GRAPHQL_URL, {
            query: `mutation { grantAccess(documentId: "${docId}", userId: "${bobId}", permission: "edit") }`
        }, {
            headers: { Authorization: `Bearer ${tokenAlice}` }
        });
    });

    test('Alice and Bob real-time collaboration', async () => {
        const aliceClient = createClient({
            url: WS_URL,
            webSocketImpl: WebSocket,
            connectionParams: { Authorization: `Bearer ${tokenAlice}` },
        });

        const bobClient = createClient({
            url: WS_URL,
            webSocketImpl: WebSocket,
            connectionParams: { Authorization: `Bearer ${tokenBob}` },
        });

        // 1. Bob subscribes to cursor movements
        const bobCursorPromise = new Promise((resolve, reject) => {
            const unsub = bobClient.subscribe({
                query: `subscription { cursorMoved(documentId: "${docId}") { userId position { line column } } }`,
            }, {
                next: (data: any) => { unsub(); resolve(data.data.cursorMoved); },
                error: (err: any) => { reject(err); },
                complete: () => { },
            });
        });

        // Wait a bit for subscription to be established
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 2. Alice moves her cursor
        await axios.post(GRAPHQL_URL, {
            query: `mutation { updateCursor(documentId: "${docId}", position: { line: 10, column: 20 }) }`,
        }, {
            headers: { Authorization: `Bearer ${tokenAlice}` }
        });

        const bobReceivedAliceCursor = await bobCursorPromise as any;
        expect(bobReceivedAliceCursor.position.line).toBe(10);
        expect(bobReceivedAliceCursor.position.column).toBe(20);

        // 3. Bob subscribes to document changes
        const bobChangePromise = new Promise((resolve, reject) => {
            const unsub = bobClient.subscribe({
                query: `subscription { documentChanged(documentId: "${docId}") { content } }`,
            }, {
                next: (data: any) => { unsub(); resolve(data.data.documentChanged); },
                error: (err: any) => { reject(err); },
                complete: () => { },
            });
        });

        // Wait a bit for subscription to be established
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 4. Alice updates the document
        await axios.post(GRAPHQL_URL, {
            query: `mutation { updateDocument(id: "${docId}", content: "Updated content by Alice") { id } }`,
        }, {
            headers: { Authorization: `Bearer ${tokenAlice}` }
        });

        const bobReceivedAliceChange = await bobChangePromise as any;
        expect(bobReceivedAliceChange.content).toBe("Updated content by Alice");

        aliceClient.dispose();
        bobClient.dispose();
    }, 30000);

    test('Should reject unauthenticated WebSocket connections', (done) => {
        const client = createClient({
            url: WS_URL,
            webSocketImpl: WebSocket,
            connectionParams: {}, // No token
            shouldRetry: () => false,
        });

        client.subscribe({
            query: `subscription { documentChanged(documentId: "none") { content } }`,
        }, {
            next: () => { },
            error: (err: any) => {
                // For graphql-ws, onConnect errors usually come as CloseEvents with codes
                // or as connection errors.
                if (err.reason) {
                    expect(err.reason).toContain('Missing authentication token');
                } else if (err.message) {
                    expect(err.message).toContain('Missing authentication token');
                } else {
                    // Fallback to close code if reason is missing but it's an error
                    expect(err.code).toBe(4500);
                }
                done();
            },
            complete: () => { },
        });
    }, 20000);

    test('Should expose metrics endpoint', async () => {
        const metricsUrl = GRAPHQL_URL.replace('/graphql', '/metrics');
        const response = await axios.get(metricsUrl);
        expect(response.status).toBe(200);
        expect(response.data).toContain('active_websocket_connections');
    });
});
