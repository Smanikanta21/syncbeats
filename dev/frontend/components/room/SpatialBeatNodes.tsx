"use client";

import { useEffect, useRef } from "react";
import { useBeatEngine } from "../../context/BeatContext";
import { cn } from "../../lib/utils";

interface BeatNodeProps {
  beatType: "bass" | "mid" | "treble";
  x: number; // percentage [0 - 100]
  y: number; // percentage [0 - 100]
  label: string;
  gradientClass: string;
}

function BeatNode({ beatType, x, y, label, gradientClass }: BeatNodeProps) {
  const { subscribeToBeat } = useBeatEngine();
  const blobRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cleanup = subscribeToBeat(beatType, (intensity) => {
      const blob = blobRef.current;
      const ring = ringRef.current;
      if (!blob) return;

      const boundedIntensity = Math.min(1, Math.max(0, intensity));

      // Calculate punchy scale and peak opacity based on intensity
      const scale = 1 + boundedIntensity * 0.8;
      const opacity = 0.5 + boundedIntensity * 0.45;

      // 1. Instant hit on the glowing blob
      blob.style.transition = "none";
      blob.style.transform = `translate(-50%, -50%) scale(${scale})`;
      blob.style.opacity = opacity.toFixed(2);

      // 2. Pulse shockwave ring effect
      if (ring) {
        ring.style.transition = "none";
        ring.style.transform = `translate(-50%, -50%) scale(0.6)`;
        ring.style.opacity = (boundedIntensity * 0.8).toFixed(2);
      }

      // Force reflow
      void blob.offsetWidth;

      // 3. Smooth decay back to subtle idle baseline
      blob.style.transition = "transform 350ms cubic-bezier(0.16, 1, 0.3, 1), opacity 450ms ease-out";
      blob.style.transform = `translate(-50%, -50%) scale(1)`;
      blob.style.opacity = "0.25";

      if (ring) {
        ring.style.transition = "transform 500ms cubic-bezier(0.16, 1, 0.3, 1), opacity 500ms ease-out";
        ring.style.transform = `translate(-50%, -50%) scale(${scale * 1.4})`;
        ring.style.opacity = "0";
      }
    });

    return cleanup;
  }, [beatType, subscribeToBeat]);

  return (
    <div
      className="absolute pointer-events-none z-0"
      style={{
        left: `${x}%`,
        top: `${y}%`,
      }}
    >
      {/* Expanding shockwave ring on beat trigger */}
      <div
        ref={ringRef}
        className={cn(
          "absolute left-0 top-0 w-[24vw] h-[24vw] max-w-[320px] max-h-[320px] rounded-full border-2 border-current pointer-events-none opacity-0"
        )}
        style={{ transformOrigin: "center center" }}
      />

      {/* Main blurred spatial beat node */}
      <div
        ref={blobRef}
        className={cn(
          "absolute left-0 top-0 w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] rounded-full filter blur-[60px] pointer-events-none opacity-25 transition-all",
          gradientClass
        )}
        style={{
          transform: "translate(-50%, -50%) scale(1)",
          transformOrigin: "center center",
        }}
      />
    </div>
  );
}

export function SpatialBeatNodes() {
  // Distinct spatial node coordinates across the screen:
  // - BASS:   Bottom-Left corner (low frequency anchor)
  // - MID:    Center-Right region (vocal / mid frequency anchor)
  // - TREBLE: Top-Center region (high frequency / hi-hat anchor)
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Bass Spatial Node (Bottom-Left) */}
      <BeatNode
        beatType="bass"
        x={22}
        y={72}
        label="BASS NODE"
        gradientClass="bg-gradient-to-tr from-purple-600 via-indigo-600 to-violet-500"
      />

      {/* Mid Spatial Node (Center-Right) */}
      <BeatNode
        beatType="mid"
        x={78}
        y={48}
        label="MID NODE"
        gradientClass="bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-500"
      />

      {/* Treble Spatial Node (Top-Center) */}
      <BeatNode
        beatType="treble"
        x={50}
        y={20}
        label="TREBLE NODE"
        gradientClass="bg-gradient-to-tr from-pink-500 via-rose-500 to-fuchsia-500"
      />
    </div>
  );
}
