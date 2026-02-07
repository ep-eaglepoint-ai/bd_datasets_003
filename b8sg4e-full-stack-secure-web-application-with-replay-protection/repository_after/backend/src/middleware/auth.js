const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');
const logger = require('../utils/logger');

const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'AUTHENTICATION_REQUIRED',
                message: 'No access token provided',
                code: 'MISSING_TOKEN',
            });
        }

        const token = authHeader.split(' ')[1];

        const decoded = jwt.verify(token, config.jwt.secret);

        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'USER_NOT_FOUND',
                message: 'User associated with this token no longer exists',
                code: 'INVALID_USER',
            });
        }

        if (user.isDeleted) {
            return res.status(401).json({
                success: false,
                error: 'ACCOUNT_DELETED',
                message: 'This account has been deactivated',
                code: 'ACCOUNT_INACTIVE',
            });
        }

        req.user = {
            id: user._id,
            email: user.email,
            role: user.role,
            twoFactorEnabled: user.twoFactorEnabled,
        };

        logger.debug('User authenticated', { userId: user._id, email: user.email });
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'TOKEN_EXPIRED',
                message: 'Access token has expired, please refresh',
                code: 'EXPIRED_TOKEN',
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'INVALID_TOKEN',
                message: 'Invalid access token',
                code: 'MALFORMED_TOKEN',
            });
        }

        logger.error('Authentication error:', error);
        return res.status(500).json({
            success: false,
            error: 'AUTHENTICATION_ERROR',
            message: 'An error occurred during authentication',
            code: 'AUTH_INTERNAL_ERROR',
        });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'AUTHENTICATION_REQUIRED',
                message: 'You must be logged in to access this resource',
                code: 'NOT_AUTHENTICATED',
            });
        }

        if (!roles.includes(req.user.role)) {
            logger.warn('Authorization failed', {
                userId: req.user.id,
                requiredRoles: roles,
                userRole: req.user.role,
                endpoint: req.originalUrl,
            });
            return res.status(403).json({
                success: false,
                error: 'FORBIDDEN',
                message: 'You do not have permission to perform this action',
                code: 'INSUFFICIENT_PERMISSIONS',
                required: roles,
            });
        }

        next();
    };
};

const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, config.jwt.secret);
            const user = await User.findById(decoded.id);

            if (user && !user.isDeleted) {
                req.user = {
                    id: user._id,
                    email: user.email,
                    role: user.role,
                    twoFactorEnabled: user.twoFactorEnabled,
                };
            }
        }
        next();
    } catch (error) {
        next();
    }
};

module.exports = {
    authenticate,
    authorize,
    optionalAuth,
};
