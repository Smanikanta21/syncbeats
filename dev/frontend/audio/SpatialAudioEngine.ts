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

  /** Master gain — lets you fade everything at once */
  private masterGain: GainNode | null = null;

  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private lastPollTime: number = 0;
  private lastVolume: number = 0;

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
    
    // Setup Analyser for beat detection
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.masterGain.connect(this.analyser);

    this.source = inputNode;
    
    // Disconnect from raw destination so we don't hear unpanned audio on top of spatial audio
    try {
      this.source.disconnect(this.ctx.destination);
    } catch (e) {}

    this.isInitialised = true;
  }

  // --- AudioContext lifecycle ---

  getVolume(): number {
    if (!this.analyser || !this.dataArray) return 0;
    
    // Cache polling per frame (~16ms) to avoid WebKit double-poll zeroing bug
    const now = performance.now();
    if (now - this.lastPollTime > 10) {
      this.analyser.getByteFrequencyData(this.dataArray as any);
      this.lastPollTime = now;
      
      let sum = 0;
      // Focus on lower frequencies (bass) for the "beat" effect (first 10 bins)
      const bins = Math.min(10, this.dataArray.length);
      for (let i = 0; i < bins; i++) {
        sum += this.dataArray[i];
      }
      this.lastVolume = sum / bins / 255;
    }
    
    return this.lastVolume;
  }

  getFrequencyData(): Uint8Array | null {
    if (!this.analyser || !this.dataArray) return null;
    
    const now = performance.now();
    if (now - this.lastPollTime > 10) {
      this.analyser.getByteFrequencyData(this.dataArray as any);
      this.lastPollTime = now;
    }
    
    return this.dataArray;
  }

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

  setMyDeviceId(deviceId: string): void {
    this.myDeviceId = deviceId;
  }

  addDevice(deviceId: string, initialPosition?: SpatialPosition): void {
    if (!this.ctx || !this.source || !this.masterGain) {
      console.warn('[SpatialAudio] addDevice called before init()');
      return;
    }
    // Only spatialise our OWN device (act as a physical surround speaker)
    // We mute/ignore other devices since they are playing from their own physical speakers
    if (deviceId !== this.myDeviceId) return;
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
      // We only care about applying spatial transforms to OUR device
      if (deviceId !== this.myDeviceId) return;
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

  // --- Auto Rotate (8D Audio) ---

  private autoRotateEnabled: boolean = false;
  private currentYaw: number = 0;
  private animationFrameId: number | null = null;

  setAutoRotate(enabled: boolean): void {
    if (this.autoRotateEnabled === enabled) return;
    this.autoRotateEnabled = enabled;
    
    if (enabled) {
      this.startAutoRotate();
    } else {
      this.stopAutoRotate();
    }
  }

  private startAutoRotate() {
    let lastTime = performance.now();
    const animate = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;
      
      // Rotate ~20 degrees per second
      this.currentYaw += (20 * dt) / 1000;
      if (this.currentYaw >= 360) this.currentYaw -= 360;
      
      this.setListenerOrientation(this.currentYaw);
      
      this.animationFrameId = requestAnimationFrame(animate);
    };
    this.animationFrameId = requestAnimationFrame(animate);
  }

  private stopAutoRotate() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    // Snap back to 0
    this.currentYaw = 0;
    this.setListenerOrientation(0);
  }

  setListenerOrientation(yawDeg: number): void {
    if (!this.ctx) return;
    const rad = (yawDeg * Math.PI) / 180;
    const listener = this.ctx.listener;
    
    // Smooth transition using linearRampToValueAtTime to avoid audio glitches
    const t = this.ctx.currentTime + 0.05;
    listener.forwardX.linearRampToValueAtTime(-Math.sin(rad), t);
    listener.forwardY.linearRampToValueAtTime(0, t);
    listener.forwardZ.linearRampToValueAtTime(-Math.cos(rad), t);
    listener.upX.linearRampToValueAtTime(0, t);
    listener.upY.linearRampToValueAtTime(1, t);
    listener.upZ.linearRampToValueAtTime(0, t);
  }

  // --- Geometry ---

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
    // Increase refDistance so volume doesn't drop too drastically when moving far away
    panner.refDistance = 5;
    panner.maxDistance = 100;
    // Lower rolloff so the 3D space feels larger but keeps audible volume
    panner.rolloffFactor = 0.8;

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

    // Exaggerate distance for a much stronger spatial/panning effect
    const SPATIAL_MULTIPLIER = 15;
    const scaledRadius = radius * SPATIAL_MULTIPLIER;

    const horizRadius = scaledRadius * Math.cos(elevRad);

    return {
      x: horizRadius * Math.sin(angle),
      y: scaledRadius * Math.sin(elevRad),
      z: -horizRadius * Math.cos(angle),
    };
  }
}
