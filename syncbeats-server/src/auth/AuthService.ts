// auth/AuthService.ts — Business logic for auth (hashing, JWT signing)

import bcrypt    from 'bcryptjs';
import jwt       from 'jsonwebtoken';
import { UserRepository, PublicUser } from './UserRepository';
import { DeviceRepository, PublicDevice } from '../db/DeviceRepository';

const SALT_ROUNDS = 12;

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

  async register(name: string, email: string, password: string, deviceKey?: string | null, userAgent?: string | null): Promise<AuthResult> {
    if (!name?.trim())     throw new Error('Name is required');
    if (!email?.trim())    throw new Error('Email is required');
    if (password.length < 8) throw new Error('Password must be at least 8 characters');

    if (await this.repo.emailExists(email)) {
      throw new Error('An account with this email already exists');
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.repo.create(name, email, hash);
    const device = deviceKey ? await this.devices.ensureForUser(user.id, deviceKey, userAgent ?? null, user.name) : null;
    const token = this.signToken(user);
    return { user, token, device: device?.device ?? null, needsDeviceRename: device?.created ?? false };
  }

  async login(email: string, password: string, deviceKey?: string | null, userAgent?: string | null): Promise<AuthResult> {
    const row = await this.repo.findByEmail(email);
    if (!row) throw new Error('Invalid email or password');

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) throw new Error('Invalid email or password');

    const { password_hash: _, ...user } = row;
    const token = this.signToken(user as PublicUser);
    const device = deviceKey ? await this.devices.ensureForUser(user.id, deviceKey, userAgent ?? null, user.name) : null;
    return { user: user as PublicUser, token, device: device?.device ?? null, needsDeviceRename: device?.created ?? false };
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
