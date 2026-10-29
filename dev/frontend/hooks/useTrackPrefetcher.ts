"use client";

import { useEffect, useRef, useState } from 'react';
import { ytId } from '../lib/youtube';
import { trackCacheKey } from '../lib/trackIdentity';
import { selectNextTrack } from '../lib/roomState';
import { downloadTrack, resolvePlayableTrack } from '../lib/trackDownload';
import { prefetchDelay, validDownloadSpeed } from '../lib/prefetchPolicy';
import type { RoomSnapshot } from '../lib/types';

const SPEED_STORAGE_KEY = 'sb_dl_speed_bps';
function loadSpeedEstimate(): number {
  try { return validDownloadSpeed(Number(localStorage.getItem(SPEED_STORAGE_KEY))); }
  catch { return validDownloadSpeed(0); }
}

export const extractVideoId = ytId;
export interface PrefetchState {
  nextTrackProgress: number;
  nextTrackTitle: string | null;
  isPrefetching: boolean;
  status?: 'idle' | 'resolving' | 'downloading' | 'cached' | 'ready' | 'failed' | 'cancelled';
  isIndeterminate?: boolean;
  error?: string | null;
}
const EMPTY: PrefetchState = { nextTrackProgress: 0, nextTrackTitle: null, isPrefetching: false, status: 'idle' };

interface Options {
  snapshot: RoomSnapshot | null;
  currentTime: number;
  duration: number;
  isCurrentReady: boolean;
  roomId: string;
}

export function useTrackPrefetcher(options: Options): PrefetchState {
  const target = selectNextTrack(options.snapshot);
  const key = target ? options.roomId + ':' + target.id + ':' + trackCacheKey(target.trackUrl) : '';
  const latest = useRef({ ...options, target });
  const [state, setState] = useState<PrefetchState & { key: string }>({ ...EMPTY, key: '' });

  useEffect(() => {
    latest.current = { ...options, target };
  });

  useEffect(() => {
    let cancelled = false;
    let running = false;
    let done = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const track = latest.current.target;
    if (!track || !key) return;
    const publish = (patch: Partial<PrefetchState>) => {
      if (!cancelled) setState(previous => ({
        ...(previous.key === key ? previous : EMPTY),
        key, nextTrackTitle: track.title, ...patch,
      }));
    };

    const download = async () => {
      running = true;
      publish({ status: track.trackUrl.startsWith('spotify-lazy:') ? 'resolving' : 'downloading',
        isPrefetching: true, isIndeterminate: true, nextTrackProgress: 0, error: null });
      try {
        const url = await resolvePlayableTrack(track, options.roomId, controller.signal);
        if (cancelled) return;
        // Non-YouTube swarm sources keep their existing foreground P2P loader.
        if ((url.startsWith('magnet:') || url.startsWith('ws-p2p:')) && !ytId(url)) {
          done = true;
          publish({ status: 'idle', isPrefetching: false, isIndeterminate: false });
          return;
        }
        publish({ status: 'downloading' });
        const result = await downloadTrack(url, options.roomId, {
          priority: 'prefetch', title: track.title, signal: controller.signal,
          onProgress: progress => publish({ nextTrackProgress: progress ?? 0, isIndeterminate: progress == null }),
        });
        if (cancelled) return;
        if (result.downloadDurationMs && result.downloadDurationMs > 100) {
          try {
            const speed = validDownloadSpeed(result.blob.size / (result.downloadDurationMs / 1000));
            localStorage.setItem(SPEED_STORAGE_KEY, String(loadSpeedEstimate() * 0.6 + speed * 0.4));
          } catch { /* Storage access is optional. */ }
        }
        done = true;
        publish({ status: result.cached ? 'cached' : result.reusable ? 'ready' : 'failed', isPrefetching: false,
          isIndeterminate: false, nextTrackProgress: result.reusable ? 100 : 0,
          error: result.reusable ? null : 'Storage is unavailable. This track will load when needed.' });
      } catch (error) {
        if (cancelled) return;
        const wasAborted = error instanceof DOMException && error.name === 'AbortError';
        if (!wasAborted) failures++;
        publish({ status: wasAborted ? 'cancelled' : 'failed', isPrefetching: false,
          isIndeterminate: false, error: wasAborted ? null : 'The next track will load when needed.' });
        if (failures < 3) timer = setTimeout(tick, Math.min(15_000, 2000 * 2 ** failures));
      } finally {
        running = false;
      }
    };

    function tick() {
      if (cancelled || done || running) return;
      const current = latest.current;
      if (!current.isCurrentReady) {
        timer = setTimeout(tick, 1000);
        return;
      }
      const delay = prefetchDelay(current.duration, current.currentTime, loadSpeedEstimate(),
        track?.sizeBytes, track?.durationSec, track?.trackUrl.startsWith('spotify-lazy:'));
      if (delay === 0) void download();
      else timer = setTimeout(tick, Math.min(1000, delay * 1000));
    }
    tick();
    const resume = () => {
      if (!running && !done) {
        failures = 0;
        if (timer) clearTimeout(timer);
        tick();
      }
    };
    const visible = () => { if (document.visibilityState === 'visible') resume(); };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', visible);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', visible);
      // Keep the bytes in flight if this exact target just became the current track.
      const current = latest.current;
      const promoted = current.roomId === options.roomId && current.snapshot?.trackUrl &&
        trackCacheKey(current.snapshot.trackUrl) === trackCacheKey(track.trackUrl);
      if (!promoted) controller.abort();
    };
  }, [key, options.roomId]);

  return state.key === key ? state : EMPTY;
}
