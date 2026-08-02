// src/middleware/rateLimiter.ts
// Centralized rate limiting middleware — applied per-route in each handler file.
// All limiters use standard IP-based windowing with custom messages.

import rateLimit from 'express-rate-limit';

const isProd = process.env.NODE_ENV?.toLowerCase() === 'production';

// ── Auth endpoints — brute-force protection ──────────────────────────────────

/** /auth/login — 10 attempts per 15 min per IP */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  skipSuccessfulRequests: true, // don't penalize successful logins
});

/** /auth/verification/resend — 3 per hour per IP */
export const verificationResendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProd ? 3 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification emails sent. Please wait an hour.' },
});

/** /auth/password/forgot — 3 per hour per IP */
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProd ? 3 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Please wait an hour.' },
});

/** /auth/register — 5 per hour per IP */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProd ? 5 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registrations from this IP. Please try again later.' },
});

// ── Room / media endpoints ───────────────────────────────────────────────────

/** yt-proxy — 15 streams per minute per IP (heavy resource usage) */
export const ytProxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProd ? 15 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many stream requests. Please slow down.' },
});

/** youtube-search + youtube-suggest — 30 per minute per IP */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProd ? 30 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many search requests. Please slow down.' },
});

/** enqueue endpoints — 30 per minute per IP */
export const enqueueLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProd ? 30 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many queue requests. Please slow down.' },
});

// ── Feedback ─────────────────────────────────────────────────────────────────

/** feedback submit — 2 per day per IP (soft anti-spam) */
export const feedbackLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: isProd ? 2 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  // No message — frontend shows loading/shimmer, not an error message
  skip: () => false,
});
