// handlers/AuthRoutes.ts — /auth REST endpoints

import { Router, Request, Response } from 'express';
import { AuthService } from '../auth/AuthService';
import { requireAuth } from '../auth/authMiddleware';

const authService = new AuthService();

function getDeviceContext(req: Request): { deviceKey: string | null; userAgent: string | null } {
  const deviceId = req.header('x-device-id');
  return {
    deviceKey: deviceId?.trim() || null,
    userAgent: req.header('user-agent') || null,
  };
}

export function createAuthRoutes(): Router {
  const router = Router();

  // POST /auth/register
  router.post('/register', async (req: Request, res: Response) => {
    const { name, email, password } = req.body as { name?: string; email?: string; password?: string };
    if (!name || !email || !password) {
      res.status(400).json({ error: 'name, email and password are required' });
      return;
    }
    try {
      await authService.register(name, email, password);
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('[Auth] register error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(409).json({ error: msg });
    }
  });

  // POST /auth/login
  router.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }
    try {
      const { deviceKey, userAgent } = getDeviceContext(req);
      const result = await authService.login(email, password, deviceKey, userAgent);
      res.json(result);
    } catch (err) {
      console.error('[Auth] login error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(401).json({ error: msg });
    }
  });

  // POST /auth/google
  router.post('/google', async (req: Request, res: Response) => {
    const { credential } = req.body as { credential?: string };
    if (!credential) {
      res.status(400).json({ error: 'credential is required' });
      return;
    }
    try {
      const { deviceKey, userAgent } = getDeviceContext(req);
      const result = await authService.googleLogin(credential, deviceKey, userAgent);
      res.json(result);
    } catch (err) {
      console.error('[Auth] google error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(401).json({ error: msg });
    }
  });

  // POST /auth/verification/resend
  router.post('/verification/resend', async (req: Request, res: Response) => {
    const { email } = req.body as { email?: string };
    if (!email?.trim()) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    try {
      await authService.resendVerification(email);
      res.json({ ok: true });
    } catch (err) {
      console.error('[Auth] resend verification error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // POST /auth/verification/confirm
  router.post('/verification/confirm', async (req: Request, res: Response) => {
    const { token } = req.body as { token?: string };
    if (!token?.trim()) {
      res.status(400).json({ error: 'token is required' });
      return;
    }
    try {
      await authService.verifyEmail(token);
      res.json({ ok: true });
    } catch (err) {
      console.error('[Auth] verify email error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  // POST /auth/password/forgot
  router.post('/password/forgot', async (req: Request, res: Response) => {
    const { email } = req.body as { email?: string };
    if (!email?.trim()) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    try {
      const result = await authService.forgotPassword(email);
      // Return generic success to avoid account enumeration.
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[Auth] forgot password error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('account not found')) {
        res.status(404).json({ error: msg });
        return;
      }
      res.status(500).json({ error: msg });
    }
  });

  // POST /auth/password/reset
  router.post('/password/reset', async (req: Request, res: Response) => {
    const { token, email, otp, password } = req.body as {
      token?: string;
      email?: string;
      otp?: string;
      password?: string;
    };
    if (!password) {
      res.status(400).json({ error: 'password is required' });
      return;
    }
    try {
      if (token?.trim()) {
        await authService.resetPassword(token, password);
      } else if (email?.trim() && otp?.trim()) {
        await authService.resetPasswordWithOtp(email, otp, password);
      } else {
        res.status(400).json({ error: 'provide token or email + otp' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[Auth] reset password error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  // POST /auth/password/verify-otp
  router.post('/password/verify-otp', async (req: Request, res: Response) => {
    const { email, otp } = req.body as { email?: string; otp?: string };
    if (!email?.trim() || !otp?.trim()) {
      res.status(400).json({ error: 'email and otp are required' });
      return;
    }
    try {
      await authService.verifyPasswordResetOtp(email, otp);
      res.json({ ok: true });
    } catch (err) {
      console.error('[Auth] verify reset otp error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  // GET /auth/me — protected
  router.get('/me', requireAuth, async (req: Request, res: Response) => {
    try {
      const { deviceKey, userAgent } = getDeviceContext(req);
      const result = await authService.me(req.user!.sub, deviceKey, userAgent);
      res.json(result);
    } catch (err) {
      console.error('[Auth] me error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(404).json({ error: msg });
    }
  });

  return router;
}
