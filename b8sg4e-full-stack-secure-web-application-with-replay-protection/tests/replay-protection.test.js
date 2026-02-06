const request = require('supertest');
const mongoose = require('mongoose');
const CryptoJS = require('crypto-js');
const { v4: uuidv4 } = require('uuid');
const { createApp, User, Nonce, AuditLog, Payment, config, generateTokens } = require('./testHelper');

let MongoMemoryServer;
let mongoServer;
let app;
let useRealMongo = false;

const createSecurityHeaders = (method, path, body = {}) => {
    const nonce = uuidv4();
    const timestamp = Date.now();
    const expiry = timestamp + config.requestValidityWindow;
    const payload = { nonce, timestamp, expiry, method, path, body };
    const signature = CryptoJS.HmacSHA256(JSON.stringify(payload), config.hmac.secret).toString();
    return { 'x-nonce': nonce, 'x-timestamp': timestamp.toString(), 'x-expiry': expiry.toString(), 'x-signature': signature };
};

const createExpiredHeaders = (method, path, body = {}) => {
    const nonce = uuidv4();
    const timestamp = Date.now() - 600000;
    const expiry = timestamp + config.requestValidityWindow;
    const payload = { nonce, timestamp, expiry, method, path, body };
    const signature = CryptoJS.HmacSHA256(JSON.stringify(payload), config.hmac.secret).toString();
    return { 'x-nonce': nonce, 'x-timestamp': timestamp.toString(), 'x-expiry': expiry.toString(), 'x-signature': signature };
};

const createInvalidSignatureHeaders = (method, path, body = {}) => {
    const nonce = uuidv4();
    const timestamp = Date.now();
    const expiry = timestamp + config.requestValidityWindow;
    return { 'x-nonce': nonce, 'x-timestamp': timestamp.toString(), 'x-expiry': expiry.toString(), 'x-signature': 'invalid-signature' };
};

beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI;
    if (mongoUri) {
        useRealMongo = true;
        await mongoose.connect(mongoUri);
    } else {
        MongoMemoryServer = require('mongodb-memory-server').MongoMemoryServer;
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
    }
    app = createApp();
});

afterAll(async () => {
    await mongoose.disconnect();
    if (!useRealMongo && mongoServer) {
        await mongoServer.stop();
    }
});

beforeEach(async () => {
    await User.deleteMany({});
    await Nonce.deleteMany({});
    await AuditLog.deleteMany({});
    await Payment.deleteMany({});
});

