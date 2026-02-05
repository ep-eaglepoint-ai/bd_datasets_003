const mongoose = require('mongoose');
const config = require('../config');

const nonceSchema = new mongoose.Schema({
    nonce: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
    },
    clientIp: {
        type: String,
    },
    endpoint: {
        type: String,
        required: true,
    },
    method: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: Math.floor(config.requestValidityWindow / 1000),
    },
});

nonceSchema.index({ nonce: 1 }, { unique: true });
nonceSchema.index({ createdAt: 1 }, { expireAfterSeconds: Math.floor(config.requestValidityWindow / 1000) });

module.exports = mongoose.model('Nonce', nonceSchema);
