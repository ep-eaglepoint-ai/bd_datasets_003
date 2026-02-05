const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
    },
    action: {
        type: String,
        required: true,
        index: true,
    },
    endpoint: {
        type: String,
        required: true,
    },
    method: {
        type: String,
        required: true,
    },
    clientIp: {
        type: String,
    },
    userAgent: {
        type: String,
    },
    requestBody: {
        type: mongoose.Schema.Types.Mixed,
    },
    responseStatus: {
        type: Number,
    },
    isReplayAttempt: {
        type: Boolean,
        default: false,
    },
    replayReason: {
        type: String,
    },
    nonce: {
        type: String,
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true,
    },
    duration: {
        type: Number,
    },
    success: {
        type: Boolean,
    },
}, {
    timestamps: true,
});

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ isReplayAttempt: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