describe('Nonce Generation and Replay Protection', () => {
    test('should generate cryptographically secure UUID nonces', () => {
        const nonce1 = uuidv4();
        const nonce2 = uuidv4();
        expect(nonce1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        expect(nonce2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        expect(nonce1).not.toBe(nonce2);
    });

    test('should include timestamp and expiry in security headers', () => {
        const headers = createSecurityHeaders('POST', '/api/auth/register', {});
        expect(headers['x-timestamp']).toBeDefined();
        expect(headers['x-expiry']).toBeDefined();
        const timestamp = parseInt(headers['x-timestamp']);
        const expiry = parseInt(headers['x-expiry']);
        expect(timestamp).toBeLessThanOrEqual(Date.now());
        expect(timestamp).toBeGreaterThan(Date.now() - 5000);
        expect(expiry).toBe(timestamp + config.requestValidityWindow);
        expect(expiry).toBeGreaterThan(Date.now());
    });

    test('should reject requests with missing security headers', async () => {
        const response = await request(app)
            .post('/api/auth/register')
            .send({ email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('MISSING_SECURITY_HEADERS');
    });

    test('should reject requests with expired timestamp', async () => {
        const userData = { email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const headers = createExpiredHeaders('POST', '/api/auth/register', userData);

        const response = await request(app)
            .post('/api/auth/register')
            .set(headers)
            .send(userData);

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('INVALID_TIMESTAMP');
    });

    test('should reject requests with reused nonce', async () => {
        const userData = { email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const headers = createSecurityHeaders('POST', '/api/auth/register', userData);

        const response1 = await request(app)
            .post('/api/auth/register')
            .set(headers)
            .send(userData);

        expect(response1.status).toBe(201);

        const userData2 = { email: 'test2@example.com', password: 'Password123', firstName: 'Test2', lastName: 'User2' };
        const headers2 = { ...headers };
        const newTimestamp = Date.now();
        const newExpiry = newTimestamp + config.requestValidityWindow;
        headers2['x-timestamp'] = newTimestamp.toString();
        headers2['x-expiry'] = newExpiry.toString();
        const payload = { nonce: headers['x-nonce'], timestamp: newTimestamp, expiry: newExpiry, method: 'POST', path: '/api/auth/register', body: userData2 };
        headers2['x-signature'] = CryptoJS.HmacSHA256(JSON.stringify(payload), config.hmac.secret).toString();

        const response2 = await request(app)
            .post('/api/auth/register')
            .set(headers2)
            .send(userData2);

        expect(response2.status).toBe(409);
        expect(response2.body.code).toBe('NONCE_ALREADY_USED');
    });

    test('should store used nonces in database', async () => {
        const userData = { email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const headers = createSecurityHeaders('POST', '/api/auth/register', userData);

        await request(app)
            .post('/api/auth/register')
            .set(headers)
            .send(userData);

        const storedNonce = await Nonce.findOne({ nonce: headers['x-nonce'] });
        expect(storedNonce).toBeTruthy();
        expect(storedNonce.endpoint).toBe('/api/auth/register');
        expect(storedNonce.method).toBe('POST');
    });
});

describe('HMAC-SHA256 Signature Verification', () => {
    test('should sign requests using HMAC-SHA256', () => {
        const timestamp = Date.now();
        const expiry = timestamp + config.requestValidityWindow;
        const payload = { nonce: 'test-nonce', timestamp, expiry, method: 'POST', path: '/api/test', body: {} };
        const signature = CryptoJS.HmacSHA256(JSON.stringify(payload), config.hmac.secret).toString();
        expect(signature).toHaveLength(64);
        expect(signature).toMatch(/^[a-f0-9]+$/);
    });

    test('should reject requests with invalid signature', async () => {
        const userData = { email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const headers = createInvalidSignatureHeaders('POST', '/api/auth/register', userData);

        const response = await request(app)
            .post('/api/auth/register')
            .set(headers)
            .send(userData);

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('SIGNATURE_MISMATCH');
    });

    test('should accept requests with valid signature', async () => {
        const userData = { email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const headers = createSecurityHeaders('POST', '/api/auth/register', userData);

        const response = await request(app)
            .post('/api/auth/register')
            .set(headers)
            .send(userData);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
    });
});

describe('JWT Authentication', () => {
    test('should return JWT tokens on successful login', async () => {
        const userData = { email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const registerHeaders = createSecurityHeaders('POST', '/api/auth/register', userData);
        await request(app).post('/api/auth/register').set(registerHeaders).send(userData);

        const loginData = { email: 'test@example.com', password: 'Password123' };
        const loginHeaders = createSecurityHeaders('POST', '/api/auth/login', loginData);
        const response = await request(app).post('/api/auth/login').set(loginHeaders).send(loginData);

        expect(response.status).toBe(200);
        expect(response.body.data.accessToken).toBeDefined();
        expect(response.body.data.refreshToken).toBeDefined();
    });

    test('should refresh access token using refresh token', async () => {
        const userData = { email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const registerHeaders = createSecurityHeaders('POST', '/api/auth/register', userData);
        const registerResponse = await request(app).post('/api/auth/register').set(registerHeaders).send(userData);

        const refreshToken = registerResponse.body.data.refreshToken;
        const refreshResponse = await request(app)
            .post('/api/auth/refresh-token')
            .send({ refreshToken });

        expect(refreshResponse.status).toBe(200);
        expect(refreshResponse.body.data.accessToken).toBeDefined();
        expect(refreshResponse.body.data.refreshToken).toBeDefined();
        expect(refreshResponse.body.data.refreshToken).not.toBe(refreshToken);
    });

    test('should reject expired or invalid tokens', async () => {
        const response = await request(app)
            .get('/api/auth/profile')
            .set('Authorization', 'Bearer invalid-token');

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('MALFORMED_TOKEN');
    });

    test('should revoke all refresh tokens on suspicious reuse', async () => {
        const userData = { email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const registerHeaders = createSecurityHeaders('POST', '/api/auth/register', userData);
        const registerResponse = await request(app).post('/api/auth/register').set(registerHeaders).send(userData);

        const refreshToken = registerResponse.body.data.refreshToken;

        await request(app).post('/api/auth/refresh-token').send({ refreshToken });

        const reuseResponse = await request(app).post('/api/auth/refresh-token').send({ refreshToken });

        expect(reuseResponse.status).toBe(401);
        expect(reuseResponse.body.code).toBe('TOKEN_REVOKED');
    });
});

describe('Role-Based Access Control', () => {
    test('should restrict admin routes to authorized roles', async () => {
        const userData = { email: 'user@example.com', password: 'Password123', firstName: 'Regular', lastName: 'User' };
        const registerHeaders = createSecurityHeaders('POST', '/api/auth/register', userData);
        const registerResponse = await request(app).post('/api/auth/register').set(registerHeaders).send(userData);
        const accessToken = registerResponse.body.data.accessToken;

        const response = await request(app)
            .get('/api/users/all')
            .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(403);
        expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    test('should allow admin access to admin routes', async () => {
        const adminUser = await User.create({
            email: 'admin@example.com', password: 'Password123',
            firstName: 'Admin', lastName: 'User', role: 'admin'
        });
        const { accessToken } = generateTokens(adminUser._id, adminUser.email, adminUser.role);

        const response = await request(app)
            .get('/api/users/all')
            .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });

    test('should only allow superadmin to change user roles', async () => {
        const adminUser = await User.create({
            email: 'admin@example.com', password: 'Password123',
            firstName: 'Admin', lastName: 'User', role: 'admin'
        });
        const regularUser = await User.create({
            email: 'user@example.com', password: 'Password123',
            firstName: 'Regular', lastName: 'User', role: 'user'
        });
        const { accessToken } = generateTokens(adminUser._id, adminUser.email, adminUser.role);

        const headers = createSecurityHeaders('PUT', `/api/users/${regularUser._id}/role`, { role: 'admin' });
        const response = await request(app)
            .put(`/api/users/${regularUser._id}/role`)
            .set('Authorization', `Bearer ${accessToken}`)
            .set(headers)
            .send({ role: 'admin' });

        expect(response.status).toBe(403);
    });

    test('superadmin should be able to change user roles', async () => {
        const superAdmin = await User.create({
            email: 'superadmin@example.com', password: 'Password123',
            firstName: 'Super', lastName: 'Admin', role: 'superadmin'
        });
        const regularUser = await User.create({
            email: 'user@example.com', password: 'Password123',
            firstName: 'Regular', lastName: 'User', role: 'user'
        });
        const { accessToken } = generateTokens(superAdmin._id, superAdmin.email, superAdmin.role);

        const headers = createSecurityHeaders('PUT', `/api/users/${regularUser._id}/role`, { role: 'admin' });
        const response = await request(app)
            .put(`/api/users/${regularUser._id}/role`)
            .set('Authorization', `Bearer ${accessToken}`)
            .set(headers)
            .send({ role: 'admin' });

        expect(response.status).toBe(200);

        const updatedUser = await User.findById(regularUser._id);
        expect(updatedUser.role).toBe('admin');
    });
});

describe('HTTP Status Codes and Error Handling', () => {
    test('should return 400 for validation errors', async () => {
        const headers = createSecurityHeaders('POST', '/api/auth/register', {});
        const response = await request(app)
            .post('/api/auth/register')
            .set(headers)
            .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    test('should return 401 for authentication errors', async () => {
        const response = await request(app).get('/api/auth/profile');
        expect(response.status).toBe(401);
    });

    test('should return 403 for authorization errors', async () => {
        const userData = { email: 'user@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const registerHeaders = createSecurityHeaders('POST', '/api/auth/register', userData);
        const registerResponse = await request(app).post('/api/auth/register').set(registerHeaders).send(userData);
        const accessToken = registerResponse.body.data.accessToken;

        const response = await request(app)
            .get('/api/users/all')
            .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(403);
    });

    test('should return 409 for replay attack detection', async () => {
        const userData = { email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const headers = createSecurityHeaders('POST', '/api/auth/register', userData);

        await request(app).post('/api/auth/register').set(headers).send(userData);

        const userData2 = { email: 'test2@example.com', password: 'Password123', firstName: 'Test2', lastName: 'User2' };
        const timestamp = Date.now();
        const expiry = timestamp + config.requestValidityWindow;
        const payload = {
            nonce: headers['x-nonce'],
            timestamp,
            expiry,
            method: 'POST',
            path: '/api/auth/register',
            body: userData2
        };
        const newSignature = CryptoJS.HmacSHA256(JSON.stringify(payload), config.hmac.secret).toString();

        const response = await request(app)
            .post('/api/auth/register')
            .set({
                'x-nonce': headers['x-nonce'],
                'x-timestamp': timestamp.toString(),
                'x-expiry': expiry.toString(),
                'x-signature': newSignature
            })
            .send(userData2);

        expect(response.status).toBe(409);
        expect(response.body.error).toBe('REPLAY_DETECTED');
    });
});

describe('API Request Logging', () => {
    test('should log successful API requests', async () => {
        const userData = { email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const headers = createSecurityHeaders('POST', '/api/auth/register', userData);

        await request(app).post('/api/auth/register').set(headers).send(userData);

        await new Promise(resolve => setTimeout(resolve, 100));

        const logs = await AuditLog.find({ endpoint: '/api/auth/register' });
        expect(logs.length).toBeGreaterThan(0);
    });

    test('should log replay attack attempts', async () => {
        const userData = { email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const headers = createSecurityHeaders('POST', '/api/auth/register', userData);

        await request(app).post('/api/auth/register').set(headers).send(userData);

        const timestamp = Date.now();
        const expiry = timestamp + config.requestValidityWindow;
        const payload = {
            nonce: headers['x-nonce'],
            timestamp,
            expiry,
            method: 'POST',
            path: '/api/auth/register',
            body: { email: 'test2@example.com', password: 'Password123', firstName: 'Test2', lastName: 'User2' }
        };
        const newSignature = CryptoJS.HmacSHA256(JSON.stringify(payload), config.hmac.secret).toString();

        await request(app)
            .post('/api/auth/register')
            .set({
                'x-nonce': headers['x-nonce'],
                'x-timestamp': timestamp.toString(),
                'x-expiry': expiry.toString(),
                'x-signature': newSignature
            })
            .send(payload.body);

        const replayLogs = await AuditLog.find({ isReplayAttempt: true });
        expect(replayLogs.length).toBeGreaterThan(0);
        expect(replayLogs[0].replayReason).toBe('NONCE_REUSE');
    });
});

describe('Sensitive Operations Protection', () => {
    test('should require replay protection for payments', async () => {
        const userData = { email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const registerHeaders = createSecurityHeaders('POST', '/api/auth/register', userData);
        const registerResponse = await request(app).post('/api/auth/register').set(registerHeaders).send(userData);
        const accessToken = registerResponse.body.data.accessToken;

        const response = await request(app)
            .post('/api/payments')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ amount: 100 });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('MISSING_SECURITY_HEADERS');
    });

    test('should create payment with valid replay protection', async () => {
        const userData = { email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const registerHeaders = createSecurityHeaders('POST', '/api/auth/register', userData);
        const registerResponse = await request(app).post('/api/auth/register').set(registerHeaders).send(userData);
        const accessToken = registerResponse.body.data.accessToken;

        const paymentData = { amount: 100, currency: 'USD', description: 'Test payment' };
        const paymentHeaders = createSecurityHeaders('POST', '/api/payments', paymentData);

        const response = await request(app)
            .post('/api/payments')
            .set('Authorization', `Bearer ${accessToken}`)
            .set(paymentHeaders)
            .send(paymentData);

        expect(response.status).toBe(201);
        expect(response.body.data.payment.transactionId).toBeDefined();
    });

    test('should require replay protection for profile updates', async () => {
        const userData = { email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const registerHeaders = createSecurityHeaders('POST', '/api/auth/register', userData);
        const registerResponse = await request(app).post('/api/auth/register').set(registerHeaders).send(userData);
        const accessToken = registerResponse.body.data.accessToken;

        const response = await request(app)
            .put('/api/users/profile')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ firstName: 'Updated' });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('MISSING_SECURITY_HEADERS');
    });

    test('should require replay protection for account deletion', async () => {
        const userData = { email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const registerHeaders = createSecurityHeaders('POST', '/api/auth/register', userData);
        const registerResponse = await request(app).post('/api/auth/register').set(registerHeaders).send(userData);
        const accessToken = registerResponse.body.data.accessToken;

        const response = await request(app)
            .delete('/api/users/account')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ password: 'Password123' });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('MISSING_SECURITY_HEADERS');
    });
});

describe('Soft Delete and Recovery', () => {
    test('should soft delete user account', async () => {
        const userData = { email: 'test@example.com', password: 'Password123', firstName: 'Test', lastName: 'User' };
        const registerHeaders = createSecurityHeaders('POST', '/api/auth/register', userData);
        const registerResponse = await request(app).post('/api/auth/register').set(registerHeaders).send(userData);
        const accessToken = registerResponse.body.data.accessToken;
        const userId = registerResponse.body.data.user.id;

        const deleteData = { password: 'Password123' };
        const deleteHeaders = createSecurityHeaders('DELETE', '/api/users/account', deleteData);

        await request(app)
            .delete('/api/users/account')
            .set('Authorization', `Bearer ${accessToken}`)
            .set(deleteHeaders)
            .send(deleteData);

        const user = await User.findById(userId);
        expect(user.isDeleted).toBe(true);
    });

    test('should allow admin to restore deleted user', async () => {
        const adminUser = await User.create({
            email: 'admin@example.com', password: 'Password123',
            firstName: 'Admin', lastName: 'User', role: 'admin'
        });
        const deletedUser = await User.create({
            email: 'deleted@example.com', password: 'Password123',
            firstName: 'Deleted', lastName: 'User', isDeleted: true
        });
        const { accessToken } = generateTokens(adminUser._id, adminUser.email, adminUser.role);

        const restoreHeaders = createSecurityHeaders('POST', `/api/users/${deletedUser._id}/restore`, {});

        const response = await request(app)
            .post(`/api/users/${deletedUser._id}/restore`)
            .set('Authorization', `Bearer ${accessToken}`)
            .set(restoreHeaders)
            .send({});

        expect(response.status).toBe(200);

        const restoredUser = await User.findById(deletedUser._id);
        expect(restoredUser.isDeleted).toBe(false);
    });
});
