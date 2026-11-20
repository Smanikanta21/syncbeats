// src/utils/errorLogger.ts — Human-readable error diagnostics and logging
import fs from 'fs';
import path from 'path';

export interface ErrorContext {
  method?: string;
  url?: string;
  ip?: string;
  userId?: string;
  userEmail?: string;
  body?: unknown;
  userFacingMessage?: string;
  source?: string;
  statusCode?: number;
}

export interface ErrorExplanation {
  title: string;              // Human-readable title
  humanExplanation: string;   // Plain English explanation of what went wrong
  suggestedAction: string;    // Actionable steps to resolve the issue
  userFacingMessage: string;  // Safe string that can be sent to client
  errorCode?: string;         // e.g. 'P2021', 'ECONNREFUSED'
  errorType: string;          // e.g. 'PrismaClientKnownRequestError'
  isInternal: boolean;        // true if internal database / system error
}

const DEFAULT_LOG_DIR = path.resolve(__dirname, '../../logs');
const DEFAULT_LOG_FILE = process.env.ERROR_LOG_PATH || path.join(DEFAULT_LOG_DIR, 'error.log');
const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * JSON.stringify that cannot throw and does not lose what matters.
 * Express req/res objects are circular, and Error's own fields are
 * non-enumerable — plain JSON.stringify does the exact wrong thing on both,
 * which matters because this runs inside console.error (i.e. inside catch blocks).
 */
export function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, v) => {
      if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack, code: (v as any).code };
      if (typeof v === 'bigint') return v.toString();
      if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`;
      if (typeof v === 'symbol') return v.toString();
      if (v === undefined) return '[undefined]';
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    });
  } catch (e) {
    return `[Unserializable: ${(e as Error)?.message || 'unknown'}]`;
  }
}

/** Format timestamp in Indian Standard Time (IST / UTC+5:30) */
export function getISTTimestamp(): string {
  const istDate = new Date(Date.now() + 5.5 * 3600 * 1000);
  return istDate.toISOString().replace('T', ' ').slice(0, 19) + ' IST';
}

/**
 * Checks whether an error or error message contains internal system,
 * database, or stack trace signatures that should NEVER be exposed to users.
 */
export function isInternalError(err: unknown): boolean {
  if (!err) return false;

  const code = (err as any)?.code;
  const name = String((err as any)?.name || '');
  const message = String((err as any)?.message || (typeof err === 'string' ? err : ''));

  // Prisma error codes (P1xxx = connection/env, P2xxx = query/engine)
  if (typeof code === 'string' && /^P\d{4}$/.test(code)) {
    // P2002 (unique) and P2025 (not found) can have humanized user responses,
    // but the raw error object itself is internal
    return true;
  }

  // System/network errors
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'EAI_AGAIN'].includes(code)) {
    return true;
  }

  // Prisma error class names
  if (name.includes('Prisma') || name.startsWith('PrismaClient')) {
    return true;
  }

  // Raw database or internal keywords in message
  const internalPatterns = [
    /invalid `prisma\./i,
    /the table `.+` does not exist/i,
    /the column `.+` does not exist/i,
    /does not exist in the current database/i,
    /relation ".+" does not exist/i,
    /table ".+" does not exist/i,
    /column ".+" does not exist/i,
    /syntax error at or near/i,
    /foreign key constraint fails/i,
    /password_hash/i,
    /connection pool/i,
    /\bat Object\./i,
    /\bat async/i,
    /\(node:internal/i,
    /\.ts:\d+:\d+/i,
    /\.js:\d+:\d+/i,
  ];

  return internalPatterns.some(pattern => pattern.test(message));
}

/**
 * Translates any error into a human-readable diagnosis and a safe user-facing message.
 */
