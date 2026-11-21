'use client';
import { useState } from 'react';
import { startNativeGoogle, type NativeGoogleRequest } from '../../../lib/nativeGoogle';

export default function NativeGoogleStart({ flow }: { flow: NativeGoogleRequest | null }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function signIn() {
    if (!flow || opening) return;
    try { setOpening(true); startNativeGoogle(flow); }
    catch { setOpening(false); setError('Allow browser storage, then try again.'); }
  }
  return <main className="min-h-dvh flex items-center justify-center bg-background text-foreground px-6 py-12">
    <div className="w-full max-w-sm">
      <p className="text-sm font-semibold mb-9">SyncBeats</p>
      <h1 className="text-3xl font-semibold tracking-tight mb-3">Your music, on your Mac.</h1>
      <p className="text-sm leading-6 text-foreground/65 mb-8">{flow ? 'Sign in with the same Google account you use on SyncBeats. You’ll return to the Mac app when you’re done.' : 'This sign-in request has expired. Return to SyncBeats and click Continue with Google again.'}</p>
      {flow && <button type="button" disabled={opening} onClick={signIn} className="w-full rounded-xl bg-foreground text-background font-medium px-5 py-3.5 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">
        {opening ? 'Opening Google…' : 'Continue with Google'}
      </button>}
      {error && <p role="alert" className="text-sm mt-4 text-red-500">{error}</p>}
      <p className="text-xs text-foreground/45 mt-6">SyncBeats never sees your Google password.</p>
    </div>
  </main>;
}
