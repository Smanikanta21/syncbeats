// utils/errorHandler.ts — every failure the client sees comes through here.
//
// Rule: raw internal error messages are never sent to clients. What goes out
// is a user-friendly sentence. Every error is logged to logs/error.log with
// human-readable diagnostics explaining what went wrong and how to fix it.

import { Request, Response, NextFunction } from 'express';
import {
  explainError,
  logErrorToFile,
  isInternalError,
  ErrorExplanation,
  ErrorContext,
} from './errorLogger';

export { explainError, logErrorToFile, isInternalError, ErrorExplanation, ErrorContext };

/** Room codes we generate. Enforced on create only — see roomCodeError(). */
export const ROOM_CODE_RE = /^\d{6}$/;

/** Upper bound for a code we're only going to look up. Keeps absurd input out of the DB. */
const MAX_LOOKUP_CODE_LEN = 64;

/**
 * Lookups stay loose on purpose: rooms created before the format was enforced
 * may not be 6 digits, and locking them out would strand live rooms. This only
 * rejects input that can't be a code at all; the DB decides if it exists.
 */
export function roomCodeLookupError(code: unknown): string | null {
  if (typeof code !== 'string' || !code.trim()) return 'A room code is required.';
  if (code.length > MAX_LOOKUP_CODE_LEN) return 'That room code is too long to be valid.';
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return 'Room codes can only contain letters, numbers, dashes and underscores.';
  return null;
}

/** Strict check, for codes a user is asking us to create. */
export function roomCodeError(code: unknown): string | null {
  if (typeof code !== 'string' || !code.trim()) return 'A room code is required.';
  if (!ROOM_CODE_RE.test(code)) return 'Room codes must be exactly 6 digits (for example 482913).';
  return null;
}

/** Plain-English version of the failures this server produces, safe for users to see. */
export function humanizeError(err: any): string {
  return explainError(err).userFacingMessage;
}

/** Deliberate 4xx: the message is already human, send it as-is. */
export function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

/**
 * Unexpected or caught failure.
 * - Explains and records the error to logs/error.log with full diagnostics.
 * - Sends a human-readable, safe error message to the client.
 */
export function sendError(
  res: Response,
  err: any,
  userMessage?: string,
  status: number = 500,
): void {
  const req = (res as any).req as Request | undefined;
  const context: ErrorContext = {
    method: req?.method,
    url: req?.originalUrl || req?.url,
    ip: req?.ip,
    userId: (req as any)?.user?.sub,
    userEmail: (req as any)?.user?.email,
    body: req?.body,
    userFacingMessage: userMessage,
    source: req ? `Express: ${req.method} ${req.originalUrl || req.url}` : 'Express Handler',
    statusCode: status,
  };

  const explanation = logErrorToFile(err, context);
  console.error(`[Error] ${explanation.title}:`, (err as any)?.message || err);

  if (res.headersSent) return;

  // If it's an internal database or system error, avoid leaking 4xx with internal messages
  const effectiveStatus = (explanation.isInternal && status < 500) ? 500 : status;
  res.status(effectiveStatus).json({ error: explanation.userFacingMessage });
}

/** Unknown path — JSON, not Express's default HTML page. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `No such endpoint: ${req.method} ${req.path}` });
}

/**
 * Last resort. Express 5 forwards rejected async handlers here, so this also
 * catches the throws no route remembered to try/catch.
 */
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) { next(err); return; }

  const explanation = logErrorToFile(err, {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip,
    userId: (req as any)?.user?.sub,
    userEmail: (req as any)?.user?.email,
    body: req.body,
    source: `Express errorHandler: ${req.method} ${req.originalUrl || req.url}`,
  });

  console.error('[Error] Unhandled request failure:', (err as any)?.message || err);

  // Body-parser and similar tag their own status; anything untagged is our fault.
  let status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (explanation.isInternal && status < 500) {
    status = 500;
  }

  res.status(status).json({ error: explanation.userFacingMessage });
}
