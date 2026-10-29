export interface DurableRoomState {
  state: string;
  positionMs: number;
  trackUrl: string | null;
  queue: unknown;
}

/** Coalesced atomic snapshots, with at most one database write per room in flight. */
export class RoomPersistence {
  private pending = new Map<string, DurableRoomState>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private inFlight = new Map<string, Promise<void>>();
  private failures = new Map<string, number>();
  private closing = false;

  constructor(
    private readonly write: (roomId: string, state: DurableRoomState) => Promise<void>,
    private readonly onError: (roomId: string, error: unknown) => void,
    private readonly delayMs = 1000,
  ) {}

  schedule(roomId: string, state: DurableRoomState): void {
    // Queue items are mutable inside RoomQueue. A pending write must own its bytes.
    this.pending.set(roomId, structuredClone(state));
    if (!this.closing && !this.timers.has(roomId) && !this.inFlight.has(roomId)) {
      this.arm(roomId, this.delayMs);
    }
  }

  private arm(roomId: string, delay: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(roomId);
      void this.drain(roomId).catch(error => this.onError(roomId, error));
    }, delay);
    timer.unref();
    this.timers.set(roomId, timer);
  }

  private drain(roomId: string): Promise<void> {
    const active = this.inFlight.get(roomId);
    if (active) return active;
    const timer = this.timers.get(roomId);
    if (timer) clearTimeout(timer);
    this.timers.delete(roomId);

    const run = (async () => {
      while (this.pending.has(roomId)) {
        const state = this.pending.get(roomId)!;
        this.pending.delete(roomId);
        try {
          await this.write(roomId, state);
          this.failures.delete(roomId);
        } catch (error) {
          // Retain the most recent state, including a mutation received during this write.
          if (!this.pending.has(roomId)) this.pending.set(roomId, state);
          this.failures.set(roomId, (this.failures.get(roomId) ?? 0) + 1);
          throw error;
        }
      }
    })().finally(() => {
      this.inFlight.delete(roomId);
      if (!this.closing && this.pending.has(roomId)) {
        this.arm(roomId, Math.min(10_000, 1000 * 2 ** Math.min(4, this.failures.get(roomId) ?? 0)));
      }
    });
    this.inFlight.set(roomId, run);
    return run;
  }

  /** Call after accepting connections/mutations stops, before disconnecting Prisma. */
  async flush(): Promise<void> {
    this.closing = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    while (this.pending.size || this.inFlight.size) {
      const rooms = new Set([...this.pending.keys(), ...this.inFlight.keys()]);
      await Promise.all([...rooms].map(roomId => this.drain(roomId)));
    }
  }
}
