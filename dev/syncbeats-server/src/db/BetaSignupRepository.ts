import type { PrismaClient } from '@prisma/client';
import { BETA_CONSENT_VERSION, BETA_RETENTION_DAYS, type BetaSignupInput } from '../utils/betaSignup';

export interface BetaSignupStore {
  save(signup: BetaSignupInput): Promise<void>;
  prune(): Promise<void>;
}

export function createBetaSignupStore(db: PrismaClient): BetaSignupStore {
  return {
    async save(signup) {
      const now = new Date();
      await db.macBetaSignup.createMany({
        data: [{ ...signup, consentVersion: BETA_CONSENT_VERSION, consentedAt: now,
          expiresAt: new Date(now.getTime() + BETA_RETENTION_DAYS * 24 * 60 * 60 * 1000) }],
        skipDuplicates: true,
      });
    },
    async prune() {
      await db.macBetaSignup.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    },
  };
}
