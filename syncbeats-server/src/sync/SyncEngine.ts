// ─── Step 4: NTP-style SyncEngine (Strategy pattern) ─────────────────────

export interface ISyncStrategy {
  computeOffset(t0: number, t1: number, t2: number, t3: number): number;
}

export class NTPSyncStrategy implements ISyncStrategy {
  computeOffset(t0: number, t1: number, t2: number, t3: number): number {
    // NTP formula: clock offset θ = ((t1 - t0) + (t2 - t3)) / 2
    return ((t1 - t0) + (t2 - t3)) / 2;
  }
}

export class SyncEngine {
  recordPing(_socketId: string, _t0: number): { t1: number; t2: number } {
    const now = Date.now();
    return { t1: now, t2: now }; 
  }

  clearSocket(_socketId: string): void {}
}
