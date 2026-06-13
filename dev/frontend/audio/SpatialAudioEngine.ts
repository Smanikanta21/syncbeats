/**
 * SpatialAudioEngine.ts
 *
 * Owns the entire Web Audio graph for SyncBeats spatial audio.
 * One singleton instance per client, created on first user gesture.
 *
 * Graph topology:
 *
 *   <audio> element
 *        │
 *   MediaElementSourceNode  (single source, shared)
 *        │
 *   ┌────┴────┬──────────────┬──────────────┐
 *   │         │              │              │
 * PannerNode  PannerNode  PannerNode  GainNode (own device — no spatial offset)
 * (device A)  (device B)  (device C)        │
 *   │         │              │              │
 *   └────┬────┴──────────────┴──────────────┘
 *        │
 *  AudioDestinationNode  (speakers / headphones)
 */

export interface SpatialPosition {
  /** Angle in radians. 0 = front, π/2 = right, π = behind, -π/2 = left */
  angle: number;
  /** Normalised radius. 1.0 = standard orbit distance */
  radius: number;
  /** Elevation in degrees. 0 = ear level, +45 = above, -45 = below */
  elevation: number;
}

export interface DeviceSpatialState {
  deviceId: string;
  position: SpatialPosition;
}

interface PannerEntry {
  panner: PannerNode;
  gain: GainNode;
}

export class SpatialAudioEngine {
  private static instance: SpatialAudioEngine | null = null;

  private ctx: AudioContext | null = null;
  private source: AudioNode | null = null;

  /** One PannerNode + GainNode per remote device */
  private panners = new Map<string, PannerEntry>();

  /** GainNode for the local device — bypasses spatial processing */
  private localGain: GainNode | null = null;

  /** Master gain — lets you fade everything at once */
  private masterGain: GainNode | null = null;

  private myDeviceId: string | null = null;
  private isInitialised = false;

  // --- Singleton ---

  static getInstance(): SpatialAudioEngine {
    if (!SpatialAudioEngine.instance) {
      SpatialAudioEngine.instance = new SpatialAudioEngine();
    }
    return SpatialAudioEngine.instance;
  }

  private constructor() {}

  // --- Initialisation (must be called from a user gesture handler) ---

  init(ctx: AudioContext, inputNode: AudioNode, myDeviceId: string): void {
    if (this.isInitialised) return;

    this.myDeviceId = myDeviceId;
    this.ctx = ctx;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1;
    this.masterGain.connect(this.ctx.destination);

    this.source = inputNode;

    this.localGain = this.ctx.createGain();
    this.localGain.gain.value = 1;
    this.source.connect(this.localGain);
    this.localGain.connect(this.masterGain);

    this.isInitialised = true;
  }

  // --- AudioContext lifecycle ---

  async resume(): Promise<void> {
    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  async suspend(): Promise<void> {
    if (this.ctx?.state === 'running') {
      await this.ctx.suspend();
    }
  }

  // --- Device management ---

  addDevice(deviceId: string, initialPosition?: SpatialPosition): void {
    if (!this.ctx || !this.source || !this.masterGain) {
      console.warn('[SpatialAudio] addDevice called before init()');
      return;
    }
    if (deviceId === this.myDeviceId) return;
    if (this.panners.has(deviceId)) return;

    const panner = this.createPanner();
    const gain = this.ctx.createGain();
    gain.gain.value = 1;

    this.source.connect(panner);
    panner.connect(gain);
    gain.connect(this.masterGain);

    this.panners.set(deviceId, { panner, gain });

    if (initialPosition) {
      this.updatePosition(deviceId, initialPosition);
    }
  }

  removeDevice(deviceId: string): void {
    const entry = this.panners.get(deviceId);
    if (!entry) return;

    entry.panner.disconnect();
    entry.gain.disconnect();
    this.panners.delete(deviceId);
  }

  // --- Spatial position ---

  updatePosition(deviceId: string, pos: SpatialPosition): void {
    const entry = this.panners.get(deviceId);
    if (!entry || !this.ctx) return;

    const { x, y, z } = this.orbitToCartesian(pos);
    const { panner } = entry;
    const t = this.ctx.currentTime;
    const rampTime = t + 0.05;

    panner.positionX.linearRampToValueAtTime(x, rampTime);
    panner.positionY.linearRampToValueAtTime(y, rampTime);
    panner.positionZ.linearRampToValueAtTime(z, rampTime);
  }

  applySnapshot(devices: DeviceSpatialState[]): void {
    devices.forEach(({ deviceId, position }) => {
      if (deviceId === this.myDeviceId) return;
      if (!this.panners.has(deviceId)) {
        this.addDevice(deviceId, position);
      } else {
        this.updatePosition(deviceId, position);
      }
    });
  }

  // --- Volume ---

  setDeviceGain(deviceId: string, value: number): void {
    const entry = this.panners.get(deviceId);
    if (!entry || !this.ctx) return;
    const t = this.ctx.currentTime;
    entry.gain.gain.linearRampToValueAtTime(
      Math.max(0, Math.min(1, value)),
      t + 0.02
    );
  }

  setMasterGain(value: number): void {
    if (!this.masterGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.linearRampToValueAtTime(
      Math.max(0, Math.min(1, value)),
      t + 0.02
    );
  }

  // --- Listener orientation ---

  setListenerOrientation(yawDeg: number): void {
    if (!this.ctx) return;
    const rad = (yawDeg * Math.PI) / 180;
    const listener = this.ctx.listener;
    listener.forwardX.value = -Math.sin(rad);
    listener.forwardY.value = 0;
    listener.forwardZ.value = -Math.cos(rad);
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
  }

  // --- Diagnostics ---

  getContextState(): AudioContextState | 'uninitialised' {
    return this.ctx?.state ?? 'uninitialised';
  }

  getActiveDeviceCount(): number {
    return this.panners.size;
  }

  // --- Private helpers ---

  private createPanner(): PannerNode {
    const panner = this.ctx!.createPanner();

    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 10;
    panner.rolloffFactor = 1.5;

    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    panner.coneOuterGain = 0;

    panner.positionX.value = 0;
    panner.positionY.value = 0;
    panner.positionZ.value = -1;

    return panner;
  }

  private orbitToCartesian(pos: SpatialPosition): { x: number; y: number; z: number } {
    const { angle, radius, elevation } = pos;
    const elevRad = (elevation * Math.PI) / 180;

    const horizRadius = radius * Math.cos(elevRad);

    return {
      x: horizRadius * Math.sin(angle),
      y: radius * Math.sin(elevRad),
      z: -horizRadius * Math.cos(angle),
    };
  }
}
