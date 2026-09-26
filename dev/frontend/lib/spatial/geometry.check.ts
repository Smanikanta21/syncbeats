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
  angleDelta,
  computeSpeakerGains,
  distanceBetween,
  polarToCartesian,
  relativePolar,
  type Speaker,
  type SpatialPosition,
} from './geometry.ts';
import { PLANES, toPosition } from './panPlanes.ts';
import { DEVICE_RADIUS, SEAT_ARC, SEAT_RADIUS, SEAT_SLOTS, resolveSeats, seatKey } from './seats.ts';

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

// ── Seat placement ──────────────────────────────────────────────────────────
// Every client builds the layout independently from the same participant list,
// so any disagreement here means people see each other in different places.

const crowd = ['zoe', 'al', 'mika', 'bo', 'ren', 'ivy'];
const seatsOf = (ids: string[], stored: Record<string, SpatialPosition> = {}) =>
  resolveSeats([...ids].sort(), stored);

// Same set, different arrival order → identical placement.
const a1 = seatsOf(crowd);
const a2 = seatsOf([...crowd].reverse());
for (const id of crowd) {
  assert.deepEqual(a1.get(id)!.seat, a2.get(id)!.seat, `${id}: placement depends on order`);
}

// The whole point: no two seats closer than one slot. The old hash-derived
// bearing was uniform over the full circle, so with three users two of them
// routinely landed a couple of degrees apart and drew on top of each other.
const placed = crowd.map(id => a1.get(id)!.seat);
for (let i = 0; i < placed.length; i++) {
  for (let j = i + 1; j < placed.length; j++) {
    const gap = Math.abs(angleDelta(placed[i].angle, placed[j].angle));
    assert.ok(
      gap >= SEAT_ARC - 1e-9,
      `seats ${i}/${j} only ${((gap * 180) / Math.PI).toFixed(1)}° apart`,
    );
  }
}

// Seat + its devices must stay inside the room.
assert.ok(SEAT_RADIUS + DEVICE_RADIUS <= MAX_RADIUS, 'device cloud escapes MAX_RADIUS');

// A hand-placed seat is returned untouched, and no default lands on top of it —
// including when the stored user sorts *after* the ones taking defaults.
const mine: SpatialPosition = { angle: 1.2, radius: 2.1, elevation: 0 };
const withStored = seatsOf(crowd, { [seatKey('zoe')]: mine });
assert.deepEqual(withStored.get('zoe')!.seat, mine, 'stored seat should not move');
assert.equal(withStored.get('zoe')!.isDefault, false, 'stored seat should not be flagged default');
for (const id of crowd) {
  if (id === 'zoe') continue;
  assert.ok(
    distanceBetween(withStored.get(id)!.seat, mine) > 0.5,
    `${id} defaulted on top of a hand-placed seat`,
  );
}

// Alone in the room you are the listener, so you sit at the centre.
assert.equal(seatsOf(['solo']).get('solo')!.seat.radius, 0, 'a lone user should be centred');

// Past the slot count seats have to be reused — assert the ceiling is reached
// rather than silently producing NaN or escaping the ring.
const packed = seatsOf(Array.from({ length: SEAT_SLOTS + 3 }, (_, i) => `u${i}`));
for (const { seat } of packed.values()) {
  assert.ok(Number.isFinite(seat.angle) && seat.radius === SEAT_RADIUS, 'overflow seat is malformed');
}

// ── Reciprocity ─────────────────────────────────────────────────────────────
// Every client draws the room from its own seat, so "put the phone to my right"
// has to read back on the phone as "the Mac is to my left" — same distance,
// opposite bearing, opposite height. It falls out of `relativePolar` being odd
// in the difference vector, which is exactly the kind of thing a well-meaning
// refactor breaks silently: the map still looks plausible, it just lies.

const pairs: [SpatialPosition, SpatialPosition][] = [
  // Straight across, level.
  [{ angle: 0, radius: 2, elevation: 0 }, { angle: Math.PI, radius: 2, elevation: 0 }],
  // Off-axis, one raised — covers the "and same, for up and down" case.
  [{ angle: 0.7, radius: 2.4, elevation: 22 }, { angle: -2.1, radius: 1.1, elevation: -8 }],
  // One of them at the room centre, the degenerate origin.
  [{ angle: 0, radius: 0, elevation: 0 }, { angle: 1.9, radius: 3, elevation: 15 }],
];

for (const [a, b] of pairs) {
  const there = relativePolar(b, a); // where B is, seen from A
  const back = relativePolar(a, b); // where A is, seen from B

  assert.ok(Math.abs(there.radius - back.radius) < 1e-9, 'reciprocity: distances disagree');
  assert.ok(
    Math.abs(Math.abs(angleDelta(there.angle, back.angle)) - Math.PI) < 1e-9,
    'reciprocity: bearings are not opposite',
  );
  assert.ok(Math.abs(there.elevation + back.elevation) < 1e-9, 'reciprocity: heights do not mirror');
}

// Concretely: put B to A's right and A must land on B's left.
const [me, them] = [
  { angle: 0, radius: 1, elevation: 0 },
  { angle: Math.PI / 2, radius: 1, elevation: 0 },
];
assert.ok(relativePolar(them, me).angle > 0, 'they should be on my right');
assert.ok(relativePolar(me, them).angle < 0, 'I should be on their left');

// Your own seat is always the centre of your own view.
const seatOfMine: SpatialPosition = { angle: 2.2, radius: 1.7, elevation: 12 };
assert.ok(relativePolar(seatOfMine, seatOfMine).radius < 1e-9, 'you should sit at your own origin');

console.log('ok');
