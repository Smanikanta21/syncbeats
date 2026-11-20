/**
 * Pure maths for the fluid field — no WebGL, no React, no imports.
 *
 * Split out from ./sim.ts so that ./fluid.check.ts can exercise it under plain
 * `node --experimental-strip-types`. Node's ESM resolver needs explicit file
 * extensions, and sim.ts imports its shaders extensionlessly (as the rest of the
 * repo does, because webpack resolves that fine) — so importing sim.ts from a
 * check script fails to resolve before a single assertion runs.
 *
 * Keeping the maths in a leaf module is also just where it belongs: none of it
 * needs a GPU, and all of it fails *quietly* when wrong. That combination is
 * exactly what wants a test.
 */

// ── Quality ───────────────────────────────────────────────────────────────────

export type Quality = {
  /** Velocity/pressure grid, square. The solver's accuracy knob. */
  sim: number;
  /** Dye grid, square. The *visible* resolution — what sharpness costs. */
  dye: number;
  /** Jacobi iterations per frame. The single biggest cost in the solver. */
  pressureIters: number;
};

/**
 * The ladder, most expensive first. `useDevicePerf`'s tier picks a starting
 * rung; `nextLowerQuality` walks down when measured frame times say the guess
 * was optimistic.
 *
 * Dye resolution and iteration count are spent before sim resolution on
 * purpose: coarsening the velocity grid makes the motion visibly blocky, while
 * halving the dye grid mostly costs edge sharpness on a field that its own
 * advection blurs anyway.
 */
export const QUALITY_LADDER: readonly Quality[] = [
  { sim: 128, dye: 512, pressureIters: 20 },
  { sim: 128, dye: 256, pressureIters: 12 },
  { sim: 64, dye: 256, pressureIters: 8 },
];

export const QUALITY_FOR_TIER: Record<"high" | "mid" | "low", Quality | null> = {
  high: QUALITY_LADDER[0],
  mid: QUALITY_LADDER[1],
  // Low tier never runs the solver — the component renders a static gradient
  // instead. Returning a Quality here would imply otherwise.
  low: null,
};

/** The next rung down, or null at the bottom (caller should bail to CSS). */
export function nextLowerQuality(current: Quality): Quality | null {
  const i = QUALITY_LADDER.findIndex(
    (q) =>
      q.sim === current.sim &&
      q.dye === current.dye &&
      q.pressureIters === current.pressureIters,
  );
  // An unrecognised quality is treated as the TOP rung rather than the bottom,
  // so a hand-tuned or stale persisted config degrades one step instead of
  // instantly blanking the field.
  if (i === -1) return QUALITY_LADDER[1] ?? null;
  return QUALITY_LADDER[i + 1] ?? null;
}

// ── Coordinates ───────────────────────────────────────────────────────────────

/**
 * Viewport pixels -> splat coordinates.
 *
 * The y flip is the part that is easy to get wrong and hard to notice: pointer
 * events are top-left origin, GL texture coordinates are bottom-left. Skipping
 * it mirrors every interaction vertically, which still *looks* like working
 * fluid — ink follows the cursor, just on the wrong side of the screen.
 */
export function splatCoords(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): { x: number; y: number } {
  // A canvas measured before layout reports 0. Dividing by it yields Infinity,
  // which advects into the velocity field and kills the sim for the rest of the
  // session rather than for one frame.
  return {
    x: width > 0 ? clientX / width : 0.5,
    y: height > 0 ? 1 - clientY / height : 0.5,
  };
}

/**
 * Deterministic point on the frame for the n-th beat of a track.
 *
 * THE SHARED MOMENT DEPENDS ON THIS BEING PURE. Every device in a room derives
 * its splat position from the same beat index off the same shared timeline, so
 * five phones on a table bloom in the same place at the same instant. Any
 * Math.random or Date.now in here silently turns one shared moment into five
 * unrelated ones — and it still looks perfectly fine on any single device,
 * which is why it is asserted rather than trusted.
 *
 * Golden-angle spiral rather than a hash: consecutive beats land far apart (so
 * it never reads as a metronome tapping one spot) while the sequence still
 * covers the frame evenly. Cheap, monotone, no state.
 */
export function beatSplatPoint(
  beatIndex: number,
  spread = 0.34,
): { x: number; y: number } {
  const GOLDEN = 2.39996323;
  const a = beatIndex * GOLDEN;
  // sqrt keeps the spiral area-uniform instead of clustering at the centre.
  const r = Math.sqrt((beatIndex % 24) / 24) * spread;
  return { x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r };
}

/**
 * Which beat index `nowMs` falls on, in the room's shared timeline.
 *
 * `startEpoch` is stamped by the SERVER, so `clockOffset` (this device's NTP
 * estimate, from useRoom) must be applied before subtracting or each device
 * measures elapsed time on its own skewed clock. Two phones 200ms apart would
 * then pick different indices and splat in different places — which looks
 * completely fine on either phone alone, and ruins the only thing the shared
 * index exists for.
 *
 * Returns null when there is no epoch yet (track not scheduled), so the caller
 * can fall back to a local clock rather than treating 0 as a real anchor.
 */
export function beatIndexAt(
  nowMs: number,
  clockOffset: number,
  startEpoch: number | null | undefined,
  quantumMs: number,
): number | null {
  if (!startEpoch) return null;
  return Math.round((nowMs + clockOffset - startEpoch) / quantumMs);
}


// ── Colour ────────────────────────────────────────────────────────────────────

/** `#RRGGBB` / `#RGB` / bare hex -> 0..1 triple for a shader uniform. */
export function hexToRgb01(hex: string): [number, number, number] {
  let h = String(hex ?? "").trim().replace(/^#/, "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  // Album-art extraction is a best-effort canvas read that can hand back junk.
  // Returning NaN here would permanently stain the dye field.
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return [1, 1, 1];
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
