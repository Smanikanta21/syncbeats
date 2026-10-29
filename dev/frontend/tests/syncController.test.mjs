import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { loadTypeScript } from './loadTypeScript.mjs';

// Disable development-only telemetry; these checks never call a live service.
process.env.NODE_ENV = 'production';
const { SyncController } = loadTypeScript('hooks/useSyncController.ts');
const trackUrl = 'youtube:abcdefghijk';

function fixture() {
  const calls = { pause: [], start: [], schedule: [], volume: [], rate: [] };
  const audio = {
    trackUrl, isPlaying: false, isReady: true, audioUnlocked: true, volume: 80, outputLatency: 0, manualLatency: 0,
    getTruePosition: () => 9.9,
    pauseAt: value => { calls.pause.push(value); audio.isPlaying = false; },
    playNow: value => { calls.start.push(value); audio.isPlaying = true; },
    scheduleStart: async value => { calls.schedule.push(value); },
    isReadyForTrack: url => url === trackUrl,
    setPlaybackInstance: () => {}, setPlaybackRate: value => calls.rate.push(value),
  };
  const readyClock = { current: true };
  const sync = new SyncController();
  sync.getServerNow = () => 20_000;
  sync.bind({ current: audio }, { current: 0 }, { current: { DRIFT_SOFT_SEEK_MS: 2, DRIFT_HARD_SEEK_MS: 60 } }, readyClock);
  const snapshot = { roomId: '123456', trackUrl, isPlaying: true, startEpoch: 10_000, pauseOffset: 0,
    playbackInstanceId: 'instance-a', pendingPlay: false, queue: [], participants: [] };
  return { sync, audio, readyClock, calls, snapshot };
}

test('reconnect and ordinary snapshots share intent; repeated metadata leaves its generation unchanged', () => {
  const { sync, snapshot, calls } = fixture();
  sync.reconcile(snapshot);
  const gen = sync.getGen();
  sync.reconcile({ ...snapshot, queue: [{ title: 'Updated title' }] });
  assert.equal(sync.getGen(), gen);
  assert.equal(sync.getIntent().state, 'playing');
  assert.equal(calls.pause.length, 0);
});

test('late NTP callbacks cannot start audio after pause, replacement or room reset', () => {
  const { sync, snapshot, calls } = fixture();
  for (const invalidate of [() => sync.pause(4), () => sync.setTrack('youtube:lmnopqrstuv'), () => sync.idle()]) {
    sync.reconcile(snapshot);
    const gen = sync.getGen();
    invalidate();
    sync.applyScheduleIfCurrent(gen, snapshot, 0);
  }
  assert.equal(calls.schedule.length, 0);
  assert.ok(calls.pause.includes(4));
});

test('completed sources stay completed across duplicate/reconnect snapshots until a new instance', () => {
  const { sync, audio, snapshot, calls } = fixture();
  sync.reconcile(snapshot);
  assert.equal(sync.complete(trackUrl, 'old-instance'), false);
  assert.equal(sync.complete(trackUrl, 'instance-a'), true);
  assert.equal(sync.complete(trackUrl, 'instance-a'), false);
  sync.reconcile(snapshot);
  sync.correctDrift();
  sync.applyScheduleIfCurrent(sync.getGen(), snapshot, 0);
  assert.equal(calls.start.length, 0);
  assert.equal(calls.schedule.length, 0);
  sync.reconcile({ ...snapshot, playbackInstanceId: 'instance-b', startEpoch: 20_000 });
  audio.isPlaying = false;
  sync.correctDrift();
  assert.equal(calls.start.length, 1);
});

test('clock recovery and autoplay unlock both gate local continuation', () => {
  const { sync, audio, readyClock, snapshot, calls } = fixture();
  sync.reconcile(snapshot);
  readyClock.current = false;
  sync.correctDrift();
  readyClock.current = true;
  audio.audioUnlocked = false;
  sync.correctDrift();
  assert.equal(calls.start.length, 0);
  audio.audioUnlocked = true;
  sync.correctDrift();
  assert.equal(calls.start.length, 1);
});

test('drift recovery never changes playback rate to chase timing error', () => {
  const { sync, audio, snapshot, calls } = fixture();
  sync.reconcile(snapshot);
  audio.isPlaying = true;
  audio.getTruePosition = () => 9.92;
  sync.correctDrift();
  assert.equal(sync.getLastDrift().tier, 'crossfade');
  assert.ok(calls.rate.every(rate => rate === 1));
});

test('pending readiness and idle queue history are preserved independently of playing intent', () => {
  const { sync, snapshot, calls } = fixture();
  sync.reconcile({ ...snapshot, isPlaying: false, startEpoch: null, pendingPlay: true });
  assert.equal(sync.getIntent().state, 'paused');
  assert.equal(sync.getRoomIntent().pendingPlay, true);
  sync.reconcile({ ...snapshot, trackUrl: null, isPlaying: false, queue: [{ trackUrl }] });
  assert.equal(sync.getIntent().state, 'idle');
  assert.equal(calls.start.length, 0);
});

test('a delayed crossfade cannot revive a paused or replaced source, and restores its gain', async () => {
  const { sync, audio, snapshot, calls } = fixture();
  audio.audioCtx = { currentTime: 10 };
  audio.gainNode = { gain: {
    value: 0.8, cancelScheduledValues: () => {},
    setValueAtTime: value => calls.volume.push(value), linearRampToValueAtTime: () => {},
  } };
  sync.reconcile(snapshot);
  audio.isPlaying = true;
  sync.correctDrift();
  assert.equal(sync.getLastDrift().tier, 'crossfade');
  sync.pause(10);
  sync.reconcile({ ...snapshot, playbackInstanceId: 'instance-b' });
  await delay(45);
  assert.equal(calls.start.length, 0);
  assert.equal(calls.volume.at(-1), 0.8);
});
