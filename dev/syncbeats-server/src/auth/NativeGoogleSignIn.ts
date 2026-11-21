import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import prisma from '../db/prisma';
import { AuthService, AuthResult } from './AuthService';
import { loginLimiter } from '../middleware/rateLimiter';

export const NATIVE_GOOGLE_TTL_MS = 90_000;
export interface NativeGoogleAuthenticating {
  googleLogin(credential: string, deviceKey?: string | null, userAgent?: string | null, ip?: string | null, expectedNonce?: string): Promise<AuthResult>;
  nativeLogin(userId: string, deviceKey?: string | null, userAgent?: string | null, ip?: string | null): Promise<AuthResult>;
}
const hash = (value: string) => createHash('sha256').update(value).digest('base64url');
const token = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const verifier = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(value);
class NativeGoogleError extends Error { constructor(public status: number, message: string) { super(message); } }

export class NativeGoogleSignIn {
  constructor(private auth: NativeGoogleAuthenticating = new AuthService(), private now = () => new Date()) {}
  async issue(credential: unknown, challenge: unknown, nonce: unknown) {
    if (typeof credential !== 'string' || !credential || credential.length > 12000 || !token(challenge) || !token(nonce)) {
      throw new NativeGoogleError(400, 'Invalid native Google sign-in request.');
    }
    const identity = await this.auth.googleLogin(credential, undefined, undefined, undefined, nonce as string);
    const code = randomBytes(32).toString('base64url');
    await prisma.nativeAuthCode.deleteMany({ where: { expiresAt: { lte: this.now() } } });
    await prisma.nativeAuthCode.create({ data: { codeHash: hash(code), codeChallenge: challenge as string,
      userId: identity.user.id, expiresAt: new Date(this.now().getTime() + NATIVE_GOOGLE_TTL_MS) } });
    return { version: 1, code, expiresIn: NATIVE_GOOGLE_TTL_MS / 1000 };
  }
  async exchange(code: unknown, supplied: unknown, deviceKey?: string | null, userAgent?: string | null, ip?: string | null) {
    const rejected = () => new NativeGoogleError(401, 'Sign-in expired or could not be verified. Please try again.');
    if (!token(code) || !verifier(supplied)) throw rejected();
    const pending = await prisma.nativeAuthCode.findUnique({ where: { codeHash: hash(code as string) } });
    if (!pending || pending.expiresAt <= this.now()) throw rejected();
    const expected = Buffer.from(pending.codeChallenge), actual = Buffer.from(hash(supplied as string));
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw rejected();
    // Only one request may consume a handoff, including across server instances.
    const consumed = await prisma.nativeAuthCode.deleteMany({ where: { id: pending.id, expiresAt: { gt: this.now() } } });
    if (consumed.count !== 1) throw rejected();
    return this.auth.nativeLogin(pending.userId, deviceKey, userAgent, ip);
  }
}

export function nativeGoogleRoutes(auth?: NativeGoogleAuthenticating) {
  const router = Router(); const service = new NativeGoogleSignIn(auth);
  router.use(loginLimiter);
  router.get('/', (_req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID) { res.status(503).json({ error: 'Google sign-in is not configured on this server.' }); return; }
    res.setHeader('Cache-Control', 'no-store'); res.json({ version: 1 });
  });
  router.post('/', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(await service.issue(req.body?.credential, req.body?.codeChallenge, req.body?.nonce)); }
    catch (error) { res.status(error instanceof NativeGoogleError ? error.status : 401).json({ error: error instanceof NativeGoogleError ? error.message : 'Google sign-in could not be verified. Please try again.' }); }
  });
  router.post('/exchange', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const deviceKey = req.get('x-device-id') || null;
      if (deviceKey && (deviceKey.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(deviceKey))) throw new NativeGoogleError(400, 'Invalid device identity.');
      res.json(await service.exchange(req.body?.code, req.body?.verifier, deviceKey, req.get('user-agent'), req.ip));
    } catch (error) { res.status(error instanceof NativeGoogleError ? error.status : 500).json({ error: error instanceof NativeGoogleError ? error.message : 'Could not finish sign-in. Please try again.' }); }
  });
  return router;
}
