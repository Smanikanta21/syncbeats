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
const RESET_OTP_LENGTH = 6;

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

  private buildEmailLayout(title: string, intro: string, actionLabel: string, actionUrl: string, expiryText: string): string {
    return `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#0b0b0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e4e4e7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 16px;background:#0b0b0d;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#121217;border:1px solid #27272a;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 8px 24px;">
                <p style="margin:0;color:#a1a1aa;font-size:11px;letter-spacing:0.18em;font-weight:700;text-transform:uppercase;">SyncBeats</p>
                <h1 style="margin:14px 0 0 0;color:#fafafa;font-size:26px;line-height:1.2;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 24px 0 24px;">
                <p style="margin:0;color:#d4d4d8;font-size:15px;line-height:1.6;">${intro}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 24px 0 24px;">
                <a href="${actionUrl}" style="display:inline-block;background:#f4f4f5;color:#09090b;text-decoration:none;padding:12px 18px;border-radius:12px;font-size:14px;font-weight:700;">${actionLabel}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px 0 24px;">
                <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.6;">${expiryText}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px 24px 24px;">
                <p style="margin:0;color:#71717a;font-size:12px;line-height:1.6;">
                  If the button does not work, copy and paste this link into your browser:<br />
                  <a href="${actionUrl}" style="color:#d4d4d8;word-break:break-all;">${actionUrl}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private buildVerifyEmailHtml(name: string, verifyUrl: string): string {
    return this.buildEmailLayout(
      'Verify your email',
      `Hi ${name}, thanks for joining SyncBeats. Verify your email to finish setting up your account.`,
      'Verify Email',
      verifyUrl,
      'This verification link expires in 24 hours.'
    );
  }

  private buildWelcomeEmailContent(name: string, actionLabel: string, actionUrl: string, footerText: string = ''): string {
    return `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#0b0b0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e4e4e7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 16px;background:#0b0b0d;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#121217;border:1px solid #27272a;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 8px 24px;">
                <p style="margin:0;color:#a1a1aa;font-size:11px;letter-spacing:0.18em;font-weight:700;text-transform:uppercase;">SyncBeats</p>
                <h1 style="margin:14px 0 0 0;color:#fafafa;font-size:26px;line-height:1.2;">Welcome to SyncBeats, ${name}! 🎵</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 24px 0 24px;">
                <p style="margin:0;color:#d4d4d8;font-size:15px;line-height:1.6;">We're thrilled to have you on board! SyncBeats is the best way to listen to music in perfect sync with your friends, no matter where they are.</p>
                <p style="margin:16px 0 0 0;color:#d4d4d8;font-size:15px;line-height:1.6;"><strong>Here is a quick guide to get you started:</strong></p>
                <ul style="margin:12px 0 0 0;padding-left:20px;color:#d4d4d8;font-size:14px;line-height:1.6;">
                  <li style="margin-bottom:8px;"><strong>1. Create a Room:</strong> Head to the Hub and start a new listening session.</li>
                  <li style="margin-bottom:8px;"><strong>2. Add Music:</strong> Search for your favorite YouTube tracks or upload local files.</li>
                  <li style="margin-bottom:8px;"><strong>3. Invite Friends:</strong> Click the "Share" button to copy your room code and send it to friends.</li>
                  <li><strong>4. Sync & Listen:</strong> Hit play and enjoy perfectly synchronized playback across all devices!</li>
                </ul>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 24px 0 24px;">
                <a href="${actionUrl}" style="display:inline-block;background:#f4f4f5;color:#09090b;text-decoration:none;padding:12px 18px;border-radius:12px;font-size:14px;font-weight:700;">${actionLabel}</a>
              </td>
            </tr>
            ${footerText ? `
            <tr>
              <td style="padding:18px 24px 0 24px;">
                <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.6;">${footerText}</p>
              </td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding:18px 24px 24px 24px;">
                <p style="margin:0;color:#71717a;font-size:12px;line-height:1.6;">
                  If the button does not work, copy and paste this link into your browser:<br />
                  <a href="${actionUrl}" style="color:#d4d4d8;word-break:break-all;">${actionUrl}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private buildWelcomeHtml(name: string): string {
    return this.buildWelcomeEmailContent(name, 'Go to Hub', `${this.getPublicAppUrl()}/hub`);
  }

  private buildWelcomeWithVerificationHtml(name: string, verifyUrl: string): string {
    return this.buildWelcomeEmailContent(name, 'Verify Email & Start Listening', verifyUrl, 'This verification link expires in 24 hours.');
  }

  private buildResetPasswordOtpHtml(name: string, otp: string): string {
    return `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#0b0b0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e4e4e7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 16px;background:#0b0b0d;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#121217;border:1px solid #27272a;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 8px 24px;">
                <p style="margin:0;color:#a1a1aa;font-size:11px;letter-spacing:0.18em;font-weight:700;text-transform:uppercase;">SyncBeats</p>
                <h1 style="margin:14px 0 0 0;color:#fafafa;font-size:26px;line-height:1.2;">Reset your password</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 24px 0 24px;">
                <p style="margin:0;color:#d4d4d8;font-size:15px;line-height:1.6;">Hi ${name}, use the OTP below to reset your SyncBeats password.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 0 24px;">
                <div style="display:inline-block;border:1px solid #3f3f46;background:#18181b;border-radius:14px;padding:12px 16px;color:#fafafa;font-size:28px;letter-spacing:0.2em;font-weight:800;">${otp}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px 24px 24px;">
                <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.6;">This OTP expires in 30 minutes. If you did not request this, you can safely ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private makeRawToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private makeNumericOtp(length: number): string {
    const min = 10 ** (length - 1);
    const max = 10 ** length;
    const value = crypto.randomInt(min, max);
    return String(value);
  }

  private getPublicAppUrl(): string {
    return process.env.FRONTEND_URL || "https://syncbeats.app";
  }

  private async sendEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const authAddress = process.env.AUTH_FROM_EMAIL;
    const from = authAddress ? `SYNCBEATS <${authAddress}>` : authAddress;
    if (!apiKey || !from) {
      throw new Error('Email service is not configured. Set RESEND_API_KEY and AUTH_FROM_EMAIL.');
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });

    const rawBody = await response.text();
    if (!response.ok) {
      throw new Error(`Resend email send failed: ${rawBody}`);
    }

    console.info(`[Auth] Email queued via Resend to ${to}. response=${rawBody}`);
  }

  private async issueEmailVerification(user: PublicUser, isNewUser: boolean = false): Promise<void> {
    if (user.email_verified_at) return;
    const rawToken = this.makeRawToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

    await this.repo.setEmailVerificationToken(user.id, tokenHash, expiresAt);

    const verifyUrl = `${this.getPublicAppUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
    
    if (isNewUser) {
      await this.sendEmail(
        user.email,
        'Welcome to SyncBeats! Please verify your email 🎵',
        this.buildWelcomeWithVerificationHtml(user.name, verifyUrl)
      );
    } else {
      await this.sendEmail(
        user.email,
        'Verify your SyncBeats email',
        this.buildVerifyEmailHtml(user.name, verifyUrl)
      );
    }
  }

  async checkEmail(email: string): Promise<boolean> {
    if (!email?.trim()) return false;
    return await this.repo.emailExists(email);
  }

  async register(name: string, email: string, password: string): Promise<void> {
    if (!name?.trim())     throw new Error('Name is required');
    if (!email?.trim())    throw new Error('Email is required');
    if (password.length < 8) throw new Error('Password must be at least 8 characters');

    const existing = await this.repo.findByEmail(email);
    if (existing) {
      if (existing.auth_provider === 'GOOGLE' || !existing.password_hash || existing.password_hash === 'temp_hash_change_me') {
        const { devOtp } = await this.forgotPassword(email);
        const extra = devOtp ? ` [DEV_OTP:${devOtp}]` : '';
        throw new Error(`GOOGLE_AUTH_SETUP_PASSWORD: You already have a Google account. An OTP has been sent to your email so you can set up a local password.${extra}`);
      }
      throw new Error('An account with this email already exists');
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.repo.create(name, email, hash);
    await this.issueEmailVerification(user, true);
  }

  async login(email: string, password: string, deviceKey?: string | null, userAgent?: string | null): Promise<AuthResult> {
    const row = await this.repo.findByEmail(email);
    if (!row) throw new Error('User not found , Register first');

    if (row.auth_provider === 'GOOGLE' || !row.password_hash || row.password_hash === 'temp_hash_change_me') {
      const { devOtp } = await this.forgotPassword(email);
      const extra = devOtp ? ` [DEV_OTP:${devOtp}]` : '';
      throw new Error(`GOOGLE_AUTH_SETUP_PASSWORD: An OTP has been sent to your email to set up a local password.${extra}`);
    }

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) throw new Error('Invalid password');

    if (!row.email_verified_at) {
      await this.issueEmailVerification(row as unknown as PublicUser, false);
      throw new Error('UNVERIFIED_EMAIL: We have sent a new verification link to your email. Please verify before logging in.');
    }

    const { password_hash: _, ...user } = row;
    const loggedInUser = (await this.repo.setLastLoginAt(user.id)) ?? (user as PublicUser);
    const token = this.signToken(loggedInUser);
    const device = deviceKey ? await this.devices.ensureForUser(user.id, deviceKey, userAgent ?? null, user.name) : null;
    return { user: loggedInUser, token, device: device?.device ?? null, needsDeviceRename: device?.created ?? false };
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
    let isNewUser = false;
    
    if (!row) {
      const existingByEmail = await this.repo.findByEmail(email);
      if (existingByEmail) {
        await this.repo.linkGoogleAccount(existingByEmail.id, googleId);
        row = await this.repo.findByEmail(email);
      } else {
        await this.repo.createGoogleUser(name, email, googleId);
        row = await this.repo.findByGoogleId(googleId);
        isNewUser = true;
      }
    }

    if (!row) throw new Error('Unable to create Google account');

    if (isNewUser) {
      await this.sendEmail(
        row.email,
        'Welcome to SyncBeats! 🎵',
        this.buildWelcomeHtml(row.name)
      ).catch(err => {
        console.error('[Auth] Failed to send welcome email for Google OAuth:', err);
      });
    }

    const { password_hash: _, ...user } = row;
    const loggedInUser = (await this.repo.setLastLoginAt(user.id)) ?? (user as PublicUser);
    const token = this.signToken(loggedInUser);
    const device = deviceKey ? await this.devices.ensureForUser(user.id, deviceKey, userAgent ?? null, user.name) : null;
    return { user: loggedInUser, token, device: device?.device ?? null, needsDeviceRename: device?.created ?? false };
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
      last_login_at: row.last_login_at,
      created_at: row.created_at,
    }, false);
  }

  async verifyEmail(token: string, deviceKey?: string | null, userAgent?: string | null): Promise<AuthResult> {
    const tokenHash = this.hashToken(token);
    const row = await this.repo.findByEmailVerificationTokenHash(tokenHash);
    if (!row) throw new Error('Invalid or expired verification token');
    await this.repo.markEmailVerified(row.id);

    const verifiedUser = await this.repo.setLastLoginAt(row.id);
    if (!verifiedUser) throw new Error('User not found after verification');

    const tokenValue = this.signToken(verifiedUser);
    const device = deviceKey
      ? await this.devices.ensureForUser(verifiedUser.id, deviceKey, userAgent ?? null, verifiedUser.name)
      : null;

    return {
      user: verifiedUser,
      token: tokenValue,
      device: device?.device ?? null,
      needsDeviceRename: device?.created ?? false,
    };
  }

  async forgotPassword(email: string): Promise<{ devOtp?: string }> {
    const row = await this.repo.findByEmail(email);
    if (!row) {
      throw new Error('Account not found for this email');
    }

    const otp = this.makeNumericOtp(RESET_OTP_LENGTH);
    const tokenHash = this.hashToken(otp);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await this.repo.setPasswordResetToken(row.id, tokenHash, expiresAt);

    await this.sendEmail(
      row.email,
      'Your SyncBeats password reset OTP',
      this.buildResetPasswordOtpHtml(row.name, otp),
      `Hi ${row.name}, your SyncBeats password reset OTP is ${otp}. This OTP expires in 30 minutes.`
    );

    return process.env.NODE_ENV === 'production' ? {} : { devOtp: otp };
  }

  async resetPassword(token: string, password: string): Promise<void> {
    if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');
    const tokenHash = this.hashToken(token);
    const row = await this.repo.findByPasswordResetTokenHash(tokenHash);
    if (!row) throw new Error('Invalid or expired reset token');

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await this.repo.resetPassword(row.id, hash);
  }

  async resetPasswordWithOtp(email: string, otp: string, password: string): Promise<void> {
    if (!email?.trim()) throw new Error('Email is required');
    if (!otp?.trim()) throw new Error('OTP is required');
    if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');

    const tokenHash = this.hashToken(otp.trim());
    const row = await this.repo.findByEmailAndPasswordResetTokenHash(email, tokenHash);
    if (!row) throw new Error('Invalid or expired OTP');

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await this.repo.resetPassword(row.id, hash);
  }

  async verifyPasswordResetOtp(email: string, otp: string): Promise<void> {
    if (!email?.trim()) throw new Error('Email is required');
    if (!otp?.trim()) throw new Error('OTP is required');

    const tokenHash = this.hashToken(otp.trim());
    const row = await this.repo.findByEmailAndPasswordResetTokenHash(email, tokenHash);
    if (!row) throw new Error('Invalid or expired OTP');
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
    if (!jwtSecret) throw new Error('JWT_SECRET not configured');
    const payload: TokenPayload = { sub: user.id, email: user.email, name: user.name };
    // Token does not expire by default for this project requirement.
    return jwt.sign(payload, jwtSecret);
  }
}
