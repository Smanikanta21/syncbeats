import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from './loadTypeScript.mjs';

const { isSameTrack, trackCacheKey } = loadTypeScript('lib/trackIdentity.ts');
const { normalizeRoomSnapshot, applyQueueUpdate, selectNextTrack } = loadTypeScript('lib/roomState.ts');
const { prefetchDelay, validDownloadSpeed } = loadTypeScript('lib/prefetchPolicy.ts');
const { updateTransferActivities, visibleTransferActivity } = loadTypeScript('lib/transferActivity.ts');
const first = { id: 'a', trackUrl: 'youtube:abcdefghijk', title: 'A', isCurrent: true };
const second = { id: 'b', trackUrl: 'spotify-lazy:playlist-track', title: 'B', isCurrent: false };
const snapshot = {
  roomId: '123456', roomInstanceId: 'server-a', queueVersion: 9, queue: [first, second],
  trackUrl: first.trackUrl, state: 'PLAYING', isPlaying: true, startEpoch: 1000, pauseOffset: 5,
  playbackInstanceId: 'play-a', repeatMode: 'off', shuffle: false, participants: [],
};

test('all supported YouTube transports share one identity and cache entry', () => {
  for (const alias of ['abcdefghijk', 'youtube:abcdefghijk?thumb=art', 'ws-p2p:yt:abcdefghijk_1785136544031',
    'https://youtu.be/abcdefghijk?t=5', 'https://www.youtube.com/watch?v=abcdefghijk']) {
    assert.equal(trackCacheKey(alias), 'abcdefghijk');
    assert.ok(isSameTrack(first.trackUrl, alias));
  }
  assert.ok(!isSameTrack('youtube:abcdefghijk', 'youtube:lmnopqrstuv'));
  assert.ok(!isSameTrack('/files/a.mp3', '/files/b.mp3'));
});

test('queue-only updates preserve playback intent even if the patch has no current item', () => {
  const patched = applyQueueUpdate(snapshot, { roomId: snapshot.roomId, queueVersion: 10, queue: [second], nextTrack: null });
  for (const key of ['trackUrl', 'state', 'isPlaying', 'startEpoch', 'pauseOffset', 'playbackInstanceId']) assert.equal(patched[key], snapshot[key]);
  assert.deepEqual(patched.queue, [second]);
  assert.equal(patched.nextTrack, null);
});

test('old revisions, old rooms and old server instances cannot replace queue state', () => {
  for (const patch of [
    { queueVersion: 8 }, { roomId: '654321' }, { roomInstanceId: 'server-before-restart' },
  ]) assert.equal(applyQueueUpdate(snapshot, { ...patch, queue: [] }), snapshot);
  assert.equal(applyQueueUpdate(null, { queue: [] }), null);
});

test('join snapshots accept a fresh version baseline and normalize wrapped native payloads', () => {
  const restarted = normalizeRoomSnapshot({ state: { ...snapshot, queueVersion: 0, roomInstanceId: 'server-b' } }, '123456');
  assert.equal(restarted.queueVersion, 0);
  assert.equal(restarted.roomInstanceId, 'server-b');
  assert.equal(normalizeRoomSnapshot(snapshot, '654321'), null);
  assert.equal(normalizeRoomSnapshot({ ...snapshot, queue: null }, '123456'), null);
});

test('prefetch follows the published successor, including null and a shuffled next lap', () => {
  assert.equal(selectNextTrack(snapshot), second);
  assert.equal(selectNextTrack({ ...snapshot, repeatMode: 'track' }), first);
  assert.equal(selectNextTrack({ ...snapshot, nextTrack: null }), null);
  assert.equal(selectNextTrack({ ...snapshot, shuffle: true, repeatMode: 'all', nextTrack: first }), first);
  const last = { ...snapshot, queue: [{ ...first, isCurrent: false }, { ...second, isCurrent: true }], repeatMode: 'all' };
  assert.equal(selectNextTrack(last).id, first.id);
  assert.equal(selectNextTrack({ ...last, shuffle: true }), null);
  assert.equal(selectNextTrack({ ...snapshot, queue: [{ ...first, isCurrent: false }] }), null);
});

test('prefetch timing remains finite with unknown duration, throughput and sizes', () => {
  for (const duration of [NaN, Infinity, 0, -1]) assert.equal(prefetchDelay(duration, 10, NaN), 0);
  for (const speed of [NaN, Infinity, 0, -1]) {
    assert.ok(validDownloadSpeed(speed) > 0);
    assert.ok(Number.isFinite(prefetchDelay(180, NaN, speed, Infinity)));
  }
  assert.equal(prefetchDelay(180, 179, 300_000), 0);
  assert.ok(prefetchDelay(180, 60, 300_000, 5_000_000, 180, true) < prefetchDelay(180, 60, 300_000, 5_000_000, 180, false));
  assert.equal(prefetchDelay(180, 60, 300_000, 50_000_000), 0);
});

test('one sender completing or cancelling cannot dismiss another active transfer', () => {
  const a = { id: 'a', roomId: '123456', title: 'A', status: 'active', progress: 10 };
  const b = { ...a, id: 'b', title: 'B' };
  let transfers = updateTransferActivities(new Map(), a);
  transfers = updateTransferActivities(transfers, b);
  transfers = updateTransferActivities(transfers, { ...a, status: 'complete', progress: 100 });
  assert.equal(visibleTransferActivity(transfers).id, 'b');
  transfers = updateTransferActivities(transfers, { ...a, status: 'cancelled' });
  assert.equal(visibleTransferActivity(transfers).id, 'b');
  transfers = updateTransferActivities(transfers, { ...b, status: 'failed' });
  assert.equal(visibleTransferActivity(transfers).status, 'failed');
});
