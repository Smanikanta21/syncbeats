"use client";

import { useEffect, useRef } from "react";
import { useBeatEngine } from "../../context/BeatContext";
import { useSettings } from "../../hooks/useSettings";

import { useDevicePerf } from "../../hooks/useDevicePerf";

interface BeatNodeProps {
  beatType: "bass" | "mid" | "treble";
  x: number; // percentage [0 - 100]
  y: number; // percentage [0 - 100]
  color: string;
  blurClass?: string;
  liquidMotion?: boolean;
}

function BeatNode({ beatType, x, y, color, blurClass = "blur-[60px]", liquidMotion = true }: BeatNodeProps) {
  const { subscribeToBeat } = useBeatEngine();
  const blobRef = useRef<HTMLDivElement>(null);
  const nodeContainerRef = useRef<HTMLDivElement>(null);

  const beatIntensityRef = useRef<number>(0);
  const phaseRef = useRef<number>(Math.random() * Math.PI * 2);

  // 1. Listen to real-time beat hits to boost liquid energy
  useEffect(() => {
    const cleanup = subscribeToBeat(beatType, (intensity) => {
      beatIntensityRef.current = Math.max(beatIntensityRef.current, Math.min(1, intensity));
    });
    return cleanup;
  }, [beatType, subscribeToBeat]);

  // 2. Ultra-Lightweight GPU-Composited Physics Engine (Zero CPU Reflows)
  useEffect(() => {
    let animId: number;
    let lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const updateLiquidPhysics = (now: number) => {
      // Throttle rAF frame rate to 30fps-60fps based on hardware frameInterval
      const delta = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      // Smooth exponential decay of beat energy
      beatIntensityRef.current *= Math.pow(0.05, delta);
      const intensity = beatIntensityRef.current;

      const container = nodeContainerRef.current;
      const blob = blobRef.current;

      if (liquidMotion && container && blob) {
        // Wave phase motion
        const flowSpeed = 0.8 + intensity * 2.5;
        phaseRef.current += delta * flowSpeed;
        const phase = phaseRef.current;

        // A. GPU-Composited Position Drift (translate3d)
        const driftAmpX = 14 + intensity * 28;
        const driftAmpY = 10 + intensity * 22;
        
        const dx = Math.sin(phase) * driftAmpX;
        const dy = Math.cos(phase * 0.9) * driftAmpY;

        container.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;

        // B. GPU-Composited Scale & Opacity (No Layout Reflows / No Repaints)
        const scaleBase = 1 + intensity * 0.35;
        const stretchX = 1 + Math.sin(phase * 2.2) * (0.06 + intensity * 0.12);
        const stretchY = 1 + Math.cos(phase * 2.2) * (0.06 + intensity * 0.12);

        blob.style.transform = `translate3d(-50%, -50%, 0) scale3d(${scaleBase * stretchX}, ${scaleBase * stretchY}, 1)`;
        blob.style.opacity = `${0.22 + intensity * 0.35}`;
      } else if (container && blob) {
        container.style.transform = `translate3d(0px, 0px, 0)`;
        blob.style.transform = `translate3d(-50%, -50%, 0) scale3d(${1 + intensity * 0.35}, ${1 + intensity * 0.35}, 1)`;
        blob.style.opacity = `${0.22 + intensity * 0.3}`;
      }

      animId = requestAnimationFrame(updateLiquidPhysics);
    };

    animId = requestAnimationFrame(updateLiquidPhysics);
    return () => cancelAnimationFrame(animId);
  }, [liquidMotion]);

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
      {/* Main blurred spatial beat node */}
      <div
        ref={blobRef}
        className={`absolute left-0 top-0 w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] rounded-full filter ${blurClass} pointer-events-none opacity-25 will-change-transform`}
        style={{
          transform: "translate3d(-50%, -50%, 0) scale3d(1, 1, 1)",
          transformOrigin: "center center",
          backgroundColor: color,
        }}
      />
    </div>
  );
}

export function SpatialBeatNodes() {
  const { settings } = useSettings();
  const { blurClass } = useDevicePerf();

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
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
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
          />
        );
      })}
    </div>
  );
}
