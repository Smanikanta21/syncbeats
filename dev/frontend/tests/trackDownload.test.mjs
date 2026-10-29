import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { loadTypeScript } from './loadTypeScript.mjs';

const { TrackDownloadPool } = loadTypeScript('lib/trackDownload.ts');
const options = { trackUrl: 'youtube:abcdefghijk', url: 'https://audio.invalid/fixture', priority: 'prefetch' };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

test('foreground promotion shares a single download even when the prefetch subscriber cancels', async () => {
  const response = deferred();
  let fetches = 0;
  const pool = new TrackDownloadPool({ read: async () => null, write: async () => true, fetch: async () => { fetches++; return response.promise; } });
  const controller = new AbortController();
  const prefetch = pool.load({ ...options, signal: controller.signal });
  const cancelled = assert.rejects(prefetch, { name: 'AbortError' });
  await nextTurn();
  const playback = pool.load({ ...options, trackUrl: 'ws-p2p:yt:abcdefghijk_1785136544031', priority: 'playback' });
  await nextTurn();
  controller.abort();
  response.resolve(new Response('fixture audio'));
  assert.equal(await (await playback).blob.text(), 'fixture audio');
  await cancelled;
  assert.equal(fetches, 1);
});

test('missing Content-Length stays indeterminate until bytes and cache commit finish', async () => {
  const write = deferred();
  const progress = [];
  const pool = new TrackDownloadPool({ read: async () => null, write: () => write.promise, fetch: async () => new Response('audio') });
  const result = pool.load({ ...options, onProgress: value => progress.push(value) });
  await nextTurn();
  assert.ok(progress.includes(null));
  assert.ok(!progress.includes(100));
  write.resolve(true);
  assert.equal((await result).cached, true);
  assert.equal(progress.at(-1), 100);
});

test('denied storage keeps one bounded compressed fallback for foreground reuse', async () => {
  let fetches = 0;
  const pool = new TrackDownloadPool({ read: async () => null, write: async () => false, fetch: async () => { fetches++; return new Response('audio'); } });
  const prepared = await pool.load(options);
  assert.equal(prepared.cached, false);
  assert.equal(prepared.reusable, true);
  const reused = await pool.load({ ...options, trackUrl: 'https://youtu.be/abcdefghijk', priority: 'playback' });
  assert.equal(reused.blob, prepared.blob);
  assert.equal(fetches, 1);
});

test('uncached downloads above the memory bound are not reported as prepared', async () => {
  const pool = new TrackDownloadPool({ read: async () => null, write: async () => false,
    fetch: async () => new Response(new Uint8Array(32 * 1024 * 1024 + 1)) });
  const result = await pool.load(options);
  assert.equal(result.reusable, false);
  assert.equal(pool.adopt(options.trackUrl), null);
});

test('obsolete cache-write completion cannot install an aborted result as the prepared track', async () => {
  const write = deferred();
  const pool = new TrackDownloadPool({ read: async () => null, write: () => write.promise, fetch: async () => new Response('audio') });
  const controller = new AbortController();
  const result = pool.load({ ...options, signal: controller.signal });
  const cancelled = assert.rejects(result, { name: 'AbortError' });
  await nextTurn();
  controller.abort();
  pool.prioritize('youtube:lmnopqrstuv');
  write.resolve(true);
  await cancelled;
  await nextTurn();
  assert.equal(pool.adopt(options.trackUrl), null);
});

test('new foreground work aborts obsolete speculation but preserves another foreground consumer', async () => {
  const requests = [];
  const pool = new TrackDownloadPool({ read: async () => null, write: async () => true,
    fetch: (_url, { signal }) => new Promise((resolve, reject) => {
      requests.push({ signal, resolve });
      signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')));
    }) });
  const speculative = pool.load(options);
  const cancelled = assert.rejects(speculative, { name: 'AbortError' });
  await nextTurn();
  const foreground = pool.load({ ...options, trackUrl: 'youtube:lmnopqrstuv', priority: 'playback' });
  await nextTurn();
  await cancelled;
  assert.equal(requests[0].signal.aborted, true);
  pool.prioritize('youtube:zyxwvutsrqp');
  assert.equal(requests[1].signal.aborted, false);
  requests[1].resolve(new Response('new audio'));
  await foreground;
});

test('a failed request is retryable and an already cancelled consumer never starts network work', async () => {
  let fetches = 0;
  const pool = new TrackDownloadPool({ read: async () => null, write: async () => true,
    fetch: async () => { if (++fetches === 1) throw new Error('offline'); return new Response('audio'); } });
  await assert.rejects(pool.load(options), /offline/);
  assert.equal((await pool.load(options)).reusable, true);
  assert.equal(fetches, 2);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(pool.load({ ...options, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(fetches, 2);
});
