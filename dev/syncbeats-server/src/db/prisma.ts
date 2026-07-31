// db/prisma.ts — singleton Prisma client with pg adapter + null-byte sanitizer utility

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { _prisma?: PrismaClient };

/**
 * Deep-sanitize any plain value for safe storage in PostgreSQL:
 *  - Strips null bytes (\0 / \u0000) which cause "invalid byte sequence for encoding UTF8: 0x00"
 *  - Strips other non-printable C0/C1 control characters (U+0001–U+001F, U+007F, U+0080–U+009F)
 *    which can cause "syntax error at or near <word>" Postgres errors
 *  - Normalises rogue \n or \r inside field values that corrupt timestamp parsing
 *    e.g. "2026-07-28\n, Tungevaag" being treated as a timestamp
 * Returns a NEW object — never mutates the input.
 * IMPORTANT: Only use this on plain data objects (not Prisma query arg proxies).
 */
export function sanitizeNullBytes(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    return val
      // Remove null bytes
      .replace(/\x00/g, '')
      .replace(/\u0000/g, '')
      .replace(/\\u0000/g, '')
      // Remove other ASCII control characters (except tab \x09, newline \x0A, CR \x0D which may be legitimate in text)
      // Actually for DB field values (titles, artists, urls) strip ALL control characters
      // eslint-disable-next-line no-control-regex
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/g, '')
      // Replace any remaining newline/CR with a space so artist names don't get split across lines
      .replace(/[\r\n]+/g, ' ')
      .trim();
  }
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (val instanceof Date) return val;
  if (Buffer.isBuffer(val)) return val;
  if (Array.isArray(val)) {
    return val.map(sanitizeNullBytes);
  }
  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const key of Object.keys(val)) {
      out[key] = sanitizeNullBytes(val[key]);
    }
    return out;
  }
  return val;
}

// Alias for backwards compatibility with existing imports
export const sanitizeString = sanitizeNullBytes;

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Standard PrismaClient uses Prisma's native Rust query engine connection pool,
  // which handles PostgreSQL protocol state, idle connection resets, and automatic retries
  // seamlessly without throwing 'DriverAdapterError: invalid message format' or pg pool idle errors.
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  return client;
}

const prisma = (globalForPrisma._prisma ?? createPrismaClient()) as unknown as PrismaClient;

if (process.env.NODE_ENV !== 'production') globalForPrisma._prisma = prisma;

export default prisma;
