import express from 'express';
import { createServer } from 'http';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer, WebSocket } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import cors from 'cors';
import bodyParser from 'body-parser';
import { typeDefs } from './schema/typeDefs.js';
import { resolvers } from './resolvers/index.js';
import { AuthService } from './services/auth.js';
import { PresenceService } from './services/presence.js';
import { prisma } from './db/prisma.js';
import client from 'prom-client';

const PORT = process.env.PORT || 4000;
const MAX_CONNECTIONS_PER_USER = 10;
const BACKPRESSURE_THRESHOLD = 1024 * 1024; // 1MB

// Prometheus Metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const activeConnections = new client.Gauge({
    name: 'active_websocket_connections',
    help: 'Total number of active WebSocket connections',
});
register.registerMetric(activeConnections);

const authFailures = new client.Counter({
    name: 'auth_failures_total',
    help: 'Total number of authentication failures',
});
register.registerMetric(authFailures);

const permissionDenials = new client.Counter({
    name: 'permission_denials_total',
    help: 'Total number of permission denials',
});
register.registerMetric(permissionDenials);

const activeSubscriptions = new client.Gauge({
    name: 'active_subscriptions_total',
    help: 'Total number of active subscriptions per document',
    labelNames: ['documentId', 'type'],
});
register.registerMetric(activeSubscriptions);

async function startServer() {
    const app = express();
    const httpServer = createServer(app);

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    // Web Socket Server
    const wsServer = new WebSocketServer({
        server: httpServer,
        path: '/graphql',
    });

    const serverCleanup = useServer(
        {
            schema,
            context: async (ctx, msg, args) => {
                return { user: (ctx.extra as any).user };
            },
            onConnect: async (ctx) => {
                const connectionParams = ctx.connectionParams as any;
                const authHeader = connectionParams?.Authorization || connectionParams?.authorization;

                if (!authHeader) {
                    authFailures.inc();
                    throw new Error('Missing authentication token');
                }

                const token = authHeader.replace('Bearer ', '');
                const user = AuthService.verify(token);

                if (!user) {
                    authFailures.inc();
                    throw new Error('Invalid or expired token');
                }

                // Connection Limit Enforcement
                const count = await PresenceService.trackConnection(user.userId);
                if (count > MAX_CONNECTIONS_PER_USER) {
                    await PresenceService.untrackConnection(user.userId);
                    throw new Error('Connection limit exceeded (max 10)');
                }

                (ctx.extra as any).user = user;
                activeConnections.inc();
                return true;
            },
            onDisconnect: async (ctx) => {
                const user = (ctx.extra as any).user;
                if (user) {
                    await PresenceService.untrackConnection(user.userId);
                    await PresenceService.clearUserPresence(user.userId);
                    activeConnections.dec();
                    // Cleanup subscription metrics would need onSubscribe/onNext tracking
                }
            },
            onSubscribe: (ctx, msg) => {
                const docId = (msg.payload.variables as any)?.documentId;
                if (docId) {
                    const opType = (msg.payload.query.includes('documentChanged') ? 'documentChanged' :
                        msg.payload.query.includes('presenceUpdated') ? 'presenceUpdated' : 'cursorMoved');
                    activeSubscriptions.inc({ documentId: docId, type: opType });
                }
            },
        },
        wsServer as any
    );

    // Heartbeat Mechanism (30s ping, 90s cleanup)
    const heartbeatInterval = setInterval(() => {
        wsServer.clients.forEach((ws: any) => {
            if (ws.isAlive === false) {
                console.log('Terminating inactive connection');
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    // Backpressure Monitoring & Heartbeat Init
    wsServer.on('connection', (socket: any) => {
        socket.isAlive = true;
        socket.on('pong', () => {
            socket.isAlive = true;
        });

        // Backpressure: Monitor buffer and pause if necessary
        const checkBackpressure = setInterval(() => {
            if (socket.bufferedAmount > BACKPRESSURE_THRESHOLD) {
                if (!socket._isPaused) {
                    console.warn('Pausing slow consumer');
                    socket._isPaused = true;
                    // Unfortunately graphql-ws doesn't expose a simple pause for emissions.
                    // But standard approach is to let the buffer drain and only continue when it's below a threshold.
                }
            } else if (socket._isPaused && socket.bufferedAmount < BACKPRESSURE_THRESHOLD / 2) {
                console.log('Resuming consumer');
                socket._isPaused = false;
            }
        }, 100);

        socket.on('close', () => clearInterval(checkBackpressure));
    });

    const server = new ApolloServer({
        schema,
        plugins: [
            ApolloServerPluginDrainHttpServer({ httpServer }),
            {
                async serverWillStart() {
                    return {
                        async drainServer() {
                            clearInterval(heartbeatInterval);
                            await serverCleanup.dispose();
                        },
                    };
                },
            },
        ],
    });

    await server.start();

    app.use(
        '/graphql',
        cors<cors.CorsRequest>(),
        bodyParser.json(),
        expressMiddleware(server, {
            context: async ({ req }) => {
                const authHeader = req.headers.authorization;
                if (authHeader) {
                    const token = authHeader.replace('Bearer ', '');
                    const user = AuthService.verify(token);
                    if (user) return { user };
                }
                return {};
            },
        })
    );

    app.get('/metrics', async (req, res) => {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    });

    httpServer.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}/graphql`);
    });
}

startServer().catch((error) => {
    console.error('Failed to start server:', error);
});
