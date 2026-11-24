import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from './loadTypeScript.mjs';
const { outputPlaybackPosition } = loadTypeScript('lib/audioOutputClock.ts');
test('output clock maps the audible sample and elapsed time since the timestamp', () => {
  const context = { state: 'running', currentTime: 12,
    getOutputTimestamp: () => ({ contextTime: 11.8, performanceTime: 990 }) };
  assert.ok(Math.abs(outputPlaybackPosition(context, 10, 5, 1, 1000) - 6.81) < 0.000001);
});
test('unsupported, interrupted, stale, invalid and pre-start output clocks fall back', () => {
  assert.equal(outputPlaybackPosition(null, 0, 0, 1, 1000), null);
  assert.equal(outputPlaybackPosition({ state: 'running', currentTime: 12 }, 0, 0, 1, 1000), null);
  for (const stamp of [
    { contextTime: 0, performanceTime: 0 }, { contextTime: NaN, performanceTime: 1900 },
    { contextTime: 11, performanceTime: 2100 }, { contextTime: 11, performanceTime: 100 },
    { contextTime: 13, performanceTime: 1900 }, { contextTime: 9, performanceTime: 1900 },
  ]) assert.equal(outputPlaybackPosition({ state: 'running', currentTime: 12,
    getOutputTimestamp: () => stamp }, 10, 5, 1, 2000), null);
  assert.equal(outputPlaybackPosition({ state: 'suspended', currentTime: 12,
    getOutputTimestamp: () => ({ contextTime: 11.8, performanceTime: 1990 }) }, 10, 5, 1, 2000), null);
});
