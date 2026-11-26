export type AmbientMode = 'off' | 'normal' | 'auto' | 'immersive';

export const AMBIENT_STORAGE_KEY = 'syncbeats_device_ambient_v1';
export const AMBIENT_CHANGE_EVENT = 'syncbeats-device-ambient-changed';
export const DEFAULT_IMMERSIVE_INTENSITY = 65;

export function normalizeImmersiveIntensity(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(20, Math.min(100, Math.round(value / 5) * 5))
    : DEFAULT_IMMERSIVE_INTENSITY;
}

export function parseImmersiveIntensity(stored: string | null): number {
  try {
    return normalizeImmersiveIntensity(stored ? JSON.parse(stored)?.immersiveIntensity : undefined);
  } catch { return DEFAULT_IMMERSIVE_INTENSITY; }
}

/** Old account settings must never opt another device into the GPU effect. */
export function parseAmbientMode(stored: string | null, legacyEnabled = true): AmbientMode {
  try {
    if (stored) {
      const value = JSON.parse(stored);
      if (value.mode === 'immersive') return value.powerWarningAccepted === true ? 'immersive' : 'normal';
      if (['off', 'normal', 'auto'].includes(value.mode)) return value.mode;
    }
  } catch { /* Use the inexpensive default if storage is corrupt. */ }
  return legacyEnabled === false ? 'off' : 'normal';
}
