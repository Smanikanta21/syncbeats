"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useBeatEngine } from "../../context/BeatContext";
import { useSettings } from "../../hooks/useSettings";
import { useAmbientMode } from '../../hooks/useAmbientMode';
import { useAlbumPalette } from '../../hooks/useAlbumPalette';
import { usePageVisible } from '../../hooks/usePageVisible';
import { useSyncInfo } from "../../context/SyncContext";
import { useOptionalAudio } from "../../context/AudioContext";
import { cn } from "@/lib/utils";

interface BeatNodeProps {
  beatType: "bass" | "mid" | "treble";
  x: number; // percentage [0 - 100]
  y: number; // percentage [0 - 100]
  color: string;
  liquidMotion?: boolean;
  index: number;
  moving: boolean;
  brightness: number;
}

function BeatNode({ beatType, x, y, color, liquidMotion = true, index, moving, brightness }: BeatNodeProps) {
  const reducedMotion = useReducedMotion();
  const { subscribeToBeat } = useBeatEngine();
  const blobRef = useRef<HTMLDivElement>(null);
  const nodeContainerRef = useRef<HTMLDivElement>(null);

  const beatIntensityRef = useRef<number>(0);
  const targetIntensityRef = useRef<number>(0);
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    let first = 0;
    let second = 0;
    first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setArrived(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  // 1. Listen to real-time beat hits to boost deterministic radial beat intensity
  useEffect(() => {
    if (!moving || reducedMotion) return;
    const cleanup = subscribeToBeat(beatType, (intensity) => {
      const bounded = Math.min(1, Math.max(0.35, intensity));
      targetIntensityRef.current = Math.max(targetIntensityRef.current, bounded);
    });
    return cleanup;
  }, [beatType, subscribeToBeat, moving, reducedMotion]);

  // The normal background stays still when paused/hidden and renders at 30fps.
  useEffect(() => {
    if (!moving || reducedMotion) {
      targetIntensityRef.current = beatIntensityRef.current = 0;
      if (nodeContainerRef.current) nodeContainerRef.current.style.transform = 'translate(0, 0)';
      if (blobRef.current) {
        blobRef.current.style.transform = 'scale(1)';
        blobRef.current.style.opacity = String(0.18 * brightness);
      }
      return;
    }
    let animId = 0;
    let lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    // Vector pointing radially away from center (50%, 50%) for outward beat swells
    const radX = (x - 50) / 50; // -1 to +1
    const radY = (y - 50) / 50; // -1 to +1

    const updatePhysics = (now: number) => {
      if (now - lastTime < 1000 / 30 - 0.5) { animId = requestAnimationFrame(updatePhysics); return; }
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
        const orbitX = liquidMotion ? Math.sin(time * 0.45 + index * 1.5) * 6 : 0;
        const orbitY = liquidMotion ? Math.cos(time * 0.35 + index * 1.5) * 5 : 0;

        // B. Radial Beat Swell (Pulsing outward along node's spatial vector)
        const radialPulseDist = intensity * 10;
        const totalX = orbitX + radX * radialPulseDist;
        const totalY = orbitY + radY * radialPulseDist;

        // C. Scale & Opacity Swell matching main branch aesthetics
        const scaleBase = 1 + intensity * 0.2;

        // Apply GPU Hardware-Accelerated Transforms (Zero Mac Lag)
        container.style.transform = `translate(${totalX.toFixed(1)}px, ${totalY.toFixed(1)}px)`;

        blob.style.transform = `scale(${scaleBase.toFixed(3)})`;
        blob.style.opacity = `${Math.min(0.4, (0.18 + intensity * 0.1) * brightness).toFixed(3)}`;
      }

      animId = requestAnimationFrame(updatePhysics);
    };

    animId = requestAnimationFrame(updatePhysics);
    return () => cancelAnimationFrame(animId);
  }, [liquidMotion, x, y, index, moving, reducedMotion, brightness]);

  // Broad, overlapping fields blend into a wash instead of isolated circles.
  const isBass = beatType === "bass";
  const isTreble = beatType === "treble";

  const sizeClasses = isBass
    ? "w-[130vmax] h-[105vmax] -ml-[65vmax] -mt-[52.5vmax]"
    : isTreble
    ? "w-[120vmax] h-[110vmax] -ml-[60vmax] -mt-[55vmax]"
    : "w-[115vmax] h-[100vmax] -ml-[57.5vmax] -mt-[50vmax]";

  return (
    <div
      ref={nodeContainerRef}
      className="absolute pointer-events-none z-0"
      style={{
        left: `${arrived ? x : 50}%`,
        top: `${arrived ? y : 50}%`,
        opacity: arrived ? 1 : 0,
        transition: reducedMotion
          ? "none"
          : "left 1450ms cubic-bezier(0.16, 1, 0.3, 1), top 1450ms cubic-bezier(0.16, 1, 0.3, 1), opacity 900ms ease-out",
        transitionDelay: arrived ? `${index * 90}ms` : "0ms",
      }}
    >
      {/* Soft ellipses have no bright core or visible circular edge. */}
      <div
        ref={blobRef}
        className={`absolute rounded-full ${sizeClasses} pointer-events-none`}
        style={{
          opacity: 0.18 * brightness,
          transform: "scale(1)",
          transformOrigin: "center center",
          background: `radial-gradient(ellipse at center, ${color} 0%, color-mix(in srgb, ${color} 55%, transparent) 22%, color-mix(in srgb, ${color} 18%, transparent) 48%, transparent 76%)`,
        }}
      />
    </div>
  );
}

