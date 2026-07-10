import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

export function createHistoryRoutes(prisma: PrismaClient): Router {
  const router = Router();

  // POST /history/listen
  router.post('/listen', async (req, res) => {
    const { userId, youtubeId, title, artist, thumbnail } = req.body;
    
    if (!userId || !youtubeId || !title) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const entry = await prisma.listenHistory.create({
        data: {
          userId,
          youtubeId,
          title,
          artist,
          thumbnail
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
    const { userId, query } = req.body;
    
    if (!userId || !query) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const entry = await prisma.searchHistory.create({
        data: {
          userId,
          query
        }
      });
      res.json({ success: true, entry });
    } catch (error) {
      console.error('[History] Failed to log search history:', error);
      res.status(500).json({ error: 'Failed to log search history' });
    }
  });

  // GET /history/recent
  router.get('/recent', async (req, res) => {
    const userId = req.query.userId as string;
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
