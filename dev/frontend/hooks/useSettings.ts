import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { authApi } from "../lib/api";

export interface IslandCustomizerSettings {
  glowColor: "violet" | "cyan" | "emerald" | "amber" | "dark" | "none";
  autoShrinkDelaySec: number; // 3, 6, 10, or 0 (0 means never shrink)
  showAlbumArt: boolean;
}

export interface GradientNode {
  id: string;
  color: string;
  position: number;
  x?: number;
  y?: number;
}

export interface GradientSettings {
  presetName?: string;
  nodes: GradientNode[];
}

export interface AppSettings {
  audioLatencyOffsetMs: number;
  syncAggressiveness: "high" | "saver";
  keepScreenAwake: boolean; // Screen Awake Feature (Wake Lock API)
  islandCustomizer: IslandCustomizerSettings; // Dynamic Island Customizer
  gradientSettings: GradientSettings; // Custom Gradient & Theme Color Palette
  ambientColors: {
    subHue: number;
    bassHue: number;
    lowMidHue: number;
    midHue: number;
    upperMidHue: number;
    highHue: number;
  };
  ambientBrightness: number;
  ambientContrast: number;
  ambientPositions?: {
    sub: { x: number; y: number };
    bass: { x: number; y: number };
    lowMid: { x: number; y: number };
    mid: { x: number; y: number };
    upperMid: { x: number; y: number };
    high: { x: number; y: number };
  };
  activeLightCount?: number;
  reducedMotion: boolean;
  ambientEnabled?: boolean;
  showDebugAudio?: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  audioLatencyOffsetMs: 0,
  syncAggressiveness: "high",
  keepScreenAwake: true,
  islandCustomizer: {
    glowColor: "violet",
    autoShrinkDelaySec: 6,
    showAlbumArt: true,
  },
  gradientSettings: {
    presetName: "Cyber Neon",
    nodes: [
      { id: "node-1", color: "#8b5cf6", position: 0 },
      { id: "node-2", color: "#ec4899", position: 50 },
      { id: "node-3", color: "#3b82f6", position: 100 },
    ],
  },
  ambientColors: {
    subHue: 320,
    bassHue: 0,
    lowMidHue: 40,
    midHue: 120,
    upperMidHue: 200,
    highHue: 280,
  },
  ambientBrightness: 100,
  ambientContrast: 100,
  ambientPositions: {
    sub: { x: 50, y: 15 },
    bass: { x: 18, y: 38 },
    lowMid: { x: 18, y: 68 },
    mid: { x: 82, y: 38 },
    upperMid: { x: 82, y: 68 },
    high: { x: 50, y: 85 },
  },
  activeLightCount: 3,
  reducedMotion: false,
  ambientEnabled: true,
  showDebugAudio: false,
};

const SETTINGS_STORAGE_KEY = "syncbeats_app_settings";

// Custom hook to request Screen Wake Lock API when enabled
export function useScreenAwake(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("wakeLock" in navigator)) return;

    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        wakeLock = await (navigator as any).wakeLock.request("screen");
      } catch (err) {
        // Wake lock request failed (e.g. low power mode or battery saver)
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && enabled) {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, [enabled]);
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const auth = useAuth();
  const syncTimeoutRef = useRef<any>(null);
  // Flag to suppress the custom event handler reacting to our own dispatches
  const isInternalUpdateRef = useRef(false);

  // Automatically keep screen awake if enabled in settings
  useScreenAwake(settings.keepScreenAwake);

  // Load from local storage initially
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettingsState({
          ...DEFAULT_SETTINGS,
          ...parsed,
          islandCustomizer: {
            ...DEFAULT_SETTINGS.islandCustomizer,
            ...(parsed.islandCustomizer || {}),
          },
        });
      }
    } catch {
      // ignore
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_STORAGE_KEY && e.newValue) {
        const parsed = JSON.parse(e.newValue);
        setSettingsState({
          ...DEFAULT_SETTINGS,
          ...parsed,
          islandCustomizer: {
            ...DEFAULT_SETTINGS.islandCustomizer,
            ...(parsed.islandCustomizer || {}),
          },
        });
      }
    };
    
    // Custom event for intra-tab updates (skip if dispatched by our own updateSettings)
    const handleCustomEvent = () => {
      if (isInternalUpdateRef.current) return;
      try {
        const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setSettingsState({
            ...DEFAULT_SETTINGS,
            ...parsed,
            islandCustomizer: {
              ...DEFAULT_SETTINGS.islandCustomizer,
              ...(parsed.islandCustomizer || {}),
            },
          });
        }
      } catch {}
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("syncbeats-settings-updated", handleCustomEvent);
    
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("syncbeats-settings-updated", handleCustomEvent);
    };
  }, []);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const userSettings = auth?.user?.settings;

  // Sync settings with the database user object when it changes (e.g. on login or save)
  useEffect(() => {
    if (userSettings) {
      try {
        const dbSettings = typeof userSettings === "string" 
          ? JSON.parse(userSettings) 
          : userSettings;
        
        if (dbSettings && typeof dbSettings === "object") {
          const currentStr = JSON.stringify(settingsRef.current);
          const merged = {
            ...settingsRef.current,
            ...dbSettings,
            islandCustomizer: {
              ...settingsRef.current.islandCustomizer,
              ...(dbSettings.islandCustomizer || {}),
            },
            gradientSettings: {
              ...settingsRef.current.gradientSettings,
              ...(dbSettings.gradientSettings || {}),
            },
            ambientColors: {
              ...settingsRef.current.ambientColors,
              ...(dbSettings.ambientColors || {}),
            },
            ambientPositions: {
              ...settingsRef.current.ambientPositions,
              ...(dbSettings.ambientPositions || {}),
            },
          };
          if (JSON.stringify(merged) !== currentStr) {
            setSettingsState(merged);
          }
        }
      } catch (e) {
        console.warn("Failed to parse DB settings", e);
      }
    }
  }, [userSettings]);

  const updateSettings = (updates: Partial<AppSettings>) => {
    const newSettings = {
      ...settings,
      ...updates,
      islandCustomizer: updates.islandCustomizer
        ? { ...settings.islandCustomizer, ...updates.islandCustomizer }
        : settings.islandCustomizer,
      gradientSettings: updates.gradientSettings
        ? { ...settings.gradientSettings, ...updates.gradientSettings }
        : settings.gradientSettings,
      ambientColors: updates.ambientColors 
        ? { ...settings.ambientColors, ...updates.ambientColors }
        : settings.ambientColors,
      ambientPositions: updates.ambientPositions
        ? { ...settings.ambientPositions, ...updates.ambientPositions }
        : settings.ambientPositions,
    };
    setSettingsState(newSettings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
    // Mark this as an internal update so our own custom event handler ignores it
    isInternalUpdateRef.current = true;
    window.dispatchEvent(new Event("syncbeats-settings-updated"));
    // Reset after microtask so only our handler is skipped, not future cross-tab events
    setTimeout(() => { isInternalUpdateRef.current = false; }, 0);

    // Sync to backend if logged in (debounced to prevent high-frequency PATCH flooding)
    // Note: we call authApi directly — NOT AuthContext.updateSettings — to avoid setUser re-render
    if (auth?.user) {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        authApi.updateSettings(newSettings)
          .then(() => {
            // Keep auth.user.settings in sync so the DB-merge effect never
            // overwrites local state with stale login-time data.
            auth.patchUserSettings(newSettings);
          })
          .catch((err) => {
            console.warn("Failed to sync settings to server:", err);
          });
      }, 1500);
    }
  };

  return { settings, updateSettings };
}
