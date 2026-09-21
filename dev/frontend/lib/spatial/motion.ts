/**
 * motion.ts
 *
 * How the virtual sound source moves. Every function here is pure and driven by
 * the *server* clock (`Date.now() + clockOffset`), which is the whole trick: the
 * audio engine and the 3D renderer each compute the source position
 * independently and always agree, and so does every other device in the room —
 * without any extra socket traffic.
 */

import {
  clamp,
  hashSeed,
  lerpAngle,
  normalizeAngle,
  type SpatialPosition,
} from './geometry';

export type MotionMode = 'orbit' | 'pingpong' | 'beat';

export interface MotionConfig {
  mode: MotionMode;
  /** ms for one full revolution (orbit) or one there-and-back sweep (pingpong) */
  periodMs: number;
  /** Orbit radius, in the same world units as device radius */
  radius: number;
  /** Degrees above/below ear level */
  elevation: number;
  /** +1 = clockwise (front → right → back → left), -1 = counter-clockwise */
  direction: 1 | -1;
}

/** A beat-jump in flight. Owned by the engine, read by the renderer. */
export interface BeatState {
  fromAngle: number;
  toAngle: number;
  /** Server-clock ms when the jump started */
  startedAt: number;
  glideMs: number;
}

export const DEFAULT_MOTION: MotionConfig = {
  mode: 'orbit',
  periodMs: 9000,
  radius: 1.6,
  elevation: 0,
  direction: 1,
};

export const MIN_PERIOD_MS = 2000;
export const MAX_PERIOD_MS = 30000;

/** Smooth 0 → 1 → 0 over one period, flat at the turnarounds. */
const pingPongEase = (phase: number) => 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * The arc a ping-pong sweep travels: everything *except* the widest empty gap
 * between neighbouring speakers. With a Mac on your left and a phone on your
 * right that means a natural left ↔ right sweep across the front rather than a
 * pass through the dead space behind you.
 */
export function pingPongArc(speakerAngles: number[]): { start: number; span: number } {
  if (speakerAngles.length < 2) {
    return { start: -Math.PI / 2, span: Math.PI };
  }

  const ring = speakerAngles.map(normalizeAngle).sort((a, b) => a - b);

  let widestAt = ring.length - 1;
  let widest = ring[0] + Math.PI * 2 - ring[ring.length - 1];

  for (let i = 0; i < ring.length - 1; i++) {
    const gap = ring[i + 1] - ring[i];
    if (gap > widest) {
      widest = gap;
      widestAt = i;
    }
  }

  // Start just past the widest gap and sweep forward across every other speaker.
  const start = ring[(widestAt + 1) % ring.length];
  return { start, span: Math.PI * 2 - widest };
}

/**
 * Where the sound is right now.
 *
 * @param serverNowMs  Date.now() + clockOffset — identical across devices
 * @param speakerAngles Ring of speaker angles, used by ping-pong to size its arc
 * @param beat         Current beat-jump, when mode is 'beat'
 */
export function sourceAt(
  serverNowMs: number,
  config: MotionConfig,
  speakerAngles: number[] = [],
  beat: BeatState | null = null,
): SpatialPosition {
  const period = clamp(config.periodMs, MIN_PERIOD_MS, MAX_PERIOD_MS);
  const base = { radius: config.radius, elevation: config.elevation };

  switch (config.mode) {
    case 'pingpong': {
      const { start, span } = pingPongArc(speakerAngles);
      const phase = (serverNowMs % period) / period;
      return { ...base, angle: start + span * pingPongEase(phase) };
    }

    case 'beat': {
      if (!beat) return { ...base, angle: 0 };
      const elapsed = serverNowMs - beat.startedAt;
      if (elapsed >= beat.glideMs) return { ...base, angle: beat.toAngle };
      const t = easeOutCubic(clamp(elapsed / beat.glideMs, 0, 1));
      return { ...base, angle: lerpAngle(beat.fromAngle, beat.toAngle, t) };
    }

    case 'orbit':
    default: {
      const phase = (serverNowMs % period) / period;
      return { ...base, angle: config.direction * phase * Math.PI * 2 };
    }
  }
}

/**
 * Pick the speaker a beat jump lands on.
 *
 * Deliberately **stateless** — derived from a clock-bucketed seed alone, with no
 * running counter. Two devices detecting the same beat therefore always choose
 * the same speaker, and a device that misses a beat (or joins late) rejoins in
 * step on the very next one instead of staying permanently offset. The price is
 * a 1-in-N chance the sound stays put for a beat, which reads as a rest.
 */
export function pickBeatTarget(seed: number, speakerCount: number): number {
  if (speakerCount <= 1) return 0;
  return hashSeed(seed) % speakerCount;
}

/** Bucket the synced clock so all devices hashing "this beat" agree on the seed. */
export function beatSeed(serverNowMs: number): number {
  return Math.floor(serverNowMs / 100);
}
