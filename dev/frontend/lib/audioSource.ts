/** Old room snapshots can contain a laptop's previous LAN address. */
export function localAudioSource(source: string, development: boolean): string {
  if (!development) return source;
  try {
    const url = new URL(source);
    const parts = url.hostname.split('.').map(Number);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' ||
      (parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255) &&
        (parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)));
    if (local && url.port === '4000' && (/^\/files\//.test(url.pathname) || url.pathname === '/search/youtube/download' || /^\/rooms\/[^/]+\/yt-proxy$/.test(url.pathname))) {
      return `/api${url.pathname}${url.search}`;
    }
  } catch { /* Relative URLs and track IDs already use the normal resolver. */ }
  return source;
}