export function explainError(err: unknown, userOverride?: string): ErrorExplanation {
  const code = (err as any)?.code;
  const name = String((err as any)?.name || (err instanceof Error ? err.constructor.name : typeof err));
  const message = String((err as any)?.message || (typeof err === 'string' ? err : ''));

  // 1. Prisma P2021 — Table does not exist (Missing migrations)
  if (code === 'P2021' || /table `?.+`? does not exist/i.test(message)) {
    const tableMatch = message.match(/table `?([^`'\s]+)`? does not exist/i);
    const table = tableMatch ? tableMatch[1] : 'requested table';
    return {
      title: 'Database Schema Out of Sync (Table Not Found)',
      humanExplanation: `The database table "${table}" does not exist in PostgreSQL. This occurs when database migrations have not been applied yet.`,
      suggestedAction: 'Run "npm run prisma:migrate" (or "npx prisma migrate dev") to apply pending migrations and create all tables.',
      userFacingMessage: userOverride ?? 'The service is temporarily undergoing database maintenance. Please try again in a few moments.',
      errorCode: code || 'P2021',
      errorType: name,
      isInternal: true,
    };
  }

  // 2. Prisma P2022 — Column does not exist
  if (code === 'P2022' || /column `?.+`? does not exist/i.test(message)) {
    const colMatch = message.match(/column `?([^`'\s]+)`? does not exist/i);
    const column = colMatch ? colMatch[1] : 'requested column';
    return {
      title: 'Database Column Missing',
      humanExplanation: `The database query attempted to access column "${column}", which does not exist in the table. The Prisma schema is ahead of the database schema.`,
      suggestedAction: 'Run "npm run prisma:migrate" or "npx prisma db push" to sync the database schema with Prisma.',
      userFacingMessage: userOverride ?? 'The service is temporarily undergoing database maintenance. Please try again shortly.',
      errorCode: code || 'P2022',
      errorType: name,
      isInternal: true,
    };
  }

  // 3. Prisma P1001 / P1002 / P1017 — Database unreachable
  if (code === 'P1001' || code === 'P1002' || code === 'P1017' || /can't reach database server/i.test(message)) {
    return {
      title: 'Database Server Unreachable',
      humanExplanation: "The application could not establish a connection to the PostgreSQL database server. The database container/service may be stopped or network is down.",
      suggestedAction: 'Verify that PostgreSQL is running on the configured host/port (e.g. localhost:5439) and verify DATABASE_URL in .env.',
      userFacingMessage: userOverride ?? "We couldn't reach the SyncBeats database. Please try again in a moment.",
      errorCode: code || 'P1001',
      errorType: name,
      isInternal: true,
    };
  }

  // 4. Prisma P2002 — Unique constraint violation
  if (code === 'P2002') {
    const target = Array.isArray((err as any)?.meta?.target) ? (err as any).meta.target.join(', ') : 'field';
    return {
      title: 'Duplicate Record (Unique Constraint Conflict)',
      humanExplanation: `A unique constraint failed on field: ${target}. A record with this value already exists in the database.`,
      suggestedAction: 'Ensure distinct values are provided for unique fields (e.g., email or username), or gracefully handle existing records.',
      userFacingMessage: userOverride ?? 'That already exists. Please try a different value.',
      errorCode: code,
      errorType: name,
      isInternal: false,
    };
  }

  // 5. Prisma P2025 — Record not found
  if (code === 'P2025') {
    return {
      title: 'Database Record Not Found',
      humanExplanation: 'An update, delete, or relation query expected a record to exist, but none was found in the database.',
      suggestedAction: 'Verify that the target record ID exists before attempting to mutate or link it.',
      userFacingMessage: userOverride ?? 'That no longer exists — it may have been removed already.',
      errorCode: code,
      errorType: name,
      isInternal: false,
    };
  }

  // 6. Prisma P2003 — Foreign key relation constraint violation
  if (code === 'P2003') {
    return {
      title: 'Database Foreign Key Relation Conflict',
      humanExplanation: 'A database operation failed because a referenced parent record does not exist or has been deleted.',
      suggestedAction: 'Ensure all parent records (e.g., user or room) exist prior to inserting child entities.',
      userFacingMessage: userOverride ?? 'That refers to something which no longer exists.',
      errorCode: code,
      errorType: name,
      isInternal: false,
    };
  }

  // 7. Prisma P2024 — Connection pool timeout
  if (code === 'P2024') {
    return {
      title: 'Database Connection Pool Exhausted',
      humanExplanation: 'Timed out waiting for an available connection from the PostgreSQL connection pool. The server is under heavy load or queries are blocking.',
      suggestedAction: 'Check for connection leaks, optimize long-running queries, or increase connection_limit in DATABASE_URL.',
      userFacingMessage: userOverride ?? 'The server is busy right now. Please try again in a few seconds.',
      errorCode: code,
      errorType: name,
      isInternal: true,
    };
  }

  // 8. Prisma P2010 — Raw SQL query failed
  if (code === 'P2010') {
    return {
      title: 'Raw Database Query Failed',
      humanExplanation: 'A raw SQL query failed execution against PostgreSQL.',
      suggestedAction: 'Inspect raw query syntax and parameters.',
      userFacingMessage: userOverride ?? 'A database error occurred. Please try again in a moment.',
      errorCode: code,
      errorType: name,
      isInternal: true,
    };
  }

  // 9. Other Prisma Client Errors
  if (name.includes('Prisma') || /invalid `prisma\./i.test(message)) {
    return {
      title: 'Database Query Client Error',
      humanExplanation: `Prisma client threw an error during query execution: ${message.split('\n')[0] || 'Unknown error'}`,
      suggestedAction: 'Check query parameter types and run "npm run prisma:generate" if Prisma schema was modified.',
      userFacingMessage: userOverride ?? 'Something went wrong on our end. Please try again.',
      errorCode: code || 'PRISMA_CLIENT_ERROR',
      errorType: name,
      isInternal: true,
    };
  }

  // 10. External Network Connection Errors
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ECONNRESET' || name === 'AbortError') {
    const isConnRefused = code === 'ECONNREFUSED';
    return {
      title: isConnRefused ? 'Connection Refused (External Service / DB)' : 'Network Request Timed Out',
      humanExplanation: isConnRefused
        ? 'A network connection to a local or remote service was rejected. The service is not running or port is closed.'
        : 'An external API request took too long or was interrupted.',
      suggestedAction: 'Check network connectivity and verify that all dependent backend services are online.',
      userFacingMessage: userOverride ?? "We couldn't reach an external service. Please try again in a moment.",
      errorCode: code || 'NETWORK_ERROR',
      errorType: name,
      isInternal: true,
    };
  }

  // 11. Malformed JSON Body
  if (err instanceof SyntaxError && ('body' in (err as any) || message.includes('JSON'))) {
    return {
      title: 'Malformed JSON Request Body',
      humanExplanation: 'The incoming HTTP request body could not be parsed as valid JSON.',
      suggestedAction: 'Ensure client sends well-formed JSON and sets "Content-Type: application/json".',
      userFacingMessage: 'That request body wasn\'t valid JSON.',
      errorCode: 'INVALID_JSON',
      errorType: 'SyntaxError',
      isInternal: false,
    };
  }

  // 12. Payload Too Large
  if ((err as any)?.type === 'entity.too.large') {
    return {
      title: 'Request Payload Too Large',
      humanExplanation: 'The request body exceeds the maximum configured payload size.',
      suggestedAction: 'Reduce the payload size or increase the body-parser limit if necessary.',
      userFacingMessage: 'That request was too large. Please send something smaller.',
      errorCode: 'PAYLOAD_TOO_LARGE',
      errorType: 'PayloadTooLargeError',
      isInternal: false,
    };
  }

  // 13. JWT Token Errors
  if (name === 'TokenExpiredError') {
    return {
      title: 'Authentication Session Expired',
      humanExplanation: 'The JWT authentication token provided by the client has expired.',
      suggestedAction: 'Client should re-authenticate or refresh their token.',
      userFacingMessage: 'Your session has expired. Please log in again.',
      errorCode: 'TOKEN_EXPIRED',
      errorType: name,
      isInternal: false,
    };
  }
  if (name === 'JsonWebTokenError') {
    return {
      title: 'Invalid Authentication Token',
      humanExplanation: 'The JWT authentication token could not be verified or has an invalid signature.',
      suggestedAction: 'Verify JWT_SECRET consistency across environments and check Authorization header.',
      userFacingMessage: 'Invalid authentication credentials.',
      errorCode: 'INVALID_TOKEN',
      errorType: name,
      isInternal: false,
    };
  }

  // 14. Fallback for generic or unknown errors
  const isInternal = isInternalError(err);
  return {
    title: isInternal ? 'Internal Server Error' : 'Application Request Failure',
    humanExplanation: isInternal
      ? `An internal error occurred: ${message.split('\n')[0] || 'Unknown error'}`
      : (message || 'Request failed.'),
    suggestedAction: isInternal
      ? 'Inspect technical details and stack trace in the log entry below.'
      : 'Verify client request input parameters.',
    userFacingMessage: userOverride ?? (isInternal ? 'Something went wrong on our end. Please try again.' : (message || 'Something went wrong.')),
    errorCode: code,
    errorType: name,
    isInternal,
  };
}

/**
 * Sanitizes request payload to remove passwords, tokens, and secrets before logging.
 */
function sanitizeRequestBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  try {
    const clone = JSON.parse(JSON.stringify(body));
    const SENSITIVE_KEYS = ['password', 'token', 'credential', 'secret', 'otp', 'authorization'];

    const mask = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        if (SENSITIVE_KEYS.some(s => key.toLowerCase().includes(s))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object') {
          mask(obj[key]);
        }
      }
    };
    mask(clone);
    return clone;
  } catch {
    return '[Unserializable Payload]';
  }
}

/**
 * Ensures the log directory exists and manages log file size with automatic rotation.
 */
function prepareLogFile(logFilePath: string): void {
  const dir = path.dirname(logFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Rotate log if it exceeds MAX_LOG_SIZE_BYTES
  try {
    if (fs.existsSync(logFilePath)) {
      const stats = fs.statSync(logFilePath);
      if (stats.size > MAX_LOG_SIZE_BYTES) {
        const rotatedPath = path.join(dir, 'error.1.log');
        try {
          if (fs.existsSync(rotatedPath)) fs.unlinkSync(rotatedPath);
          fs.renameSync(logFilePath, rotatedPath);
        } catch {
          // If rotation fails, proceed with appending
        }
      }
    }
  } catch {
    // Stat failure shouldn't block logging
  }
}

/**
 * Writes an error entry to the designated error log file with human-readable diagnostics.
 */
export function logErrorToFile(err: unknown, context: ErrorContext = {}): ErrorExplanation {
  const explanation = explainError(err, context.userFacingMessage);
  const timestamp = getISTTimestamp();

  try {
    const logFilePath = DEFAULT_LOG_FILE;
    prepareLogFile(logFilePath);

    const rawMessage = (err as any)?.message ?? (typeof err === 'string' ? err : String(err));
    const stack = (err as any)?.stack ?? '';
    const sanitizedBody = context.body ? JSON.stringify(sanitizeRequestBody(context.body), null, 2) : undefined;

    const lines: string[] = [
      '================================================================================',
      `[${timestamp}] ERROR: ${explanation.title}`,
      '--------------------------------------------------------------------------------',
      `Human-Readable Explanation:`,
      `  ${explanation.humanExplanation.split('\n').join('\n  ')}`,
      '',
      `Suggested Action / Fix:`,
      `  ${explanation.suggestedAction.split('\n').join('\n  ')}`,
      '',
      `What the User Saw:`,
      `  "${explanation.userFacingMessage}"`,
      '',
      `Request Context:`,
      `  Source:      ${context.source || 'General'}`,
      `  Method:      ${context.method || 'N/A'}`,
      `  URL/Path:    ${context.url || 'N/A'}`,
      `  Client IP:   ${context.ip || 'N/A'}`,
      ...(context.userEmail ? [`  User Email:  ${context.userEmail}`] : []),
      ...(context.userId ? [`  User ID:     ${context.userId}`] : []),
      ...(sanitizedBody ? [`  Request Body:\n${sanitizedBody.split('\n').map(l => '    ' + l).join('\n')}`] : []),
      '',
      `Technical Details:`,
      `  Error Type:  ${explanation.errorType}`,
      ...(explanation.errorCode ? [`  Error Code:  ${explanation.errorCode}`] : []),
      `  Raw Message: ${rawMessage.split('\n').join('\n               ')}`,
      ...(stack ? [`  Stack Trace:\n${stack.split('\n').map((l: string) => '    ' + l).join('\n')}`] : []),
      '================================================================================',
      '',
    ];

    fs.appendFileSync(logFilePath, lines.join('\n'), 'utf8');
  } catch (fsErr) {
    // If writing to file fails, fall back to console to avoid losing the error
    console.error(`[ErrorLogger] Failed to write to log file:`, fsErr);
    console.error(`[ErrorLogger] Original error:`, err);
  }

  return explanation;
}
