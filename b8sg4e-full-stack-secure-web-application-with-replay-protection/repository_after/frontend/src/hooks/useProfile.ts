'use client';

import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface ProfileData {
    firstName?: string;
    lastName?: string;
    phone?: string;
}

interface UseProfileReturn {
    isLoading: boolean;
    error: string | null;
    updateProfile: (data: ProfileData) => Promise<{ success: boolean; error?: string }>;
    changePassword: (currentPassword: string, newPassword: string, twoFactorToken?: string) => Promise<{ success: boolean; error?: string }>;
    deleteAccount: (password: string, twoFactorToken?: string) => Promise<{ success: boolean; error?: string }>;
    setup2FA: () => Promise<{ success: boolean; secret?: string; qrCode?: string; error?: string }>;
    verify2FA: (token: string) => Promise<{ success: boolean; error?: string }>;
    disable2FA: (token: string) => Promise<{ success: boolean; error?: string }>;
}

export const useProfile = (): UseProfileReturn => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { refreshUser, logout } = useAuth();

    const updateProfile = useCallback(async (data: ProfileData) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await api.put(
                '/users/profile',
                data,
                { requiresAuth: true, requiresReplayProtection: true }
            );

            if (response.success) {
                await refreshUser();
                return { success: true };
            }

            return { success: false, error: response.message || 'Failed to update profile' };
        } catch {
            return { success: false, error: 'An unexpected error occurred' };
        } finally {
            setIsLoading(false);
        }
    }, [refreshUser]);

    const changePassword = useCallback(async (currentPassword: string, newPassword: string, twoFactorToken?: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await api.put(
                '/users/password',
                { currentPassword, newPassword },
                { requiresAuth: true, requiresReplayProtection: true, twoFactorToken }
            );

            if (response.success) {
                await logout();
                return { success: true };
            }

            return { success: false, error: response.message || 'Failed to change password' };
        } catch {
            return { success: false, error: 'An unexpected error occurred' };
        } finally {
            setIsLoading(false);
        }
    }, [logout]);

    const deleteAccount = useCallback(async (password: string, twoFactorToken?: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await api.delete(
                '/users/account',
                { password },
                { requiresAuth: true, requiresReplayProtection: true, twoFactorToken }
            );

            if (response.success) {
                await logout();
                return { success: true };
            }

            return { success: false, error: response.message || 'Failed to delete account' };
        } catch {
            return { success: false, error: 'An unexpected error occurred' };
        } finally {
            setIsLoading(false);
        }
    }, [logout]);

    const setup2FA = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await api.post<{ secret: string; qrCode: string }>(
                '/auth/2fa/setup',
                {},
                { requiresAuth: true, requiresReplayProtection: true }
            );

            if (response.success && response.data) {
                return { success: true, secret: response.data.secret, qrCode: response.data.qrCode };
            }

            return { success: false, error: response.message || 'Failed to setup 2FA' };
        } catch {
            return { success: false, error: 'An unexpected error occurred' };
        } finally {
            setIsLoading(false);
        }
    }, []);

    const verify2FA = useCallback(async (token: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await api.post(
                '/auth/2fa/verify',
                { token },
                { requiresAuth: true, requiresReplayProtection: true }
            );

            if (response.success) {
                await refreshUser();
                return { success: true };
            }

            return { success: false, error: response.message || 'Failed to verify 2FA' };
        } catch {
            return { success: false, error: 'An unexpected error occurred' };
        } finally {
            setIsLoading(false);
        }
    }, [refreshUser]);

    const disable2FA = useCallback(async (token: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await api.post(
                '/auth/2fa/disable',
                { token },
                { requiresAuth: true, requiresReplayProtection: true }
            );

            if (response.success) {
                await refreshUser();
                return { success: true };
            }

            return { success: false, error: response.message || 'Failed to disable 2FA' };
        } catch {
            return { success: false, error: 'An unexpected error occurred' };
        } finally {
            setIsLoading(false);
        }
    }, [refreshUser]);

    return {
        isLoading,
        error,
        updateProfile,
        changePassword,
        deleteAccount,
        setup2FA,
        verify2FA,
        disable2FA,
    };
};
