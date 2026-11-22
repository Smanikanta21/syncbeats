'use client';

import { useEffect } from 'react';

export default function NativeGoogleReturn({ callback, failed }: { callback: string | null; failed: boolean }) {
  useEffect(() => {
    if (callback) {
      try { window.location.href = callback; } catch { /* The manual link remains available. */ }
    }
  }, [callback]);

  return <main className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
    <div className="w-full max-w-sm rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-8 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Return to SyncBeats</h1>
      <p className="text-sm text-foreground/55 mt-3 mb-6">
        {!callback ? 'This sign-in link is invalid. Start Google sign-in again from the app.' :
          failed ? 'Google sign-in did not finish. Return to the app to try again.' :
          'Open the app to finish signing in. If it does not open automatically, use the button below.'}
      </p>
      {callback && <a href={callback} className="block w-full rounded-xl bg-foreground text-background font-medium px-5 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">Open SyncBeats</a>}
      {callback && <p className="text-xs text-foreground/45 mt-6">The SyncBeats app must be installed. If the link has expired, start sign-in again from the app.</p>}
    </div>
  </main>;
}
