import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from './loadTypeScript.mjs';

const { advanceImmersiveMotion: advance, immersivePhase, INITIAL_IMMERSIVE_MOTION: initial } = loadTypeScript('components/fluid/music.ts');
const run = (state, seconds, energy, onsets, playing = true, intensity = 0.65) => {
  for (let t = 0; t < seconds; t += 1 / 30) state = advance(state, energy, onsets, playing, 1 / 30, intensity);
  return state;
};

test('bass sustains broad motion while treble impulses release quickly', () => {
  const hit = advance(initial, [0, 0, 0], [1, 1, 1], true, 1 / 30, 0.65);
  const tail = run(hit, 0.4, [0, 0, 0], [0, 0, 0]);
  assert.ok(tail.bands[0] > tail.bands[1]);
  assert.ok(tail.bands[1] > tail.bands[2] * 2);
});

test('quiet audio stays quiet and stronger music brightens the field', () => {
  const quiet = run(initial, 2, [0, 0, 0], [0, 0, 0]);
  const loud = run(initial, 2, [1, 0.7, 0.4], [0, 0, 0]);
  assert.deepEqual(quiet.bands, [0, 0, 0]);
  assert.ok(loud.opacity > quiet.opacity);
  assert.ok(quiet.motion > 0.99); // A continuous gentle current still exists.
});

test('pause settles rather than abruptly removing the current or palette', () => {
  const playing = run(initial, 3, [0.8, 0.7, 0.6], [0, 0, 0]);
  const first = advance(playing, [1, 1, 1], [1, 1, 1], false, 1 / 30, 0.65);
  assert.ok(first.motion > 0.9);
  assert.ok(first.opacity > 0.25 * 0.65);
  const settled = run(first, 5, [1, 1, 1], [1, 1, 1], false);
  assert.ok(settled.motion < 0.015);
  assert.ok(Math.abs(settled.opacity - 0.25 * 0.65) < 0.005);
  assert.ok(settled.opacity > 0);
});

test('intensity controls the visual without changing detected music', () => {
  const low = run(initial, 2, [0.8, 0.3, 0.2], [0, 0, 0], true, 0.2);
  const high = run(initial, 2, [0.8, 0.3, 0.2], [0, 0, 0], true, 1);
  assert.deepEqual(low.bands, high.bands);
  assert.ok(Math.abs(high.opacity / low.opacity - 5) < 0.001);
});

test('bad FFT samples and stalled frames cannot produce invalid forces', () => {
  for (const dt of [NaN, -10, Infinity, 20]) {
    const state = advance(initial, [NaN, -3, Infinity], [Infinity, 2, -1], true, dt, 2);
    for (const value of [...state.bands, state.motion, state.opacity]) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
  }
});

test('devices with different local clocks derive the same flow phase', () => {
  assert.equal(immersivePhase(10_000, 75, 5000), immersivePhase(10_150, -75, 5000));
  assert.equal(immersivePhase(2000, 0, 3000), 0);
});
