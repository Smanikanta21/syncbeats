export interface ClockSample {
  t0: number;
  t1: number;
  t2: number;
  t3: number;
}

/** Offset is server time minus client time; RTT excludes server processing. */
export function estimateClockSample({ t0, t1, t2, t3 }: ClockSample) {
  return {
    offsetMs: ((t1 - t0) + (t2 - t3)) / 2,
    rttMs: (t3 - t0) - (t2 - t1),
  };
}

/** Prefer the least delayed samples; a slow WAN can bootstrap without changing its adaptive gate. */
export function selectClockOffset(
  samples: { offsetMs: number; rttMs: number }[],
  rttGateMs: number,
  allowHighRtt = false,
): number | null {
  const valid = samples.filter(s => Number.isFinite(s.offsetMs) && Number.isFinite(s.rttMs) && s.rttMs >= 0);
  const gated = valid.filter(s => s.rttMs <= rttGateMs);
  // Only bootstrap from ungated samples. Once synchronized, retain the last
  // offset when a burst is entirely noisy, rather than moving the timeline.
  const candidates = gated.length ? gated : allowHighRtt ? valid : [];
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((a, b) => a.rttMs - b.rttMs);
  const q1 = sorted[Math.floor(sorted.length * 0.25)].rttMs;
  const q3 = sorted[Math.floor(sorted.length * 0.75)].rttMs;
  const clean = sorted.filter(s => s.rttMs <= q3 + 1.5 * (q3 - q1));
  const offsets = clean.slice(0, Math.max(1, Math.ceil(clean.length * 0.35)))
    .map(s => s.offsetMs).sort((a, b) => a - b);
  return offsets[Math.floor(offsets.length / 2)];
}
