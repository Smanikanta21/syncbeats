/** Optional seconds from search metadata; reject non-finite or unbounded input. */
export function trackDuration(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 86400
    ? value : undefined;
}
