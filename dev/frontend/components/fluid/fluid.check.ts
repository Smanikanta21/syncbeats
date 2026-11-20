/**
 * fluid.check.ts
 *
 * Self-check for the parts of the fluid field that have no UI to notice when
 * they break. Excluded from the build (see tsconfig `exclude`) — run it directly:
 *
 *   node --experimental-strip-types components/fluid/fluid.check.ts
 *
 * It throws on the first failure and prints nothing but "ok" when clean.
 *
 * What is covered is specifically the maths that fails *plausibly*: a flipped y
 * axis still produces fluid that moves, a broken quality ladder still renders,
 * and a non-deterministic beat position still looks fine on one device. All
 * three only show up as "the background feels slightly wrong", which is not a
 * bug report anyone can act on. The GL pipeline itself is not covered — it needs
 * a GPU, and it fails loudly (black screen) rather than subtly.
 */

import assert from 'node:assert/strict';
import {
  QUALITY_LADDER,
  QUALITY_FOR_TIER,
  beatIndexAt,
  beatSplatPoint,
  hexToRgb01,
  nextLowerQuality,
  splatCoords,
} from './math.ts';

// ── Splat coordinates ───────────────────────────────────────────────────────
// Pointer events are top-left origin; GL texture coordinates are bottom-left.
// Forgetting the flip mirrors every interaction vertically, which looks
// believable in isolation — ink still follows the cursor, just on the wrong
// side of the screen.

const tl = splatCoords(0, 0, 1000, 500);
assert.deepEqual(tl, { x: 0, y: 1 }, 'viewport top-left must map to GL top (y=1)');

const bl = splatCoords(0, 500, 1000, 500);
assert.deepEqual(bl, { x: 0, y: 0 }, 'viewport bottom-left must map to GL bottom (y=0)');

const mid = splatCoords(500, 250, 1000, 500);
assert.deepEqual(mid, { x: 0.5, y: 0.5 }, 'centre must map to centre');

// Degenerate viewport: a canvas measured before layout reports 0. Dividing by it
// yields Infinity/NaN, which propagates into the velocity field and kills the
// sim for the rest of the session rather than for one frame.
assert.deepEqual(
  splatCoords(10, 10, 0, 0),
  { x: 0.5, y: 0.5 },
  'zero-size viewport must fall back to centre, never NaN',
);

// ── Quality ladder ──────────────────────────────────────────────────────────
// The runtime downgrade path walks this. A ladder that does not terminate loops
// forever; one that terminates early never reaches the cheap rung and the
// component bails to CSS on a device that could have run the sim.

assert.ok(QUALITY_LADDER.length >= 2, 'ladder needs at least one step down');

for (let i = 1; i < QUALITY_LADDER.length; i++) {
  const prev = QUALITY_LADDER[i - 1];
  const cur = QUALITY_LADDER[i];
  const prevCost = prev.sim * prev.sim * prev.pressureIters + prev.dye * prev.dye;
  const curCost = cur.sim * cur.sim * cur.pressureIters + cur.dye * cur.dye;
  assert.ok(curCost < prevCost, `ladder rung ${i} must be cheaper than rung ${i - 1}`);
}

// Walking the whole ladder must reach null in exactly as many steps as rungs.
let q = QUALITY_LADDER[0];
let steps = 0;
while (true) {
  const next = nextLowerQuality(q);
  if (!next) break;
  q = next;
  steps++;
  assert.ok(steps <= QUALITY_LADDER.length, 'ladder must terminate, not cycle');
}
assert.equal(steps, QUALITY_LADDER.length - 1, 'every rung must be reachable');

// An unrecognised quality (hand-tuned, or a stale persisted value) must degrade
// rather than immediately give up — returning null there would blank the field.
assert.ok(
  nextLowerQuality({ sim: 999, dye: 999, pressureIters: 99 }) !== null,
  'unknown quality must step down, not bail',
);

assert.equal(QUALITY_FOR_TIER.low, null, 'low tier must not run the solver at all');
assert.ok(QUALITY_FOR_TIER.high && QUALITY_FOR_TIER.mid, 'high and mid tiers must have a quality');

// ── Colour ──────────────────────────────────────────────────────────────────

assert.deepEqual(hexToRgb01('#ffffff'), [1, 1, 1]);
assert.deepEqual(hexToRgb01('#000000'), [0, 0, 0]);
assert.deepEqual(hexToRgb01('ff0000'), [1, 0, 0], 'bare hex (no #) must parse');
assert.deepEqual(hexToRgb01('#f00'), [1, 0, 0], 'short hex must expand');
// Album-art extraction is a best-effort canvas read that can hand back junk.
// Returning NaN here would stain the dye field permanently.
assert.deepEqual(hexToRgb01('not a colour'), [1, 1, 1], 'garbage must fall back, not NaN');
assert.deepEqual(hexToRgb01(''), [1, 1, 1], 'empty must fall back');
for (const c of hexToRgb01('#F72FD0')) {
  assert.ok(Number.isFinite(c) && c >= 0 && c <= 1, 'channels must be finite and in 0..1');
}

