"use client";

import { useEffect, useRef } from "react";
import { useBeatEngine } from "../../context/BeatContext";
import { useSettings } from "../../hooks/useSettings";
import { useDevicePerf } from "../../hooks/useDevicePerf";
import { useSyncInfo } from "../../context/SyncContext";
import { useOptionalAudio } from "../../context/AudioContext";
import { cn } from "@/lib/utils";

interface BeatNodeProps {
  beatType: "bass" | "mid" | "treble";
  x: number; // percentage [0 - 100]
  y: number; // percentage [0 - 100]
  color: string;
  blurClass?: string;
  liquidMotion?: boolean;
  index: number;
}

function BeatNode({ beatType, x, y, color, blurClass = "blur-[40px] md:blur-[100px]", liquidMotion = true, index }: BeatNodeProps) {
  const { subscribeToBeat } = useBeatEngine();
  const blobRef = useRef<HTMLDivElement>(null);
  const nodeContainerRef = useRef<HTMLDivElement>(null);

  const beatIntensityRef = useRef<number>(0);
  const targetIntensityRef = useRef<number>(0);

  // 1. Listen to real-time beat hits to boost deterministic radial beat intensity
  useEffect(() => {
    const cleanup = subscribeToBeat(beatType, (intensity) => {
      const bounded = Math.min(1, Math.max(0.35, intensity));
      targetIntensityRef.current = Math.max(targetIntensityRef.current, bounded);
    });
    return cleanup;
  }, [beatType, subscribeToBeat]);

  // 2. 60FPS Deterministic Spatial Orbital Drift & Radial Beat Swell Engine
  useEffect(() => {
    let animId: number;
    let lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    // Vector pointing radially away from center (50%, 50%) for outward beat swells
    const radX = (x - 50) / 50; // -1 to +1
    const radY = (y - 50) / 50; // -1 to +1

    const updatePhysics = (now: number) => {
      const delta = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // Smooth interpolation of beat intensity
      targetIntensityRef.current *= Math.pow(0.05, delta);
      beatIntensityRef.current += (targetIntensityRef.current - beatIntensityRef.current) * Math.min(1, delta * 18);
      const intensity = beatIntensityRef.current;

      const container = nodeContainerRef.current;
      const blob = blobRef.current;

      if (container && blob) {
        const time = now / 1000;
        
        // A. Smooth Harmonic Lissajous Orbital Motion
        const orbitX = liquidMotion ? Math.sin(time * 0.75 + index * 1.5) * 18 : 0;
        const orbitY = liquidMotion ? Math.cos(time * 0.55 + index * 1.5) * 14 : 0;

        // B. Radial Beat Swell (Pulsing outward along node's spatial vector)
        const radialPulseDist = intensity * 24;
        const totalX = orbitX + radX * radialPulseDist;
        const totalY = orbitY + radY * radialPulseDist;

        // C. Scale & Opacity Swell matching main branch aesthetics
        const scaleBase = 1 + intensity * 0.65;

        // Apply GPU Hardware-Accelerated Transforms (Zero Mac Lag)
        container.style.transform = `translate3d(${totalX.toFixed(1)}px, ${totalY.toFixed(1)}px, 0)`;

        blob.style.transform = `translate3d(0, 0, 0) scale(${scaleBase.toFixed(3)})`;
        blob.style.opacity = `${(0.4 + intensity * 0.45).toFixed(3)}`;
      }

      animId = requestAnimationFrame(updatePhysics);
    };

    animId = requestAnimationFrame(updatePhysics);
    return () => cancelAnimationFrame(animId);
  }, [liquidMotion, x, y, index]);

  // Main branch responsive sizing according to frequency band type
  const isBass = beatType === "bass";
  const isTreble = beatType === "treble";

  const sizeClasses = isBass
    ? "w-[80vw] h-[80vw] -ml-[40vw] -mt-[40vw] md:w-[45vw] md:h-[45vw] md:-ml-[22.5vw] md:-mt-[22.5vw]"
    : isTreble
    ? "w-[90vw] h-[90vw] -ml-[45vw] -mt-[45vw] md:w-[50vw] md:h-[50vw] md:-ml-[25vw] md:-mt-[25vw]"
    : "w-[70vw] h-[70vw] -ml-[35vw] -mt-[35vw] md:w-[40vw] md:h-[40vw] md:-ml-[20vw] md:-mt-[20vw]";

  const maxDimension = isBass ? "600px" : isTreble ? "650px" : "500px";

  return (
    <div
      ref={nodeContainerRef}
      className="absolute pointer-events-none z-0"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        willChange: "transform",
      }}
    >
      {/* Main branch radial-gradient spatial light blob */}
      <div
        ref={blobRef}
        className={`absolute rounded-full filter ${blurClass} ${sizeClasses} pointer-events-none opacity-40 will-change-transform`}
        style={{
          maxWidth: maxDimension,
          maxHeight: maxDimension,
          mixBlendMode: "screen",
          transform: "translate3d(0, 0, 0) scale(1)",
          transformOrigin: "center center",
          background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        }}
      />
    </div>
  );
}

