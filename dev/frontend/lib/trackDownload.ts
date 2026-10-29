import { getTrack, saveTrack } from './idb';
import { getAuthToken, getRestUrl, getServerUrl } from './api';
import { trackCacheKey } from './trackIdentity';
import { ytId } from './youtube';
import type { TrackQueueItem } from './types';

type Priority = 'playback' | 'prefetch';
export interface DownloadResult {
  blob: Blob;
  cached: boolean;
  /** The bytes remain available after this caller releases the result. */
  reusable: boolean;
  downloadDurationMs?: number;
}
interface DownloadOptions {
  trackUrl: string;
  url: string;
  title?: string;
  signal?: AbortSignal;
  onProgress?: (percent: number | null) => void;
  priority?: Priority;
  headers?: HeadersInit;
}
interface Consumer { priority: Priority; progress?: DownloadOptions['onProgress']; }
interface Job {
  controller: AbortController;
  consumers: Set<Consumer>;
  promise: Promise<DownloadResult>;
  progress: number | null;
}

const aborted = () => new DOMException('Download cancelled', 'AbortError');

/** Shares bytes, not decoded audio or playback state, between prefetch and the player. */
export class TrackDownloadPool {
  private jobs = new Map<string, Job>();
  private prepared: { key: string; result: DownloadResult } | null = null;

  constructor(private readonly io = {
    read: getTrack,
    write: saveTrack,
    fetch: (url: string, init: RequestInit) => fetch(url, init),
  }) {}

  async load(options: DownloadOptions): Promise<DownloadResult> {
    if (options.signal?.aborted) throw aborted();
    const key = trackCacheKey(options.trackUrl);
    if (this.prepared?.key === key) {
      options.onProgress?.(100);
      return this.prepared.result;
    }
    const cached = await this.io.read(options.trackUrl);
    if (options.signal?.aborted) throw aborted();
    if (cached) { options.onProgress?.(100); return { blob: cached, cached: true, reusable: true }; }
    if (options.priority === 'playback') this.prioritize(options.trackUrl);
    let job = this.jobs.get(key);
    if (job?.controller.signal.aborted) job = undefined;
    if (!job) {
      job = { controller: new AbortController(), consumers: new Set(), progress: null, promise: Promise.resolve(null as never) };
      this.jobs.set(key, job);
      job.promise = this.fetch(job, key, options);
    }
    return this.subscribe(job, options);
  }

  /** P2P loaders can adopt an already running HTTP prefetch without changing their fallback. */
  adopt(trackUrl: string, signal?: AbortSignal, onProgress?: DownloadOptions['onProgress']): Promise<DownloadResult> | null {
    if (signal?.aborted) return Promise.reject(aborted());
    const key = trackCacheKey(trackUrl);
    if (this.prepared?.key === key) return Promise.resolve(this.prepared.result);
    const job = this.jobs.get(key);
    return job && !job.controller.signal.aborted
      ? this.subscribe(job, { trackUrl, url: '', signal, onProgress, priority: 'playback' })
      : null;
  }

  prioritize(trackUrl: string): void {
    const key = trackCacheKey(trackUrl);
    for (const [otherKey, job] of this.jobs) {
      if (otherKey !== key && ![...job.consumers].some(c => c.priority === 'playback')) job.controller.abort();
    }
  }

  forget(trackUrl: string): void {
    if (this.prepared?.key === trackCacheKey(trackUrl)) this.prepared = null;
  }

