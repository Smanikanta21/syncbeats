// auth/AuthService.ts — Business logic for auth (hashing, JWT signing)

import bcrypt    from 'bcryptjs';
import jwt       from 'jsonwebtoken';
import crypto    from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { UserRepository, PublicUser } from './UserRepository';
import { DeviceRepository, PublicDevice } from '../db/DeviceRepository';

const SALT_ROUNDS = 12;
const VERIFY_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const RESET_TOKEN_TTL_MS = 1000 * 60 * 30; // 30m

export interface TokenPayload {
  sub:   string;   // user id
  email: string;
  name:  string;
}

export interface AuthResult {
  user:  PublicUser;
  token: string;
  device: PublicDevice | null;
  needsDeviceRename: boolean;
}

export class AuthService {
  private repo = new UserRepository();
  private devices = new DeviceRepository();
  private googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private makeRawToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private getPublicAppUrl(): string {
    return process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      console.warn('[Auth] RESEND_API_KEY or RESEND_FROM_EMAIL is missing; skipping email send.');
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend email send failed: ${body}`);
    }
  }

  private async issueEmailVerification(user: PublicUser): Promise<void> {
    if (user.email_verified_at) return;
    const rawToken = this.makeRawToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

    await this.repo.setEmailVerificationToken(user.id, tokenHash, expiresAt);

    const verifyUrl = `${this.getPublicAppUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
    await this.sendEmail(
      user.email,
      'Verify your SyncBeats email',
      `<p>Hi ${user.name},</p><p>Verify your email to finish setting up your account:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`
    );
  }

  async register(name: string, email: string, password: string, deviceKey?: string | null, userAgent?: string | null): Promise<AuthResult> {
    if (!name?.trim())     throw new Error('Name is required');
    if (!email?.trim())    throw new Error('Email is required');
    if (password.length < 8) throw new Error('Password must be at least 8 characters');

    if (await this.repo.emailExists(email)) {
      throw new Error('An account with this email already exists');
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.repo.create(name, email, hash);
    await this.issueEmailVerification(user);
    const device = deviceKey ? await this.devices.ensureForUser(user.id, deviceKey, userAgent ?? null, user.name) : null;
    const token = this.signToken(user);
    return { user, token, device: device?.device ?? null, needsDeviceRename: device?.created ?? false };
  }

  async login(email: string, password: string, deviceKey?: string | null, userAgent?: string | null): Promise<AuthResult> {
    const row = await this.repo.findByEmail(email);
    if (!row) throw new Error('User not found , Register first');

    if (!row.password_hash) throw new Error('This account uses Google sign-in. Use Google login.');

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) throw new Error('Invalid password');

    if (!row.email_verified_at) throw new Error('Please verify your email before logging in');

    const { password_hash: _, ...user } = row;
    const token = this.signToken(user as PublicUser);
    const device = deviceKey ? await this.devices.ensureForUser(user.id, deviceKey, userAgent ?? null, user.name) : null;
    return { user: user as PublicUser, token, device: device?.device ?? null, needsDeviceRename: device?.created ?? false };
  }

  async googleLogin(credential: string, deviceKey?: string | null, userAgent?: string | null): Promise<AuthResult> {
    const audience = process.env.GOOGLE_CLIENT_ID;
    if (!audience) throw new Error('GOOGLE_CLIENT_ID is not configured');

    const ticket = await this.googleClient.verifyIdToken({ idToken: credential, audience });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.sub) {
      throw new Error('Invalid Google token payload');
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase().trim();
    const name = payload.name?.trim() || email.split('@')[0] || 'Google User';

    let row = await this.repo.findByGoogleId(googleId);
    if (!row) {
      const existingByEmail = await this.repo.findByEmail(email);
      if (existingByEmail) {
        await this.repo.linkGoogleAccount(existingByEmail.id, googleId);
        row = await this.repo.findByEmail(email);
      } else {
        await this.repo.createGoogleUser(name, email, googleId);
        row = await this.repo.findByGoogleId(googleId);
      }
    }

    if (!row) throw new Error('Unable to create Google account');

    const { password_hash: _, ...user } = row;
    const token = this.signToken(user as PublicUser);
    const device = deviceKey ? await this.devices.ensureForUser(user.id, deviceKey, userAgent ?? null, user.name) : null;
    return { user: user as PublicUser, token, device: device?.device ?? null, needsDeviceRename: device?.created ?? false };
  }

  async resendVerification(email: string): Promise<void> {
    const row = await this.repo.findByEmail(email);
    if (!row || row.email_verified_at) return;

    await this.issueEmailVerification({
      id: row.id,
      name: row.name,
      email: row.email,
      auth_provider: row.auth_provider,
      email_verified_at: row.email_verified_at,
      created_at: row.created_at,
    });
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const row = await this.repo.findByEmailVerificationTokenHash(tokenHash);
    if (!row) throw new Error('Invalid or expired verification token');
    await this.repo.markEmailVerified(row.id);
  }

  async forgotPassword(email: string): Promise<void> {
    const row = await this.repo.findByEmail(email);
    if (!row) return;

    const rawToken = this.makeRawToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await this.repo.setPasswordResetToken(row.id, tokenHash, expiresAt);

    const resetUrl = `${this.getPublicAppUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await this.sendEmail(
      row.email,
      'Reset your SyncBeats password',
      `<p>Hi ${row.name},</p><p>Reset your password using this link:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 30 minutes.</p>`
    );
  }

  async resetPassword(token: string, password: string): Promise<void> {
    if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');
    const tokenHash = this.hashToken(token);
    const row = await this.repo.findByPasswordResetTokenHash(tokenHash);
    if (!row) throw new Error('Invalid or expired reset token');

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await this.repo.resetPassword(row.id, hash);
  }

  async me(userId: string, deviceKey?: string | null, userAgent?: string | null): Promise<AuthResult> {
    const user = await this.repo.findById(userId);
    if (!user) throw new Error('User not found');

    const device = deviceKey ? await this.devices.ensureForUser(user.id, deviceKey, userAgent ?? null, user.name) : null;
    const token = this.signToken(user);
    return { user, token, device: device?.device ?? null, needsDeviceRename: device?.created ?? false };
  }

  verifyToken(token: string): TokenPayload {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error('JWT_SECRET not configured');
    return jwt.verify(token, jwtSecret) as TokenPayload;
  }

  private signToken(user: PublicUser): string {
    const jwtSecret = process.env.JWT_SECRET;
    const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
    if (!jwtSecret) throw new Error('JWT_SECRET not configured');
    const payload: TokenPayload = { sub: user.id, email: user.email, name: user.name };
    return jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn } as jwt.SignOptions);
  }
}
