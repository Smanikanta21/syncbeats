/**
 * SpatialAudioEngine.ts
 *
 * Turns every device in the room into a real speaker.
 *
 * A virtual sound source moves around a listening point. Each client computes
 * *its own* gain from how close that source is to *its own* physical position,
 * using constant-power amplitude panning — so with a Mac on your left and a
 * phone on your right, the sound audibly travels between them. Motion is a pure
 * function of the synced server clock, so every device agrees on where the
 * sound is without a single extra socket message.
 *
 * Graph — spliced **in series** into the existing player chain:
 *
 *   … → EQ[last] → spatialGain → airFilter → panner(HRTF) → stereoPanner → analyser → destination
 *                                              └→ reverbDelay → reverbGain ┘
 *
 * The previous version hung this chain off `gainNode` in *parallel* with the dry
 * EQ path, so a full-volume unpanned copy was always mixed on top and the
 * spatial effect was inaudible. Splicing in series is the fix.
 */

import {
  ORIGIN_POSITION,
  addVec,
  clamp,
  computeSpeakerGains,
  normalizeAngle,
  polarToCartesian,
  relativePolar,
  subVec,
  vecLength,
  type Speaker,
  type SpatialPosition,
  type Vec3,
} from '../lib/spatial/geometry';
import {
  DEFAULT_MOTION,
  hopBucket,
  pickBeatTarget,
  sourceAt,
  type BeatState,
  type MotionConfig,
} from '../lib/spatial/motion';

export type { SpatialPosition, Speaker } from '../lib/spatial/geometry';
export type { MotionConfig, MotionMode } from '../lib/spatial/motion';

export interface DeviceSpatialState {
  deviceId: string;
  position: SpatialPosition;
}

export interface SpatialSample {
  /** Where the sound is, relative to the listening origin */
  source: SpatialPosition;
  /** Where the sound is in absolute room coordinates */
  sourceWorld: Vec3;
  /** Per-device output level, 0..1 — drives both audio and the glowing pucks */
  gains: Map<string, number>;
  /** This device's own level */
  myGain: number;
  /** This device's stereo pan, -1..+1 */
  pan: number;
}

/** Fixed HRTF radius. Direction comes from the panner, level from the VBAP gain. */
const PANNER_DISTANCE = 1.5;
/** Exponential smoothing constant for AudioParam writes — kills zipper noise. */
const SMOOTHING = 0.04;
/** AudioParams are rewritten at most this often; the visuals still run at 60fps. */
const AUDIO_WRITE_INTERVAL_MS = 33;
/** How long a beat jump takes to travel, capped so short hops still rest. */
const BEAT_GLIDE_MS = 260;
/** How much of the HRTF output also gets hard stereo-panned (phone speakers). */
const STEREO_STRENGTH = 0.7;

export class SpatialAudioEngine {
  private static instance: SpatialAudioEngine | null = null;

  static getInstance(): SpatialAudioEngine {
    if (!SpatialAudioEngine.instance) {
      SpatialAudioEngine.instance = new SpatialAudioEngine();
    }
    return SpatialAudioEngine.instance;
  }

  private constructor() {}

  // ── Audio graph ──────────────────────────────────────────────────────────

  private ctx: AudioContext | null = null;
  private spliceIn: AudioNode | null = null;
  private spliceOut: AudioNode | null = null;

  private spatialGain: GainNode | null = null;
  private airFilter: BiquadFilterNode | null = null;
  private panner: PannerNode | null = null;
  private stereoPanner: StereoPannerNode | null = null;
  private reverbDelay: DelayNode | null = null;
  private reverbGain: GainNode | null = null;

  private isInitialised = false;

  // ── State ────────────────────────────────────────────────────────────────

  private myDeviceId = '';
  private clockOffset = 0;
  private enabled = true;
  private running = false;
  /** Server time the source was frozen at, or null while running. */
  private pausedAtMs: number | null = Date.now();

