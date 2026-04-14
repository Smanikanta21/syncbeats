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
  // socketId → last N offset samples (sliding window)
  private offsets: Map<string, number[]> = new Map();
  private readonly WINDOW_SIZE = 5;

  constructor(private strategy: ISyncStrategy = new NTPSyncStrategy()) { }

  /**
   * Called when client sends sync:ping.
   * Returns { t1, t2 } to be echoed back in sync:pong.
   */
  recordPing(_socketId: string, _t0: number): { t1: number; t2: number } {
    const now = Date.now();
    return { t1: now, t2: now }; // t2 ≈ t1 for immediate turnaround
  }

  /**
   * Called when we receive the client's t3 via sync:pong ACK.
   * Returns the median clock offset in ms.
   */
  recordPong(socketId: string, t0: number, t1: number, t2: number): number {
    const t3 = Date.now();
    const offset = this.strategy.computeOffset(t0, t1, t2, t3);

    const history = this.offsets.get(socketId) ?? [];
    history.push(offset);
    if (history.length > this.WINDOW_SIZE) history.shift();
    this.offsets.set(socketId, history);

    return this.medianOffset(socketId);
  }

  getOffset(socketId: string): number {
    return this.medianOffset(socketId);
  }

  clearSocket(socketId: string): void {
    this.offsets.delete(socketId);
  }

  private medianOffset(socketId: string): number {
    const h = [...(this.offsets.get(socketId) ?? [0])].sort((a, b) => a - b);
    return h[Math.floor(h.length / 2)];
  }
}
