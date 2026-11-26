"use client";

import { useSyncExternalStore } from 'react';
import { AMBIENT_CHANGE_EVENT, AMBIENT_STORAGE_KEY, DEFAULT_IMMERSIVE_INTENSITY, normalizeImmersiveIntensity, parseAmbientMode, parseImmersiveIntensity, type AmbientMode } from '../lib/ambientPreferences';

let memoryMode: AmbientMode = 'normal';
let memoryIntensity = DEFAULT_IMMERSIVE_INTENSITY;
let sessionOverride = false;
function intensitySnapshot(): number {
  if (sessionOverride) return memoryIntensity;
  try { return parseImmersiveIntensity(localStorage.getItem(AMBIENT_STORAGE_KEY)); }
  catch { return memoryIntensity; }
}
function snapshot(): AmbientMode {
  if (sessionOverride) return memoryMode;
  try {
    const legacy = JSON.parse(localStorage.getItem('syncbeats_app_settings') || '{}');
    return parseAmbientMode(localStorage.getItem(AMBIENT_STORAGE_KEY), legacy.ambientEnabled);
  } catch { return memoryMode; }
}
function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === AMBIENT_STORAGE_KEY || event.key === 'syncbeats_app_settings') {
      sessionOverride = false;
      notify();
    }
  };
  window.addEventListener(AMBIENT_CHANGE_EVENT, notify);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(AMBIENT_CHANGE_EVENT, notify);
    window.removeEventListener('storage', onStorage);
  };
}
function setMode(mode: AmbientMode, powerWarningAccepted = false) {
  if (mode === 'immersive' && !powerWarningAccepted) return;
  memoryIntensity = intensitySnapshot();
  memoryMode = mode;
  try {
    localStorage.setItem(AMBIENT_STORAGE_KEY, JSON.stringify({ mode, immersiveIntensity: memoryIntensity, powerWarningAccepted: mode === 'immersive' && powerWarningAccepted }));
    sessionOverride = false;
  } catch { sessionOverride = true; }
  window.dispatchEvent(new Event(AMBIENT_CHANGE_EVENT));
}
function setImmersiveIntensity(value: number) {
  memoryMode = snapshot();
  memoryIntensity = normalizeImmersiveIntensity(value);
  try {
    localStorage.setItem(AMBIENT_STORAGE_KEY, JSON.stringify({ mode: memoryMode, immersiveIntensity: memoryIntensity, powerWarningAccepted: memoryMode === 'immersive' }));
    sessionOverride = false;
  } catch { sessionOverride = true; }
  window.dispatchEvent(new Event(AMBIENT_CHANGE_EVENT));
}
const serverSnapshot = (): AmbientMode => 'normal';
const serverIntensity = (): number => DEFAULT_IMMERSIVE_INTENSITY;

export function useAmbientMode() {
  const mode = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const immersiveIntensity = useSyncExternalStore(subscribe, intensitySnapshot, serverIntensity);
  return { mode, setMode, immersiveIntensity, setImmersiveIntensity };
}
