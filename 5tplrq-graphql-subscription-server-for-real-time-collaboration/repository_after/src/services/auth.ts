import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

export interface JWTPayload {
    userId: string;
    email: string;
}

export const AuthService = {
    sign(payload: JWTPayload): string {
        return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
    },

    verify(token: string): JWTPayload | null {
        try {
            return jwt.verify(token, JWT_SECRET) as JWTPayload;
        } catch (e) {
            return null;
        }
    }
};
