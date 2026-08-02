// handlers/AuthRoutes.ts — /auth REST endpoints

import { Router, Request, Response } from 'express';
import { AuthService } from '../auth/AuthService';
import { requireAuth } from '../auth/authMiddleware';
import { loginLimiter, registerLimiter, forgotPasswordLimiter, verificationResendLimiter } from '../middleware/rateLimiter';

const authService = new AuthService();

function getClientIp(req: Request): string | null {
  const forwarded = req.header('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map(s => s.trim());
    if (ips.length > 0 && ips[0]) return ips[0];
  }
  const realIp = req.header('x-real-ip');
  if (realIp) return realIp.trim();
  return req.ip || req.socket.remoteAddress || null;
}

function getDeviceContext(req: Request): { deviceKey: string | null; userAgent: string | null; ip: string | null } {
  const deviceId = req.header('x-device-id');
  return {
    deviceKey: deviceId?.trim() || null,
    userAgent: req.header('user-agent') || null,
    ip: getClientIp(req),
  };
}

export function createAuthRoutes(): Router {
  const router = Router();

  // POST /auth/register — rate limited
  router.post('/register', registerLimiter, async (req: Request, res: Response) => {
    const { name, email, password } = req.body as { name?: string; email?: string; password?: string };
    if (!name || !email || !password) {
      res.status(400).json({ error: 'name, email and password are required' });
      return;
    }
    // Input length caps — prevents DB storage attacks
    if (name.trim().length > 100) { res.status(400).json({ error: 'Name too long (max 100 chars)' }); return; }
    if (email.trim().length > 254) { res.status(400).json({ error: 'Email too long' }); return; }
    if (password.length > 128) { res.status(400).json({ error: 'Password too long (max 128 chars)' }); return; }
    if (password.length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters' }); return; }
    try {
      await authService.register(name.trim(), email.trim().toLowerCase(), password);
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('[Auth] register error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(409).json({ error: msg });
    }
  });

  // POST /auth/check-email
  router.post('/check-email', async (req: Request, res: Response) => {
    const { email } = req.body as { email?: string };
    if (!email) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    try {
      const exists = await authService.checkEmail(email);
      res.json({ exists });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // POST /auth/login — rate limited (brute-force protection)
  router.post('/login', loginLimiter, async (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }
    if (email.length > 254 || password.length > 128) {
      res.status(400).json({ error: 'Invalid credentials' }); // don't leak which field
      return;
    }
    try {
      const { deviceKey, userAgent, ip } = getDeviceContext(req);
      const result = await authService.login(email.trim().toLowerCase(), password, deviceKey, userAgent, ip);
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
      const { deviceKey, userAgent, ip } = getDeviceContext(req);
      const result = await authService.googleLogin(credential, deviceKey, userAgent, ip);
      res.json(result);
    } catch (err) {
      console.error('[Auth] google error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(401).json({ error: msg });
    }
  });

  // POST /auth/verification/resend — rate limited
  router.post('/verification/resend', verificationResendLimiter, async (req: Request, res: Response) => {
    const { email } = req.body as { email?: string };
    if (!email?.trim()) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (email.length > 254) { res.status(400).json({ error: 'Invalid email' }); return; }
    try {
      await authService.resendVerification(email.trim().toLowerCase());
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
      const { deviceKey, userAgent } = getDeviceContext(req);
      const result = await authService.verifyEmail(token, deviceKey, userAgent);
      res.json(result);
    } catch (err) {
      console.error('[Auth] verify email error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  // POST /auth/password/forgot — rate limited
  router.post('/password/forgot', forgotPasswordLimiter, async (req: Request, res: Response) => {
    const { email } = req.body as { email?: string };
    if (!email?.trim()) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (email.length > 254) { res.status(400).json({ error: 'Invalid email' }); return; }
    try {
      const result = await authService.forgotPassword(email.trim().toLowerCase());
      // Always return ok to avoid account enumeration.
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

  // PATCH /auth/me
  router.patch('/me', requireAuth, async (req: Request, res: Response) => {
    try {
      const { name, settings } = req.body;
      let updatedUser = null;

      if (name !== undefined) {
        if (typeof name !== 'string') {
          res.status(400).json({ error: 'Name must be a string' });
          return;
        }
        updatedUser = await authService.updateProfile(req.user!.sub, name.trim());
      }

      if (settings !== undefined) {
        updatedUser = await authService.updateSettings(req.user!.sub, settings);
      }

      if (!updatedUser) {
        res.status(400).json({ error: 'At least one field (name or settings) is required' });
        return;
      }

      res.json({ user: updatedUser });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  return router;
}