export function SpatialBeatNodes() {
  const { settings } = useSettings();
  const { blurClass } = useDevicePerf();
  const { isRoomPlaying } = useSyncInfo();
  const audioContext = useOptionalAudio();

  const isPlaying = isRoomPlaying || (audioContext ? audioContext.isPlaying : false);

  if (settings.ambientEnabled === false) {
    return null;
  }

  const isBufferingOrDownloading = audioContext
    ? (audioContext.isBuffering || (audioContext.downloadProgress > 0 && audioContext.downloadProgress < 100))
    : false;

  const count = settings.activeLightCount || 3;
  const nodes = settings?.gradientSettings?.nodes || [];
  const liquidMotion = settings?.liquidMotion ?? true;

  // Default layout presets for 2, 3, 4, 5, 6 nodes
  const layoutPresets: Record<number, Array<{ x: number; y: number; beatType: "bass" | "mid" | "treble" }>> = {
    2: [
      { x: 30, y: 50, beatType: "bass" },
      { x: 70, y: 50, beatType: "treble" },
    ],
    3: [
      { x: 22, y: 72, beatType: "bass" },
      { x: 78, y: 48, beatType: "mid" },
      { x: 50, y: 20, beatType: "treble" },
    ],
    4: [
      { x: 25, y: 25, beatType: "treble" },
      { x: 75, y: 25, beatType: "mid" },
      { x: 25, y: 75, beatType: "bass" },
      { x: 75, y: 75, beatType: "mid" },
    ],
    5: [
      { x: 20, y: 30, beatType: "treble" },
      { x: 80, y: 30, beatType: "mid" },
      { x: 50, y: 50, beatType: "mid" },
      { x: 20, y: 75, beatType: "bass" },
      { x: 80, y: 75, beatType: "bass" },
    ],
    6: [
      { x: 50, y: 15, beatType: "treble" },
      { x: 82, y: 35, beatType: "mid" },
      { x: 82, y: 68, beatType: "mid" },
      { x: 50, y: 85, beatType: "bass" },
      { x: 18, y: 68, beatType: "bass" },
      { x: 18, y: 35, beatType: "treble" },
    ],
  };

  const activePreset = layoutPresets[count] || layoutPresets[3];

  return (
    <>
      {/* 1. Slow Breathing Ambient Glow Aura during track loading / downloading */}
      <div
        className={cn(
          "fixed inset-0 overflow-hidden pointer-events-none -z-10 transition-opacity duration-1200 ease-in-out flex items-center justify-center",
          isBufferingOrDownloading ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="w-[75vw] h-[75vw] max-w-[850px] max-h-[850px] rounded-full bg-foreground/15 filter blur-[100px] animate-ambient-breathing pointer-events-none" />
      </div>

      {/* 2. Main Spatial Ambient Gradient Visualizer (Smooth 1.2s transition when ready) */}
      <div
        className={cn(
          "fixed inset-0 overflow-hidden pointer-events-none -z-10 transition-opacity duration-1200 ease-in-out",
          (isPlaying && !isBufferingOrDownloading) ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
      {activePreset.slice(0, Math.min(count, activePreset.length)).map((preset, idx) => {
        const node = nodes[idx];
        const color = node?.color || (idx === 0 ? "#8b5cf6" : idx === 1 ? "#ec4899" : "#3b82f6");
        const x = node?.x ?? preset.x;
        const y = node?.y ?? preset.y;

        return (
          <BeatNode
            key={node?.id || `node-${idx}`}
            beatType={preset.beatType}
            x={x}
            y={y}
            color={color}
            blurClass={blurClass}
            liquidMotion={liquidMotion}
            index={idx}
          />
        );
      })}
      </div>
    </>
  );
}
