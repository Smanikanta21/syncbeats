import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../auth/authMiddleware';
import { ARTISTS, GENRES, LANGUAGES, normalizeName } from '../recommendations/catalog';
import { buildFeed, parseTaste } from '../recommendations/engine';
import { loadTaste, loadSignals, recordSignal } from '../recommendations/store';

function unavailable(res: Response, operation: string, error: unknown, message: string): void {
  // Prisma messages can include SQL values. Log only a validated error code and operation.
  const rawCode = (error as { code?: unknown } | null)?.code;
  const code = typeof rawCode === 'string' && /^(P\d{4}|[A-Z0-9_]{2,32})$/.test(rawCode) ? rawCode : 'UNKNOWN';
  const missingSchema = code === 'P2021' || code === 'P2022';
  console.error(`[Recommendations] ${operation} failed (${code}).${missingSchema ? ' Apply pending Prisma migrations with prisma migrate deploy.' : ''}`);
  res.status(503).json({ error: message, code: missingSchema ? 'RECOMMENDATIONS_SCHEMA_NOT_READY' : 'RECOMMENDATIONS_UNAVAILABLE' });
}

export function createRecommendationRoutes(db: PrismaClient): Router {
  const router = Router();
  router.use(requireAuth);
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
  router.use(rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: req => req.user!.sub }));
  router.get('/catalog', (_req, res) => { res.json({ languages: LANGUAGES, genres: GENRES, artists: ARTISTS }); });
  router.get('/profile', async (req, res) => {
    try { res.json(await loadTaste(db, req.user!.sub)); }
    catch (error) { unavailable(res, 'GET /profile', error, 'Music interests are temporarily unavailable. Please try again.'); }
  });
  router.put('/profile', async (req, res) => {
    let profile;
    try { profile = parseTaste(req.body); }
    catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
    try {
      const userId = req.user!.sub;
      await db.$transaction(async tx => {
        await tx.musicTasteProfile.upsert({ where: { userId }, create: { userId, ...profile }, update: profile });
        // Choosing an artist again is an explicit way to undo "less like this".
        const restoring = [...profile.favoriteArtistIds, ...ARTISTS.filter(a => profile.customArtists.some(name => normalizeName(name) === normalizeName(a.name))).map(a => a.id)];
        await tx.recommendationEvent.deleteMany({ where: { userId, kind: 'DISLIKE', artistId: { in: restoring } } });
        if (!profile.useActivity) await tx.recommendationEvent.deleteMany({ where: { userId, kind: { notIn: ['LIKE', 'DISLIKE'] } } });
      });
      res.json(profile);
    } catch (error) { unavailable(res, 'PUT /profile', error, 'Could not save your interests. Please try again.'); }
  });
  router.get('/feed', async (req, res) => {
    try {
      const userId = req.user!.sub;
      const profile = await loadTaste(db, userId);
      const events = await loadSignals(db, userId);
      res.json(buildFeed(profile, events));
    } catch (error) { unavailable(res, 'GET /feed', error, 'Suggestions are temporarily unavailable. Search for music or try again.'); }
  });
  router.post('/events', async (req, res) => {
    const { artistId, kind, eventId, context = 'PERSONAL', secondsListened = 0 } = req.body ?? {};
    if (typeof artistId !== 'string' || !ARTISTS.some(a => a.id === artistId) || !['LIKE', 'DISLIKE', 'OPEN', 'QUEUE', 'PLAY'].includes(kind)
      || typeof eventId !== 'string' || !/^[A-Za-z0-9:_-]{8,140}$/.test(eventId) || !['PERSONAL', 'ROOM'].includes(context)
      || !Number.isInteger(secondsListened) || secondsListened < 0 || secondsListened > 86400
      || (['LIKE', 'DISLIKE'].includes(kind) && context !== 'PERSONAL')) {
      res.status(400).json({ error: 'Choose valid feedback.' }); return;
    }
    try { await recordSignal(db, req.user!.sub, artistId, kind, eventId, context, secondsListened); res.json({ ok: true }); }
    catch (error) { unavailable(res, 'POST /events', error, 'Could not save feedback. Please try again.'); }
  });
  router.delete('/profile', async (req, res) => {
    try {
      const userId = req.user!.sub;
      await db.$transaction([db.recommendationEvent.deleteMany({ where: { userId } }), db.musicTasteProfile.deleteMany({ where: { userId } })]);
      res.json({ ok: true });
    } catch (error) { unavailable(res, 'DELETE /profile', error, 'Could not reset your music interests. Please try again.'); }
  });
  return router;
}
