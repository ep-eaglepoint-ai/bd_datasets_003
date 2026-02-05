// src/middleware/authenticate.ts
import { Request, Response, NextFunction } from 'express';

/**
 * Attaches authenticated user to request.
 * NOTE: This is assumed to be correct and must not be changed.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const user = req.headers['x-user'];

  if (!user) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  // User object shape is inconsistent across app
  req.user = JSON.parse(String(user));
  next();
}
