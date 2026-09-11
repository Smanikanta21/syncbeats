import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Simple in-memory rate limiter (per IP, 1 req / 10s) ──────────────────────
const lastSeen = new Map<string, number>();
const RATE_LIMIT_MS = 9_000; // allow slightly under 10s to handle clock jitter

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const last = lastSeen.get(ip) ?? 0;
  if (now - last < RATE_LIMIT_MS) return false;
  lastSeen.set(ip, now);
  return true;
}

// Prune rate-limit map every 5 min to avoid unbounded memory growth
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [ip, ts] of lastSeen) {
    if (ts < cutoff) lastSeen.delete(ip);
  }
}, 5 * 60_000);

// ── Payload shape (mirrors useSyncTelemetry.ts on the frontend) ──────────────
interface SyncTelemetryPayload {
  sessionId:        string;
  roomId:           string;
  userId?:          string;
  deviceType?:      string;
  os?:              string;
  exactModel?:      string;
  userAgent?:       string;
  networkQuality:   string;
  rttMedianMs:      number;
  rttJitterMs:      number;
  rttSamples:       number[];
  clockOffsetMs:    number;
  driftSamples:     number[];
  driftMeanMs:      number;
  driftMaxMs:       number;
  correctionTier:   string;
  correctionsCount: number;
  playbackRate:     number;
  audioUnlocked:    boolean;
  tabVisible:       boolean;
  sessionAgeSecs:   number;
  participantCount: number;
}

function isValidPayload(b: any): b is SyncTelemetryPayload {
  return (
    typeof b.sessionId        === 'string' && b.sessionId.length > 0 &&
    typeof b.roomId           === 'string' && b.roomId.length > 0 &&
    typeof b.networkQuality   === 'string' &&
    typeof b.rttMedianMs      === 'number' &&
    typeof b.rttJitterMs      === 'number' &&
    Array.isArray(b.rttSamples) &&
    typeof b.clockOffsetMs    === 'number' &&
    Array.isArray(b.driftSamples) &&
    typeof b.driftMeanMs      === 'number' &&
    typeof b.driftMaxMs       === 'number' &&
    typeof b.correctionTier   === 'string' &&
    typeof b.correctionsCount === 'number' &&
    typeof b.playbackRate     === 'number' &&
    typeof b.audioUnlocked    === 'boolean' &&
    typeof b.tabVisible       === 'boolean' &&
    typeof b.sessionAgeSecs   === 'number' &&
    typeof b.participantCount === 'number'
  );
}

export function createTelemetryRoutes(): Router {
  const router = Router();

  /**
   * POST /telemetry/sync
   * Accepts a 10-second telemetry batch from the SyncController.
   * Rate-limited to 1 request per IP per ~10 seconds.
   * No auth required — anonymous sessions are valuable training data.
   */
  router.post('/sync', async (req: Request, res: Response) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
      ?? req.socket.remoteAddress
      ?? 'unknown';

    if (!rateLimit(ip)) {
      res.status(429).json({ error: 'Rate limit: one telemetry batch per 10s' });
      return;
    }

    const body = req.body;
    if (!isValidPayload(body)) {
      res.status(400).json({ error: 'Invalid telemetry payload' });
      return;
    }

    try {
      await prisma.syncTelemetry.create({
        data: {
          sessionId:        body.sessionId,
          roomId:           body.roomId,
          userId:           body.userId ?? null,
          deviceType:       body.deviceType ?? null,
          os:               body.os ?? null,
          exactModel:       body.exactModel ?? null,
          userAgent:        body.userAgent ?? null,
          networkQuality:   body.networkQuality,
          rttMedianMs:      body.rttMedianMs,
          rttJitterMs:      body.rttJitterMs,
          rttSamples:       body.rttSamples,
          clockOffsetMs:    body.clockOffsetMs,
          driftSamples:     body.driftSamples,
          driftMeanMs:      body.driftMeanMs,
          driftMaxMs:       body.driftMaxMs,
          correctionTier:   body.correctionTier,
          correctionsCount: body.correctionsCount,
          playbackRate:     body.playbackRate,
          audioUnlocked:    body.audioUnlocked,
          tabVisible:       body.tabVisible,
          sessionAgeSecs:   body.sessionAgeSecs,
          participantCount: body.participantCount,
        },
      });

      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('[Telemetry] Failed to store batch:', err);
      // Don't expose DB errors to the client — telemetry is best-effort
      res.status(500).json({ error: 'Storage failed' });
    }
  });

  return router;
}
