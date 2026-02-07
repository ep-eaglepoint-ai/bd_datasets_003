export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role: 'user' | 'admin' | 'superadmin';
    twoFactorEnabled: boolean;
    createdAt?: string;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

export interface Payment {
    id: string;
    transactionId: string;
    amount: number;
    currency: string;
    description?: string;
    cardLastFour?: string;
    status: 'pending' | 'completed' | 'failed' | 'refunded';
    createdAt: string;
    updatedAt?: string;
}

export interface ApiResponse<T = unknown> {
    success: boolean;
    message?: string;
    error?: string;
    code?: string;
    data?: T;
}

export interface PaginatedResponse<T> {
    items: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
}

export interface SecurityHeaders {
    'x-nonce': string;
    'x-timestamp': string;
    'x-signature': string;
    'x-2fa-token'?: string;
}

export interface WebSocketMessage {
    type: string;
    message?: string;
    data?: unknown;
    timestamp: string;
}
