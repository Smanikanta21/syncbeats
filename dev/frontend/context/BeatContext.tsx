"use client";

import React, { createContext, useContext, useCallback, useRef, useState } from "react";

export interface BeatEvent {
  timestamp: number;        // ms, relative to track start
  beatType: 'bass' | 'mid' | 'treble';
  intensity: number;        // 0-1, normalized strength of this onset
  source: 'spotify-analysis' | 'realtime-fft';
}

interface BeatContextType {
  // Allow producers (Spotify analysis, real-time FFT) to emit a beat event
  emitBeat: (event: BeatEvent) => void;
  // Allow consumers (the nodes) to subscribe to a specific beat type
  subscribeToBeat: (beatType: 'bass' | 'mid' | 'treble', callback: (intensity: number) => void) => () => void;
  // For the debug overlay
  latestEvents: BeatEvent[];
}

const BeatContext = createContext<BeatContextType | null>(null);

export function BeatProvider({ children }: { children: React.ReactNode }) {
  const subscribersRef = useRef<Record<'bass' | 'mid' | 'treble', Set<(intensity: number) => void>>>({
    bass: new Set(),
    mid: new Set(),
    treble: new Set()
  });

  const [latestEvents, setLatestEvents] = useState<BeatEvent[]>([]);

  const emitBeat = useCallback((event: BeatEvent) => {
    // Notify all subscribers for this beat type
    const subs = subscribersRef.current[event.beatType];
    if (subs) {
      subs.forEach(cb => cb(event.intensity));
    }
    
    // Keep a small buffer for the debug overlay (last 20 events)
    setLatestEvents(prev => [event, ...prev].slice(0, 20));
  }, []);

  const subscribeToBeat = useCallback((beatType: 'bass' | 'mid' | 'treble', callback: (intensity: number) => void) => {
    subscribersRef.current[beatType].add(callback);
    return () => {
      subscribersRef.current[beatType].delete(callback);
    };
  }, []);

  return (
    <BeatContext.Provider value={{ emitBeat, subscribeToBeat, latestEvents }}>
      {children}
    </BeatContext.Provider>
  );
}

export function useBeatEngine() {
  const context = useContext(BeatContext);
  if (!context) {
    throw new Error("useBeatEngine must be used within a BeatProvider");
  }
  return context;
}