/**
 * Normal and Auto reuse the app's music-reactive light layout. The GPU effect
 * replaces these nodes entirely, rather than keeping two animation loops alive.
 */
export function SpatialBeatNodes({ suppressGradient = false, coverUrl }: { suppressGradient?: boolean; coverUrl?: string | null }) {
  const { settings } = useSettings();
  const { mode } = useAmbientMode();
  const visible = usePageVisible();
  const palette = useAlbumPalette(coverUrl, mode === 'auto' || mode === 'immersive');
  const { isRoomPlaying } = useSyncInfo();
  const audioContext = useOptionalAudio();

  const isPlaying = audioContext?.isPlaying ?? isRoomPlaying;

  if (mode === 'off') {
    return null;
  }

  const isBufferingOrDownloading = audioContext
    ? (audioContext.isBuffering || (audioContext.downloadProgress > 0 && audioContext.downloadProgress < 100))
    : false;

  const count = settings.activeLightCount || 3;
  const nodes = settings?.gradientSettings?.nodes || [];
  const liquidMotion = settings?.liquidMotion ?? true;
  const moving = isPlaying && visible && !settings.reducedMotion;
  const brightness = Math.max(0.2, Math.min(2, (settings.ambientBrightness ?? 100) / 100));

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
      {!suppressGradient && <div
        data-room-ambient-wash
        className={cn(
          "fixed -inset-32 overflow-hidden pointer-events-none z-0 transition-opacity duration-[1800ms] ease-out",
          isPlaying && !isBufferingOrDownloading
            ? "opacity-100"
            : "opacity-60"
        )}
        // One shared blur pass blends the fields; each light stays unfiltered.
        style={{ filter: 'blur(clamp(64px, 5vmax, 112px))', WebkitFilter: 'blur(clamp(64px, 5vmax, 112px))', viewTransitionName: 'none' }}
      >
      {activePreset.slice(0, Math.min(count, activePreset.length)).map((preset, idx) => {
        const node = nodes[idx];
        const savedColor = node?.color || (idx === 0 ? "#8b5cf6" : idx === 1 ? "#ec4899" : "#3b82f6");
        const idleSlate = ["#94a3b8", "#64748b", "#a8b3c2"][idx % 3];
        const color = palette?.[idx % 2] ?? (isPlaying ? savedColor : idleSlate);
        const x = node?.x ?? preset.x;
        const y = node?.y ?? preset.y;

        return (
          <BeatNode
            key={node?.id || `node-${idx}`}
            beatType={preset.beatType}
            x={x}
            y={y}
            color={color}
            liquidMotion={liquidMotion}
            index={idx}
            moving={moving}
            brightness={brightness}
          />
        );
      })}
      </div>}
    </>
  );
}
