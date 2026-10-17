/**
 * The landing page's accent palette, and the clock that walks it.
 *
 * Lives in one module so the ambient blobs and the CSS custom properties are
 * driven from the same call: `accentAt(elapsedSeconds)`. Previously the palette
 * was private to MouseGradient and the `--accent-*` properties it implied were
 * never written at all, so every consumer sat frozen on its emerald fallback.
 *
 * Stored as HSL rather than hex because the sync-field canvas needs the accent
 * *hue* as a number to converge its per-band traces onto, and because `hsla()`
 * is as portable as `rgba()` in CSS.
 */

/** [hue 0-360, saturation %, lightness %] */
export type Hsl = readonly [number, number, number];

/**
 * Primary accent and the gradient's far stop. Every published value derives from these.
 *
 * Three stages, not five, and not a rainbow: this is the walk between the two
 * brand inks, passing through the point where they overlay. Stage 0 is the dye
 * (magenta), stage 2 is the field (cyan), stage 1 is the crossing — lighter than
 * either, because two inks laid over each other transmit more, which is what
 * constructive interference does and what the product does to a room.
 *
 * `lerpHue` takes the shortest arc, so the walk descends 312 -> 190 through
 * violet and blue. That keeps the whole sweep in the cool half of the wheel and
 * well clear of the semantic hues (ok / warn / bad in globals.css), so the live
 * accent can never be mistaken for a state colour at a glance.
 *
 * Values are HSL because `hsla()` is what gets published to CSS. The
 * hue-separation guarantee is checked in OKLCH — see the note in globals.css
 * `@theme`; these HSL hues are NOT the same numbers.
 *
 * Replaces a 5-stage emerald -> sky -> violet -> rose -> amber loop, which swept
 * the entire wheel and so collided with every semantic colour in turn.
 */
export const ACCENT_STAGES: readonly { readonly a: Hsl; readonly b: Hsl }[] = [
  { a: [312, 93, 58], b: [324, 90, 66] }, // dye — magenta ink
  { a: [262, 80, 64], b: [240, 84, 66] }, // the crossing — lighter than either
  { a: [190, 81, 52], b: [180, 78, 56] }, // field — cyan ink
];

/** Seconds for one pass through the palette. Mirrored, so a round trip is twice this. */
export const ACCENT_CYCLE_S = 25;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Hue interpolation along the shortest arc. Without this the rose -> amber step
 * (350 -> 38) walks the long way round and sweeps the whole page through green
 * and blue on its way to orange.
 */
export function lerpHue(from: number, to: number, t: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return (((from + delta * t) % 360) + 360) % 360;
}

const mix = (x: Hsl, y: Hsl, t: number): Hsl => [
  lerpHue(x[0], y[0], t),
  lerp(x[1], y[1], t),
  lerp(x[2], y[2], t),
];

export const hsla = (c: Hsl, alpha = 1) =>
  `hsla(${c[0].toFixed(1)}, ${c[1].toFixed(1)}%, ${c[2].toFixed(1)}%, ${alpha})`;

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
  /** Interpolated primary, for canvas work that wants the numbers. */
  hsl: Hsl;
  /** Far stop of the gradient, likewise. */
  hslB: Hsl;
  color: string;
  glow: string;
  border: string;
  gradient: string;
  blob1: string;
  blob2: string;
};

/**
 * Where in the palette we are at `elapsedS`, folded so the walk reverses at each
 * end instead of snapping back to stage 0. This mirrors framer's
 * `repeatType: "mirror"` on the blobs — a plain forward cycle would sit a full
 * stage out of step with them after the first pass.
 */
function stageAt(elapsedS: number): number {
  const span = ACCENT_STAGES.length - 1;
  const phase = (elapsedS / ACCENT_CYCLE_S) % 2; // 0..2
  const folded = phase <= 1 ? phase : 2 - phase; // 0..1..0
  return folded * span;
}

export function accentAt(elapsedS: number): Accent {
  const pos = stageAt(elapsedS);
  const i = Math.min(Math.floor(pos), ACCENT_STAGES.length - 2);
  const t = pos - i;

  const a = mix(ACCENT_STAGES[i].a, ACCENT_STAGES[i + 1].a, t);
  const b = mix(ACCENT_STAGES[i].b, ACCENT_STAGES[i + 1].b, t);

  return {
    hsl: a,
    hslB: b,
    color: hsla(a),
    glow: hsla(a, 0.35),
    border: hsla(a, 0.4),
    gradient: `linear-gradient(135deg, ${hsla(a)} 0%, ${hsla(b)} 100%)`,
    blob1: hsla(a, 0.5),
    blob2: hsla(b, 0.35),
  };
}

/**
 * The custom properties read across the landing page, DynamicAuroraButton and
 * the auth form. `--accent-blob-*` are the softer pair the ambient blobs use.
 */
export function writeAccentVars(el: HTMLElement, accent: Accent) {
  el.style.setProperty("--accent-color", accent.color);
  el.style.setProperty("--accent-glow", accent.glow);
  el.style.setProperty("--accent-border", accent.border);
  el.style.setProperty("--accent-gradient", accent.gradient);
  el.style.setProperty("--accent-blob-1", accent.blob1);
  el.style.setProperty("--accent-blob-2", accent.blob2);
}

/**
 * Seconds since this module loaded. Everything that reads the palette reads this
 * clock, so a shader that mounts late can't end up a different colour from the
 * CSS properties — which would be visible as a seam between the WebGL field and
 * the buttons sitting on top of it.
 */
const EPOCH = typeof performance !== "undefined" ? performance.now() : 0;
export const accentClock = () =>
  typeof performance !== "undefined" ? (performance.now() - EPOCH) / 1000 : 0;

/** Custom properties only need to keep up with the eye, not the frame rate. */
const WRITE_MS = 100;

/**
 * Start publishing the accent properties onto `<html>`. Returns the stopper.
 *
 * This is the only writer, on every page that wants a live accent — the shader
 * reads the same clock for its uniforms rather than writing properties itself.
 * `frozen` pins the palette at stage 0 for viewers who asked for less motion.
 */
export function startAccentVars(frozen = false): () => void {
  if (typeof document === "undefined") return () => {};
  const el = document.documentElement;

  if (frozen) {
    writeAccentVars(el, accentAt(0));
    return () => {};
  }

  const tick = () => writeAccentVars(el, accentAt(accentClock()));
  tick();
  const id = setInterval(tick, WRITE_MS);
  return () => clearInterval(id);
}
