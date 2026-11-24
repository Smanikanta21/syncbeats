interface OutputClock {
  state: string;
  currentTime: number;
  getOutputTimestamp?: () => { contextTime?: number; performanceTime?: number };
}

/** Map the device output clock to media time rather than assuming rendered audio is audible. */
export function outputPlaybackPosition(context: OutputClock | null, startedAt: number,
  offset: number, rate: number, performanceNow: number): number | null {
  if (!context || context.state !== 'running' || !context.getOutputTimestamp) return null;
  try {
    const { contextTime, performanceTime } = context.getOutputTimestamp();
    if (contextTime == null || performanceTime == null || !Number.isFinite(contextTime) ||
        !Number.isFinite(performanceTime) || contextTime <= 0 || performanceTime <= 0) return null;
    const ageMs = performanceNow - performanceTime;
    if (ageMs < 0 || ageMs > 1000) return null;
    const outputTime = contextTime + ageMs / 1000;
    if (outputTime < startedAt || outputTime > context.currentTime + 0.05) return null;
    const position = offset + (outputTime - startedAt) * rate;
    return Number.isFinite(position) ? position : null;
  } catch { return null; }
}