  private subscribe(job: Job, options: DownloadOptions): Promise<DownloadResult> {
    if (options.signal?.aborted) return Promise.reject(aborted());
    const consumer: Consumer = { priority: options.priority ?? 'prefetch', progress: options.onProgress };
    job.consumers.add(consumer);
    options.onProgress?.(job.progress);
    return new Promise((resolve, reject) => {
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        options.signal?.removeEventListener('abort', onAbort);
        job.consumers.delete(consumer);
        // A track transition's React cleanup can run just before the player adopts the job.
        setTimeout(() => { if (!job.consumers.size) job.controller.abort(); }, 100);
      };
      const onAbort = () => { release(); reject(aborted()); };
      options.signal?.addEventListener('abort', onAbort, { once: true });
      job.promise.then(result => { release(); resolve(result); }, error => { release(); reject(error); });
    });
  }

  private async fetch(job: Job, key: string, options: DownloadOptions): Promise<DownloadResult> {
    const started = Date.now();
    const deadline = setTimeout(() => job.controller.abort(), 120_000);
    try {
      const response = await this.io.fetch(options.url, { signal: job.controller.signal, headers: options.headers });
      if (!response.ok) throw new Error('Audio download failed (' + response.status + ')');
      const total = Number(response.headers.get('content-length'));
      const reader = response.body?.getReader();
      const chunks: ArrayBuffer[] = [];
      let loaded = 0;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (job.controller.signal.aborted) throw aborted();
          chunks.push(new Uint8Array(value).buffer);
          loaded += value.byteLength;
          job.progress = total > 0 ? Math.min(99, Math.round(loaded / total * 100)) : null;
          for (const consumer of job.consumers) consumer.progress?.(job.progress);
        }
      } else {
        chunks.push(await response.arrayBuffer());
      }
      if (job.controller.signal.aborted) throw aborted();
      const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'audio/mpeg' });
      if (!blob.size) throw new Error('The audio download was empty');
      const downloadDurationMs = Date.now() - started;
      const cached = await this.io.write(options.trackUrl, blob, options.title).catch(() => false);
      if (job.controller.signal.aborted) throw aborted();
      const keepInMemory = blob.size <= 32 * 1024 * 1024;
      const result = { blob, cached, reusable: cached || keepInMemory, downloadDurationMs };
      // One compressed fallback, bounded at 32 MiB, also works when IndexedDB is unavailable.
      if (keepInMemory) this.prepared = { key, result };
      job.progress = 100;
      for (const consumer of job.consumers) consumer.progress?.(100);
      return result;
    } finally {
      clearTimeout(deadline);
      if (this.jobs.get(key) === job) this.jobs.delete(key);
    }
  }
}

export const trackDownloads = new TrackDownloadPool();

export function downloadTrack(trackUrl: string, roomId: string, options: Omit<DownloadOptions, 'trackUrl' | 'url' | 'headers'> = {}): Promise<DownloadResult> {
  const id = ytId(trackUrl);
  const base = getServerUrl();
  const url = id
    ? base + '/rooms/' + encodeURIComponent(roomId) + '/yt-proxy?videoId=' + id
    : trackUrl.startsWith('/') ? base + trackUrl : trackUrl;
  const token = getAuthToken();
  // Attach room authorization only to the same API proxy, never to arbitrary uploaded URLs.
  const headers = token && (id || trackUrl.startsWith('/')) ? { Authorization: 'Bearer ' + token } : undefined;
  return trackDownloads.load({ ...options, trackUrl, url, headers });
}

export async function resolvePlayableTrack(track: TrackQueueItem, roomId: string, signal?: AbortSignal): Promise<string> {
  if (!track.trackUrl.startsWith('spotify-lazy:')) return track.trackUrl;
  if (signal?.aborted) throw aborted();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(cancel, 30_000);
  try {
  const token = getAuthToken();
  const response = await fetch(getRestUrl() + '/rooms/' + encodeURIComponent(roomId) + '/resolve-lazy', {
    method: 'POST', signal: controller.signal,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ queueItemId: track.id, trackId: track.trackUrl.split(':')[1]?.split('?')[0], title: track.title, artist: track.artist || '' }),
  });
  const data = await response.json();
  if (!response.ok || !data.success || !ytId(data.youtubeId)) throw new Error('Could not find a playable version of this track');
  return 'youtube:' + data.youtubeId;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('Finding this track took too long. Try again.');
    throw error;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener('abort', cancel);
  }
}
