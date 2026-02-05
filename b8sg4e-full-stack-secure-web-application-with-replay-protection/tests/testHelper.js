const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const CryptoJS = require('crypto-js');
const { v4: uuidv4 } = require('uuid');

const config = {
    jwt: {
        secret: process.env.JWT_SECRET || 'test-jwt-secret',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'test-refresh-secret',
        expiry: '15m',
        refreshExpiry: '7d',
    },
    hmac: {
        secret: process.env.HMAC_SECRET || 'test-hmac-secret',
    },
    requestValidityWindow: parseInt(process.env.REQUEST_VALIDITY_WINDOW) || 300000,
};

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user' },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    twoFactorEnabled: { type: Boolean, default: false },
    refreshTokens: [{ token: String, expiresAt: Date }],
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

const nonceSchema = new mongoose.Schema({
    nonce: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    endpoint: { type: String, required: true },
    method: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 300 },
});

const Nonce = mongoose.models.Nonce || mongoose.model('Nonce', nonceSchema);

const auditLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    endpoint: { type: String, required: true },
    method: { type: String, required: true },
    isReplayAttempt: { type: Boolean, default: false },
    replayReason: { type: String },
    nonce: { type: String },
    success: { type: Boolean },
    timestamp: { type: Date, default: Date.now },
});

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

const paymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    description: { type: String },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
    transactionId: { type: String, unique: true },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

const generateTokens = (userId, email, role) => {
    const accessToken = jwt.sign({ id: userId, email, role }, config.jwt.secret, { expiresIn: config.jwt.expiry });
    const refreshToken = jwt.sign({ id: userId, tokenId: uuidv4() }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiry });
    return { accessToken, refreshToken };
};

const verifySignature = (payload, signature, secret) => {
    const expectedSignature = CryptoJS.HmacSHA256(JSON.stringify(payload), secret).toString();
    return signature === expectedSignature;
};

const replayProtection = async (req, res, next) => {
    const { 'x-nonce': nonce, 'x-timestamp': timestamp, 'x-signature': signature } = req.headers;
    const userId = req.user?.id || null;

    if (!nonce || !timestamp || !signature) {
        await AuditLog.create({
            userId, action: 'API_REQUEST', endpoint: req.originalUrl, method: req.method,
            isReplayAttempt: true, replayReason: 'MISSING_HEADERS', nonce, success: false,
        });
        return res.status(400).json({
            success: false, error: 'REPLAY_PROTECTION_ERROR',
            message: 'Missing required security headers', code: 'MISSING_SECURITY_HEADERS',
        });
    }

    const requestTimestamp = parseInt(timestamp, 10);
    const timeDifference = Math.abs(Date.now() - requestTimestamp);

    if (isNaN(requestTimestamp) || timeDifference > config.requestValidityWindow) {
        await AuditLog.create({
            userId, action: 'API_REQUEST', endpoint: req.originalUrl, method: req.method,
            isReplayAttempt: true, replayReason: 'EXPIRED_TIMESTAMP', nonce, success: false,
        });
        return res.status(401).json({
            success: false, error: 'REQUEST_EXPIRED',
            message: 'Request has expired', code: 'INVALID_TIMESTAMP',
        });
    }

    const payloadToVerify = {
        nonce, timestamp: requestTimestamp, method: req.method,
        path: req.originalUrl.split('?')[0], body: req.body || {},
    };

    if (!verifySignature(payloadToVerify, signature, config.hmac.secret)) {
        await AuditLog.create({
            userId, action: 'API_REQUEST', endpoint: req.originalUrl, method: req.method,
            isReplayAttempt: true, replayReason: 'INVALID_SIGNATURE', nonce, success: false,
        });
        return res.status(401).json({
            success: false, error: 'INVALID_SIGNATURE',
            message: 'Request signature verification failed', code: 'SIGNATURE_MISMATCH',
        });
    }

    try {
        const existingNonce = await Nonce.findOne({ nonce });
        if (existingNonce) {
            await AuditLog.create({
                userId, action: 'API_REQUEST', endpoint: req.originalUrl, method: req.method,
                isReplayAttempt: true, replayReason: 'NONCE_REUSE', nonce, success: false,
            });
            return res.status(409).json({
                success: false, error: 'REPLAY_DETECTED',
                message: 'This request has already been processed', code: 'NONCE_ALREADY_USED',
            });
        }

        await Nonce.create({ nonce, userId, endpoint: req.originalUrl, method: req.method });

        res.on('finish', async () => {
            await AuditLog.create({
                userId, action: 'API_REQUEST', endpoint: req.originalUrl, method: req.method,
                isReplayAttempt: false, nonce, success: res.statusCode < 400,
            });
        });

        next();
    } catch (error) {
        if (error.code === 11000) {
            await AuditLog.create({
                userId, action: 'API_REQUEST', endpoint: req.originalUrl, method: req.method,
                isReplayAttempt: true, replayReason: 'CONCURRENT_NONCE_COLLISION', nonce, success: false,
            });
            return res.status(409).json({
                success: false, error: 'REPLAY_DETECTED',
                message: 'This request has already been processed', code: 'CONCURRENT_REQUEST_DETECTED',
            });
        }
        return res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
};

const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'AUTHENTICATION_REQUIRED', code: 'MISSING_TOKEN' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, config.jwt.secret);
        const user = await User.findById(decoded.id);
        if (!user || user.isDeleted) {
            return res.status(401).json({ success: false, error: 'USER_NOT_FOUND', code: 'INVALID_USER' });
        }
        req.user = { id: user._id, email: user.email, role: user.role };
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'TOKEN_EXPIRED', code: 'EXPIRED_TOKEN' });
        }
        return res.status(401).json({ success: false, error: 'INVALID_TOKEN', code: 'MALFORMED_TOKEN' });
    }
};

