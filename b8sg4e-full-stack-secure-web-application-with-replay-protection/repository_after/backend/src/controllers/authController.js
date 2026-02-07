const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const User = require('../models/User');
const config = require('../config');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const generateTokens = (userId, email, role) => {
    const accessToken = jwt.sign(
        { id: userId, email, role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiry }
    );

    const refreshToken = jwt.sign(
        { id: userId, tokenId: uuidv4() },
        config.jwt.refreshSecret,
        { expiresIn: config.jwt.refreshExpiry }
    );

    return { accessToken, refreshToken };
};

const register = async (req, res) => {
    try {
        const { email, password, firstName, lastName, phone } = req.body;

        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Email, password, first name, and last name are required',
                code: 'MISSING_FIELDS',
            });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: 'USER_EXISTS',
                message: 'A user with this email already exists',
                code: 'DUPLICATE_EMAIL',
            });
        }

        const user = await User.create({
            email,
            password,
            firstName,
            lastName,
            phone,
        });

        const { accessToken, refreshToken } = generateTokens(user._id, user.email, user.role);

        const refreshExpiry = new Date();
        refreshExpiry.setDate(refreshExpiry.getDate() + 7);

        user.refreshTokens.push({
            token: refreshToken,
            expiresAt: refreshExpiry,
        });
        await user.save();

        logger.info('User registered successfully', { userId: user._id, email: user.email });

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                },
                accessToken,
                refreshToken,
            },
        });
    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: 'REGISTRATION_ERROR',
            message: 'An error occurred during registration',
            code: 'INTERNAL_ERROR',
        });
    }
};

const login = async (req, res) => {
    try {
        const { email, password, totpToken } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Email and password are required',
                code: 'MISSING_CREDENTIALS',
            });
        }

        const user = await User.findOne({ email: email.toLowerCase(), isDeleted: false })
            .select('+password +twoFactorSecret');

        if (!user || !(await user.comparePassword(password))) {
            logger.warn('Failed login attempt', { email });
            return res.status(401).json({
                success: false,
                error: 'INVALID_CREDENTIALS',
                message: 'Invalid email or password',
                code: 'AUTH_FAILED',
            });
        }

        if (user.twoFactorEnabled) {
            if (!totpToken) {
                return res.status(403).json({
                    success: false,
                    error: '2FA_REQUIRED',
                    message: 'Two-factor authentication token is required',
                    code: 'MISSING_2FA',
                    requires2FA: true,
                });
            }

            const isValid = authenticator.verify({
                token: totpToken,
                secret: user.twoFactorSecret,
            });

            if (!isValid) {
                logger.warn('Invalid 2FA token during login', { userId: user._id });
                return res.status(403).json({
                    success: false,
                    error: '2FA_INVALID',
                    message: 'Invalid two-factor authentication token',
                    code: 'INVALID_2FA',
                });
            }
        }

        const { accessToken, refreshToken } = generateTokens(user._id, user.email, user.role);

        const refreshExpiry = new Date();
        refreshExpiry.setDate(refreshExpiry.getDate() + 7);

        user.refreshTokens = user.refreshTokens.filter(t => t.expiresAt > new Date());
        user.refreshTokens.push({
            token: refreshToken,
            expiresAt: refreshExpiry,
        });
        await user.save();

        logger.info('User logged in successfully', { userId: user._id, email: user.email });

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                    twoFactorEnabled: user.twoFactorEnabled,
                },
                accessToken,
                refreshToken,
            },
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'LOGIN_ERROR',
            message: 'An error occurred during login',
            code: 'INTERNAL_ERROR',
        });
    }
};

const refreshToken = async (req, res) => {
    try {
        const { refreshToken: token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Refresh token is required',
                code: 'MISSING_REFRESH_TOKEN',
            });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, config.jwt.refreshSecret);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'INVALID_TOKEN',
                message: 'Invalid or expired refresh token',
                code: 'REFRESH_TOKEN_INVALID',
            });
        }

        const user = await User.findById(decoded.id);

        if (!user || user.isDeleted) {
            return res.status(401).json({
                success: false,
                error: 'USER_NOT_FOUND',
                message: 'User not found',
                code: 'INVALID_USER',
            });
        }

        const tokenIndex = user.refreshTokens.findIndex(t => t.token === token);

        if (tokenIndex === -1) {
            logger.warn('Refresh token reuse attempt detected', { userId: user._id });
            user.refreshTokens = [];
            await user.save();
            return res.status(401).json({
                success: false,
                error: 'TOKEN_REUSE',
                message: 'Refresh token has been revoked',
                code: 'TOKEN_REVOKED',
            });
        }

        user.refreshTokens.splice(tokenIndex, 1);

        const { accessToken, refreshToken: newRefreshToken } = generateTokens(
            user._id,
            user.email,
            user.role
        );

        const refreshExpiry = new Date();
        refreshExpiry.setDate(refreshExpiry.getDate() + 7);

        user.refreshTokens.push({
            token: newRefreshToken,
            expiresAt: refreshExpiry,
        });
        await user.save();

        logger.info('Token refreshed successfully', { userId: user._id });

        res.json({
            success: true,
            message: 'Token refreshed successfully',
            data: {
                accessToken,
                refreshToken: newRefreshToken,
            },
        });
    } catch (error) {
        logger.error('Token refresh error:', error);
        res.status(500).json({
            success: false,
            error: 'REFRESH_ERROR',
            message: 'An error occurred during token refresh',
            code: 'INTERNAL_ERROR',
        });
    }
};

