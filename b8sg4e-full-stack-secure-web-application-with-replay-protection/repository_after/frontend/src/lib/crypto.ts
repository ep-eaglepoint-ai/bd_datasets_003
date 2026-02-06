import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';

const HMAC_SECRET = process.env.NEXT_PUBLIC_HMAC_SECRET || 'default-hmac-secret';
const REQUEST_VALIDITY_WINDOW = parseInt(process.env.NEXT_PUBLIC_REQUEST_VALIDITY_WINDOW || '300000', 10);

export interface SecurityPayload {
    nonce: string;
    timestamp: number;
    expiry: number;
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

export const generateExpiry = (timestamp: number): number => {
    return timestamp + REQUEST_VALIDITY_WINDOW;
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
    const expiry = generateExpiry(timestamp);

    const payload: SecurityPayload = {
        nonce,
        timestamp,
        expiry,
        method: method.toUpperCase(),
        path,
        body,
    };

    const signature = generateSignature(payload);

    const headers: Record<string, string> = {
        'x-nonce': nonce,
        'x-timestamp': timestamp.toString(),
        'x-expiry': expiry.toString(),
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
