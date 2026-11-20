import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from './loadTypeScript.mjs';

const { estimateClockSample, selectClockOffset } = loadTypeScript('lib/syncClock.ts');

test('four-timestamp estimate removes server processing time and returns server-minus-client offset', () => {
  const sample = estimateClockSample({ t0: 1_000, t1: 1_125, t2: 1_130, t3: 1_255 });
  assert.equal(sample.rttMs, 250);
  assert.equal(sample.offsetMs, 0);
});

test('asymmetric paths leave a measurable offset error instead of hiding it as network RTT', () => {
  // 160 ms client-to-server and 80 ms server-to-client. With equal clocks,
  // the midpoint estimator is biased by half the path asymmetry (40 ms).
  const sample = estimateClockSample({ t0: 0, t1: 160, t2: 160, t3: 240 });
  assert.equal(sample.rttMs, 240);
  assert.equal(sample.offsetMs, 40);
});

test('a 278ms WAN bootstraps in the first burst even though the default gate is 250ms', () => {
  const samples = [278, 279, 280, 281, 282, 283, 850].map((rttMs, i) => ({ rttMs, offsetMs: i === 6 ? 400 : 42 }));
  assert.equal(selectClockOffset(samples, 250, true), 42);
  // After bootstrap, a wholly rejected burst cannot move the existing clock.
  assert.equal(selectClockOffset(samples, 250), null);
});

test('gated samples take priority and timed-out or invalid replies cannot establish sync', () => {
  assert.equal(selectClockOffset([{ rttMs: 30, offsetMs: 7 }, { rttMs: 290, offsetMs: 80 }], 250, true), 7);
  assert.equal(selectClockOffset([
    { rttMs: NaN, offsetMs: NaN }, { rttMs: -1, offsetMs: 0 }, { rttMs: 50, offsetMs: Infinity },
  ], 250, true), null);
  assert.equal(selectClockOffset([], 250, true), null);
});