  /** Speakers in absolute room coordinates */
  private speakers: Speaker[] = [];
  /** Same speakers re-expressed around `origin` — cached, rebuilt on change */
  private speakersRelative: Speaker[] = [];
  private ringAngles: number[] = [];
  private originVec: Vec3 = { x: 0, y: 0, z: 0 };
  private origin: SpatialPosition = ORIGIN_POSITION;

  private motion: MotionConfig = { ...DEFAULT_MOTION };
  private beat: BeatState | null = null;
  /** Hop window the last beat jump fired in — see `onBeat`. */
  private lastHopBucket = -1;

  private rafId: number | null = null;
  private lastAudioWrite = 0;

  /** One-frame memo so audio and renderer sampling the same instant agree exactly. */
  private cachedAt = -1;
  private cached: SpatialSample | null = null;

  // ── Initialisation ───────────────────────────────────────────────────────

  /**
   * @param spliceIn  Node currently feeding `spliceOut` (the last EQ band)
   * @param spliceOut Node to hand the spatialised signal back to (the analyser)
   */
  init(ctx: AudioContext, spliceIn: AudioNode, spliceOut: AudioNode, myDeviceId: string): void {
    if (this.isInitialised) return;

    this.ctx = ctx;
    this.spliceIn = spliceIn;
    this.spliceOut = spliceOut;
    this.myDeviceId = myDeviceId || this.myDeviceId;

    this.spatialGain = ctx.createGain();
    this.spatialGain.gain.value = 1;

    this.airFilter = ctx.createBiquadFilter();
    this.airFilter.type = 'lowpass';
    this.airFilter.frequency.value = 20000;
    this.airFilter.Q.value = 0.7;

    this.panner = ctx.createPanner();
    this.panner.panningModel = 'HRTF';
    // Direction only — level is handled explicitly, so keep distance rolloff mild.
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = PANNER_DISTANCE;
    this.panner.maxDistance = 20;
    this.panner.rolloffFactor = 0.2;
    this.panner.coneInnerAngle = 360;
    this.panner.coneOuterAngle = 360;
    this.panner.coneOuterGain = 0;
    this.panner.positionX.value = 0;
    this.panner.positionY.value = 0;
    this.panner.positionZ.value = -PANNER_DISTANCE;

    this.stereoPanner = ctx.createStereoPanner();
    this.stereoPanner.pan.value = 0;

    this.reverbDelay = ctx.createDelay(1.0);
    this.reverbDelay.delayTime.value = 0.045;
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0;

    // Break the existing direct EQ → analyser link, then rebuild it through us.
    try {
      spliceIn.disconnect(spliceOut);
    } catch {
      /* not connected yet — the chain below still wires up correctly */
    }

    spliceIn.connect(this.spatialGain);
    this.spatialGain.connect(this.airFilter);
    this.airFilter.connect(this.panner);
    this.panner.connect(this.stereoPanner);
    this.panner.connect(this.reverbDelay);
    this.reverbDelay.connect(this.reverbGain);
    this.reverbGain.connect(this.stereoPanner);
    this.stereoPanner.connect(spliceOut);

    this.resetListener();
    this.isInitialised = true;
  }

  /** Restore the plain EQ → analyser path. */
  dispose(): void {
    if (!this.isInitialised || !this.spliceIn || !this.spliceOut) return;
    this.stop();
    try {
      this.spliceIn.disconnect(this.spatialGain!);
      this.stereoPanner!.disconnect(this.spliceOut);
      this.spliceIn.connect(this.spliceOut);
    } catch {
      /* graph already torn down */
    }
    this.isInitialised = false;
  }

  /** The listener is fixed at the origin facing front; the source is what moves. */
  private resetListener(): void {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    const set = (p: AudioParam | undefined, v: number) => p?.setValueAtTime(v, t);

    set(l.positionX, 0); set(l.positionY, 0); set(l.positionZ, 0);
    set(l.forwardX, 0); set(l.forwardY, 0); set(l.forwardZ, -1);
    set(l.upX, 0); set(l.upY, 1); set(l.upZ, 0);
  }

  // ── Configuration ────────────────────────────────────────────────────────

  setMyDeviceId(deviceId: string): void {
    this.myDeviceId = deviceId;
  }

