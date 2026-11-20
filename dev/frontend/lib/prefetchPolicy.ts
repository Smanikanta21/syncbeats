const DEFAULT_SPEED_BPS = 300_000;

export function validDownloadSpeed(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.max(10_000, Math.min(50_000_000, value)) : DEFAULT_SPEED_BPS;
}

/** All inputs and the return value use seconds, except sizes/speed in bytes. */
export function prefetchDelay(duration: number, currentTime: number, speed: number, sizeBytes?: number, nextDuration?: number, lazy = false): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const remaining = Math.max(0, duration - (Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0));
  const size = sizeBytes && Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes
    : nextDuration && Number.isFinite(nextDuration) && nextDuration > 0 ? nextDuration * 20_000 : 5_000_000;
  const preparation = size / validDownloadSpeed(speed) + 2 + 20 + (lazy ? 8 : 0);
  return Math.max(0, remaining - preparation);
}
