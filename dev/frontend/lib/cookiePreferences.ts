export const COOKIE_PREFERENCES_KEY = 'cookiePreferences';
export const COOKIE_PREFERENCES_EVENT = 'syncbeats:cookie-preferences';

export function subscribeAnalyticsConsent(callback: () => void): () => void {
  window.addEventListener(COOKIE_PREFERENCES_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(COOKIE_PREFERENCES_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

export function analyticsConsent(raw: string | null): boolean {
  try { return raw !== null && JSON.parse(raw)?.analytics === true; } catch { return false; }
}

export function readAnalyticsConsent(): boolean {
  if (typeof window === 'undefined') return false;
  try { return analyticsConsent(window.localStorage.getItem(COOKIE_PREFERENCES_KEY)); } catch { return false; }
}

export function saveAnalyticsConsent(analytics: boolean): boolean {
  try {
    window.localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify({
      essential: true, analytics, marketing: false, timestamp: new Date().toISOString(),
    }));
    window.dispatchEvent(new Event(COOKIE_PREFERENCES_EVENT));
    return true;
  } catch { return false; }
}

export function analyticsAllowed(hostname: string, consent: boolean): boolean {
  return consent && (hostname === 'syncbeats.in' || hostname === 'www.syncbeats.in');
}
