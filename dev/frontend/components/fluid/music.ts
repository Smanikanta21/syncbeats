export type MusicBands = [number, number, number];
export type ImmersiveMotion = { bands: MusicBands; motion: number; opacity: number };
export type FluidDrive = {
  time: number;
  motion: number;
  bands: MusicBands;
  intensity: number;
  paletteA: MusicBands;
  paletteB: MusicBands;
};

export const INITIAL_IMMERSIVE_MOTION: ImmersiveMotion = { bands: [0, 0, 0], motion: 0, opacity: 0 };
const unit = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const ease = (from: number, to: number, dt: number, seconds: number) => from + (to - from) * (1 - Math.exp(-dt / seconds));

/** Fast onset response; bass lingers while treble ripples dissipate quickly. */
export function advanceImmersiveMotion(previous: ImmersiveMotion, energy: MusicBands, onsets: MusicBands, playing: boolean, dt: number, intensity: number): ImmersiveMotion {
  const h = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
  const releases = [0.85, 0.5, 0.18];
  const bands = previous.bands.map((level, index) => {
    const target = playing ? Math.max(unit(energy[index]), unit(onsets[index])) : 0;
    return ease(level, target, h, target > level ? 0.045 : releases[index]);
  }) as MusicBands;
  const motion = ease(previous.motion, playing ? 1 : 0, h, playing ? 0.35 : 0.85);
  const energyLevel = bands[0] * 0.6 + bands[1] * 0.3 + bands[2] * 0.1;
  const opacity = ease(previous.opacity, (playing ? 0.44 + energyLevel * 0.38 : 0.25) * unit(intensity), h, 0.65);
  return { bands, motion, opacity };
}

/** Keep the flow phase aligned to the room without putting time into React state. */
export function immersivePhase(now: number, offset: number, epoch?: number | null): number {
  const start = typeof epoch === 'number' && Number.isFinite(epoch) && epoch > 0 ? epoch : 0;
  return Math.max(0, (now + (Number.isFinite(offset) ? offset : 0) - start) / 1000) % 3600;
}
