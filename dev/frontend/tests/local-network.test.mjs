import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from './loadTypeScript.mjs';

const { localAudioSource } = loadTypeScript('lib/audioSource.ts');

test('development audio follows the website proxy when a saved laptop address changes', () => {
  for (const host of ['10.7.17.157', '192.168.1.14', '172.16.2.3', 'localhost', '127.0.0.1', '[::1]']) {
    assert.equal(localAudioSource(`http://${host}:4000/files/test.mp3?version=2`, true), '/api/files/test.mp3?version=2');
  }
  assert.equal(localAudioSource('http://10.7.17.157:4000/search/youtube/download?videoId=abc', true), '/api/search/youtube/download?videoId=abc');
  assert.equal(localAudioSource('http://10.7.17.157:4000/rooms/123456/yt-proxy?videoId=abc', true), '/api/rooms/123456/yt-proxy?videoId=abc');
});

test('external CDN URLs and production sources retain their original URL', () => {
  for (const source of ['https://r1.googlevideo.com/videoplayback?signature=example', 'https://cdn.example.com/files/audio.mp3', 'http://10.7.17.157:4000/auth/me', '/files/audio.mp3', '/api/files/audio.mp3', 'youtube:abc']) {
    assert.equal(localAudioSource(source, true), source);
  }
  const source = 'http://10.7.17.157:4000/files/audio.mp3';
  assert.equal(localAudioSource(source, false), source);
});

let effect;
const { useWakeLock } = loadTypeScript('hooks/useWakeLock.ts', { react: { useEffect: callback => { effect = callback; } } });
const flush = () => new Promise(resolve => setImmediate(resolve));

async function withBrowser(document, navigator, run) {
  const originals = Object.fromEntries(['document', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigator });
  try { await run(); } finally {
    for (const key of ['document', 'navigator']) {
      if (originals[key]) Object.defineProperty(globalThis, key, originals[key]);
      else delete globalThis[key];
    }
  }
}

function page(visibilityState) {
  const listeners = new Map();
  return { visibilityState, listeners, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
}

test('wake lock waits for visibility and coalesces repeated user gestures', async () => {
  const document = page('hidden');
  let requests = 0, releases = 0, complete;
  const sentinel = { released: false, addEventListener() {}, release: async () => { releases++; sentinel.released = true; } };
  await withBrowser(document, { wakeLock: { request: () => { requests++; return new Promise(resolve => { complete = resolve; }); } } }, async () => {
    useWakeLock(true);
    const cleanup = effect();
    assert.equal(requests, 0);
    document.visibilityState = 'visible';
    document.listeners.get('visibilitychange')();
    document.listeners.get('click')();
    assert.equal(requests, 1);
    complete(sentinel);
    await flush();
    document.visibilityState = 'hidden';
    document.listeners.get('visibilitychange')();
    await flush();
    assert.equal(releases, 1);
    cleanup();
    assert.equal(document.listeners.size, 0);
  });
});

test('a late wake-lock acquisition releases itself after unmount', async () => {
  const document = page('visible');
  let complete, releases = 0;
  await withBrowser(document, { wakeLock: { request: () => new Promise(resolve => { complete = resolve; }) } }, async () => {
    useWakeLock(true);
    const cleanup = effect();
    cleanup();
    complete({ release: async () => { releases++; } });
    await flush();
    assert.equal(releases, 1);
    assert.equal(document.listeners.size, 0);
  });
});

test('unsupported mobile browsers do not try an invalid video fallback', async () => {
  const document = page('visible');
  await withBrowser(document, {}, async () => {
    useWakeLock(true);
    assert.equal(effect(), undefined);
    assert.equal(document.listeners.size, 0);
  });
});

test('session validation sends the saved token through the website proxy with a bounded timeout', async () => {
  const { authApi, getRestUrl, getServerUrl } = loadTypeScript('lib/api.ts');
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const keys = ['window', 'document', 'fetch'];
  const originals = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalTimeout = AbortSignal.timeout;
  let requested, timeoutMs;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: '10.0.0.27', protocol: 'http:' } } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie: 'sb_token=fixture-session-token' } });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (url, options) => {
    requested = { url, options };
    return { ok: true, json: async () => ({ user: { id: 'fixture-user' } }) };
  } });
  AbortSignal.timeout = ms => { timeoutMs = ms; return new AbortController().signal; };
  try {
    assert.equal(getRestUrl(), '/api');
    assert.equal(getServerUrl(), 'http://10.0.0.27:4000');
    const result = await authApi.me();
    assert.equal(requested.url, '/api/auth/me');
    assert.equal(requested.options.headers.Authorization, 'Bearer fixture-session-token');
    assert.equal(requested.options.cache, 'no-store');
    assert.equal(timeoutMs, 10_000);
    assert.equal(result.user.id, 'fixture-user');
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    AbortSignal.timeout = originalTimeout;
    for (const key of keys) {
      if (originals[key]) Object.defineProperty(globalThis, key, originals[key]);
      else delete globalThis[key];
    }
  }
});
