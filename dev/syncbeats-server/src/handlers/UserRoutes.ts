import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/authMiddleware';
import { UserRepository } from '../auth/UserRepository';

export function createUserRoutes(users: UserRepository): Router {
  const router = Router();

  // GET /users/search?q=query
  router.get('/search', requireAuth, async (req: Request, res: Response) => {
    try {
      const query = (req.query.q as string || '').trim();
      if (!query) {
        return res.json({ users: [] });
      }

      // We'll search by name or email (excluding the requester)
      const results = await users.searchUsers(query, req.user!.sub);
      
      // Return public info
      const publicUsers = results.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email
      }));

      res.json({ users: publicUsers });
    } catch (err) {
      console.error('[Users] search error:', err);
      res.status(500).json({ error: 'Failed to search users' });
    }
  });

  return router;
}
