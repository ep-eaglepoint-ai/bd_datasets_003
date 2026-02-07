const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');
const { sensitiveOperationLimiter, strictLimiter } = require('../middleware/rateLimiter');
const replayProtection = require('../middleware/replayProtection');
const verify2FA = require('../middleware/twoFactor');

router.put(
    '/profile',
    authenticate,
    sensitiveOperationLimiter,
    replayProtection,
    userController.updateProfile
);

router.put(
    '/password',
    authenticate,
    strictLimiter,
    replayProtection,
    verify2FA,
    userController.changePassword
);

router.delete(
    '/account',
    authenticate,
    strictLimiter,
    replayProtection,
    verify2FA,
    userController.deleteAccount
);

router.get(
    '/all',
    authenticate,
    authorize('admin', 'superadmin'),
    userController.getAllUsers
);

router.put(
    '/:userId/role',
    authenticate,
    authorize('superadmin'),
    replayProtection,
    verify2FA,
    userController.updateUserRole
);

router.post(
    '/:userId/restore',
    authenticate,
    authorize('admin', 'superadmin'),
    replayProtection,
    userController.restoreUser
);

module.exports = router;
