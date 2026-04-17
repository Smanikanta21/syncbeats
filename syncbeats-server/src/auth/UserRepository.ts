// auth/UserRepository.ts — Prisma client for users table

import prisma from '../db/prisma';

export interface UserRow {
  id:            string;
  name:          string;
  email:         string;
  password_hash: string | null;
  auth_provider: string;
  google_id: string | null;
  email_verified_at: Date | null;
  email_verification_token_hash: string | null;
  email_verification_expires_at: Date | null;
  password_reset_token_hash: string | null;
  password_reset_expires_at: Date | null;
  created_at:    Date;
}

export interface PublicUser {
  id:         string;
  name:       string;
  email:      string;
  auth_provider: string;
  email_verified_at: Date | null;
  created_at: Date;
}

export class UserRepository {
  async findByEmail(email: string): Promise<UserRow | null> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    }) as any;
    return user ? this.toUserRow(user) : null;
  }

  async findByGoogleId(googleId: string): Promise<UserRow | null> {
    const user = await prisma.user.findUnique({
      where: { googleId },
    }) as any;
    return user ? this.toUserRow(user) : null;
  }

  async findByEmailVerificationTokenHash(tokenHash: string): Promise<UserRow | null> {
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: { gt: new Date() },
      },
    }) as any;
    return user ? this.toUserRow(user) : null;
  }

  async findByPasswordResetTokenHash(tokenHash: string): Promise<UserRow | null> {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { gt: new Date() },
      },
    }) as any;
    return user ? this.toUserRow(user) : null;
  }

  async findByEmailAndPasswordResetTokenHash(email: string, tokenHash: string): Promise<UserRow | null> {
    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase().trim(),
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { gt: new Date() },
      },
    }) as any;
    return user ? this.toUserRow(user) : null;
  }

  async findById(id: string): Promise<PublicUser | null> {
    const user = await prisma.user.findUnique({
      where: { id },
    }) as any;
    return user ? this.toPublicUser(user) : null;
  }

  async create(name: string, email: string, passwordHash: string | null): Promise<PublicUser> {
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
      },
    }) as any;
    return this.toPublicUser(user);
  }

  async createGoogleUser(name: string, email: string, googleId: string): Promise<PublicUser> {
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash: null,
        authProvider: 'GOOGLE',
        googleId,
        emailVerifiedAt: new Date(),
      },
    }) as any;
    return this.toPublicUser(user);
  }

  async emailExists(email: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    return !!user;
  }

  async setEmailVerificationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: expiresAt,
      },
    });
  }

  async markEmailVerified(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    });
  }

  async setPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: expiresAt,
      },
    });
  }

  async resetPassword(userId: string, passwordHash: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        authProvider: 'LOCAL',
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });
  }

  async linkGoogleAccount(userId: string, googleId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleId,
        authProvider: 'GOOGLE',
        emailVerifiedAt: new Date(),
      },
    });
  }

  private toUserRow(user: any): UserRow {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      password_hash: user.passwordHash,
      auth_provider: user.authProvider,
      google_id: user.googleId ?? null,
      email_verified_at: user.emailVerifiedAt ?? null,
      email_verification_token_hash: user.emailVerificationTokenHash ?? null,
      email_verification_expires_at: user.emailVerificationExpiresAt ?? null,
      password_reset_token_hash: user.passwordResetTokenHash ?? null,
      password_reset_expires_at: user.passwordResetExpiresAt ?? null,
      created_at: user.createdAt,
    };
  }

  private toPublicUser(user: any): PublicUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      auth_provider: user.authProvider,
      email_verified_at: user.emailVerifiedAt ?? null,
      created_at: user.createdAt,
    };
  }
}
