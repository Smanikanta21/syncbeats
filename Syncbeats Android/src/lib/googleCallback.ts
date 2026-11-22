export const googleRedirectURI = 'syncbeats-android://google/callback';

export function googleCode(callback: string, expectedState: string, startedAt: number, now = Date.now()) {
  const url = new URL(callback);
  if (now < startedAt || now - startedAt > 600_000 || url.protocol !== 'syncbeats-android:' || url.host !== 'google' || url.pathname !== '/callback' ||
    url.username || url.password || url.port || url.hash || url.searchParams.has('error') ||
    url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== expectedState ||
    url.searchParams.getAll('code').length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('code') || '')) {
    throw new Error('Google sign-in could not be completed. Please try again.');
  }
  return url.searchParams.get('code')!;
}
