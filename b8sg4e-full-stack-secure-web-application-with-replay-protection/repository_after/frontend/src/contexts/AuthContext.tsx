'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { storage } from '@/lib/storage';
import { User } from '@/types';

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string, totpToken?: string) => Promise<{ success: boolean; requires2FA?: boolean; error?: string }>;
    register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
}

interface RegisterData {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const refreshUser = useCallback(async () => {
        const accessToken = storage.getAccessToken();

        if (!accessToken) {
            setUser(null);
            setIsLoading(false);
            return;
        }

        try {
            const response = await api.get<{ user: User }>('/auth/profile', { requiresAuth: true });

            if (response.success && response.data) {
                setUser(response.data.user);
                storage.setUser({
                    id: response.data.user.id,
                    email: response.data.user.email,
                    firstName: response.data.user.firstName,
                    lastName: response.data.user.lastName,
                    role: response.data.user.role,
                    twoFactorEnabled: response.data.user.twoFactorEnabled,
                });
            } else {
                storage.clearAll();
                setUser(null);
            }
        } catch {
            storage.clearAll();
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshUser();
    }, [refreshUser]);

    const login = async (email: string, password: string, totpToken?: string) => {
        try {
            const response = await api.post<{ user: User; accessToken: string; refreshToken: string }>(
                '/auth/login',
                { email, password, totpToken },
                { requiresReplayProtection: true }
            );

            if (response.success && response.data) {
                storage.setTokens({
                    accessToken: response.data.accessToken,
                    refreshToken: response.data.refreshToken,
                });
                setUser(response.data.user);
                storage.setUser({
                    id: response.data.user.id,
                    email: response.data.user.email,
                    firstName: response.data.user.firstName,
                    lastName: response.data.user.lastName,
                    role: response.data.user.role,
                    twoFactorEnabled: response.data.user.twoFactorEnabled,
                });
                return { success: true };
            }

            if (response.code === 'MISSING_2FA') {
                return { success: false, requires2FA: true };
            }

            return { success: false, error: response.message || 'Login failed' };
        } catch {
            return { success: false, error: 'An unexpected error occurred' };
        }
    };

    const register = async (data: RegisterData) => {
        try {
            const response = await api.post<{ user: User; accessToken: string; refreshToken: string }>(
                '/auth/register',
                data,
                { requiresReplayProtection: true }
            );

            if (response.success && response.data) {
                storage.setTokens({
                    accessToken: response.data.accessToken,
                    refreshToken: response.data.refreshToken,
                });
                setUser(response.data.user);
                storage.setUser({
                    id: response.data.user.id,
                    email: response.data.user.email,
                    firstName: response.data.user.firstName,
                    lastName: response.data.user.lastName,
                    role: response.data.user.role,
                    twoFactorEnabled: response.data.user.twoFactorEnabled,
                });
                return { success: true };
            }

            return { success: false, error: response.message || 'Registration failed' };
        } catch {
            return { success: false, error: 'An unexpected error occurred' };
        }
    };

    const logout = async () => {
        try {
            const refreshToken = storage.getRefreshToken();
            await api.post('/auth/logout', { refreshToken }, { requiresAuth: true });
        } catch {
        } finally {
            storage.clearAll();
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                isAuthenticated: !!user,
                login,
                register,
                logout,
                refreshUser,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