// ── Beat splat determinism ──────────────────────────────────────────────────
// This is the feature: every device in a room splats in the same place on the
// same beat, so five phones on a table bloom together. That only holds if the
// position is a pure function of the beat index — any Math.random or Date.now
// in here silently turns the shared moment into five unrelated ones, and it
// still looks correct on any single device.

for (const i of [0, 1, 7, 23, 24, 101, 1000]) {
  assert.deepEqual(
    beatSplatPoint(i),
    beatSplatPoint(i),
    `beat ${i} must be deterministic across calls`,
  );
}

assert.notDeepEqual(
  beatSplatPoint(4),
  beatSplatPoint(5),
  'consecutive beats must not land on the same spot (would read as a metronome)',
);

// Everything must stay on screen — a splat outside 0..1 is simply invisible, so
// a too-large spread quietly drops beats.
for (let i = 0; i < 200; i++) {
  const p = beatSplatPoint(i);
  assert.ok(p.x >= 0 && p.x <= 1, `beat ${i} x=${p.x} off frame`);
  assert.ok(p.y >= 0 && p.y <= 1, `beat ${i} y=${p.y} off frame`);
}

// The spiral should actually cover the frame rather than hugging the centre:
// if every beat lands within a few percent of the middle, the field only ever
// blooms from one point and the whole effect collapses.
const radii = Array.from({ length: 48 }, (_, i) => {
  const p = beatSplatPoint(i);
  return Math.hypot(p.x - 0.5, p.y - 0.5);
});
assert.ok(Math.max(...radii) > 0.2, 'beats must reach away from centre');
assert.ok(Math.min(...radii) < 0.05, 'some beats should land near centre too');

// ── Shared beat index ───────────────────────────────────────────────────────
// The clock correction here was wrong once already, and nothing on screen said
// so: a device using its own unadjusted clock still blooms on every beat, it
// just blooms somewhere different from the phone next to it. Only two devices
// side by side reveal it, which is exactly the setup nobody has while coding.

const EPOCH = 1_700_000_000_000;
const Q = 480;

// Device A's clock matches the server (offset 0). Device B's clock runs 320ms
// slow, so its Date.now() reads 320 less and its measured offset is +320.
// Both must land on the same index.
//
// The timestamps are chosen so corrected elapsed = 5040ms = 10.5 quanta, which
// rounds to 11, while the UNcorrected 4720ms = 9.83 quanta rounds to 10. Values
// that straddle a boundary like this are the point: with a lazier pair (e.g.
// 5000/4680) the broken and correct implementations both round to 10 and the
// guard below passes for code that applies no correction at all.
const A = beatIndexAt(EPOCH + 5040, 0, EPOCH, Q);
const B = beatIndexAt(EPOCH + 4720, 320, EPOCH, Q);
const B_BROKEN = beatIndexAt(EPOCH + 4720, 0, EPOCH, Q);

assert.equal(A, 11, 'sanity: corrected elapsed 5040ms is beat 11');
assert.equal(B, A, 'devices with correctly-estimated offsets must agree');
assert.notEqual(B_BROKEN, A, 'the offset must actually be applied — guard against a no-op correction');

assert.equal(beatIndexAt(EPOCH, 0, EPOCH, Q), 0, 'the epoch itself is beat 0');
assert.equal(beatIndexAt(EPOCH + Q, 0, EPOCH, Q), 1, 'one quantum on is beat 1');

// No epoch yet = no shared timeline. Returning 0 would be a lie the caller
// could not distinguish from "we are exactly at the start of the track".
assert.equal(beatIndexAt(EPOCH, 0, null, Q), null, 'null epoch must report null');
assert.equal(beatIndexAt(EPOCH, 0, undefined, Q), null, 'undefined epoch must report null');
assert.equal(beatIndexAt(EPOCH, 0, 0, Q), null, 'epoch 0 is unset, not a real anchor');

// Monotonic: later wall-clock must never produce an earlier beat.
let prevIdx = -Infinity;
for (let t = 0; t < 20_000; t += 137) {
  const i = beatIndexAt(EPOCH + t, -40, EPOCH, Q)!;
  assert.ok(i >= prevIdx, `beat index went backwards at t=${t}`);
  prevIdx = i;
}

console.log('ok');
