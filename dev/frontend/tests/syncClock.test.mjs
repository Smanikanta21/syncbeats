import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from './loadTypeScript.mjs';

const { estimateClockSample } = loadTypeScript('lib/syncClock.ts');

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
