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
