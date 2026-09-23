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
  GAIN_FLOOR,
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
  /**
   * Divergence, 0..1 — how much of the signal spills outside the speakers the
   * source is currently between. 0 is a hard point source (only the bracketing
   * pair make sound); 1 fills every speaker equally and the motion stops being
   * audible as movement. Sits here rather than on the field because it is a
   * property of *how the source is panned*, and it rides the same plumbing as
   * the other motion parameters.
   */
  spread: number;
  /**
   * Beat mode only: the shortest time the sound is allowed to stay on one
   * speaker. Hopping on *every* bass hit is a strobe — at 120bpm that is twice
   * a second — so jumps are gated to one per window of this length.
   */
  hopMs: number;
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
  periodMs: 30000,
  radius: 1.4,
  elevation: 0,
  direction: 1,
  spread: GAIN_FLOOR,
  hopMs: 1800,
};

/**
 * A 6-second lap is already faster than anyone wants for more than a novelty
 * few seconds; two minutes is a drift you notice without it competing with the
 * music. The old 2s floor was unlistenable and the old 30s ceiling was still
 * brisk, which is why the whole feature read as a gimmick.
 */
export const MIN_PERIOD_MS = 6000;
export const MAX_PERIOD_MS = 120000;

export const MIN_HOP_MS = 400;
export const MAX_HOP_MS = 4000;

export interface MotionPreset {
  id: string;
  label: string;
  hint: string;
  config: Partial<MotionConfig>;
}

/**
 * Starting points, because seven parameters is not a thing anyone wants to
 * tune before pressing play. Every one of these is a setting you could leave on
 * for a whole album.
 */
export const MOTION_PRESETS: MotionPreset[] = [
  {
    id: 'subtle',
    label: 'Subtle',
    hint: 'A slow drift you feel rather than hear. Leave it on all day.',
    config: { mode: 'orbit', periodMs: 75000, radius: 1.2, spread: 0.45, elevation: 0 },
  },
  {
    id: '8d',
    label: '8D',
    hint: 'The classic full lap around your head. This is the default.',
    config: {
      mode: 'orbit',
      periodMs: DEFAULT_MOTION.periodMs,
      radius: DEFAULT_MOTION.radius,
      spread: DEFAULT_MOTION.spread,
      elevation: 0,
    },
  },
  {
    id: 'sweep',
    label: 'Sweep',
    hint: 'Side to side across the front, never behind you.',
    config: { mode: 'pingpong', periodMs: 16000, radius: 1.6, spread: 0.2, elevation: 0 },
  },
  {
    id: 'hop',
    label: 'Hop',
    hint: 'Lands on a new speaker about once a bar.',
    config: { mode: 'beat', hopMs: 1800, radius: 1.8, spread: 0.1, elevation: 0 },
  },
];

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

/**
 * Which hop window the synced clock is in.
 *
 * Doubles as the gate and the seed for beat jumps, which is what keeps devices
 * together. A local beat *counter* would drift the moment one device's detector
 * missed a kick — it would then be permanently a beat behind and jumping to a
 * different speaker. Quantising to a shared clock window instead means two
 * devices detecting the same kick 40ms apart still land in the same window, and
 * therefore on the same speaker.
 */
export function hopBucket(serverNowMs: number, hopMs: number): number {
  return Math.floor(serverNowMs / clamp(hopMs, MIN_HOP_MS, MAX_HOP_MS));
}
