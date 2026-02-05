const { authenticator } = require('otplib');
const User = require('../models/User');
const logger = require('../utils/logger');

const verify2FA = async (req, res, next) => {
    try {
        const { 'x-2fa-token': totpToken } = req.headers;

        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'AUTHENTICATION_REQUIRED',
                message: 'You must be logged in to perform this action',
                code: 'NOT_AUTHENTICATED',
            });
        }

        const user = await User.findById(req.user.id).select('+twoFactorSecret');

        if (!user.twoFactorEnabled) {
            return next();
        }

        if (!totpToken) {
            return res.status(403).json({
                success: false,
                error: '2FA_REQUIRED',
                message: 'Two-factor authentication token is required for this action',
                code: 'MISSING_2FA_TOKEN',
            });
        }

        const isValid = authenticator.verify({
            token: totpToken,
            secret: user.twoFactorSecret,
        });

        if (!isValid) {
            logger.warn('Invalid 2FA token', {
                userId: user._id,
                endpoint: req.originalUrl,
            });
            return res.status(403).json({
                success: false,
                error: '2FA_INVALID',
                message: 'Invalid two-factor authentication token',
                code: 'INVALID_2FA_TOKEN',
            });
        }

        logger.debug('2FA verified successfully', { userId: user._id });
        next();
    } catch (error) {
        logger.error('2FA verification error:', error);
        return res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'An error occurred during 2FA verification',
            code: '2FA_CHECK_FAILED',
        });
    }
};

module.exports = verify2FA;
