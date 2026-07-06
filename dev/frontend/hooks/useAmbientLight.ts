"use client";

import { useRef, useCallback, useEffect } from "react";
import { useVisualizer } from "../context/VisualizerContext";

/**
 * useAmbientLight
 *
 * Directly drives the existing global ambient glow blobs in layout.tsx
 * by ID — refines their opacity and blur in response to music energy.
 *
 * Bass  → violet blob  (#ambient-bass)
 * Mids  → emerald blob (#ambient-mid)
 * Treble→ blue blob    (#ambient-treble)
 *
 * This does NOT add new elements — it updates the existing ones.
 */
export function useAmbientLight() {
  const { dataRef } = useVisualizer();
  const rafRef = useRef<number>(0);
  const smoothBass = useRef(0);
  const smoothMid = useRef(0);
  const smoothTreble = useRef(0);

  const update = useCallback(() => {
    const { bassEnergy, midEnergy, trebleEnergy, isPlaying } = dataRef.current;

    const attack = isPlaying ? 0.3 : 0;
    const decay = 0.05;

    smoothBass.current   += ((isPlaying ? bassEnergy   : 0) - smoothBass.current)   * (bassEnergy   > smoothBass.current   ? attack : decay);
    smoothMid.current    += ((isPlaying ? midEnergy    : 0) - smoothMid.current)    * (midEnergy    > smoothMid.current    ? attack : decay);
    smoothTreble.current += ((isPlaying ? trebleEnergy : 0) - smoothTreble.current) * (trebleEnergy > smoothTreble.current ? attack : decay);

    const b = smoothBass.current;
    const m = smoothMid.current;
    const t = smoothTreble.current;

    // Scale from idle (1.0) up to energized (1.0 + energy * boost)
    const bassScale   = 1 + b * 0.35;
    const midScale    = 1 + m * 0.25;
    const trebleScale = 1 + t * 0.2;

    // Opacity: resting value + energy boost
    const bassOpacity   = 0.10 + b * 0.30;
    const midOpacity    = 0.10 + m * 0.25;
    const trebleOpacity = 0.10 + t * 0.22;

    const setBlob = (id: string, opacity: number, scale: number) => {
      const el = document.getElementById(id) as HTMLElement | null;
      if (!el) return;
      el.style.opacity = String(Math.min(1, opacity));
      el.style.transform = `scale(${scale})`;
    };

    setBlob("ambient-bass",   bassOpacity,   bassScale);
    setBlob("ambient-mid",    midOpacity,    midScale);
    setBlob("ambient-treble", trebleOpacity, trebleScale);

    rafRef.current = requestAnimationFrame(update);
  }, [dataRef]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [update]);
}
