require('dotenv').config();

module.exports = {
    port: process.env.PORT || 5000,
    nodeEnv: process.env.NODE_ENV || 'development',
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/secure_app',
    jwt: {
        secret: process.env.JWT_SECRET || 'default-jwt-secret',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
        expiry: process.env.JWT_EXPIRY || '15m',
        refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    },
    hmac: {
        secret: process.env.HMAC_SECRET || 'default-hmac-secret',
    },
    requestValidityWindow: parseInt(process.env.REQUEST_VALIDITY_WINDOW) || 300000,
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    },
    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    },
    encryption: {
        key: process.env.ENCRYPTION_KEY || '32-byte-encryption-key-here!!!!',
    },
};
