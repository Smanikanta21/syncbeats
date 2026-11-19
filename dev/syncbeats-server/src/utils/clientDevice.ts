/** iPadOS desktop Safari masks its model in the UA; the browser supplies a display-only hint. */
export function deviceUserAgent(userAgent: string | undefined, hint: string | undefined): string | null {
  if (!userAgent) return null;
  if (hint === 'ipad' && /Macintosh/i.test(userAgent) && !/iPad/i.test(userAgent)) {
    return `${userAgent} SyncBeatsDevice/iPad`;
  }
  return userAgent;
}
