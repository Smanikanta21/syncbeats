/**
 * The site's accent palette — now a constant.
 *
 * This module used to walk magenta -> violet -> cyan on a 25 s clock and publish
 * the result to `<html>`. That walk was the single source of the brand's pink and
 * light blue. It is gone: the chrome is ink on paper, and depth comes from two
 * TEMPERATURES (warm highlight, cool shadow) rather than from hue. See the
 * "Smoked glass" note in app/globals.css.
 *
 * globals.css owns the theme variables. `accentAt()` returns their references
 * plus the warm and cool tints used by the landing shader.
 *
 * `hsl` / `hslB` keep their HSL shape because the landing shader converts them
 * with `toRgb01()`; they now describe the warm and cool tints, which is what the
 * interference bands are drawn in.
 */

/** [hue 0-360, saturation %, lightness %] */
export type Hsl = readonly [number, number, number];

/** Warm highlight — light passing through the glass. Near #FFF6E8. */
const WARM: Hsl = [38, 100, 96];
/** Cool shadow — thickness building in the glass. Near #DCE4EC. */
const COOL: Hsl = [210, 33, 89];

/** Nothing walks any more. Kept for callers that read it. */
export const ACCENT_CYCLE_S = 25;

/** sRGB in 0..1, which is what a shader uniform wants. */
export function toRgb01(c: Hsl): [number, number, number] {
  const h = c[0] / 360;
  const s = c[1] / 100;
  const l = c[2] / 100;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    const x = (t % 1 + 1) % 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [ch(h + 1 / 3), ch(h), ch(h - 1 / 3)];
}

export type Accent = {
  /** Warm tint, for canvas work that wants the numbers. */
  hsl: Hsl;
  /** Cool tint, likewise. */
  hslB: Hsl;
  color: string;
  glow: string;
  border: string;
  gradient: string;
  blob1: string;
  blob2: string;
};

/**
 * Ink accent. `color`, `glow`, `border` and `gradient` all derive from the
 * foreground rather than from a fixed hex, so they follow the theme: the same
 * call is correct in light and dark without a theme read.
 */
export function accentAt(): Accent {
  return {
    hsl: WARM,
    hslB: COOL,
    color: "var(--foreground)",
    glow: "var(--accent-glow)",
    border: "var(--accent-border)",
    gradient: "var(--accent-gradient)",
    blob1: "var(--accent-blob-1)",
    blob2: "var(--accent-blob-2)",
  };
}

/** Seconds since this module loaded. The shader still reads it as its clock. */
const EPOCH = typeof performance !== "undefined" ? performance.now() : 0;
export const accentClock = () =>
  typeof performance !== "undefined" ? (performance.now() - EPOCH) / 1000 : 0;
