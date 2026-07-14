import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { authApi } from "../lib/api";

export interface AppSettings {
  audioLatencyOffsetMs: number;
  syncAggressiveness: "high" | "saver";
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

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const auth = useAuth();

  // Load from local storage initially
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        setSettingsState({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch {
      // ignore
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_STORAGE_KEY && e.newValue) {
        setSettingsState({ ...DEFAULT_SETTINGS, ...JSON.parse(e.newValue) });
      }
    };
    
    // Custom event for intra-tab updates
    const handleCustomEvent = () => {
      try {
        const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (stored) {
          setSettingsState({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
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
            // Ensure nested objects merge properly
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
      // Ensure nested updates merge correctly
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

    // Sync to backend if logged in
    if (auth?.user) {
      // Small fire-and-forget async update (debounce could be added here if needed)
      authApi.updateSettings(newSettings).catch((err) => {
        console.warn("Failed to sync settings to server:", err);
      });
    }
  };

  return { settings, updateSettings };
}