  setClockOffset(offsetMs: number): void {
    this.clockOffset = offsetMs;
  }

  /**
   * Replace the speaker set and the listening point.
   *
   * `origin` is your seat in My Space and the room centre in Room mode; speaker
   * positions arrive as absolute room coordinates and are re-expressed around it.
   */
  setField(speakers: Speaker[], origin: SpatialPosition = ORIGIN_POSITION): void {
    this.speakers = speakers;
    this.origin = origin;
    this.originVec = polarToCartesian(origin);
    this.speakersRelative = speakers.map(s => ({
      id: s.id,
      position: relativePolar(s.position, origin),
    }));
    this.ringAngles = this.speakersRelative
      .map(s => normalizeAngle(s.position.angle))
      .sort((a, b) => a - b);
    this.invalidate();
  }

  setMotion(patch: Partial<MotionConfig>): void {
    this.motion = { ...this.motion, ...patch };
    this.invalidate();
  }

  getMotion(): MotionConfig {
    return this.motion;
  }

  /** Bypass the whole effect — gain to unity, pan centred, filter wide open. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.invalidate();
    if (!enabled) this.applyBypass();
  }

  /**
   * Drive the orbit only while something is actually playing.
   *
   * Pausing freezes the source at the server time of the pause purely so the
   * visual stops. It deliberately does *not* accumulate paused time: motion has
   * to stay a pure function of the shared clock, and a per-device accumulator
   * would leave two devices at different orbit phases. Resuming therefore snaps
   * back to the shared phase, which is the behaviour that keeps the room in
   * agreement.
   */
  setRunning(running: boolean): void {
    if (this.running === running) return;
    this.running = running;

    if (running) {
      this.pausedAtMs = null;
      this.start();
    } else {
      this.pausedAtMs = this.serverNow();
      this.stop();
    }
    this.invalidate();
  }

  /**
   * Called on each detected bass beat; only meaningful in 'beat' mode.
   *
   * Hopping on literally every kick is a strobe, so jumps are gated to one per
   * clock-aligned window of `motion.hopMs` — which also supplies the seed, so
   * every device in the room picks the same speaker. See `hopBucket`.
   */
  onBeat(): void {
    if (this.motion.mode !== 'beat' || this.ringAngles.length === 0) return;

    const now = this.serverNow();
    const bucket = hopBucket(now, this.motion.hopMs);
    if (bucket === this.lastHopBucket) return;
    this.lastHopBucket = bucket;

    const target = this.ringAngles[pickBeatTarget(bucket, this.ringAngles.length)];
    const current = this.sample(now).source.angle;

    // A fast hop setting must still land and sit for a moment, or the jumps run
    // into each other and it stops reading as movement between speakers.
    const glideMs = Math.min(BEAT_GLIDE_MS, this.motion.hopMs * 0.6);

    this.beat = { fromAngle: current, toAngle: target, startedAt: now, glideMs };
    this.invalidate();
  }

  // ── Sampling ─────────────────────────────────────────────────────────────

  serverNow(): number {
    return Date.now() + this.clockOffset;
  }

  private invalidate(): void {
    this.cachedAt = -1;
    this.cached = null;
  }

  /**
   * Everything about this instant: where the sound is and how loud each device
   * should be. Pure with respect to engine state, memoised per millisecond so
   * the audio loop and the 3D renderer never disagree.
   */
  sample(serverNowMs: number = this.serverNow()): SpatialSample {
    const key = Math.round(serverNowMs);
    if (this.cached && this.cachedAt === key) return this.cached;

    // Frozen at the pause instant when stopped, live on the shared clock when
    // running — see the note on setRunning().
    const timeToUse = !this.running && this.pausedAtMs !== null ? this.pausedAtMs : serverNowMs;

    const source = sourceAt(timeToUse, this.motion, this.ringAngles, this.beat);
    const gains = this.enabled
      ? computeSpeakerGains(source.angle, this.speakersRelative, this.motion.spread)
      : new Map(this.speakers.map(s => [s.id, 1]));

    const sourceWorld = addVec(this.originVec, polarToCartesian(source));

    const me = this.speakers.find(s => s.id === this.myDeviceId);
    const myVec = me ? polarToCartesian(me.position) : this.originVec;
    const toSource = subVec(sourceWorld, myVec);
    const distance = vecLength(toSource);
    const pan = distance < 1e-4 ? 0 : clamp(toSource.x / Math.max(distance, 0.5), -1, 1);

    const result: SpatialSample = {
      source,
      sourceWorld,
      gains,
      myGain: gains.get(this.myDeviceId) ?? 1,
      pan,
    };

    this.cached = result;
    this.cachedAt = key;
    return result;
  }