const logout = async (req, res) => {
    try {
        const { refreshToken: token } = req.body;
        const user = await User.findById(req.user.id);

        if (token) {
            user.refreshTokens = user.refreshTokens.filter(t => t.token !== token);
        } else {
            user.refreshTokens = [];
        }

        await user.save();

        logger.info('User logged out', { userId: user._id });

        res.json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'LOGOUT_ERROR',
            message: 'An error occurred during logout',
            code: 'INTERNAL_ERROR',
        });
    }
};

const setup2FA = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (user.twoFactorEnabled) {
            return res.status(400).json({
                success: false,
                error: '2FA_ALREADY_ENABLED',
                message: 'Two-factor authentication is already enabled',
                code: '2FA_EXISTS',
            });
        }

        const secret = authenticator.generateSecret();
        const otpauth = authenticator.keyuri(user.email, 'SecureApp', secret);
        const qrCode = await QRCode.toDataURL(otpauth);

        user.twoFactorSecret = secret;
        await user.save();

        res.json({
            success: true,
            message: 'Scan the QR code with your authenticator app',
            data: {
                secret,
                qrCode,
            },
        });
    } catch (error) {
        logger.error('2FA setup error:', error);
        res.status(500).json({
            success: false,
            error: '2FA_SETUP_ERROR',
            message: 'An error occurred during 2FA setup',
            code: 'INTERNAL_ERROR',
        });
    }
};

const verify2FASetup = async (req, res) => {
    try {
        const { token } = req.body;
        const user = await User.findById(req.user.id).select('+twoFactorSecret');

        if (!user.twoFactorSecret) {
            return res.status(400).json({
                success: false,
                error: '2FA_NOT_SETUP',
                message: 'Please setup 2FA first',
                code: 'SETUP_REQUIRED',
            });
        }

        const isValid = authenticator.verify({
            token,
            secret: user.twoFactorSecret,
        });

        if (!isValid) {
            return res.status(400).json({
                success: false,
                error: '2FA_INVALID',
                message: 'Invalid verification token',
                code: 'INVALID_TOKEN',
            });
        }

        user.twoFactorEnabled = true;
        await user.save();

        logger.info('2FA enabled successfully', { userId: user._id });

        res.json({
            success: true,
            message: 'Two-factor authentication enabled successfully',
        });
    } catch (error) {
        logger.error('2FA verification error:', error);
        res.status(500).json({
            success: false,
            error: '2FA_VERIFY_ERROR',
            message: 'An error occurred during 2FA verification',
            code: 'INTERNAL_ERROR',
        });
    }
};

const disable2FA = async (req, res) => {
    try {
        const { token } = req.body;
        const user = await User.findById(req.user.id).select('+twoFactorSecret');

        if (!user.twoFactorEnabled) {
            return res.status(400).json({
                success: false,
                error: '2FA_NOT_ENABLED',
                message: 'Two-factor authentication is not enabled',
                code: '2FA_DISABLED',
            });
        }

        const isValid = authenticator.verify({
            token,
            secret: user.twoFactorSecret,
        });

        if (!isValid) {
            return res.status(400).json({
                success: false,
                error: '2FA_INVALID',
                message: 'Invalid verification token',
                code: 'INVALID_TOKEN',
            });
        }

        user.twoFactorEnabled = false;
        user.twoFactorSecret = undefined;
        await user.save();

        logger.info('2FA disabled successfully', { userId: user._id });

        res.json({
            success: true,
            message: 'Two-factor authentication disabled successfully',
        });
    } catch (error) {
        logger.error('2FA disable error:', error);
        res.status(500).json({
            success: false,
            error: '2FA_DISABLE_ERROR',
            message: 'An error occurred while disabling 2FA',
            code: 'INTERNAL_ERROR',
        });
    }
};

const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    phone: user.phone,
                    role: user.role,
                    twoFactorEnabled: user.twoFactorEnabled,
                    createdAt: user.createdAt,
                },
            },
        });
    } catch (error) {
        logger.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            error: 'PROFILE_ERROR',
            message: 'An error occurred while fetching profile',
            code: 'INTERNAL_ERROR',
        });
    }
};

module.exports = {
    register,
    login,
    refreshToken,
    logout,
    setup2FA,
    verify2FASetup,
    disable2FA,
    getProfile,
};
