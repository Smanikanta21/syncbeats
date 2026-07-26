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
}

export interface GradientSettings {
  mode: "auto" | "manual";
  nodes: GradientNode[];
  extractedColors: [string, string];
}

export interface AppSettings {
  audioLatencyOffsetMs: number;
  syncAggressiveness: "high" | "saver";
  keepScreenAwake: boolean; // Screen Awake Feature (Wake Lock API)
  islandCustomizer: IslandCustomizerSettings; // Dynamic Island Customizer
  gradientSettings: GradientSettings; // Dynamic Album Art Gradient & Custom Node Editor
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
}

const DEFAULT_SETTINGS: AppSettings = {
  audioLatencyOffsetMs: 0,
  syncAggressiveness: "high",
  keepScreenAwake: true,
  islandCustomizer: {
    glowColor: "violet",
    autoShrinkDelaySec: 6,
    showAlbumArt: true,
  },
  gradientSettings: {
    mode: "auto",
    nodes: [
      { id: "node-1", color: "#8b5cf6", position: 0 },
      { id: "node-2", color: "#3b82f6", position: 100 },
    ],
    extractedColors: ["#8b5cf6", "#3b82f6"],
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
    
    // Custom event for intra-tab updates
    const handleCustomEvent = () => {
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

  // Sync settings with the database user object when it changes (e.g. on login or save)
  useEffect(() => {
    if (auth?.user?.settings) {
      try {
        const dbSettings = typeof auth.user.settings === "string" 
          ? JSON.parse(auth.user.settings) 
          : auth.user.settings;
        
        if (dbSettings && typeof dbSettings === "object") {
          setSettingsState((prev) => ({
            ...prev,
            ...dbSettings,
            islandCustomizer: {
              ...prev.islandCustomizer,
              ...(dbSettings.islandCustomizer || {}),
            },
            gradientSettings: {
              ...prev.gradientSettings,
              ...(dbSettings.gradientSettings || {}),
            },
            ambientColors: {
              ...prev.ambientColors,
              ...(dbSettings.ambientColors || {}),
            },
            ambientPositions: {
              ...prev.ambientPositions,
              ...(dbSettings.ambientPositions || {}),
            },
          }));
        }
      } catch (e) {
        console.warn("Failed to parse DB settings", e);
      }
    }
  }, [auth?.user]);

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
    window.dispatchEvent(new Event("syncbeats-settings-updated"));

    // Sync to backend if logged in (debounced to prevent high-frequency PATCH flooding)
    if (auth?.user) {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        authApi.updateSettings(newSettings).catch((err) => {
          console.warn("Failed to sync settings to server:", err);
        });
      }, 500);
    }
  };

  return { settings, updateSettings };
}
