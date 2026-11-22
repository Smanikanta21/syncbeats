// The auth-session listener consumes the original callback. Keep credentials out of router history.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try { if (['syncbeats-android:', 'syncbeats:'].includes(new URL(path).protocol) && new URL(path).host === 'google') return '/login'; } catch {}
  return path;
}
