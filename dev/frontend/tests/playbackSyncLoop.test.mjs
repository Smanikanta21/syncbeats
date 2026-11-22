import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from './loadTypeScript.mjs';

const { startPlaybackSyncLoop } = loadTypeScript('lib/playbackSyncLoop.ts');

test('playing audio keeps getting drift checks while hidden and corrects immediately on return', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const document = new EventTarget();
  document.visibilityState = 'visible';
  const original = globalThis.document;
  globalThis.document = document;
  let checks = 0;
  let playing = true;
  let interval = 350;
  const stop = startPlaybackSyncLoop({
    correctDrift: () => checks++, isPlaying: () => playing, getIntervalMs: () => interval,
  });
  t.after(() => { stop(); globalThis.document = original; });
  assert.equal(checks, 1);
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(checks, 2);
  t.mock.timers.tick(999); assert.equal(checks, 2);
  t.mock.timers.tick(1); assert.equal(checks, 3);
  playing = false;
  t.mock.timers.tick(1000); assert.equal(checks, 3);
  playing = true;
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(checks, 4);
  interval = 500;
  t.mock.timers.tick(350); assert.equal(checks, 5);
  t.mock.timers.tick(499); assert.equal(checks, 5);
  t.mock.timers.tick(1); assert.equal(checks, 6);
  document.dispatchEvent(new Event('ytBufferEnd'));
  assert.equal(checks, 7);
  stop();
  t.mock.timers.tick(5000);
  document.dispatchEvent(new Event('visibilitychange'));
  document.dispatchEvent(new Event('ytBufferEnd'));
  assert.equal(checks, 7);
});
