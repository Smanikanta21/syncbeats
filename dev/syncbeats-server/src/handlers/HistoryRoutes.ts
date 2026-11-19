import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../auth/authMiddleware';
import { loadTaste, recordTextSignal } from '../recommendations/store';

export function createHistoryRoutes(prisma: PrismaClient): Router {
  const router = Router();
  router.use(requireAuth);
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });

  const cleanStr = (s: any): string => (typeof s === 'string' ? s.replace(/\0/g, '').replace(/\u0000/g, '').trim() : '');

  // POST /history/listen
  router.post('/listen', async (req, res) => {
    const { youtubeId, title, artist, thumbnail } = req.body ?? {};
    const userId = req.user!.sub;
    
    if (!cleanStr(youtubeId) || !cleanStr(title) || cleanStr(title).length > 300 || cleanStr(youtubeId).length > 2048) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const entry = await prisma.listenHistory.create({
        data: {
          userId: cleanStr(userId),
          youtubeId: cleanStr(youtubeId),
          title: cleanStr(title),
          artist: cleanStr(artist) || null,
          thumbnail: cleanStr(thumbnail) || null
        }
      });
      res.json({ success: true, entry });
    } catch (error) {
      console.error('[History] Failed to log listen history:', error);
      res.status(500).json({ error: 'Failed to log listen history' });
    }
  });

  // POST /history/search
  router.post('/search', async (req, res) => {
    const { query } = req.body ?? {};
    const userId = req.user!.sub;
    
    if (!cleanStr(query) || cleanStr(query).length > 200) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      if (!(await loadTaste(prisma, userId)).useActivity) {
        res.json({ success: true, entry: null });
        return;
      }
      const entry = await prisma.searchHistory.create({
        data: {
          userId: cleanStr(userId),
          query: cleanStr(query)
        }
      });
      void recordTextSignal(prisma, userId, cleanStr(query), 'SEARCH', entry.id).catch(() => {});
      res.json({ success: true, entry });
    } catch (error) {
      console.error('[History] Failed to log search history:', error);
      res.status(500).json({ error: 'Failed to log search history' });
    }
  });

  // GET /history/recent
  router.get('/recent', async (req, res) => {
    const userId = req.user!.sub;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    try {
      const recentListens = await prisma.listenHistory.findMany({
        where: { userId },
        orderBy: { playedAt: 'desc' },
        take: 20
      });

      const recentSearches = await prisma.searchHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      res.json({ listens: recentListens, searches: recentSearches });
    } catch (error) {
      console.error('[History] Failed to fetch recent history:', error);
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  });

  return router;
}
