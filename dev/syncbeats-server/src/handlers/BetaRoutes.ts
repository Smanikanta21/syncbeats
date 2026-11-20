import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { BetaSignupStore } from '../db/BetaSignupRepository';
import { parseBetaSignup } from '../utils/betaSignup';

export function createBetaRoutes(store: BetaSignupStore): Router {
  const router = Router();
  const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many signup attempts. Please try again in an hour.' } });
  router.post('/mac', limiter, async (req, res) => {
    const result = parseBetaSignup(req.body);
    if (!result.ok) { res.status(400).json({ error: result.error }); return; }
    try {
      if (!result.honeypot) {
        await store.prune();
        await store.save(result.signup);
      }
      // A duplicate email gets the same response; no public membership lookup.
      res.status(202).json({ ok: true, message: 'Request saved. We will email you when Mac beta invitations are available.' });
    } catch {
      console.error('[Mac beta] Could not save signup');
      res.status(503).json({ error: 'Could not save your request. Please try again later.' });
    }
  });
  return router;
}
