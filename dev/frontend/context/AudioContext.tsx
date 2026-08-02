"use client";

// context/AudioContext.tsx — Singleton audio player shared across app

import React, { createContext, useContext, useEffect, type ReactNode } from "react";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useSettings } from "../hooks/useSettings";

type AudioCtx = ReturnType<typeof useAudioPlayer>;

const AudioContext = createContext<AudioCtx | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer();
  const { settings } = useSettings();

  useEffect(() => {
    // Convert ms to seconds for WebAudio API
    player.setManualLatency(settings.audioLatencyOffsetMs / 1000);
  }, [settings.audioLatencyOffsetMs, player]);

  return <AudioContext.Provider value={player}>{children}</AudioContext.Provider>;
}

export function useOptionalAudio(): AudioCtx | null {
  return useContext(AudioContext);
}

export function useAudio(): AudioCtx {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error("useAudio must be used inside <AudioProvider>");
  return ctx;
}
