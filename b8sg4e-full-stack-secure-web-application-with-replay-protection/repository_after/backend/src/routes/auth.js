const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const replayProtection = require('../middleware/replayProtection');

router.post('/register', authLimiter, replayProtection, authController.register);
router.post('/login', authLimiter, replayProtection, authController.login);
router.post('/refresh-token', authLimiter, authController.refreshToken);
router.post('/logout', authenticate, authController.logout);

router.get('/profile', authenticate, authController.getProfile);

router.post('/2fa/setup', authenticate, replayProtection, authController.setup2FA);
router.post('/2fa/verify', authenticate, replayProtection, authController.verify2FASetup);
router.post('/2fa/disable', authenticate, replayProtection, authController.disable2FA);

module.exports = router;
