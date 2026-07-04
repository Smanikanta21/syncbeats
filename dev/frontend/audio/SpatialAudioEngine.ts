/**
 * SpatialAudioEngine.ts
 *
 * Owns the entire Web Audio graph for SyncBeats spatial audio.
 * One singleton instance per client, created on first user gesture.
 *
 * New design:
 *   - Listener is ALWAYS at (0, 0, 0) — the center of the room.
 *   - Each device in the room gets a PannerNode at its position relative to the listener.
 *   - The audio source "visits" each device in sequence, smoothly interpolating
 *     its position between devices. This creates the effect of audio traveling
 *     through the room from device to device.
 *
 * Graph topology:
 *
 *   inputNode (from useAudioPlayer's gain → EQ → analyser chain)
 *        │
 *   masterGain
 *        │
 *   pannerNode  (single panner that orbits through device positions)
 *        │
 *   AudioDestinationNode
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

export class SpatialAudioEngine {
  private static instance: SpatialAudioEngine | null = null;

  private ctx: AudioContext | null = null;
  private source: AudioNode | null = null;

  /** Single PannerNode that orbits through device positions */
  private panner: PannerNode | null = null;

  /** Master gain — lets you fade everything at once */
  private masterGain: GainNode | null = null;

  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private lastPollTime: number = 0;
  private lastVolume: number = 0;

  private myDeviceId: string | null = null;
  private isInitialised = false;

  /** All device positions (keyed by deviceId) */
  private devicePositions = new Map<string, SpatialPosition>();

  /** UI offsets to sync audio panning with visual layout (fanX, fanY) */
  private uiOffsets = new Map<string, { fanX: number; fanY: number }>();
  private uiListenerCart: { x: number; y: number; z: number } | null = null;

  /** Ordered list of device IDs the audio visits in sequence */
  private deviceSequence: string[] = [];

  /** Seconds spent visiting each device before moving to the next */
  private secondsPerDevice: number = 3;

  /** Whether orbit is running */
  private orbitEnabled: boolean = false;
  private animationFrameId: number | null = null;

  private onOrbitUpdate?: (fromId: string, toId: string, frac: number) => void;

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

    this.panner = this.createPanner();

    // Setup Analyser for beat detection
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    // Wire: inputNode → masterGain → panner → analyser → destination
    this.source = inputNode;

    // Disconnect source from raw destination so we don't hear unpanned audio
    try {
      this.source.disconnect(this.ctx.destination);
    } catch (e) {}

    this.source.connect(this.masterGain);
    this.masterGain.connect(this.panner);
    this.panner.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Ensure listener is at origin
    this.resetListenerToOrigin();

    this.isInitialised = true;
  }

  // --- AudioContext lifecycle ---

  getVolume(): number {
    if (!this.analyser || !this.dataArray) return 0;

    const now = performance.now();
    if (now - this.lastPollTime > 10) {
      this.analyser.getByteFrequencyData(this.dataArray as any);
      this.lastPollTime = now;

      let sum = 0;
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
    if (initialPosition) {
      this.devicePositions.set(deviceId, initialPosition);
    } else if (!this.devicePositions.has(deviceId)) {
      this.devicePositions.set(deviceId, { angle: 0, radius: 1, elevation: 0 });
    }
    this.rebuildSequence();
  }

  removeDevice(deviceId: string): void {
    this.devicePositions.delete(deviceId);
    this.deviceSequence = this.deviceSequence.filter(id => id !== deviceId);
  }

  // --- Spatial position ---

  updatePosition(deviceId: string, pos: SpatialPosition): void {
    this.devicePositions.set(deviceId, pos);
    this.rebuildSequence();
  }

  applySnapshot(devices: DeviceSpatialState[]): void {
    devices.forEach(({ deviceId, position }) => {
      this.devicePositions.set(deviceId, position);
    });
    this.rebuildSequence();
  }

  // --- UI Sync ---

  setUIState(listenerCart: { x: number; y: number; z: number }, offsets: Map<string, { fanX: number; fanY: number }>): void {
    this.uiListenerCart = listenerCart;
    this.uiOffsets = offsets;
  }

  // --- Device Sequence Orbit ---

  /**
   * We ignore external sequence suggestions and strictly sort by physical angle
   * to guarantee the orbit goes Front -> Right -> Back -> Left continuously.
   */
  setDeviceSequence(deviceIds: string[]): void {
    this.rebuildSequence();
  }

  /** Rebuild sequence strictly based on angular position */
  private rebuildSequence(): void {
    const ids = Array.from(this.devicePositions.keys());
    
    ids.sort((a, b) => {
       const posA = this.devicePositions.get(a)!;
       const posB = this.devicePositions.get(b)!;
       
       // Normalize angle to [0, 2PI)
       let angA = (posA.angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
       let angB = (posB.angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
       
       if (Math.abs(angA - angB) < 0.001) {
          return posA.radius - posB.radius;
       }
       return angA - angB;
    });
    
    this.deviceSequence = ids;
  }

  /** Seconds per device — adjustable via speed slider */
  setOrbitSpeed(secondsPerDevice: number): void {
    this.secondsPerDevice = Math.max(0.5, Math.min(10, secondsPerDevice));
  }

  getOrbitSpeed(): number {
    return this.secondsPerDevice;
  }

  setOrbitUpdateCallback(cb: (fromId: string, toId: string, frac: number) => void): void {
    this.onOrbitUpdate = cb;
  }

  setAutoRotate(enabled: boolean): void {
    if (this.orbitEnabled === enabled) return;
    this.orbitEnabled = enabled;

    if (enabled) {
      this.startOrbit();
    } else {
      this.stopOrbit();
    }
  }

  private startOrbit(): void {
    let lastTime = performance.now();

    // Accumulated time in seconds for orbit progress
    let accumulatedTime = 0;

    const animate = (time: number) => {
      const dt = (time - lastTime) / 1000; // seconds
      lastTime = time;
      accumulatedTime += dt;

      this.updateOrbitPosition(accumulatedTime);

      this.animationFrameId = requestAnimationFrame(animate);
    };
    this.animationFrameId = requestAnimationFrame(animate);
  }

  private stopOrbit(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Given accumulated time, compute which two devices we're between
   * and interpolate the panner position.
   */
  private updateOrbitPosition(time: number): void {
    if (!this.ctx || !this.panner) return;

    const seq = this.deviceSequence.filter(id => this.devicePositions.has(id));
    if (seq.length === 0) return;

    if (seq.length === 1) {
      // Only one device — park the panner at its position
      const pos = this.devicePositions.get(seq[0])!;
      const cart = this.orbitToCartesian(pos);

      // Apply visual offset (1 screen unit = 100 web audio units)
      const offset = this.uiOffsets.get(seq[0]);
      if (offset) {
        cart.x += offset.fanX * 100;
        cart.z -= offset.fanY * 100;
      }

      if (this.uiListenerCart) {
        cart.x -= this.uiListenerCart.x;
        cart.y -= this.uiListenerCart.y;
        cart.z -= this.uiListenerCart.z;
      } else if (this.myDeviceId && this.devicePositions.has(this.myDeviceId)) {
        const myPos = this.devicePositions.get(this.myDeviceId)!;
        const myCart = this.orbitToCartesian(myPos);
        cart.x -= myCart.x;
        cart.y -= myCart.y;
        cart.z -= myCart.z;
      }

      this.setPannerPosition(cart.x, cart.y, cart.z);
      return;
    }

    // Total cycle time = number of devices * secondsPerDevice
    const cycleTime = seq.length * this.secondsPerDevice;
    const t = (time % cycleTime) / this.secondsPerDevice; // fractional device index

    const idx = Math.floor(t);
    const frac = t - idx; // 0..1 interpolation between device[idx] and device[idx+1]

    const fromId = seq[idx % seq.length];
    const toId = seq[(idx + 1) % seq.length];

    const fromPos = this.devicePositions.get(fromId)!;
    const toPos = this.devicePositions.get(toId)!;

    if (this.onOrbitUpdate) {
      this.onOrbitUpdate(fromId, toId, frac);
    }

    // Smooth easing (ease-in-out)
    const easedFrac = frac < 0.5
      ? 2 * frac * frac
      : 1 - Math.pow(-2 * frac + 2, 2) / 2;

    // Interpolate in Polar space to ensure circular sweeping between devices
    let angA = fromPos.angle;
    let angB = toPos.angle;
    
    // Since sequence is sorted clockwise, angB should be >= angA.
    // If it's smaller, it means we wrapped around the circle (e.g. from Left to Front).
    // However, if the difference is extremely small (stacked devices), don't wrap around!
    if (angB < angA && (angA - angB) > 0.1) {
      angB += Math.PI * 2;
    }

    const curAngle = angA + (angB - angA) * easedFrac;
    const curRadius = fromPos.radius + (toPos.radius - fromPos.radius) * easedFrac;
    const curElevation = fromPos.elevation + (toPos.elevation - fromPos.elevation) * easedFrac;

    const curPos = { angle: curAngle, radius: curRadius, elevation: curElevation };
    const cart = this.orbitToCartesian(curPos);

    // Interpolate visual offsets
    const fromOffset = this.uiOffsets.get(fromId) ?? { fanX: 0, fanY: 0 };
    const toOffset = this.uiOffsets.get(toId) ?? { fanX: 0, fanY: 0 };
    
    const curFanX = fromOffset.fanX + (toOffset.fanX - fromOffset.fanX) * easedFrac;
    const curFanY = fromOffset.fanY + (toOffset.fanY - fromOffset.fanY) * easedFrac;
    
    cart.x += curFanX * 100;
    cart.z -= curFanY * 100;

    // Make relative to listener
    if (this.uiListenerCart) {
      cart.x -= this.uiListenerCart.x;
      cart.y -= this.uiListenerCart.y;
      cart.z -= this.uiListenerCart.z;
    } else if (this.myDeviceId && this.devicePositions.has(this.myDeviceId)) {
      const myPos = this.devicePositions.get(this.myDeviceId)!;
      const myCart = this.orbitToCartesian(myPos);
      cart.x -= myCart.x;
      cart.y -= myCart.y;
      cart.z -= myCart.z;
    }

    this.setPannerPosition(cart.x, cart.y, cart.z);
  }

  private setPannerPosition(x: number, y: number, z: number): void {
    if (!this.panner || !this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    this.panner.positionX.linearRampToValueAtTime(x, t);
    this.panner.positionY.linearRampToValueAtTime(y, t);
    this.panner.positionZ.linearRampToValueAtTime(z, t);
  }

  // --- Volume ---

  setDeviceGain(_deviceId: string, _value: number): void {
    // No longer per-device gains — single panner model
  }

  setMasterGain(value: number): void {
    if (!this.masterGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.linearRampToValueAtTime(
      Math.max(0, Math.min(1, value)),
      t + 0.02
    );
  }

  // --- Listener ---

  private resetListenerToOrigin(): void {
    if (!this.ctx) return;
    const listener = this.ctx.listener;
    const t = this.ctx.currentTime + 0.05;

    listener.positionX.linearRampToValueAtTime(0, t);
    listener.positionY.linearRampToValueAtTime(0, t);
    listener.positionZ.linearRampToValueAtTime(0, t);

    listener.forwardX.linearRampToValueAtTime(0, t);
    listener.forwardY.linearRampToValueAtTime(0, t);
    listener.forwardZ.linearRampToValueAtTime(-1, t);

    listener.upX.linearRampToValueAtTime(0, t);
    listener.upY.linearRampToValueAtTime(1, t);
    listener.upZ.linearRampToValueAtTime(0, t);
  }

  /** @deprecated No longer rotating listener orientation */
  setListenerOrientation(_yawDeg: number): void {}

  // --- Geometry ---

  getContextState(): AudioContextState | 'uninitialised' {
    return this.ctx?.state ?? 'uninitialised';
  }

  getActiveDeviceCount(): number {
    return this.devicePositions.size;
  }

  // --- Private helpers ---

  private createPanner(): PannerNode {
    const panner = this.ctx!.createPanner();

    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 5;
    panner.maxDistance = 100;
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
