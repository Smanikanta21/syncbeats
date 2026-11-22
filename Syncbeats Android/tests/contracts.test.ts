import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient, ApiError } from '../src/lib/api';
import { parseServerURL } from '../src/lib/config';
import { audioURL, expectedPosition, scheduledEpoch, trackKey, youtubeId } from '../src/lib/media';
import { estimate, median, SyncClock } from '../src/sync/clock';
import { snapshot, Socket } from './fixtures';

test('resume schedule includes pauseOffset while the playing position uses startEpoch', () => {
  const room = snapshot({ isPlaying: true, startEpoch: 100_000, pauseOffset: 30 });
  assert.equal(scheduledEpoch(room), 130_000);
  assert.equal(expectedPosition(room, 129_000), 30);
  assert.equal(expectedPosition(room, 132_000), 32);
  assert.equal(expectedPosition(snapshot({ pauseOffset: 18, position: 999_000 }), 200_000), 18);
  assert.equal(expectedPosition(snapshot({ pauseOffset: undefined, position: 18_000 }), 200_000), 18);
});
test('metadata does not change audio identity; native URLs use existing serving routes', () => {
  assert.equal(trackKey('youtube:abcdefghijk?thumb=https%3A%2F%2Fexample.com'), 'youtube:abcdefghijk');
  assert.equal(youtubeId('https://youtu.be/abcdefghijk?t=20'), 'abcdefghijk');
  assert.equal(youtubeId('youtube:short'), null);
  assert.equal(audioURL('https://api.syncbeats.in', '123456', 'youtube:abcdefghijk'), 'https://api.syncbeats.in/rooms/123456/yt-proxy?videoId=abcdefghijk');
  assert.equal(audioURL('http://host:4000', '123456', '/files/track.mp3'), 'http://host:4000/files/track.mp3');
  assert.throws(() => audioURL('https://host', '123456', 'ws-p2p:unsupported'));
});
test('direct origins and /api proxies choose the correct Socket.IO path', () => {
  assert.deepEqual(parseServerURL('https://syncbeats.in/api/'), { base: 'https://syncbeats.in/api', origin: 'https://syncbeats.in', socketPath: '/api/socket.io' });
  assert.equal(parseServerURL('http://10.0.2.2:4000').socketPath, '/socket.io');
  assert.throws(() => parseServerURL('https://token:secret@example.com'));
});
test('NTP accounts for server processing time and uses a sorted median', () => {
  assert.deepEqual(estimate({ t0: 1000, t1: 1110, t2: 1120, seq: 1 }, 1030), { rtt: 20, offset: 100 });
  assert.equal(median([200, 20, 22]), 22); assert.equal(median([10, 4, 8, 6]), 7);
});
test('disposing clock probes resolves outstanding promises and ignores unmatched replies', async () => {
  const socket = new Socket(), clock = new SyncClock(socket, '123456', () => {});
  const burst = clock.start();
  socket.receive('sync:pong', { t0: -1, t1: 10, t2: 10, seq: 999 });
  assert.equal(clock.stats.sampled, false);
  clock.dispose(); await burst;
  assert.equal(socket.handlers.get('sync:pong')?.size, 0);
});
test('auth, device identity and enqueue metadata match the existing backend contract', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const fetcher = (async (input, options) => { calls.push({ url: String(input), options }); return new Response('{"item":{"id":"song-1"}}', { status: 201 }); }) as typeof fetch;
  const client = new ApiClient('session-token', 'device-1', 'https://backend.test', fetcher);
  await client.enqueue('123456', { url: 'youtube:abcdefghijk', title: 'Song', uploaderName: 'Artist', duration: 90 });
  assert.equal(calls[0].url, 'https://backend.test/rooms/123456/enqueue-youtube');
  assert.equal(new Headers(calls[0].options?.headers).get('Authorization'), 'Bearer session-token');
  assert.equal(new Headers(calls[0].options?.headers).get('X-Device-Id'), 'device-1');
  assert.deepEqual(JSON.parse(calls[0].options?.body as string), { youtubeUrl: 'youtube:abcdefghijk', title: 'Song', artist: 'Artist', durationSec: 90 });
});
test('backend errors remain actionable and invalid JSON cannot become a successful session', async () => {
  const denied = new ApiClient(null, 'device', 'https://backend.test', (async () => new Response('{"error":"Verify your email"}', { status: 401 })) as typeof fetch);
  await assert.rejects(denied.me(), (error: unknown) => error instanceof ApiError && error.status === 401 && error.message === 'Verify your email');
  const bad = new ApiClient(null, 'device', 'https://backend.test', (async () => new Response('<html>Unavailable</html>')) as typeof fetch);
  await assert.rejects(bad.me(), /unexpected response/);
});
