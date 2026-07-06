import { useState, useEffect } from "react";

export interface AppSettings {
  audioLatencyOffsetMs: number;
  syncAggressiveness: "high" | "saver";
  ambientColors: {
    bassHue: number;
    midHue: number;
    highHue: number;
  };
  ambientBrightness: number;
  ambientContrast: number;
  reducedMotion: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  audioLatencyOffsetMs: 0,
  syncAggressiveness: "high",
  ambientColors: {
    bassHue: 0,
    midHue: 180,
    highHue: 270,
  },
  ambientBrightness: 100,
  ambientContrast: 100,
  reducedMotion: false,
};

const SETTINGS_STORAGE_KEY = "syncbeats_app_settings";

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);

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

  const updateSettings = (updates: Partial<AppSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettingsState(newSettings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
    window.dispatchEvent(new Event("syncbeats-settings-updated"));
  };

  return { settings, updateSettings };
}
