'use client';

import { useState } from 'react';
import Link from 'next/link';

const source = '/api/search/youtube/download?videoId=pxCWiYFkvTg';

export default function StreamTest() {
  const [status, setStatus] = useState('Waiting for audio metadata');
  const [checking, setChecking] = useState(false);
  const [rangeResult, setRangeResult] = useState<string | null>(null);
  const checkRange = async () => {
    setChecking(true);
    try {
      const response = await fetch(source, { headers: { Range: 'bytes=0-15' }, signal: AbortSignal.timeout(10_000) });
      if (response.status !== 206) {
        await response.body?.cancel();
        setRangeResult(`The server returned HTTP ${response.status} instead of partial audio.`);
        return;
      }
      const bytes = await response.arrayBuffer();
      setRangeResult(`HTTP 206 · ${bytes.byteLength} bytes · ${response.headers.get('content-type')} · ${response.headers.get('content-range')}`);
    } catch {
      setRangeResult('Could not reach the audio source.');
    } finally {
      setChecking(false);
    }
  };
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <section className="w-full max-w-lg space-y-6 rounded-3xl border border-foreground/10 bg-foreground/5 p-6 sm:p-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Audio streaming test</h1>
          <p className="text-sm text-foreground/60">Play the cached sample, then seek forward. This uses the browser’s audio player directly, without downloading and decoding the whole file first.</p>
        </div>
        <audio className="w-full" controls preload="metadata" src={source}
          onLoadStart={() => setStatus('Loading audio metadata…')}
          onLoadedMetadata={() => setStatus('Metadata loaded')}
          onCanPlay={() => setStatus('Ready to play')}
          onPlaying={() => setStatus('Playing')}
          onWaiting={() => setStatus('Buffering…')}
          onStalled={() => setStatus('Waiting for the audio source…')}
          onPause={() => setStatus('Paused')}
          onSeeking={() => setStatus('Seeking…')}
          onSeeked={() => setStatus('Seek complete')}
          onEnded={() => setStatus('Finished')}
          onError={() => setStatus('Audio could not be played on this browser.')}
        />
        <p className="text-sm text-foreground/65" role="status" aria-live="polite">{status}</p>
        <div className="space-y-3 border-t border-foreground/10 pt-5">
          <button type="button" disabled={checking} onClick={checkRange} className="rounded-xl bg-foreground/10 px-4 py-2 text-sm font-medium hover:bg-foreground/15 disabled:opacity-50">
            {checking ? 'Checking…' : 'Check partial audio requests'}
          </button>
          {rangeResult && <p className="break-words text-xs text-foreground/60" role="status">{rangeResult}</p>}
        </div>
        <p className="text-xs text-foreground/45">This development test uses SyncBeats’ cached audio proxy. It does not establish that a fresh YouTube CDN URL will work, or that playback is synchronized.</p>
        <Link href="/hub" className="inline-block text-sm text-foreground/70 underline underline-offset-4">Back to room hub</Link>
      </section>
    </main>
  );
}
