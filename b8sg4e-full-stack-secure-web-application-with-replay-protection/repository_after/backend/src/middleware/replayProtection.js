const CryptoJS = require('crypto-js');
const Nonce = require('../models/Nonce');
const AuditLog = require('../models/AuditLog');
const config = require('../config');
const logger = require('../utils/logger');

const verifySignature = (payload, signature, secret) => {
    const expectedSignature = CryptoJS.HmacSHA256(
        JSON.stringify(payload),
        secret
    ).toString();
    return signature === expectedSignature;
};

const replayProtection = async (req, res, next) => {
    const startTime = Date.now();
    const { 'x-nonce': nonce, 'x-timestamp': timestamp, 'x-signature': signature } = req.headers;
    const clientIp = req.ip || req.connection.remoteAddress;
    const userId = req.user?.id || null;

    const logAttempt = async (isReplayAttempt, replayReason, success) => {
        try {
            await AuditLog.create({
                userId,
                action: 'API_REQUEST',
                endpoint: req.originalUrl,
                method: req.method,
                clientIp,
                userAgent: req.get('User-Agent'),
                requestBody: req.method !== 'GET' ? { ...req.body, password: undefined } : undefined,
                responseStatus: res.statusCode || (success ? 200 : 400),
                isReplayAttempt,
                replayReason,
                nonce,
                duration: Date.now() - startTime,
                success,
            });
        } catch (error) {
            logger.error('Failed to log audit entry:', error);
        }
    };

    if (!nonce || !timestamp || !signature) {
        logger.warn('Missing replay protection headers', { endpoint: req.originalUrl, clientIp });
        await logAttempt(true, 'MISSING_HEADERS', false);
        return res.status(400).json({
            success: false,
            error: 'REPLAY_PROTECTION_ERROR',
            message: 'Missing required security headers: x-nonce, x-timestamp, x-signature',
            code: 'MISSING_SECURITY_HEADERS',
        });
    }

    const requestTimestamp = parseInt(timestamp, 10);
    const currentTime = Date.now();
    const timeDifference = Math.abs(currentTime - requestTimestamp);

    if (isNaN(requestTimestamp) || timeDifference > config.requestValidityWindow) {
        logger.warn('Request expired or invalid timestamp', {
            endpoint: req.originalUrl,
            clientIp,
            timeDifference,
            validityWindow: config.requestValidityWindow,
        });
        await logAttempt(true, 'EXPIRED_TIMESTAMP', false);
        return res.status(401).json({
            success: false,
            error: 'REQUEST_EXPIRED',
            message: 'Request has expired or timestamp is invalid',
            code: 'INVALID_TIMESTAMP',
        });
    }

    const payloadToVerify = {
        nonce,
        timestamp: requestTimestamp,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        body: req.body || {},
    };

    if (!verifySignature(payloadToVerify, signature, config.hmac.secret)) {
        logger.warn('Invalid signature detected', {
            endpoint: req.originalUrl,
            clientIp,
            nonce,
        });
        await logAttempt(true, 'INVALID_SIGNATURE', false);
        return res.status(401).json({
            success: false,
            error: 'INVALID_SIGNATURE',
            message: 'Request signature verification failed',
            code: 'SIGNATURE_MISMATCH',
        });
    }

    try {
        const existingNonce = await Nonce.findOne({ nonce });

        if (existingNonce) {
            logger.warn('Replay attack detected - nonce reuse', {
                endpoint: req.originalUrl,
                clientIp,
                nonce,
                originalUsage: existingNonce.createdAt,
            });
            await logAttempt(true, 'NONCE_REUSE', false);
            return res.status(409).json({
                success: false,
                error: 'REPLAY_DETECTED',
                message: 'This request has already been processed',
                code: 'NONCE_ALREADY_USED',
            });
        }

        await Nonce.create({
            nonce,
            userId,
            clientIp,
            endpoint: req.originalUrl,
            method: req.method,
        });

        res.on('finish', async () => {
            await logAttempt(false, null, res.statusCode < 400);
        });

        logger.debug('Replay protection passed', { nonce, endpoint: req.originalUrl });
        next();
    } catch (error) {
        if (error.code === 11000) {
            logger.warn('Concurrent replay attack detected', {
                endpoint: req.originalUrl,
                clientIp,
                nonce,
            });
            await logAttempt(true, 'CONCURRENT_NONCE_COLLISION', false);
            return res.status(409).json({
                success: false,
                error: 'REPLAY_DETECTED',
                message: 'This request has already been processed',
                code: 'CONCURRENT_REQUEST_DETECTED',
            });
        }

        logger.error('Replay protection error:', error);
        await logAttempt(false, 'INTERNAL_ERROR', false);
        return res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'An internal error occurred during request validation',
            code: 'REPLAY_CHECK_FAILED',
        });
    }
};

module.exports = replayProtection;
