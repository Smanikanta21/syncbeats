// db/prisma.ts — singleton Prisma client with pg adapter + null-byte sanitizer utility

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { _prisma?: PrismaClient };

/**
 * Deep-clone and strip all null bytes (\0 / \u0000) from any plain value.
 * Returns a NEW object — never mutates the input.
 * IMPORTANT: Only use this on plain data (not Prisma query args/proxies).
 */
export function sanitizeNullBytes(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    return val
      .replace(/\0/g, '')
      .replace(/\u0000/g, '')
      .replace(/\\u0000/g, '')
      .replace(/\x00/g, '');
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

  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  // Discard corrupted/errored connections from the pool so they don't
  // cause 08P01 "insufficient data left in message" on the next query.
  pool.on('error', (err, _client) => {
    console.error('[pg pool] Idle client error — connection discarded:', err.message);
  });

  const adapter = new PrismaPg(pool);

  // NOTE: Do NOT use $extends to sanitize args here.
  // Prisma query args contain internal proxies and special objects —
  // deep-cloning them into plain objects destroys their prototype chain
  // and produces 08P01 "insufficient data left in message" from PostgreSQL.
  // Null-byte sanitization is handled per-operation in UserRepository.
  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  return client;
}

const prisma = (globalForPrisma._prisma ?? createPrismaClient()) as unknown as PrismaClient;

if (process.env.NODE_ENV !== 'production') globalForPrisma._prisma = prisma;

export default prisma;
