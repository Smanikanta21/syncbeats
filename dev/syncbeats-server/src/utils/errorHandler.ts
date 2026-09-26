// utils/errorHandler.ts — every failure the client sees comes through here.
//
// Rule: the raw error is logged server-side, never sent. What goes out is a
// sentence a person can act on. Nothing downstream rewrites it (the old
// blanket res.json 5xx masker in server.ts did, which is why users only ever
// saw "Internal Server Error").

import { Request, Response, NextFunction } from 'express';

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

/** Plain-English version of the failures this server actually produces. */
export function humanizeError(err: any): string {
  const code = err?.code;

  if (code === 'P2002') return 'That already exists. Please try a different value.';
  if (code === 'P2025') return "That no longer exists — it may have been removed already.";
  if (code === 'P2003') return "That refers to something which no longer exists.";
  if (code === 'P2024') return 'The server is busy right now. Please try again in a few seconds.';
  if (code === 'P1001' || code === 'P1002' || code === 'P1017') {
    return "We couldn't reach the SyncBeats database. Please try again in a moment.";
  }

  // express.json() rejects a malformed body with a SyntaxError carrying `body`.
  if (err instanceof SyntaxError && 'body' in (err as any)) {
    return "That request body wasn't valid JSON.";
  }
  if ((err as any)?.type === 'entity.too.large') {
    return 'That request was too large. Please send something smaller.';
  }
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || err?.name === 'AbortError') {
    return "We couldn't reach an external service. Please try again in a moment.";
  }

  return 'Something went wrong on our end. Please try again.';
}

/** Deliberate 4xx: the message is already human, send it as-is. */
export function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

/**
 * Unexpected failure. Logs the real thing, sends the human thing.
 * `userMessage` is optional — humanizeError() covers the common cases.
 */
export function sendError(
  res: Response,
  err: any,
  userMessage?: string,
  status: number = 500,
): void {
  console.error(`[Error] ${userMessage ?? 'Request failed'}:`, err);
  if (res.headersSent) return;
  res.status(status).json({ error: userMessage ?? humanizeError(err) });
}

/** Unknown path — JSON, not Express's default HTML page. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `No such endpoint: ${req.method} ${req.path}` });
}

/**
 * Last resort. Express 5 forwards rejected async handlers here, so this also
 * catches the throws no route remembered to try/catch.
 */
export function errorHandler(err: any, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) { next(err); return; }
  // Body-parser and similar tag their own status; anything untagged is our fault.
  const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  console.error('[Error] Unhandled request failure:', err);
  res.status(status).json({ error: humanizeError(err) });
}
