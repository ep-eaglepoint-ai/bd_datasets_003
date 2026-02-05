'use client';

import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Payment, ApiResponse } from '@/types';

interface PaymentData {
    amount: number;
    currency?: string;
    description?: string;
    cardLastFour?: string;
}

interface UsePaymentsReturn {
    payments: Payment[];
    isLoading: boolean;
    error: string | null;
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    } | null;
    fetchPayments: (page?: number, status?: string) => Promise<void>;
    createPayment: (data: PaymentData, twoFactorToken?: string) => Promise<{ success: boolean; payment?: Payment; error?: string }>;
    refundPayment: (paymentId: string, twoFactorToken?: string) => Promise<{ success: boolean; error?: string }>;
    deletePayment: (paymentId: string) => Promise<{ success: boolean; error?: string }>;
}

export const usePayments = (): UsePaymentsReturn => {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState<{
        page: number;
        limit: number;
        total: number;
        pages: number;
    } | null>(null);

    const fetchPayments = useCallback(async (page = 1, status?: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({ page: page.toString() });
            if (status) params.append('status', status);

            const response = await api.get<{
                payments: Payment[];
                pagination: { page: number; limit: number; total: number; pages: number };
            }>(`/payments?${params.toString()}`, { requiresAuth: true });

            if (response.success && response.data) {
                setPayments(response.data.payments);
                setPagination(response.data.pagination);
            } else {
                setError(response.message || 'Failed to fetch payments');
            }
        } catch {
            setError('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const createPayment = useCallback(async (data: PaymentData, twoFactorToken?: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await api.post<{ payment: Payment }>(
                '/payments',
                data,
                { requiresAuth: true, requiresReplayProtection: true, twoFactorToken }
            );

            if (response.success && response.data) {
                setPayments(prev => [response.data!.payment, ...prev]);
                return { success: true, payment: response.data.payment };
            }

            return { success: false, error: response.message || 'Failed to create payment' };
        } catch {
            return { success: false, error: 'An unexpected error occurred' };
        } finally {
            setIsLoading(false);
        }
    }, []);

    const refundPayment = useCallback(async (paymentId: string, twoFactorToken?: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await api.post<{ payment: Payment }>(
                `/payments/${paymentId}/refund`,
                {},
                { requiresAuth: true, requiresReplayProtection: true, twoFactorToken }
            );

            if (response.success && response.data) {
                setPayments(prev =>
                    prev.map(p => (p.id === paymentId ? { ...p, status: 'refunded' as const } : p))
                );
                return { success: true };
            }

            return { success: false, error: response.message || 'Failed to refund payment' };
        } catch {
            return { success: false, error: 'An unexpected error occurred' };
        } finally {
            setIsLoading(false);
        }
    }, []);

    const deletePayment = useCallback(async (paymentId: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await api.delete(
                `/payments/${paymentId}`,
                {},
                { requiresAuth: true, requiresReplayProtection: true }
            );

            if (response.success) {
                setPayments(prev => prev.filter(p => p.id !== paymentId));
                return { success: true };
            }

            return { success: false, error: response.message || 'Failed to delete payment' };
        } catch {
            return { success: false, error: 'An unexpected error occurred' };
        } finally {
            setIsLoading(false);
        }
    }, []);

    return {
        payments,
        isLoading,
        error,
        pagination,
        fetchPayments,
        createPayment,
        refundPayment,
        deletePayment,
    };
};
