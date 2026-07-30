// src/handlers/FeedbackRoutes.ts — /feedback REST endpoints

import { Router, Request, Response } from 'express';
import prisma from '../db/prisma';
import { requireAuth } from '../auth/authMiddleware';
import { feedbackLimiter } from '../middleware/rateLimiter';

const VALID_CATEGORIES = new Set(['general', 'audio', 'sync', 'ui', 'bug']);

export function createFeedbackRoutes(): Router {
  const router = Router();

  // Optional auth extractor (attaches req.user if Bearer token present, but doesn't block if missing)
  const optionalAuth = (req: Request, _res: Response, next: () => void) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const { AuthService } = require('../auth/AuthService');
        const authService = new AuthService();
        req.user = authService.verifyToken(token);
      } catch {
        // Ignore invalid token for guest feedback
      }
    }
    next();
  };

  // POST /feedback — Submit user rating & review
  router.post('/', feedbackLimiter, optionalAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { rating, category = 'general', comment, page, sessionId } = req.body;

      // Validate rating
      const numericRating = Number(rating);
      if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
        res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
        return;
      }

      // Validate category
      const cleanCategory = String(category).toLowerCase().trim();
      if (!VALID_CATEGORIES.has(cleanCategory)) {
        res.status(400).json({ error: 'Invalid feedback category' });
        return;
      }

      // Validate comment length
      const cleanComment = comment ? String(comment).trim() : null;
      if (cleanComment && cleanComment.length > 500) {
        res.status(400).json({ error: 'Comment must be 500 characters or fewer' });
        return;
      }

      const userId = req.user?.sub || null;
      const userAgent = req.headers['user-agent'] || null;

      const feedback = await prisma.userFeedback.create({
        data: {
          userId,
          rating: Math.round(numericRating),
          category: cleanCategory,
          comment: cleanComment,
          page: page ? String(page).slice(0, 100) : null,
          sessionId: sessionId ? String(sessionId).slice(0, 100) : null,
          userAgent: userAgent ? userAgent.slice(0, 255) : null,
          appVersion: '1.4.0',
        },
      });

      console.log(`[Feedback] Received rating ${feedback.rating}/5 from ${userId ? `user ${userId}` : 'guest'}`);
      res.status(201).json({ ok: true, id: feedback.id });
    } catch (err) {
      console.error('[Feedback] Error saving feedback:', err);
      res.status(500).json({ error: 'Failed to record feedback' });
    }
  });

  // GET /feedback/stats — Admin view of feedback analytics
  router.get('/stats', requireAuth, async (_req: Request, res: Response): Promise<void> => {
    try {
      const [totalCount, avgRatingResult, breakdown, recentComments] = await Promise.all([
        prisma.userFeedback.count(),
        prisma.userFeedback.aggregate({ _avg: { rating: true } }),
        prisma.userFeedback.groupBy({
          by: ['category'],
          _count: { rating: true },
          _avg: { rating: true },
        }),
        prisma.userFeedback.findMany({
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { name: true, email: true } },
          },
        }),
      ]);

      res.json({
        totalCount,
        averageRating: Number((avgRatingResult._avg.rating || 0).toFixed(2)),
        categoryBreakdown: breakdown,
        recent: recentComments.map((f: any) => ({
          id: f.id,
          rating: f.rating,
          category: f.category,
          comment: f.comment,
          userName: f.user?.name || 'Anonymous',
          userEmail: f.user?.email || null,
          page: f.page,
          createdAt: f.createdAt,
        })),
      });
    } catch (err) {
      console.error('[Feedback] Error fetching stats:', err);
      res.status(500).json({ error: 'Failed to fetch feedback stats' });
    }
  });

  return router;
}
