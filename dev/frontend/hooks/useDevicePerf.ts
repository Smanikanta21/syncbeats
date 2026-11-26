/**
 * useDevicePerf
 *
 * Detects device rendering capability at mount time and returns a stable
 * performance tier. Used to throttle animations on low-end devices.
 *
 * Tier classification:
 *   "low"    — mobile with ≤4 CPU cores, or prefers-reduced-motion, or low memory
 *   "mid"    — everything else on mobile / mid-range desktop
 *   "high"   — desktop with hardware concurrency > 4 and no reduced-motion
 *
 * The tier is computed once and never changes during a session.
 */

import { useState, useEffect, useMemo, useRef } from "react";

export type PerfTier = "low" | "mid" | "high";

function detectInitialTier(): PerfTier {
  if (typeof window === "undefined") return "high"; // SSR — assume full quality

  // Respect user's explicit accessibility preference first
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return "low";

  const cores = navigator.hardwareConcurrency ?? 4;
  const memGb: number = (navigator as any).deviceMemory ?? 4;
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile) {
    if (cores <= 4 || memGb <= 2) return "low";
    return "mid";
  }

  // Desktop
  if (cores <= 2 || memGb <= 2) return "mid";
  return "high";
}

export function useDevicePerf(): {
  tier: PerfTier;
  isLow: boolean;
  isMid: boolean;
  isHigh: boolean;
  /** Target ms between rAF frames — 16ms (60fps) for high, 33ms (30fps) for mid/low */
  frameInterval: number;
  /** Blur class for performance optimization */
  blurClass: string;
  /** Backdrop blur class */
  backdropBlurClass: string;
  /** Current measured real-time FPS */
  fps: number;
} {
  const [tier, setTier] = useState<PerfTier>(() => detectInitialTier());
  const [fps, setFps] = useState<number>(60);
  const frameTimesRef = useRef<number[]>([]);
  const lastTimeRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : Date.now());

  // Calibrate performance tier on mount over a short 1.5-second window, then stop rAF loop to save CPU/battery
  useEffect(() => {
    if (typeof window === "undefined") return;

    let animId: number;
    let framesCount = 0;
    const maxCalibrationFrames = 90; // ~1.5s at 60fps

    const measureFps = (now: number) => {
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (delta > 0 && delta < 200) {
        frameTimesRef.current.push(1000 / delta);
        framesCount++;
      }

      // Complete calibration once enough frames are sampled
      if (framesCount >= maxCalibrationFrames) {
        if (frameTimesRef.current.length > 0) {
          const avgFps = Math.round(
            frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length
          );
          setFps(avgFps);

          // Auto-throttle downgrade if FPS drops below 35 FPS consistently during calibration
          if (avgFps < 35) {
            setTier((prev) => (prev === "high" ? "mid" : "low"));
          } else if (avgFps < 48) {
            setTier((prev) => (prev === "high" ? "mid" : prev));
          }
        }
        // Calibration finished: stop animation frame loop to avoid CPU & battery drain
        return;
      }

      animId = requestAnimationFrame(measureFps);
    };

    animId = requestAnimationFrame(measureFps);
    return () => cancelAnimationFrame(animId);
  }, []);

  return useMemo(() => ({
    tier,
    isLow: tier === "low",
    isMid: tier === "mid",
    isHigh: tier === "high",
    frameInterval: tier === "high" ? 16 : 33,
    blurClass: tier === "low" ? "blur-[20px]" : tier === "mid" ? "blur-[40px]" : "blur-[60px]",
    backdropBlurClass: tier === "low" ? "backdrop-blur-md" : tier === "mid" ? "backdrop-blur-xl" : "backdrop-blur-3xl",
    fps,
  }), [tier, fps]);
}
