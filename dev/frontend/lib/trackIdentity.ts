import { ytId } from './youtube';

/** Keep the existing bare-video-ID cache key while unifying its transport aliases. */
export function trackCacheKey(url: string): string {
  return ytId(url) ?? url.trim();
}

export function isSameTrack(a?: string | null, b?: string | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return trackCacheKey(a) === trackCacheKey(b);
}
