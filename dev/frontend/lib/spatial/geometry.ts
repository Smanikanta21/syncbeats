/**
 * geometry.ts
 *
 * Pure coordinate math shared by the spatial audio engine and the 3D stage.
 * No React, no Web Audio, no three.js — so both sides can compute identical
 * numbers without passing state around.
 *
 * Coordinate system (matches both WebAudio's default listener and three.js):
 *   +x = right, +y = up, -z = front (away from the viewer)
 *   angle 0 = front, +π/2 = right, ±π = behind, -π/2 = left
 */

export interface SpatialPosition {
  /** Radians. 0 = front, π/2 = right, π = behind, -π/2 = left */
  angle: number;
  /** Distance from the origin in world units. 1.0 = standard placement */
  radius: number;
  /** Degrees. 0 = ear level, +45 = above, -45 = below */
  elevation: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A physical device acting as a speaker in the surround field. */
export interface Speaker {
  id: string;
  position: SpatialPosition;
}

export const MIN_RADIUS = 0.4;
export const MAX_RADIUS = 4;
export const MIN_ELEVATION = -45;
export const MAX_ELEVATION = 45;

/** Devices never drop below this share of full volume, so none ever sounds dead. */
export const GAIN_FLOOR = 0.15;

export const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

/** Wrap any angle into [0, 2π). */
export function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}

/** Shortest signed delta from `a` to `b`, in (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = normalizeAngle(b) - normalizeAngle(a);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Interpolate between two angles along the shorter arc. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDelta(a, b) * t;
}

export function polarToCartesian(pos: SpatialPosition, scale = 1): Vec3 {
  const elevRad = (pos.elevation * Math.PI) / 180;
  const r = pos.radius * scale;
  const horiz = r * Math.cos(elevRad);

  return {
    x: horiz * Math.sin(pos.angle),
    y: r * Math.sin(elevRad),
    z: -horiz * Math.cos(pos.angle),
  };
}

/**
 * Inverse of {@link polarToCartesian} on the floor plane — used while dragging a
 * puck, where the pointer raycast gives us x/z and elevation is edited separately.
 *
 * `x`/`z` describe the *horizontal projection* of the position, so the radius is
 * divided back out by cos(elevation). Without that, dropping a raised puck would
 * re-render it short of where you let go.
 */
export function cartesianToPolar(x: number, z: number, elevation = 0, scale = 1): SpatialPosition {
  const sx = x / scale;
  const sz = z / scale;
  const elev = clamp(elevation, MIN_ELEVATION, MAX_ELEVATION);
  // cos is never near zero: elevation is clamped to ±45°.
  const cos = Math.cos((elev * Math.PI) / 180);
  return {
    angle: Math.atan2(sx, -sz),
    radius: clamp(Math.hypot(sx, sz) / cos, MIN_RADIUS, MAX_RADIUS),
    elevation: elev,
  };
}

/** Distance between two polar positions, in world units. */
export function distanceBetween(a: SpatialPosition, b: SpatialPosition, scale = 1): number {
  const pa = polarToCartesian(a, scale);
  const pb = polarToCartesian(b, scale);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
}

/** Full cartesian → polar, recovering elevation. Inverse of `polarToCartesian`. */
export function vecToPolar(v: Vec3): SpatialPosition {
  const radius = Math.hypot(v.x, v.y, v.z);
  const horiz = Math.hypot(v.x, v.z);
  return {
    angle: Math.atan2(v.x, -v.z),
    radius,
    elevation: radius < 1e-6 ? 0 : (Math.atan2(v.y, horiz) * 180) / Math.PI,
  };
}

export const addVec = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const subVec = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vecLength = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);

/**
 * Re-express `target` in a frame centred on `origin`.
 *
 * Device positions travel over the wire as absolute room coordinates, but the
 * surround field is built around a listening point — your seat in My Space, the
 * room centre in Room. This converts one to the other.
 */
export function relativePolar(target: SpatialPosition, origin: SpatialPosition): SpatialPosition {
  return vecToPolar(subVec(polarToCartesian(target), polarToCartesian(origin)));
}

/** Inverse of {@link relativePolar}: place a local offset back into room coordinates. */
export function absolutePolar(local: SpatialPosition, origin: SpatialPosition): SpatialPosition {
  return vecToPolar(addVec(polarToCartesian(origin), polarToCartesian(local)));
}

/** Stable 32-bit string hash — used to derive deterministic default placements. */
export function stringHash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const ORIGIN_POSITION: SpatialPosition = { angle: 0, radius: 0, elevation: 0 };

/**
 * Constant-power vector-base amplitude panning across the ring of speakers.
 *
 * The two speakers bracketing the source's angle share it with a cos/sin
 * crossfade (so perceived loudness stays constant as it sweeps between them);
 * everyone else sits at the floor. This is what makes the sound physically
 * travel from, say, a Mac on your left to an iPhone on your right.
 *
 * Speakers further from the origin are attenuated a little, so pulling a device
 * away from your seat genuinely makes it quieter.
 */
export function computeSpeakerGains(
  sourceAngle: number,
  speakers: Speaker[],
  floor: number = GAIN_FLOOR,
): Map<string, number> {
  const gains = new Map<string, number>();
  if (speakers.length === 0) return gains;

  // A lone speaker carries everything — the HRTF panner alone conveys direction.
  if (speakers.length === 1) {
    gains.set(speakers[0].id, 1);
    return gains;
  }

  const ring = speakers
    .map(s => ({ id: s.id, angle: normalizeAngle(s.position.angle), radius: s.position.radius }))
    .sort((a, b) => a.angle - b.angle);

  const src = normalizeAngle(sourceAngle);

  // Find the arc [a, b] containing the source. Defaults to the wrap-around arc
  // (last → first), which is where the source sits when it is below ring[0].
  let ai = ring.length - 1;
  for (let i = 0; i < ring.length - 1; i++) {
    if (src >= ring[i].angle && src < ring[i + 1].angle) {
      ai = i;
      break;
    }
  }

  const a = ring[ai];
  const b = ring[(ai + 1) % ring.length];

  let span = b.angle - a.angle;
  if (span <= 0) span += Math.PI * 2;

  let offset = src - a.angle;
  if (offset < 0) offset += Math.PI * 2;

  const t = span < 1e-6 ? 0 : clamp(offset / span, 0, 1);

  const raw = new Map<string, number>();
  ring.forEach(s => raw.set(s.id, 0));
  // Two speakers at the same angle would both read t≈0; cos/sin still sums to 1.
  raw.set(a.id, Math.cos((t * Math.PI) / 2));
  raw.set(b.id, Math.sin((t * Math.PI) / 2));

  ring.forEach(s => {
    const panned = raw.get(s.id) ?? 0;
    // Distance falloff: gentle, so a device across the room is quieter but present.
    const distance = 1 / (1 + 0.35 * Math.max(0, s.radius - 1));
    gains.set(s.id, (floor + (1 - floor) * panned) * distance);
  });

  return gains;
}

/**
 * Deterministic 32-bit hash. Used to pick beat-jump targets from a clock-derived
 * seed so every device independently lands on the same speaker.
 */
export function hashSeed(seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = h ^ (h >>> 16);
  return h >>> 0;
}
