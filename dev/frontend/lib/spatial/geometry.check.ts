/**
 * geometry.check.ts
 *
 * Self-check for the spatial maths that has no UI to notice when it breaks:
 * the pan-pad sign conventions and the spread/divergence gain law. Excluded
 * from the build (see tsconfig `exclude`) — run it directly:
 *
 *   node --experimental-strip-types lib/spatial/geometry.check.ts
 *
 * It throws on the first failure and prints nothing but "ok" when clean.
 */

import assert from 'node:assert/strict';
import {
  GAIN_FLOOR,
  MAX_ELEVATION,
  MAX_RADIUS,
  MIN_RADIUS,
  computeSpeakerGains,
  polarToCartesian,
  type Speaker,
} from './geometry.ts';
import { PLANES, toPosition } from './panPlanes.ts';

const plane = (id: string) => {
  const p = PLANES.find(x => x.id === id);
  assert.ok(p, `missing plane ${id}`);
  return p;
};

// ── Pad sign conventions ────────────────────────────────────────────────────
// Getting any of these backwards puts the handle in the wrong quadrant, which
// looks plausible enough on screen to ship.

const front = polarToCartesian({ angle: 0, radius: 2, elevation: 0 });
const right = polarToCartesian({ angle: Math.PI / 2, radius: 2, elevation: 0 });
const high = polarToCartesian({ angle: 0, radius: 2, elevation: 30 });

// Top view: front is the upper half, right is the right half.
assert.ok(plane('top').toPad(front)[1] < 0, 'top: front should be up');
assert.ok(plane('top').toPad(right)[0] > 0, 'top: right should be right');

// Front view: raised is the upper half, right is the right half.
assert.ok(plane('front').toPad(high)[1] < 0, 'front: raised should be up');
assert.ok(plane('front').toPad(right)[0] > 0, 'front: right should be right');

// Side view: front is the right half, raised is the upper half.
assert.ok(plane('side').toPad(front)[0] > 0, 'side: front should be right');
assert.ok(plane('side').toPad(high)[1] < 0, 'side: raised should be up');

// Round trip: each view must return exactly what it was given, with the axis it
// hides carried over untouched.
for (const p of PLANES) {
  for (const v of [front, right, high]) {
    const [u, w] = p.toPad(v);
    const back = p.fromPad(u, w, v);
    assert.ok(
      Math.hypot(back.x - v.x, back.y - v.y, back.z - v.z) < 1e-9,
      `${p.id}: round trip drifted`,
    );
  }
}

// Corners clamp instead of escaping the room.
for (const p of PLANES) {
  const corner = toPosition(p.fromPad(1, -1, { x: 0, y: 0, z: 0 }));
  assert.ok(corner.radius <= MAX_RADIUS + 1e-9, `${p.id}: radius escaped`);
  assert.ok(Math.abs(corner.elevation) <= MAX_ELEVATION + 1e-9, `${p.id}: elevation escaped`);
}

// Dragging through the centre of a pad: `atan2` of a near-zero vector swings
// through every bearing in two frames, which snapped the sound between
// speakers. The bearing must hold and the radius must clamp up instead.
const held = Math.PI / 3;
const centreDrag = toPosition({ x: 1e-9, y: 0, z: -1e-9 }, held);
assert.equal(centreDrag.angle, held, 'near-origin should keep the fallback angle');
assert.ok(Math.abs(centreDrag.radius - MIN_RADIUS) < 1e-9, 'near-origin should clamp to MIN_RADIUS');

// Exactly at the origin — the degenerate case the drag actually passes through.
assert.equal(toPosition({ x: 0, y: 0, z: 0 }, held).angle, held, 'origin should keep the fallback angle');

// Outside the dead zone the real bearing wins, fallback or no fallback.
const real = toPosition(polarToCartesian({ angle: 0, radius: 2, elevation: 0 }), held);
assert.ok(Math.abs(real.angle) < 1e-9, 'beyond MIN_RADIUS the measured angle should win');

// ── Spread / divergence ─────────────────────────────────────────────────────

const stereo: Speaker[] = [
  { id: 'L', position: { angle: -Math.PI / 2, radius: 1, elevation: 0 } },
  { id: 'R', position: { angle: Math.PI / 2, radius: 1, elevation: 0 } },
];

// Dead centre: equal power, and the pair sums to unit power.
const centre = computeSpeakerGains(0, stereo, 0);
assert.ok(Math.abs(centre.get('L')! - centre.get('R')!) < 1e-9, 'centre should be balanced');
assert.ok(
  Math.abs(centre.get('L')! ** 2 + centre.get('R')! ** 2 - 1) < 1e-9,
  'crossfade should be constant power',
);

// spread 0 is a hard point source: park on R and L goes silent.
const hard = computeSpeakerGains(Math.PI / 2, stereo, 0);
assert.ok(Math.abs(hard.get('R')! - 1) < 1e-9, 'spread 0: near speaker should be full');
assert.ok(hard.get('L')! < 1e-9, 'spread 0: far speaker should be silent');

// spread 1 fills the room: everything full regardless of where the source is.
const filled = computeSpeakerGains(Math.PI / 2, stereo, 1);
for (const id of ['L', 'R']) {
  assert.ok(Math.abs(filled.get(id)! - 1) < 1e-9, `spread 1: ${id} should be full`);
}

// The default keeps the far speaker audible but clearly behind.
const def = computeSpeakerGains(Math.PI / 2, stereo, GAIN_FLOOR);
assert.ok(Math.abs(def.get('L')! - GAIN_FLOOR) < 1e-9, 'default: far speaker sits at the floor');
assert.ok(def.get('R')! > def.get('L')!, 'default: near speaker should still lead');

// Out-of-range spread must not poison an AudioParam.
for (const bad of [-1, 2, Number.NaN]) {
  for (const g of computeSpeakerGains(0, stereo, bad).values()) {
    assert.ok(Number.isFinite(g) && g >= 0 && g <= 1, `spread ${bad} produced ${g}`);
  }
}

console.log('ok');
