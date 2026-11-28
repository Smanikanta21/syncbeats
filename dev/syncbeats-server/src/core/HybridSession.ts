import { createHash, randomBytes } from 'node:crypto';

export interface HybridSession {
  roomId: string;
  key: string;
  tag: string;
  expiresAt: number;
}

/** Short-lived TLS PSKs; never include JWT signing keys or room codes in Bonjour. */
export class HybridSessions {
  private sessions = new Map<string, HybridSession>();
  get(roomId: string, now = Date.now()): HybridSession {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now + 45_000) this.sessions.delete(id);
    }
    const existing = this.sessions.get(roomId);
    if (existing) return existing;
    const key = randomBytes(32).toString('base64');
    const session = {
      roomId, key, tag: createHash('sha256').update(key).digest('hex').slice(0, 24),
      expiresAt: now + 10 * 60_000,
    };
    this.sessions.set(roomId, session);
    return session;
  }
  revoke(roomId: string): void { this.sessions.delete(roomId); }
}
