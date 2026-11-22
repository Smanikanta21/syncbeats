export type Quality = 'excellent' | 'good' | 'fair' | 'poor';
export interface SyncParams { count: number; gate: number; gap: number; resync: number; check: number; hardSeek: number }
// Mirrored from dev/frontend/hooks/useAdaptiveSync.ts. Native command timing is measured separately.
export const PARAMS: Record<Quality, SyncParams> = {
  excellent: { count: 7, gate: 150, gap: 20, resync: 10000, check: 250, hardSeek: 20 },
  good: { count: 7, gate: 250, gap: 40, resync: 12000, check: 350, hardSeek: 25 },
  fair: { count: 5, gate: 400, gap: 60, resync: 15000, check: 600, hardSeek: 35 },
  poor: { count: 4, gate: 600, gap: 100, resync: 20000, check: 1000, hardSeek: 50 },
};
export interface ClockStats { offset: number; rtt: number | null; jitter: number | null; quality: Quality; sampled: boolean }
export interface Pong { t0: number; t1: number; t2: number; seq: number }
export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
export function estimate(pong: Pong, t3: number) {
  return { rtt: (t3 - pong.t0) - (pong.t2 - pong.t1), offset: ((pong.t1 - pong.t0) + (pong.t2 - t3)) / 2 };
}
export function qualityFor(rtt: number, jitter: number): Quality {
  if (rtt < 30 && jitter < 5) return 'excellent';
  if (rtt < 80 && jitter < 15) return 'good';
  if (rtt < 200 && jitter < 40) return 'fair';
  return 'poor';
}

export interface EventSocket {
  connected: boolean;
  id?: string;
  on(event: string, handler: (...args: any[]) => void): unknown;
  off(event: string, handler: (...args: any[]) => void): unknown;
  emit(event: string, payload?: unknown): unknown;
}

export class SyncClock {
  stats: ClockStats = { offset: 0, rtt: null, jitter: null, quality: 'good', sampled: false };
  params = { ...PARAMS.good };
  private sequence = 0;
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private probes = new Map<number, { t0: number; resolve: (sample: ReturnType<typeof estimate> | null) => void; timeout: ReturnType<typeof setTimeout> }>();
  constructor(private socket: EventSocket, private roomId: string, private changed: (stats: ClockStats) => void, private now = Date.now) {
    socket.on('sync:pong', this.pong);
  }
  serverNow() { return this.now() + this.stats.offset; }
  private pong = (payload: Pong) => {
    const probe = this.probes.get(payload.seq);
    if (!probe || payload.t0 !== probe.t0 || ![payload.t0, payload.t1, payload.t2].every(Number.isFinite)) return;
    const sample = estimate(payload, this.now());
    if (sample.rtt < 0) return;
    clearTimeout(probe.timeout); this.probes.delete(payload.seq); probe.resolve(sample);
  };
  private ping(): Promise<ReturnType<typeof estimate> | null> {
    return new Promise(resolve => {
      if (!this.socket.connected) return resolve(null);
      const seq = ++this.sequence, t0 = this.now();
      const timeout = setTimeout(() => { this.probes.delete(seq); resolve(null); }, 1200);
      this.probes.set(seq, { t0, resolve, timeout });
      this.socket.emit('sync:ping', { t0, seq });
    });
  }
  async start() {
    this.stop();
    const generation = this.generation;
    const burst = async () => {
      const samples: ReturnType<typeof estimate>[] = [];
      for (let i = 0; i < this.params.count; i++) {
        if (generation !== this.generation) return;
        const sample = await this.ping();
        if (sample) samples.push(sample);
        if (i + 1 < this.params.count) await new Promise(resolve => setTimeout(resolve, this.params.gap));
      }
      if (generation !== this.generation) return;
      if (samples.length) {
        const rtts = samples.map(sample => sample.rtt).sort((a, b) => a - b);
        const rtt = median(rtts), jitter = rtts[Math.floor(rtts.length * .75)] - rtts[Math.floor(rtts.length * .25)];
        const quality = qualityFor(rtt, jitter);
        const accepted = samples.filter(sample => sample.rtt <= this.params.gate);
        if (accepted.length) {
          this.stats = { offset: median(accepted.map(sample => sample.offset)), rtt, jitter, quality, sampled: true };
          this.changed(this.stats);
          this.socket.emit('sync:stats', { roomId: this.roomId, latency: rtt, jitter });
        }
        const target = PARAMS[quality];
        for (const key of Object.keys(target) as (keyof SyncParams)[]) this.params[key] = Math.round(this.params[key] * .65 + target[key] * .35);
      }
      this.timer = setTimeout(burst, this.params.resync);
    };
    await burst();
  }
  stop() {
    ++this.generation;
    clearTimeout(this.timer);
    for (const probe of this.probes.values()) { clearTimeout(probe.timeout); probe.resolve(null); }
    this.probes.clear();
  }
  dispose() { this.stop(); this.socket.off('sync:pong', this.pong); }
}
