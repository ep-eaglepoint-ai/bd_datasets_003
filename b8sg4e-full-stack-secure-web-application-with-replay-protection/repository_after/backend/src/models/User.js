const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { encrypt, decrypt } = require('../utils/encryption');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: true,
        select: false,
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'superadmin'],
        default: 'user',
    },
    firstName: {
        type: String,
        required: true,
        set: encrypt,
        get: decrypt,
    },
    lastName: {
        type: String,
        required: true,
        set: encrypt,
        get: decrypt,
    },
    phone: {
        type: String,
        set: encrypt,
        get: decrypt,
    },
    twoFactorEnabled: {
        type: Boolean,
        default: false,
    },
    twoFactorSecret: {
        type: String,
        select: false,
    },
    refreshTokens: [{
        token: String,
        createdAt: {
            type: Date,
            default: Date.now,
        },
        expiresAt: Date,
    }],
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
}, {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
});

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.softDelete = function (deletedBy) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.deletedBy = deletedBy;
    return this.save();
};

userSchema.methods.restore = function () {
    this.isDeleted = false;
    this.deletedAt = null;
    this.deletedBy = null;
    return this.save();
};

userSchema.statics.findActive = function (query = {}) {
    return this.find({ ...query, isDeleted: false });
};

module.exports = mongoose.model('User', userSchema);
