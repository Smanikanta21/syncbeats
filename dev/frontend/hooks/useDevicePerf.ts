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

import { useMemo } from "react";

export type PerfTier = "low" | "mid" | "high";

function detectTier(): PerfTier {
  if (typeof window === "undefined") return "high"; // SSR — assume full quality

  // Respect user's explicit accessibility preference first
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return "low";

  const cores = navigator.hardwareConcurrency ?? 4;
  // navigator.deviceMemory is not in all TS libs yet, cast via any
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

let _cachedTier: PerfTier | null = null;

export function useDevicePerf(): {
  tier: PerfTier;
  isLow: boolean;
  isMid: boolean;
  isHigh: boolean;
  /** Target ms between rAF frames — 16ms (60fps) for high, 33ms (30fps) for mid/low */
  frameInterval: number;
  /** Max blobs to render */
  maxBlobs: number;
  /** Whether to skip the wander position update (heavier per-frame work) */
  skipWander: boolean;
} {
  const tier = useMemo(() => {
    if (_cachedTier) return _cachedTier;
    _cachedTier = detectTier();
    return _cachedTier;
  }, []);

  return {
    tier,
    isLow: tier === "low",
    isMid: tier === "mid",
    isHigh: tier === "high",
    frameInterval: tier === "high" ? 16 : 33, // ~60fps vs ~30fps
    maxBlobs: tier === "low" ? 2 : tier === "mid" ? 3 : 6,
    skipWander: tier === "low",
  };
}
