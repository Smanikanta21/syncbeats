// auth/UserRepository.ts — Prisma client for users table

import prisma from '../db/prisma';

export interface UserRow {
  id:            string;
  name:          string;
  email:         string;
  password_hash: string;
  created_at:    Date;
}

export interface PublicUser {
  id:         string;
  name:       string;
  email:      string;
  created_at: Date;
}

export class UserRepository {
  async findByEmail(email: string): Promise<UserRow | null> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    return user ? this.toUserRow(user) : null;
  }

  async findById(id: string): Promise<PublicUser | null> {
    const user = await prisma.user.findUnique({
      where: { id },
    });
    return user ? this.toPublicUser(user) : null;
  }

  async create(name: string, email: string, passwordHash: string): Promise<PublicUser> {
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
      },
    });
    return this.toPublicUser(user);
  }

  async emailExists(email: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    return !!user;
  }

  private toUserRow(user: any): UserRow {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      password_hash: user.passwordHash,
      created_at: user.createdAt,
    };
  }

  private toPublicUser(user: any): PublicUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      created_at: user.createdAt,
    };
  }
}