  getGain(deviceId: string): number {
    return this.sample().gains.get(deviceId) ?? 1;
  }

  getSourcePosition(): SpatialPosition {
    return this.sample().source;
  }

  getPanValue(): number {
    return this.sample().pan;
  }

  getContextState(): AudioContextState | 'uninitialised' {
    return this.ctx?.state ?? 'uninitialised';
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  // ── Audio loop ───────────────────────────────────────────────────────────

  private start(): void {
    if (this.rafId !== null) return;
    const tick = () => {
      const now = performance.now();
      if (now - this.lastAudioWrite >= AUDIO_WRITE_INTERVAL_MS) {
        this.lastAudioWrite = now;
        this.applyAudio();
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stop(): void {
    if (this.rafId === null) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.applyBypass();
  }

  private applyAudio(): void {
    if (!this.ctx || !this.isInitialised || !this.enabled) return;

    const sample = this.sample();
    const { sourceWorld, myGain, pan } = sample;

    const me = this.speakers.find(s => s.id === this.myDeviceId);
    const myVec = me ? polarToCartesian(me.position) : this.originVec;
    const rel = subVec(sourceWorld, myVec);
    const distance = vecLength(rel);

    // Unit direction × a fixed radius: the panner supplies direction, the VBAP
    // gain supplies level. Letting the panner also do distance would fight it.
    const len = Math.max(distance, 1e-4);
    const dir = { x: rel.x / len, y: rel.y / len, z: rel.z / len };

    const t = this.ctx.currentTime;

    this.panner!.positionX.setTargetAtTime(dir.x * PANNER_DISTANCE, t, SMOOTHING);
    this.panner!.positionY.setTargetAtTime(dir.y * PANNER_DISTANCE, t, SMOOTHING);
    this.panner!.positionZ.setTargetAtTime(dir.z * PANNER_DISTANCE, t, SMOOTHING);

    this.spatialGain!.gain.setTargetAtTime(clamp(myGain, 0, 1), t, SMOOTHING);
    this.stereoPanner!.pan.setTargetAtTime(pan * STEREO_STRENGTH, t, SMOOTHING);

    // Air absorption: distant sound loses its top end.
    const cutoff = clamp(20000 * Math.pow(0.8, distance), 1500, 20000);
    this.airFilter!.frequency.setTargetAtTime(cutoff, t, 0.08);

    // Early reflections grow with distance — dry up close, wet across the room.
    const wet = clamp((distance - 1.5) / 12, 0, 0.35);
    this.reverbGain!.gain.setTargetAtTime(wet, t, 0.12);
  }

  /** Settle every parameter back to neutral so bypass is inaudible. */
  private applyBypass(): void {
    if (!this.ctx || !this.isInitialised) return;
    const t = this.ctx.currentTime;
    this.spatialGain!.gain.setTargetAtTime(1, t, SMOOTHING);
    this.stereoPanner!.pan.setTargetAtTime(0, t, SMOOTHING);
    this.airFilter!.frequency.setTargetAtTime(20000, t, 0.08);
    this.reverbGain!.gain.setTargetAtTime(0, t, 0.12);
    this.panner!.positionX.setTargetAtTime(0, t, SMOOTHING);
    this.panner!.positionY.setTargetAtTime(0, t, SMOOTHING);
    this.panner!.positionZ.setTargetAtTime(-PANNER_DISTANCE, t, SMOOTHING);
  }
}
