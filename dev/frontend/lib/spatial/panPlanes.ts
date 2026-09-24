/**
 * panPlanes.ts
 *
 * The three orthographic views used by the placement pads — Top, Front, Side —
 * as pure mappings between a speaker's world vector and pad coordinates in
 * [-1, 1]². Kept out of the component so the sign conventions (which are easy
 * to get backwards) can be asserted; see geometry.check.ts.
 *
 * Each view hides one axis, and `fromPad` carries that axis over unchanged from
 * the current position. That is what makes Front and Side able to set *height*
 * while the 3D stage drag stays on the floor.
 */

import {
  MAX_ELEVATION,
  MAX_RADIUS,
  MIN_ELEVATION,
  MIN_RADIUS,
  clamp,
  vecToPolar,
  type SpatialPosition,
  type Vec3,
} from './geometry';

/**
 * Vertical extent of the pads. Elevation is clamped to ±45°, so this is as high
 * as a speaker can ever go — using it instead of MAX_RADIUS means the full
 * height of the pad is reachable rather than the middle 70% of it.
 */
export const MAX_HEIGHT = MAX_RADIUS * Math.sin((MAX_ELEVATION * Math.PI) / 180);

export interface Plane {
  id: 'top' | 'front' | 'side';
  label: string;
  /** Axis captions: left, right, top, bottom edge of the pad */
  edges: [string, string, string, string];
  /** World vector → pad coordinates, both in [-1, 1] */
  toPad: (v: Vec3) => [number, number];
  /** Pad coordinates → world vector, carrying over the axis this view hides */
  fromPad: (u: number, w: number, current: Vec3) => Vec3;
}

/**
 * `-z` is front and `+y` is up (see geometry.ts), while pad `w` grows *downward*
 * like any screen coordinate — hence the sign flips.
 */
export const PLANES: Plane[] = [
  {
    id: 'top',
    label: 'Top',
    edges: ['L', 'R', 'Front', 'Back'],
    toPad: v => [v.x / MAX_RADIUS, v.z / MAX_RADIUS],
    fromPad: (u, w, cur) => ({ x: u * MAX_RADIUS, y: cur.y, z: w * MAX_RADIUS }),
  },
  {
    id: 'front',
    label: 'Front',
    edges: ['L', 'R', 'Up', 'Down'],
    toPad: v => [v.x / MAX_RADIUS, -v.y / MAX_HEIGHT],
    fromPad: (u, w, cur) => ({ x: u * MAX_RADIUS, y: -w * MAX_HEIGHT, z: cur.z }),
  },
  {
    id: 'side',
    label: 'Side',
    edges: ['Back', 'Front', 'Up', 'Down'],
    toPad: v => [-v.z / MAX_RADIUS, -v.y / MAX_HEIGHT],
    fromPad: (u, w, cur) => ({ x: cur.x, y: -w * MAX_HEIGHT, z: -u * MAX_RADIUS }),
  },
];

/**
 * Cartesian → the clamped polar form the rest of the app speaks.
 *
 * `fallbackAngle` is used when the vector is shorter than `MIN_RADIUS`: dragging
 * a handle across the centre of a pad sends the vector through the origin, where
 * `atan2` is meaningless and swings through every bearing in a couple of frames.
 * Radius is clamped up anyway, so without this the device's *angle* flails and
 * the sound snaps between speakers. Holding the previous bearing instead makes
 * the pad centre behave like a floor on distance rather than a direction glitch.
 */
export function toPosition(v: Vec3, fallbackAngle = 0): SpatialPosition {
  const p = vecToPolar(v);
  return {
    angle: p.radius < MIN_RADIUS ? fallbackAngle : p.angle,
    radius: clamp(p.radius, MIN_RADIUS, MAX_RADIUS),
    elevation: clamp(p.elevation, MIN_ELEVATION, MAX_ELEVATION),
  };
}

/** Pad coordinate → CSS offset within the pad. */
export const padPercent = (n: number) => `${((clamp(n, -1, 1) + 1) / 2) * 100}%`;
