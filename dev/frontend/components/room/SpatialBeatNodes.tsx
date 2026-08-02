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

      // 1. Instant 0ms hit pop & smooth decay using Web Animations API (GPU Compositor Thread)
      blob.animate(
        [
          { transform: `translate(-50%, -50%) scale(${scale})`, opacity: opacity },
          { transform: `translate(-50%, -50%) scale(1)`, opacity: 0.25 },
        ],
        {
          duration: 380,
          easing: "cubic-bezier(0, 0, 0.2, 1)",
          fill: "forwards",
        }
      );

      // 2. Instant shockwave ring expansion
      if (ring) {
        ring.animate(
          [
            { transform: `translate(-50%, -50%) scale(0.5)`, opacity: boundedIntensity * 0.85 },
            { transform: `translate(-50%, -50%) scale(${scale * 1.45})`, opacity: 0 },
          ],
          {
            duration: 480,
            easing: "cubic-bezier(0, 0, 0.2, 1)",
            fill: "forwards",
          }
        );
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
