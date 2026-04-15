"use client";

// context/AudioContext.tsx — Singleton audio player shared across app

import { createContext, useContext, type ReactNode } from "react";
import { useAudioPlayer } from "../hooks/useAudioPlayer";

type AudioCtx = ReturnType<typeof useAudioPlayer>;

const AudioContext = createContext<AudioCtx | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer();
  return <AudioContext.Provider value={player}>{children}</AudioContext.Provider>;
}

export function useAudio(): AudioCtx {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error("useAudio must be used inside <AudioProvider>");
  return ctx;
}
