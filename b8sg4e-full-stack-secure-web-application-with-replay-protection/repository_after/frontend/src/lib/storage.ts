const TOKEN_KEY = 'auth_tokens';
const USER_KEY = 'auth_user';

export interface StoredTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt?: number;
}

export interface StoredUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    twoFactorEnabled: boolean;
}

export const storage = {
    getTokens: (): StoredTokens | null => {
        if (typeof window === 'undefined') return null;
        try {
            const tokens = localStorage.getItem(TOKEN_KEY);
            return tokens ? JSON.parse(tokens) : null;
        } catch {
            return null;
        }
    },

    setTokens: (tokens: StoredTokens): void => {
        if (typeof window === 'undefined') return;
        localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
    },

    clearTokens: (): void => {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(TOKEN_KEY);
    },

    getUser: (): StoredUser | null => {
        if (typeof window === 'undefined') return null;
        try {
            const user = localStorage.getItem(USER_KEY);
            return user ? JSON.parse(user) : null;
        } catch {
            return null;
        }
    },

    setUser: (user: StoredUser): void => {
        if (typeof window === 'undefined') return;
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    },

    clearUser: (): void => {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(USER_KEY);
    },

    clearAll: (): void => {
        storage.clearTokens();
        storage.clearUser();
    },

    getAccessToken: (): string | null => {
        const tokens = storage.getTokens();
        return tokens?.accessToken || null;
    },

    getRefreshToken: (): string | null => {
        const tokens = storage.getTokens();
        return tokens?.refreshToken || null;
    },
};
