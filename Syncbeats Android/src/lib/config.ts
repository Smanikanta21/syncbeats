// Same production origin used by the Swift client. /api proxy bases are also supported.
export function parseServerURL(raw: string) {
  const url = new URL(raw.trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use a complete HTTP or HTTPS backend URL without credentials or query parameters.');
  }
  const base = url.href.replace(/\/$/, '');
  return { base, origin: url.origin, socketPath: `${url.pathname.replace(/\/$/, '')}/socket.io` };
}

export const server = parseServerURL(process.env.EXPO_PUBLIC_SERVER_URL || 'https://api.syncbeats.in');
export const website = 'https://syncbeats.in';
