// config/config.ts — centralizes env var access

export const config = {
  port:        parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://syncbeats:syncbeats@localhost:5432/syncbeats',
  jwtSecret:   process.env.JWT_SECRET ?? 'changeme-dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigin:   process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@syncbeats.app',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'syncbeats-admin',
} as const;
