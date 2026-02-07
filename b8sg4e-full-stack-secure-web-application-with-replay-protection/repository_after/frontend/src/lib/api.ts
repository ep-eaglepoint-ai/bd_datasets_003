import { createSecurityHeaders } from './crypto';
import { storage } from './storage';
import { ApiResponse } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: object;
    requiresAuth?: boolean;
    requiresReplayProtection?: boolean;
    twoFactorToken?: string;
}

class ApiClient {
    private baseUrl: string;
    private isRefreshing: boolean = false;
    private refreshPromise: Promise<boolean> | null = null;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private async refreshAccessToken(): Promise<boolean> {
        if (this.isRefreshing) {
            return this.refreshPromise || Promise.resolve(false);
        }

        this.isRefreshing = true;
        this.refreshPromise = this.performRefresh();

        const result = await this.refreshPromise;
        this.isRefreshing = false;
        this.refreshPromise = null;

        return result;
    }

    private async performRefresh(): Promise<boolean> {
        const refreshToken = storage.getRefreshToken();

        if (!refreshToken) {
            storage.clearAll();
            return false;
        }

        try {
            const response = await fetch(`${this.baseUrl}/auth/refresh-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ refreshToken }),
            });

            if (!response.ok) {
                storage.clearAll();
                return false;
            }

            const data = await response.json();

            if (data.success && data.data) {
                storage.setTokens({
                    accessToken: data.data.accessToken,
                    refreshToken: data.data.refreshToken,
                });
                return true;
            }

            storage.clearAll();
            return false;
        } catch {
            storage.clearAll();
            return false;
        }
    }

    async request<T = unknown>(
        endpoint: string,
        options: RequestOptions = {}
    ): Promise<ApiResponse<T>> {
        const {
            method = 'GET',
            body,
            requiresAuth = false,
            requiresReplayProtection = false,
            twoFactorToken,
        } = options;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (requiresAuth) {
            const accessToken = storage.getAccessToken();
            if (accessToken) {
                headers['Authorization'] = `Bearer ${accessToken}`;
            }
        }

        if (requiresReplayProtection) {
            const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
            const securityHeaders = createSecurityHeaders(
                method,
                path,
                body || {},
                twoFactorToken
            );
            Object.assign(headers, securityHeaders);
        } else if (twoFactorToken) {
            headers['x-2fa-token'] = twoFactorToken;
        }

        const fetchOptions: RequestInit = {
            method,
            headers,
        };

        if (body && method !== 'GET') {
            fetchOptions.body = JSON.stringify(body);
        }

        try {
            let response = await fetch(`${this.baseUrl}${endpoint}`, fetchOptions);

            if (response.status === 401 && requiresAuth) {
                const refreshed = await this.refreshAccessToken();

                if (refreshed) {
                    const newAccessToken = storage.getAccessToken();
                    headers['Authorization'] = `Bearer ${newAccessToken}`;

                    if (requiresReplayProtection) {
                        const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
                        const newSecurityHeaders = createSecurityHeaders(
                            method,
                            path,
                            body || {},
                            twoFactorToken
                        );
                        Object.assign(headers, newSecurityHeaders);
                    }

                    fetchOptions.headers = headers;
                    response = await fetch(`${this.baseUrl}${endpoint}`, fetchOptions);
                }
            }

            const data = await response.json();
            return data;
        } catch (error) {
            return {
                success: false,
                error: 'NETWORK_ERROR',
                message: error instanceof Error ? error.message : 'Network request failed',
                code: 'FETCH_FAILED',
            };
        }
    }

    async get<T = unknown>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>) {
        return this.request<T>(endpoint, { ...options, method: 'GET' });
    }

    async post<T = unknown>(endpoint: string, body?: object, options?: Omit<RequestOptions, 'method' | 'body'>) {
        return this.request<T>(endpoint, { ...options, method: 'POST', body });
    }

    async put<T = unknown>(endpoint: string, body?: object, options?: Omit<RequestOptions, 'method' | 'body'>) {
        return this.request<T>(endpoint, { ...options, method: 'PUT', body });
    }

    async delete<T = unknown>(endpoint: string, body?: object, options?: Omit<RequestOptions, 'method' | 'body'>) {
        return this.request<T>(endpoint, { ...options, method: 'DELETE', body });
    }
}

export const api = new ApiClient(API_URL);
