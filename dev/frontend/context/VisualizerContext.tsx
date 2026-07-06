"use client";

import { createContext, useContext, useRef, useEffect, ReactNode } from "react";
import { useAudio } from "./AudioContext";

// We'll store the visualizer data in a mutable ref to avoid React re-renders on every frame.
// Components will use requestAnimationFrame to read from this ref and update their own DOM/Canvas.
export interface VisualizerData {
  rawAudioData: Uint8Array | null;
  bassEnergy: number; // 0 to 1
  midEnergy: number; // 0 to 1
  trebleEnergy: number; // 0 to 1
  hasTrack: boolean;
  isPlaying: boolean;
}

const VisualizerContext = createContext<{
  dataRef: React.MutableRefObject<VisualizerData>;
} | null>(null);

export function VisualizerProvider({ children }: { children: ReactNode }) {
  const { getRawAudioData, isPlaying, hasTrack } = useAudio();
  const reqRef = useRef<number>(0);

  const dataRef = useRef<VisualizerData>({
    rawAudioData: null,
    bassEnergy: 0,
    midEnergy: 0,
    trebleEnergy: 0,
    hasTrack: false,
    isPlaying: false,
  });

  useEffect(() => {
    // Update non-frequent state instantly
    dataRef.current.hasTrack = hasTrack;
    dataRef.current.isPlaying = isPlaying;
  }, [hasTrack, isPlaying]);

  useEffect(() => {
    const updateLoop = () => {
      const data = getRawAudioData ? getRawAudioData() : null;
      dataRef.current.rawAudioData = data;

      if (data && data.length > 0 && isPlaying) {
        // Calculate bass (0-10)
        let bassSum = 0;
        for (let i = 0; i < 10; i++) bassSum += data[i] || 0;
        dataRef.current.bassEnergy = (bassSum / 10) / 255;

        // Calculate mids (10-40)
        let midSum = 0;
        for (let i = 10; i < 40; i++) midSum += data[i] || 0;
        dataRef.current.midEnergy = (midSum / 30) / 255;

        // Calculate treble (40-100)
        let trebleSum = 0;
        for (let i = 40; i < 100; i++) trebleSum += data[i] || 0;
        dataRef.current.trebleEnergy = (trebleSum / 60) / 255;
      } else {
        dataRef.current.bassEnergy *= 0.9; // decay
        dataRef.current.midEnergy *= 0.9;
        dataRef.current.trebleEnergy *= 0.9;
      }
      
      reqRef.current = requestAnimationFrame(updateLoop);
    };

    reqRef.current = requestAnimationFrame(updateLoop);
    return () => {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
    };
  }, [getRawAudioData, isPlaying]);

  return (
    <VisualizerContext.Provider value={{ dataRef }}>
      {children}
    </VisualizerContext.Provider>
  );
}

export function useVisualizer() {
  const ctx = useContext(VisualizerContext);
  if (!ctx) throw new Error("useVisualizer must be used within VisualizerProvider");
  return ctx;
}
