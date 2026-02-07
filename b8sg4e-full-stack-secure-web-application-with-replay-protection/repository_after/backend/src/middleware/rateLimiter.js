const rateLimit = require('express-rate-limit');
const config = require('../config');
const logger = require('../utils/logger');

const createRateLimiter = (options = {}) => {
    const defaults = {
        windowMs: config.rateLimit.windowMs,
        max: config.rateLimit.maxRequests,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
            return req.user?.id || req.ip;
        },
        handler: (req, res, next, options) => {
            logger.warn('Rate limit exceeded', {
                ip: req.ip,
                userId: req.user?.id,
                endpoint: req.originalUrl,
            });
            res.status(429).json({
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests, please try again later',
                code: 'TOO_MANY_REQUESTS',
                retryAfter: Math.ceil(options.windowMs / 1000),
            });
        },
        skip: (req) => {
            return false;
        },
    };

    return rateLimit({ ...defaults, ...options });
};

const globalLimiter = createRateLimiter();

const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many authentication attempts, please try again after 15 minutes',
});

const sensitiveOperationLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 20,
    message: 'Too many sensitive operations, please try again later',
});

const strictLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: 'You have exceeded the maximum number of attempts for this operation',
});

module.exports = {
    createRateLimiter,
    globalLimiter,
    authLimiter,
    sensitiveOperationLimiter,
    strictLimiter,
};
