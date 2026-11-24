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

test('telemetry receives fresh drift checks, never samples room mutations or paused time', () => {
  const { sync, audio, snapshot } = fixture();
  const samples = [];
  const unsubscribe = sync.subscribeDrift(report => samples.push(report));
  sync.reconcile(snapshot);
  assert.equal(samples.length, 0);
  audio.isPlaying = true;
  audio.getTruePosition = () => 9.99;
  sync.correctDrift();
  audio.getTruePosition = () => 9.92;
  sync.correctDrift();
  assert.equal(samples.length, 2);
  assert.ok(Math.abs(samples[0].driftMs - 10) < 0.001);
  assert.equal(samples[0].correctionApplied, false);
  assert.equal(samples[1].tier, 'crossfade');
  assert.equal(samples[1].correctionApplied, true);
  sync.pause(5);
  sync.correctDrift();
  assert.equal(samples.length, 2);
  unsubscribe();
  sync.reconcile(snapshot);
  audio.isPlaying = true;
  sync.correctDrift();
  assert.equal(samples.length, 2);
});

test('audio-unlock telemetry reports the audio handle rather than playback intent', () => {
  const { sync, audio, snapshot } = fixture();
  sync.reconcile(snapshot);
  audio.audioUnlocked = false;
  assert.equal(sync.isAudioUnlocked(), false);
  audio.audioUnlocked = true;
  assert.equal(sync.isAudioUnlocked(), true);
});

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
  assert.equal(calls.schedule.length, 1);
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
  assert.equal(calls.schedule.length, 1);
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

test('missed initial start recovers even when render position is unavailable', async () => {
  const { sync, audio, snapshot, calls } = fixture();
  sync.reconcile(snapshot);
  sync.applyScheduleIfCurrent(sync.getGen(), snapshot, 0);
  await delay(0);
  calls.schedule.length = 0;
  audio.getTruePosition = () => -1;
  sync.getServerNow = () => 23_000;
  sync.correctDrift();
  assert.equal(calls.schedule.length, 1);
  assert.equal(calls.schedule[0].startEpoch, snapshot.startEpoch);
  assert.equal(calls.schedule[0].playbackInstanceId, snapshot.playbackInstanceId);
  audio.isPlaying = true; audio.getTruePosition = () => 12.9;
  sync.correctDrift();
  assert.equal(sync.getLastDrift().correctionApplied, true);
});

test('start recovery waits for readiness, clock, unlock and scheduled epoch', () => {
  const { sync, audio, snapshot, calls, readyClock } = fixture();
  sync.reconcile(snapshot);
  audio.isReady = false;
  sync.correctDrift(); assert.equal(calls.schedule.length, 0);
  audio.isReady = true; readyClock.current = false;
  sync.correctDrift(); assert.equal(calls.schedule.length, 0);
  readyClock.current = true; audio.audioUnlocked = false;
  sync.correctDrift(); assert.equal(calls.schedule.length, 0);
  audio.audioUnlocked = true; sync.getServerNow = () => 9_000;
  sync.correctDrift(); assert.equal(calls.schedule.length, 0);
  sync.pause(0); sync.getServerNow = () => 23_000;
  sync.correctDrift(); assert.equal(calls.schedule.length, 0);
});

test('recovery does not duplicate pending starts or restart queued future audio', async () => {
  const { sync, audio, snapshot, calls } = fixture();
  let finish;
  audio.scheduleStart = value => { calls.schedule.push(value); return new Promise(resolve => { finish = resolve; }); };
  sync.reconcile(snapshot);
  sync.correctDrift();
  sync.correctDrift();
  assert.equal(calls.schedule.length, 1);
  finish(); await delay(0);
  sync.getServerNow = () => 20_500;
  sync.correctDrift(); assert.equal(calls.schedule.length, 1);
  audio.isScheduled = true; sync.getServerNow = () => 23_000;
  sync.correctDrift(); assert.equal(calls.schedule.length, 1);
  audio.isScheduled = false;
  sync.correctDrift(); assert.equal(calls.schedule.length, 2);
  finish();
});

test('already playing drift is corrected on initial tick without room pause/resume', () => {
  const { sync, audio, snapshot } = fixture();
  audio.isPlaying = true;
  sync.reconcile(snapshot);
  sync.correctDrift();
  assert.equal(sync.getIntent().state, 'playing');
  assert.equal(sync.getLastDrift().correctionApplied, true);
  assert.equal(sync.getLastDrift().tier, 'crossfade');
});

test('output clock detects audible drift even when graph time matches the latency estimate', () => {
  const { sync, audio, snapshot, calls } = fixture();
  audio.isPlaying = true;
  audio.outputLatency = 0.04;
  let render = 10.04;
  audio.getTruePosition = () => render;
  audio.getOutputPosition = () => render - 0.14;
  audio.playNow = position => { render = position; calls.start.push(position); };
  sync.reconcile(snapshot);
  sync.correctDrift();
  assert.equal(sync.getLastDrift().correctionApplied, true);
  assert.ok(Math.abs(calls.start[0] - 10.14) < 0.000001);
  sync.correctDrift();
  assert.equal(sync.getLastDrift().tier, 'synced');
  assert.equal(calls.start.length, 1);
});

test('invalid manual offsets cannot poison continuous playback correction', () => {
  const { sync, audio, snapshot, calls } = fixture();
  audio.isPlaying = true;
  audio.manualLatency = NaN;
  audio.getTruePosition = () => 9.9;
  sync.reconcile(snapshot);
  sync.correctDrift();
  assert.equal(sync.getLastDrift().correctionApplied, true);
  assert.ok(Number.isFinite(calls.start[0]));
});

test('diagnostics expose a stalled correction gate instead of returning an old synced report', () => {
  const { sync, audio, snapshot, readyClock } = fixture();
  sync.reconcile(snapshot);
  audio.isPlaying = true;
  readyClock.current = false;
  assert.equal(sync.getDiagnostics().status, 'clock-untrusted');
  readyClock.current = true; audio.audioUnlocked = false;
  assert.equal(sync.getDiagnostics().status, 'audio-locked');
  audio.audioUnlocked = true; audio.isReady = false;
  assert.equal(sync.getDiagnostics().status, 'audio-not-ready');
  audio.isReady = true;
  audio.getTruePosition = () => 10.04;
  audio.outputLatency = 0.04;
  audio.getOutputPosition = () => 9.9;
  const diagnostic = sync.getDiagnostics();
  assert.equal(diagnostic.status, 'active');
  assert.equal(diagnostic.measuredLatencyMs, 140);
  assert.equal(diagnostic.signedDriftMs, 100);
});

test('crossfade restarts at the current room position after the fade, without leaving residual drift', async () => {
  const { sync, audio, calls, snapshot } = fixture();
  audio.isPlaying = true;
  let now = 20_000;
  let position = 9.91;
  sync.getServerNow = () => now;
  audio.getTruePosition = () => position;
  audio.audioCtx = { currentTime: 1 };
  audio.gainNode = { gain: {
    cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {},
  } };
  audio.playNow = value => { position = value; calls.start.push(value); };
  sync.reconcile(snapshot);

  sync.correctDrift();
  assert.equal(sync.getLastDrift().tier, 'crossfade');
  now += 50;
  await delay(75);

  assert.ok(Math.abs(calls.start[0] - 10.05) < 0.001, `restart position was ${calls.start[0]}`);
  sync.correctDrift();
  assert.equal(sync.getLastDrift().tier, 'synced');
  assert.equal(calls.start.length, 1);
});
