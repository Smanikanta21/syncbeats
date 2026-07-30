// auth/authMiddleware.ts — JWT guard for protected routes

import { Request, Response, NextFunction } from 'express';
import { AuthService, TokenPayload } from './AuthService';

// Extend Express Request to carry the decoded user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

const authService = new AuthService();

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    req.user = authService.verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Token expired or invalid' });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (token) {
    try {
      req.user = authService.verifyToken(token);
    } catch {
      // Ignored for optional auth
    }
  }
  next();
}
