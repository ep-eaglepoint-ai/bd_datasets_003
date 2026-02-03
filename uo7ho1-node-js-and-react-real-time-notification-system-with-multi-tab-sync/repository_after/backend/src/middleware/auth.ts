// Authentication middleware
// Requirement 1: Session cookie authentication (not URL tokens)

import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

// Middleware to verify user is authenticated via session
export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = req.session?.userId;

  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: 'Invalid session' });
    return;
  }

  req.userId = userId;
  next();
};

// Helper to get user ID from session (for socket auth)
export const getUserIdFromSession = async (
  sessionId: string
): Promise<string | null> => {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { userId: true, expiresAt: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session.userId;
};
