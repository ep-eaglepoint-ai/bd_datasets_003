const User = require('../models/User');
const logger = require('../utils/logger');

const updateProfile = async (req, res) => {
    try {
        const { firstName, lastName, phone } = req.body;
        const user = await User.findById(req.user.id);

        if (firstName) user.firstName = firstName;
        if (lastName) user.lastName = lastName;
        if (phone !== undefined) user.phone = phone;

        await user.save();

        logger.info('Profile updated', { userId: user._id });

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    phone: user.phone,
                    role: user.role,
                },
            },
        });
    } catch (error) {
        logger.error('Profile update error:', error);
        res.status(500).json({
            success: false,
            error: 'UPDATE_ERROR',
            message: 'An error occurred while updating profile',
            code: 'INTERNAL_ERROR',
        });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Current password and new password are required',
                code: 'MISSING_FIELDS',
            });
        }

        const user = await User.findById(req.user.id).select('+password');

        if (!(await user.comparePassword(currentPassword))) {
            return res.status(401).json({
                success: false,
                error: 'INVALID_PASSWORD',
                message: 'Current password is incorrect',
                code: 'WRONG_PASSWORD',
            });
        }

        user.password = newPassword;
        user.refreshTokens = [];
        await user.save();

        logger.info('Password changed', { userId: user._id });

        res.json({
            success: true,
            message: 'Password changed successfully. Please login again.',
        });
    } catch (error) {
        logger.error('Password change error:', error);
        res.status(500).json({
            success: false,
            error: 'PASSWORD_CHANGE_ERROR',
            message: 'An error occurred while changing password',
            code: 'INTERNAL_ERROR',
        });
    }
};

const deleteAccount = async (req, res) => {
    try {
        const { password } = req.body;
        const user = await User.findById(req.user.id).select('+password');

        if (!password) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Password is required to delete account',
                code: 'MISSING_PASSWORD',
            });
        }

        if (!(await user.comparePassword(password))) {
            return res.status(401).json({
                success: false,
                error: 'INVALID_PASSWORD',
                message: 'Password is incorrect',
                code: 'WRONG_PASSWORD',
            });
        }

        await user.softDelete(user._id);

        logger.info('Account deleted (soft)', { userId: user._id });

        res.json({
            success: true,
            message: 'Account deleted successfully',
        });
    } catch (error) {
        logger.error('Account deletion error:', error);
        res.status(500).json({
            success: false,
            error: 'DELETE_ERROR',
            message: 'An error occurred while deleting account',
            code: 'INTERNAL_ERROR',
        });
    }
};

const getAllUsers = async (req, res) => {
    try {
        const { includeDeleted } = req.query;
        let query = {};

        if (includeDeleted !== 'true') {
            query.isDeleted = false;
        }

        const users = await User.find(query).select('-refreshTokens');

        res.json({
            success: true,
            data: {
                users: users.map(u => ({
                    id: u._id,
                    email: u.email,
                    firstName: u.firstName,
                    lastName: u.lastName,
                    role: u.role,
                    twoFactorEnabled: u.twoFactorEnabled,
                    isDeleted: u.isDeleted,
                    createdAt: u.createdAt,
                })),
                count: users.length,
            },
        });
    } catch (error) {
        logger.error('Get users error:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_ERROR',
            message: 'An error occurred while fetching users',
            code: 'INTERNAL_ERROR',
        });
    }
};

const updateUserRole = async (req, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;

        if (!['user', 'admin', 'superadmin'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Invalid role specified',
                code: 'INVALID_ROLE',
            });
        }

        if (userId === req.user.id.toString()) {
            return res.status(400).json({
                success: false,
                error: 'SELF_MODIFICATION',
                message: 'Cannot modify your own role',
                code: 'CANNOT_MODIFY_SELF',
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'USER_NOT_FOUND',
                message: 'User not found',
                code: 'NOT_FOUND',
            });
        }

        user.role = role;
        await user.save();

        logger.info('User role updated', {
            targetUserId: userId,
            newRole: role,
            updatedBy: req.user.id
        });

        res.json({
            success: true,
            message: 'User role updated successfully',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    role: user.role,
                },
            },
        });
    } catch (error) {
        logger.error('Role update error:', error);
        res.status(500).json({
            success: false,
            error: 'UPDATE_ERROR',
            message: 'An error occurred while updating role',
            code: 'INTERNAL_ERROR',
        });
    }
};

const restoreUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'USER_NOT_FOUND',
                message: 'User not found',
                code: 'NOT_FOUND',
            });
        }

        if (!user.isDeleted) {
            return res.status(400).json({
                success: false,
                error: 'NOT_DELETED',
                message: 'User is not deleted',
                code: 'ALREADY_ACTIVE',
            });
        }

        await user.restore();

        logger.info('User restored', {
            targetUserId: userId,
            restoredBy: req.user.id
        });

        res.json({
            success: true,
            message: 'User restored successfully',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    isDeleted: user.isDeleted,
                },
            },
        });
    } catch (error) {
        logger.error('User restore error:', error);
        res.status(500).json({
            success: false,
            error: 'RESTORE_ERROR',
            message: 'An error occurred while restoring user',
            code: 'INTERNAL_ERROR',
        });
    }
};

module.exports = {
    updateProfile,
    changePassword,
    deleteAccount,
    getAllUsers,
    updateUserRole,
    restoreUser,
};
