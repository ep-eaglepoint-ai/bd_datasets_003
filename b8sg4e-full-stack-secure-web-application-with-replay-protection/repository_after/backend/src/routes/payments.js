const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate, authorize } = require('../middleware/auth');
const { sensitiveOperationLimiter, strictLimiter } = require('../middleware/rateLimiter');
const replayProtection = require('../middleware/replayProtection');
const verify2FA = require('../middleware/twoFactor');

router.post(
    '/',
    authenticate,
    strictLimiter,
    replayProtection,
    verify2FA,
    paymentController.createPayment
);

router.get(
    '/',
    authenticate,
    paymentController.getPayments
);

router.get(
    '/:paymentId',
    authenticate,
    paymentController.getPaymentById
);

router.post(
    '/:paymentId/refund',
    authenticate,
    strictLimiter,
    replayProtection,
    verify2FA,
    paymentController.refundPayment
);

router.delete(
    '/:paymentId',
    authenticate,
    sensitiveOperationLimiter,
    replayProtection,
    paymentController.deletePayment
);

router.get(
    '/admin/all',
    authenticate,
    authorize('admin', 'superadmin'),
    paymentController.getAllPayments
);

router.post(
    '/admin/:paymentId/restore',
    authenticate,
    authorize('admin', 'superadmin'),
    replayProtection,
    paymentController.restorePayment
);

module.exports = router;
