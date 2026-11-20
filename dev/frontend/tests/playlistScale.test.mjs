import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { loadTypeScript } from './loadTypeScript.mjs';

// Run the real modules with controlled network/React boundaries. These tests
// exercise pagination and scheduling, not Spotify access or media decoding.
function isolated(relative, dependencies = {}, globals = {}) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  const compiledModule = { exports: {} };
  const require = name => {
    if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
    return dependencies[name];
  };
  new Function('module', 'exports', 'require', ...Object.keys(globals), outputText)(
    compiledModule, compiledModule.exports, require, ...Object.values(globals),
  );
  return compiledModule.exports;
}

const spotifyItem = index => ({ track: {
  id: 'spotify-' + index, name: 'Song ' + index, duration_ms: 180000, is_local: false,
  artists: [{ name: 'Artist ' + index }], album: { name: 'Album', images: [{ url: 'https://example.invalid/art.jpg' }] },
} });

function spotifyHarness(respond) {
  const requests = [];
  const waits = [];
  const api = isolated('../../syncbeats-server/src/utils/spotifyPlaylistFetcher.ts', {}, {
    process: { env: { SPOTIFY_CLIENT_ID: 'fixture-client', SPOTIFY_CLIENT_SECRET: 'fixture-secret' } },
    Buffer,
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (callback, ms) => { waits.push(ms); callback(); },
    fetch: async url => {
      requests.push(url);
      if (url === 'https://accounts.spotify.com/api/token') {
        return Response.json({ access_token: 'fixture-token', expires_in: 3600 });
      }
      return respond(new URL(url));
    },
  });
  return { api, requests, waits };
}

test('500 Spotify tracks retain every page and order without requesting audio', async () => {
  const harness = spotifyHarness(url => {
    const offset = Number(url.searchParams.get('offset') || 0);
    return Response.json({
      items: Array.from({ length: 100 }, (_, index) => spotifyItem(offset + index)),
      next: offset < 400 ? `https://api.spotify.com/v1/playlists/fixture/tracks?limit=100&offset=${offset + 100}` : null,
    });
  });
  const tracks = await harness.api.fetchEntirePlaylist('fixture');
  assert.equal(tracks.length, 500);
  assert.deepEqual(tracks.map(track => track.title), Array.from({ length: 500 }, (_, index) => 'Song ' + index));
  assert.equal(harness.requests.length, 6); // one token plus five metadata pages
  assert.ok(harness.requests.every(url => ['accounts.spotify.com', 'api.spotify.com'].includes(new URL(url).hostname)));
});

test('Spotify 429 retries the same page without skipping or duplicating tracks', async () => {
  let pageCalls = 0;
  const harness = spotifyHarness(() => {
    pageCalls++;
    return pageCalls === 1
      ? new Response('', { status: 429, headers: { 'Retry-After': '1' } })
      : Response.json({ items: [spotifyItem(0)], next: null });
  });
  const tracks = await harness.api.fetchEntirePlaylist('fixture');
  assert.equal(tracks.length, 1);
  assert.equal(pageCalls, 2);
  assert.equal(harness.requests[1], harness.requests[2]);
  assert.ok(harness.waits.includes(1000));
});

test('an inaccessible later Spotify page fails rather than silently returning a partial playlist', async () => {
  const harness = spotifyHarness(url => url.searchParams.has('offset')
    ? new Response('Unavailable', { status: 403 })
    : Response.json({ items: [spotifyItem(0)], next: 'https://api.spotify.com/v1/playlists/fixture/tracks?offset=100' }));
  await assert.rejects(harness.api.fetchEntirePlaylist('fixture'), /403/);
});

test('the primary authenticated playlist reader preserves all 500 tracks', async () => {
  const requests = [];
  const { MusicBridgeService } = isolated('../../syncbeats-server/src/services/MusicBridgeService.ts', {
    'yt-search': () => { throw new Error('Metadata import must not search YouTube'); },
    '@distube/ytdl-core': {},
    '../utils/spotifyPlaylistFetcher': {},
  }, {
    console: { log() {}, warn() {}, error() {} },
    setTimeout: callback => callback(),
    fetch: async raw => {
      const url = new URL(raw);
      requests.push(url);
      if (!url.pathname.endsWith('/tracks')) return Response.json({ name: '500-song fixture', images: [] });
      const offset = Number(url.searchParams.get('offset') || 0);
      return Response.json({ items: Array.from({ length: 100 }, (_, index) => spotifyItem(offset + index)),
        next: offset < 400 ? `https://api.spotify.com/v1/playlists/fixture/tracks?limit=100&offset=${offset + 100}` : null });
    },
  });
  const playlist = await MusicBridgeService._fetchViaSpotifyApi('fixture', 'fixture-user-token');
  assert.equal(playlist.name, '500-song fixture');
  assert.equal(playlist.tracks.length, 500);
  assert.equal(playlist.tracks.at(-1).title, 'Song 499');
  assert.equal(requests.length, 6);
  assert.ok(requests.every(url => url.hostname === 'api.spotify.com'));
});

const roomState = loadTypeScript('lib/roomState.ts');
const youtube = loadTypeScript('lib/youtube.ts');
const identity = loadTypeScript('lib/trackIdentity.ts');
const policy = loadTypeScript('lib/prefetchPolicy.ts');

function prefetchHarness(isCurrentReady) {
  const downloads = [];
  const cleanups = [];
  const timers = [];
  const queue = Array.from({ length: 500 }, (_, index) => ({
    id: 'queue-' + index, title: 'Song ' + index,
    trackUrl: 'youtube:' + String(index).padStart(11, '0'), isCurrent: index === 0,
  }));
  const hook = isolated('../hooks/useTrackPrefetcher.ts', {
    react: {
      useRef: current => ({ current }),
      useState: initial => [initial, () => {}],
      useEffect: effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
    },
    '../lib/youtube': youtube,
    '../lib/trackIdentity': identity,
    '../lib/roomState': roomState,
    '../lib/prefetchPolicy': policy,
    '../lib/trackDownload': {
      resolvePlayableTrack: async track => track.trackUrl,
      downloadTrack: async (...args) => { downloads.push(args); return { blob: new Blob(['audio fixture']), cached: true, reusable: true }; },
    },
  }, {
    localStorage: { getItem: () => null, setItem() {} },
    window: { addEventListener() {}, removeEventListener() {} },
    document: { addEventListener() {}, removeEventListener() {} },
    setTimeout: callback => { timers.push(callback); return timers.length; },
    clearTimeout() {},
  });
  hook.useTrackPrefetcher({ snapshot: { queue, repeatMode: 'off', shuffle: false },
    roomId: 'fixture-room', currentTime: 179, duration: 180, isCurrentReady });
  return { downloads, cleanups, timers };
}

test('a 500-track queue prefetches only the upcoming track', async () => {
  const harness = prefetchHarness(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.downloads.length, 1);
  assert.equal(harness.downloads[0][2].title, 'Song 1');
  assert.equal(harness.downloads[0][2].priority, 'prefetch');
  harness.cleanups.forEach(cleanup => cleanup());
});

test('a 500-track queue starts no prefetch while current audio is not ready', async () => {
  const harness = prefetchHarness(false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.downloads.length, 0);
  assert.equal(harness.timers.length, 1);
  harness.cleanups.forEach(cleanup => cleanup());
});
