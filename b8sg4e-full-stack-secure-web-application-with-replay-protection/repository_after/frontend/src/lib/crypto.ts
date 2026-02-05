import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';

const HMAC_SECRET = process.env.NEXT_PUBLIC_HMAC_SECRET || 'default-hmac-secret';

export interface SecurityPayload {
    nonce: string;
    timestamp: number;
    method: string;
    path: string;
    body: object;
}

export const generateNonce = (): string => {
    return uuidv4();
};

export const generateTimestamp = (): number => {
    return Date.now();
};

export const generateSignature = (payload: SecurityPayload): string => {
    return CryptoJS.HmacSHA256(
        JSON.stringify(payload),
        HMAC_SECRET
    ).toString();
};

export const createSecurityHeaders = (
    method: string,
    path: string,
    body: object = {},
    twoFactorToken?: string
): Record<string, string> => {
    const nonce = generateNonce();
    const timestamp = generateTimestamp();

    const payload: SecurityPayload = {
        nonce,
        timestamp,
        method: method.toUpperCase(),
        path,
        body,
    };

    const signature = generateSignature(payload);

    const headers: Record<string, string> = {
        'x-nonce': nonce,
        'x-timestamp': timestamp.toString(),
        'x-signature': signature,
    };

    if (twoFactorToken) {
        headers['x-2fa-token'] = twoFactorToken;
    }

    return headers;
};

export const hashData = (data: string): string => {
    return CryptoJS.SHA256(data).toString();
};
