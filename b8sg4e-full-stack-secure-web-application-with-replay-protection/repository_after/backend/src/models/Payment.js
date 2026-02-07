const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryption');

const paymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    currency: {
        type: String,
        default: 'USD',
    },
    description: {
        type: String,
    },
    cardLastFour: {
        type: String,
        set: encrypt,
        get: decrypt,
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending',
    },
    transactionId: {
        type: String,
        unique: true,
        sparse: true,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: Date,
    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
});

paymentSchema.methods.softDelete = function (deletedBy) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.deletedBy = deletedBy;
    return this.save();
};

paymentSchema.methods.restore = function () {
    this.isDeleted = false;
    this.deletedAt = null;
    this.deletedBy = null;
    return this.save();
};

module.exports = mongoose.model('Payment', paymentSchema);
