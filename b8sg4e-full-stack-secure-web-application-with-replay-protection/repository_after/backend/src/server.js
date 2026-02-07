require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const connectDB = require('./config/database');
const config = require('./config');
const logger = require('./utils/logger');
const { globalLimiter } = require('./middleware/rateLimiter');
const { requestLogger, detailedRequestLogger } = require('./middleware/requestLogger');
const wsServer = require('./websocket');

const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const paymentRoutes = require('./routes/payments');

const app = express();

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
}));

app.use(cors({
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Nonce',
        'X-Timestamp',
        'X-Signature',
        'X-2FA-Token',
    ],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use(requestLogger);
app.use(detailedRequestLogger);

app.use(globalLimiter);

app.set('trust proxy', 1);

app.use((req, res, next) => {
    if (config.nodeEnv === 'production' && !req.secure && req.get('x-forwarded-proto') !== 'https') {
        return res.redirect(`https://${req.get('host')}${req.url}`);
    }
    next();
});

app.use('/api', indexRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/payments', paymentRoutes);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'The requested resource was not found',
        code: 'ENDPOINT_NOT_FOUND',
    });
});

app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);

    res.status(err.status || 500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: config.nodeEnv === 'development' ? err.message : 'An unexpected error occurred',
        code: 'UNHANDLED_ERROR',
    });
});

const startServer = async () => {
    try {
        await connectDB();

        const server = http.createServer(app);

        wsServer.initialize(server);

        server.listen(config.port, () => {
            logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
        });

        process.on('SIGTERM', () => {
            logger.info('SIGTERM received. Shutting down gracefully...');
            server.close(() => {
                logger.info('Process terminated');
                process.exit(0);
            });
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        });

        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            process.exit(1);
        });

    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

module.exports = app;
