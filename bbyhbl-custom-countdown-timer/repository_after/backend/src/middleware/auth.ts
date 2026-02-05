import { Context, Next } from 'hono';
import { sign, verify } from 'jsonwebtoken';
import { config } from '../config';

const JWT_SECRET = config.SESSION_SECRET;

export interface AuthContext extends Context {
  user?: {
    id: string;
    email: string;
    username: string;
  };
}

export async function authMiddleware(c: AuthContext, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const payload = verify(token, JWT_SECRET) as any;
    c.user = {
      id: payload.userId,
      email: payload.email,
      username: payload.username,
    };
    await next();
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401);
  }
}

export function generateToken(userId: string, email: string, username: string): string {
  return sign(
    { userId, email, username },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export async function optionalAuthMiddleware(c: AuthContext, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await next();
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verify(token, JWT_SECRET) as any;
    c.user = {
      id: payload.userId,
      email: payload.email,
      username: payload.username,
    };
  } catch {
    // Treat invalid token as anonymous for optional auth
  }

  await next();
}

export function verifyToken(token: string): AuthContext['user'] {
  const payload = verify(token, JWT_SECRET) as any;
  return {
    id: payload.userId,
    email: payload.email,
    username: payload.username,
  };
}