const authorize = (...roles) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'AUTHENTICATION_REQUIRED' });
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN', code: 'INSUFFICIENT_PERMISSIONS' });
    }
    next();
};

const createApp = () => {
    const app = express();
    app.use(express.json());

    app.get('/api/health', (req, res) => {
        res.json({ success: true, status: 'healthy' });
    });

    app.post('/api/auth/register', replayProtection, async (req, res) => {
        try {
            const { email, password, firstName, lastName } = req.body;
            if (!email || !password || !firstName || !lastName) {
                return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', code: 'MISSING_FIELDS' });
            }
            const existingUser = await User.findOne({ email: email.toLowerCase() });
            if (existingUser) {
                return res.status(409).json({ success: false, error: 'USER_EXISTS', code: 'DUPLICATE_EMAIL' });
            }
            const user = await User.create({ email, password, firstName, lastName });
            const { accessToken, refreshToken } = generateTokens(user._id, user.email, user.role);
            user.refreshTokens.push({ token: refreshToken, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
            await user.save();
            res.status(201).json({
                success: true, data: {
                    user: { id: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
                    accessToken, refreshToken,
                },
            });
        } catch (error) {
            res.status(500).json({ success: false, error: 'REGISTRATION_ERROR' });
        }
    });

    app.post('/api/auth/login', replayProtection, async (req, res) => {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', code: 'MISSING_CREDENTIALS' });
            }
            const user = await User.findOne({ email: email.toLowerCase(), isDeleted: false }).select('+password');
            if (!user || !(await user.comparePassword(password))) {
                return res.status(401).json({ success: false, error: 'INVALID_CREDENTIALS', code: 'AUTH_FAILED' });
            }
            const { accessToken, refreshToken } = generateTokens(user._id, user.email, user.role);
            user.refreshTokens = user.refreshTokens.filter(t => t.expiresAt > new Date());
            user.refreshTokens.push({ token: refreshToken, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
            await user.save();
            res.json({
                success: true, data: {
                    user: { id: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
                    accessToken, refreshToken,
                },
            });
        } catch (error) {
            res.status(500).json({ success: false, error: 'LOGIN_ERROR' });
        }
    });

    app.post('/api/auth/refresh-token', async (req, res) => {
        try {
            const { refreshToken: token } = req.body;
            if (!token) {
                return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', code: 'MISSING_REFRESH_TOKEN' });
            }
            let decoded;
            try {
                decoded = jwt.verify(token, config.jwt.refreshSecret);
            } catch {
                return res.status(401).json({ success: false, error: 'INVALID_TOKEN', code: 'REFRESH_TOKEN_INVALID' });
            }
            const user = await User.findById(decoded.id);
            if (!user || user.isDeleted) {
                return res.status(401).json({ success: false, error: 'USER_NOT_FOUND', code: 'INVALID_USER' });
            }
            const tokenIndex = user.refreshTokens.findIndex(t => t.token === token);
            if (tokenIndex === -1) {
                user.refreshTokens = [];
                await user.save();
                return res.status(401).json({ success: false, error: 'TOKEN_REUSE', code: 'TOKEN_REVOKED' });
            }
            user.refreshTokens.splice(tokenIndex, 1);
            const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id, user.email, user.role);
            user.refreshTokens.push({ token: newRefreshToken, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
            await user.save();
            res.json({ success: true, data: { accessToken, refreshToken: newRefreshToken } });
        } catch (error) {
            res.status(500).json({ success: false, error: 'REFRESH_ERROR' });
        }
    });

    app.get('/api/auth/profile', authenticate, async (req, res) => {
        const user = await User.findById(req.user.id);
        res.json({ success: true, data: { user: { id: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role } } });
    });

    app.put('/api/users/profile', authenticate, replayProtection, async (req, res) => {
        try {
            const { firstName, lastName, phone } = req.body;
            const user = await User.findById(req.user.id);
            if (firstName) user.firstName = firstName;
            if (lastName) user.lastName = lastName;
            if (phone !== undefined) user.phone = phone;
            await user.save();
            res.json({ success: true, message: 'Profile updated' });
        } catch (error) {
            res.status(500).json({ success: false, error: 'UPDATE_ERROR' });
        }
    });

    app.delete('/api/users/account', authenticate, replayProtection, async (req, res) => {
        try {
            const { password } = req.body;
            if (!password) {
                return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', code: 'MISSING_PASSWORD' });
            }
            const user = await User.findById(req.user.id).select('+password');
            if (!(await user.comparePassword(password))) {
                return res.status(401).json({ success: false, error: 'INVALID_PASSWORD', code: 'WRONG_PASSWORD' });
            }
            user.isDeleted = true;
            user.deletedAt = new Date();
            await user.save();
            res.json({ success: true, message: 'Account deleted' });
        } catch (error) {
            res.status(500).json({ success: false, error: 'DELETE_ERROR' });
        }
    });

    app.get('/api/users/all', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
        const users = await User.find({}).select('-refreshTokens');
        res.json({ success: true, data: { users } });
    });

    app.put('/api/users/:userId/role', authenticate, authorize('superadmin'), replayProtection, async (req, res) => {
        try {
            const { userId } = req.params;
            const { role } = req.body;
            if (!['user', 'admin', 'superadmin'].includes(role)) {
                return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', code: 'INVALID_ROLE' });
            }
            if (userId === req.user.id.toString()) {
                return res.status(400).json({ success: false, error: 'SELF_MODIFICATION', code: 'CANNOT_MODIFY_SELF' });
            }
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', code: 'NOT_FOUND' });
            }
            user.role = role;
            await user.save();
            res.json({ success: true, message: 'Role updated' });
        } catch (error) {
            res.status(500).json({ success: false, error: 'UPDATE_ERROR' });
        }
    });

    app.post('/api/users/:userId/restore', authenticate, authorize('admin', 'superadmin'), replayProtection, async (req, res) => {
        try {
            const { userId } = req.params;
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
            }
            user.isDeleted = false;
            user.deletedAt = null;
            await user.save();
            res.json({ success: true, message: 'User restored' });
        } catch (error) {
            res.status(500).json({ success: false, error: 'RESTORE_ERROR' });
        }
    });

    app.post('/api/payments', authenticate, replayProtection, async (req, res) => {
        try {
            const { amount, currency, description } = req.body;
            if (!amount || amount <= 0) {
                return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', code: 'INVALID_AMOUNT' });
            }
            const payment = await Payment.create({
                userId: req.user.id, amount, currency: currency || 'USD',
                description, transactionId: `TXN-${uuidv4()}`, status: 'pending',
            });
            res.status(201).json({ success: true, data: { payment } });
        } catch (error) {
            res.status(500).json({ success: false, error: 'PAYMENT_ERROR' });
        }
    });

    app.get('/api/payments', authenticate, async (req, res) => {
        const payments = await Payment.find({ userId: req.user.id, isDeleted: false }).sort({ createdAt: -1 });
        res.json({ success: true, data: { payments, pagination: { page: 1, limit: 10, total: payments.length, pages: 1 } } });
    });

    app.delete('/api/payments/:paymentId', authenticate, replayProtection, async (req, res) => {
        try {
            const { paymentId } = req.params;
            const payment = await Payment.findOne({ _id: paymentId, userId: req.user.id, isDeleted: false });
            if (!payment) {
                return res.status(404).json({ success: false, error: 'NOT_FOUND', code: 'PAYMENT_NOT_FOUND' });
            }
            payment.isDeleted = true;
            await payment.save();
            res.json({ success: true, message: 'Payment deleted' });
        } catch (error) {
            res.status(500).json({ success: false, error: 'DELETE_ERROR' });
        }
    });

    return app;
};

module.exports = { createApp, User, Nonce, AuditLog, Payment, config, generateTokens };
