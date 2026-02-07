const { v4: uuidv4 } = require('uuid');
const Payment = require('../models/Payment');
const logger = require('../utils/logger');

const createPayment = async (req, res) => {
    try {
        const { amount, currency, description, cardLastFour } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Valid amount is required',
                code: 'INVALID_AMOUNT',
            });
        }

        const transactionId = `TXN-${uuidv4()}`;

        const payment = await Payment.create({
            userId: req.user.id,
            amount,
            currency: currency || 'USD',
            description,
            cardLastFour,
            transactionId,
            status: 'pending',
        });

        setTimeout(async () => {
            try {
                payment.status = 'completed';
                await payment.save();
                logger.info('Payment completed', { paymentId: payment._id, transactionId });
            } catch (error) {
                logger.error('Payment completion error:', error);
            }
        }, 2000);

        logger.info('Payment created', {
            paymentId: payment._id,
            transactionId,
            userId: req.user.id,
            amount
        });

        res.status(201).json({
            success: true,
            message: 'Payment initiated successfully',
            data: {
                payment: {
                    id: payment._id,
                    transactionId: payment.transactionId,
                    amount: payment.amount,
                    currency: payment.currency,
                    status: payment.status,
                    createdAt: payment.createdAt,
                },
            },
        });
    } catch (error) {
        logger.error('Payment creation error:', error);
        res.status(500).json({
            success: false,
            error: 'PAYMENT_ERROR',
            message: 'An error occurred while processing payment',
            code: 'INTERNAL_ERROR',
        });
    }
};

const getPayments = async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const query = { userId: req.user.id, isDeleted: false };

        if (status) {
            query.status = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [payments, total] = await Promise.all([
            Payment.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Payment.countDocuments(query),
        ]);

        res.json({
            success: true,
            data: {
                payments: payments.map(p => ({
                    id: p._id,
                    transactionId: p.transactionId,
                    amount: p.amount,
                    currency: p.currency,
                    description: p.description,
                    status: p.status,
                    createdAt: p.createdAt,
                })),
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                },
            },
        });
    } catch (error) {
        logger.error('Get payments error:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_ERROR',
            message: 'An error occurred while fetching payments',
            code: 'INTERNAL_ERROR',
        });
    }
};

const getPaymentById = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const payment = await Payment.findOne({
            _id: paymentId,
            userId: req.user.id,
            isDeleted: false,
        });

        if (!payment) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Payment not found',
                code: 'PAYMENT_NOT_FOUND',
            });
        }

        res.json({
            success: true,
            data: {
                payment: {
                    id: payment._id,
                    transactionId: payment.transactionId,
                    amount: payment.amount,
                    currency: payment.currency,
                    description: payment.description,
                    cardLastFour: payment.cardLastFour,
                    status: payment.status,
                    createdAt: payment.createdAt,
                    updatedAt: payment.updatedAt,
                },
            },
        });
    } catch (error) {
        logger.error('Get payment error:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_ERROR',
            message: 'An error occurred while fetching payment',
            code: 'INTERNAL_ERROR',
        });
    }
};

const refundPayment = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const payment = await Payment.findOne({
            _id: paymentId,
            userId: req.user.id,
            isDeleted: false,
        });

        if (!payment) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Payment not found',
                code: 'PAYMENT_NOT_FOUND',
            });
        }

        if (payment.status !== 'completed') {
            return res.status(400).json({
                success: false,
                error: 'INVALID_STATUS',
                message: 'Only completed payments can be refunded',
                code: 'CANNOT_REFUND',
            });
        }

        payment.status = 'refunded';
        await payment.save();

        logger.info('Payment refunded', {
            paymentId: payment._id,
            transactionId: payment.transactionId,
            userId: req.user.id
        });

        res.json({
            success: true,
            message: 'Payment refunded successfully',
            data: {
                payment: {
                    id: payment._id,
                    transactionId: payment.transactionId,
                    status: payment.status,
                },
            },
        });
    } catch (error) {
        logger.error('Refund error:', error);
        res.status(500).json({
            success: false,
            error: 'REFUND_ERROR',
            message: 'An error occurred while processing refund',
            code: 'INTERNAL_ERROR',
        });
    }
};

const deletePayment = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const payment = await Payment.findOne({
            _id: paymentId,
            userId: req.user.id,
            isDeleted: false,
        });

        if (!payment) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Payment not found',
                code: 'PAYMENT_NOT_FOUND',
            });
        }

        await payment.softDelete(req.user.id);

        logger.info('Payment deleted (soft)', {
            paymentId: payment._id,
            userId: req.user.id
        });

        res.json({
            success: true,
            message: 'Payment record deleted successfully',
        });
    } catch (error) {
        logger.error('Payment deletion error:', error);
        res.status(500).json({
            success: false,
            error: 'DELETE_ERROR',
            message: 'An error occurred while deleting payment',
            code: 'INTERNAL_ERROR',
        });
    }
};

const getAllPayments = async (req, res) => {
    try {
        const { status, userId, page = 1, limit = 20, includeDeleted } = req.query;
        const query = {};

        if (status) query.status = status;
        if (userId) query.userId = userId;
        if (includeDeleted !== 'true') query.isDeleted = false;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [payments, total] = await Promise.all([
            Payment.find(query)
                .populate('userId', 'email firstName lastName')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Payment.countDocuments(query),
        ]);

        res.json({
            success: true,
            data: {
                payments: payments.map(p => ({
                    id: p._id,
                    transactionId: p.transactionId,
                    amount: p.amount,
                    currency: p.currency,
                    description: p.description,
                    status: p.status,
                    isDeleted: p.isDeleted,
                    user: p.userId ? {
                        id: p.userId._id,
                        email: p.userId.email,
                        name: `${p.userId.firstName} ${p.userId.lastName}`,
                    } : null,
                    createdAt: p.createdAt,
                })),
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                },
            },
        });
    } catch (error) {
        logger.error('Get all payments error:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_ERROR',
            message: 'An error occurred while fetching payments',
            code: 'INTERNAL_ERROR',
        });
    }
};

const restorePayment = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const payment = await Payment.findById(paymentId);

        if (!payment) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Payment not found',
                code: 'PAYMENT_NOT_FOUND',
            });
        }

        if (!payment.isDeleted) {
            return res.status(400).json({
                success: false,
                error: 'NOT_DELETED',
                message: 'Payment is not deleted',
                code: 'ALREADY_ACTIVE',
            });
        }

        await payment.restore();

        logger.info('Payment restored', {
            paymentId: payment._id,
            restoredBy: req.user.id
        });

        res.json({
            success: true,
            message: 'Payment restored successfully',
            data: {
                payment: {
                    id: payment._id,
                    transactionId: payment.transactionId,
                    isDeleted: payment.isDeleted,
                },
            },
        });
    } catch (error) {
        logger.error('Payment restore error:', error);
        res.status(500).json({
            success: false,
            error: 'RESTORE_ERROR',
            message: 'An error occurred while restoring payment',
            code: 'INTERNAL_ERROR',
        });
    }
};

module.exports = {
    createPayment,
    getPayments,
    getPaymentById,
    refundPayment,
    deletePayment,
    getAllPayments,
    restorePayment,
};
