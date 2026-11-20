import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from './loadTypeScript.mjs';

// Run the real batching hook through dependency-aware effects and controlled
// timers, so rapid snapshots can be tested without waiting ten seconds.
const slots = [];
let cursor = 0;
let pendingEffects = [];
const react = {
  useRef(value) {
    const index = cursor++;
    return (slots[index] ??= { ref: { current: value } }).ref;
  },
  useEffect(callback, deps) {
    const index = cursor++;
    const previous = slots[index];
    if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
    pendingEffects.push(() => {
      previous?.cleanup?.();
      slots[index] = { deps, cleanup: callback() };
    });
  },
};
const { useSyncTelemetry } = loadTypeScript('hooks/useSyncTelemetry.ts', { react });

test('rapid snapshots still flush fresh drift, and reconnect cannot mix old session samples', t => {
  const timers = new Map();
  const sent = [];
  let timerStarts = 0;
  const saved = new Map();
  const replace = (key, value) => {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  };
  replace('window', {});
  replace('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/TEST) Mobile' });
  replace('document', { visibilityState: 'visible' });
  replace('setInterval', fn => { const id = ++timerStarts; timers.set(id, fn); return id; });
  replace('clearInterval', id => timers.delete(id));
  replace('requestIdleCallback', fn => fn());
  replace('fetch', async (_url, options) => { sent.push(JSON.parse(options.body)); });
  t.after(() => {
    slots.forEach(slot => slot?.cleanup?.());
    slots.length = 0;
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  let reportDrift;
  const syncRef = { current: {
    subscribeDrift(listener) { reportDrift = listener; return () => { reportDrift = null; }; },
    isAudioUnlocked: () => true,
  } };
  const options = {
    syncRef, clockOffsetRef: { current: 42 }, lastBurstRttsRef: { current: [278, 279, 280] },
    roomId: 'room-a', sessionId: 'session-a', networkQuality: 'poor', snapshot: { participants: [{}] },
  };
  const RenderTelemetry = () => {
    cursor = 0;
    pendingEffects = [];
    useSyncTelemetry(options);
    pendingEffects.forEach(effect => effect());
  };
  const flush = () => [...timers.values()].forEach(fn => fn());

  RenderTelemetry();
  reportDrift({ driftMs: 10, tier: 'synced', correctionApplied: false, playbackRate: 1 });
  for (let i = 0; i < 25; i++) {
    options.snapshot = { participants: [{}, {}] };
    RenderTelemetry();
  }
  options.networkQuality = 'fair';
  RenderTelemetry();
  reportDrift({ driftMs: 40, tier: 'crossfade', correctionApplied: true, playbackRate: 1 });
  assert.equal(timerStarts, 1);
  flush();
  assert.deepEqual(sent[0].driftSamples, [10, 40]);
  assert.equal(sent[0].correctionsCount, 1);
  assert.equal(sent[0].participantCount, 2);
  assert.equal(sent[0].networkQuality, 'fair');
  assert.equal(sent[0].audioUnlocked, true);

  reportDrift({ driftMs: 99, tier: 'synced', correctionApplied: false, playbackRate: 1 });
  options.sessionId = 'session-b';
  RenderTelemetry();
  flush();
  assert.equal(sent.length, 1);
  reportDrift({ driftMs: 5, tier: 'synced', correctionApplied: false, playbackRate: 1 });
  flush();
  assert.equal(sent[1].sessionId, 'session-b');
  assert.deepEqual(sent[1].driftSamples, [5]);
  assert.equal(timers.size, 1);
});
