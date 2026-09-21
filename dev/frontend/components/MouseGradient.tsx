"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Unified color stages — both blobs cycle through these TOGETHER
// Blob 1 uses slightly higher opacity, Blob 2 slightly lower, so they're
// harmonious (same hue) but still visually distinct.
const COLOR_PALETTE = [
  { 
    main: "rgba(16, 185, 129, 0.45)", 
    secondary: "rgba(45, 212, 191, 0.40)", 
    glow: "rgba(52, 211, 153, 0.55)", 
    solid: "rgb(52, 211, 153)", 
    rgb: "52, 211, 153",
    gradient: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)",
    blob1: "rgba(16, 185, 129, 0.50)",
    blob2: "rgba(20, 184, 166, 0.35)",
  },
  { 
    main: "rgba(56, 189, 248, 0.45)", 
    secondary: "rgba(59, 130, 246, 0.40)", 
    glow: "rgba(14, 165, 233, 0.55)", 
    solid: "rgb(56, 189, 248)", 
    rgb: "56, 189, 248",
    gradient: "linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)",
    blob1: "rgba(56, 189, 248, 0.50)",
    blob2: "rgba(59, 130, 246, 0.35)",
  },
  { 
    main: "rgba(168, 85, 247, 0.45)", 
    secondary: "rgba(192, 132, 252, 0.40)", 
    glow: "rgba(192, 132, 252, 0.55)", 
    solid: "rgb(192, 132, 252)", 
    rgb: "192, 132, 252",
    gradient: "linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)",
    blob1: "rgba(168, 85, 247, 0.50)",
    blob2: "rgba(139, 92, 246, 0.35)",
  },
  { 
    main: "rgba(244, 63, 94, 0.45)", 
    secondary: "rgba(251, 113, 133, 0.40)", 
    glow: "rgba(244, 114, 182, 0.55)", 
    solid: "rgb(251, 113, 133)", 
    rgb: "251, 113, 133",
    gradient: "linear-gradient(135deg, #f43f5e 0%, #f472b6 100%)",
    blob1: "rgba(244, 63, 94, 0.50)",
    blob2: "rgba(251, 113, 133, 0.35)",
  },
  { 
    main: "rgba(245, 158, 11, 0.45)", 
    secondary: "rgba(251, 191, 36, 0.40)", 
    glow: "rgba(252, 211, 77, 0.55)", 
    solid: "rgb(251, 191, 36)", 
    rgb: "251, 191, 36",
    gradient: "linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)",
    blob1: "rgba(245, 158, 11, 0.50)",
    blob2: "rgba(234, 88, 12, 0.35)",
  },
];

// The unified color cycle duration — movement + color are synced to this
const COLOR_CYCLE_DURATION = 25; // seconds per full cycle (mirror = 50s round-trip)

// Continuous fluid morphing border-radius pathways
const FLUID_BLOB_PATH_1 = [
  "55% 45% 38% 62% / 60% 38% 62% 40%",
  "40% 60% 65% 35% / 45% 55% 45% 55%",
  "65% 35% 42% 58% / 38% 62% 58% 42%",
  "42% 58% 65% 35% / 55% 45% 42% 58%",
  "55% 45% 38% 62% / 60% 38% 62% 40%",
];

const FLUID_BLOB_PATH_2 = [
  "42% 58% 62% 38% / 58% 42% 40% 60%",
  "60% 40% 45% 55% / 38% 62% 62% 38%",
  "38% 62% 55% 45% / 62% 38% 45% 55%",
  "55% 45% 38% 62% / 45% 55% 58% 42%",
  "42% 58% 62% 38% / 58% 42% 40% 60%",
];

const FLUID_BLOB_PATH_MOUSE = [
  "48% 52% 42% 58% / 58% 44% 56% 42%",
  "42% 58% 55% 45% / 46% 54% 48% 52%",
  "58% 42% 45% 55% / 52% 48% 54% 46%",
  "48% 52% 42% 58% / 58% 44% 56% 42%",
];

// Slow wandering drift paths — synced to COLOR_CYCLE_DURATION so blobs
// visually glide across the screen as the color changes.
// Each position corresponds to a color stage waypoint.
const BLOB1_DRIFT_X = [0, 120, -80, 140, -60, 0];
const BLOB1_DRIFT_Y = [0, -90, 80, -40, 100, 0];
const BLOB1_SCALE   = [1, 1.08, 0.95, 1.12, 0.98, 1];
const BLOB1_ROTATE  = [0, 25, -15, 35, -20, 0];

const BLOB2_DRIFT_X = [0, -130, 100, -70, 90, 0];
const BLOB2_DRIFT_Y = [0, 80, -100, 60, -70, 0];
const BLOB2_SCALE   = [1, 0.94, 1.1, 0.96, 1.06, 1];
const BLOB2_ROTATE  = [0, -30, 20, -25, 15, 0];

export function MouseGradient() {
  const [isMounted, setIsMounted] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Interactive fluid mouse follower
  const [mouseBlob, setMouseBlob] = useState({
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotate: 0,
    visible: false,
  });

  // Mount phases
  useEffect(() => {
    setIsMounted(true);
    const id = requestAnimationFrame(() => {
      setIsReady(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Fluid mouse tracking with velocity-driven elongation
  useEffect(() => {
    if (typeof window !== "undefined" && (window.innerWidth < 768 || window.matchMedia("(pointer: coarse)").matches)) return;

    let rafId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    let lastTime = performance.now();
    let stopTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      const now = performance.now();
      const dt = Math.max(now - lastTime, 16);
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      lastTime = now;

      // Velocity-based fluid stretch
      const speed = Math.sqrt(dx * dx + dy * dy) / dt;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      const stretch = Math.min(1 + speed * 0.15, 1.4);
      const compress = 1 / Math.sqrt(stretch);

      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          setMouseBlob({
            x: e.clientX,
            y: e.clientY,
            scaleX: stretch,
            scaleY: compress,
            rotate: angle,
            visible: true,
          });
          rafId = null;
        });
      }

      if (stopTimeout) clearTimeout(stopTimeout);
      stopTimeout = setTimeout(() => {
        setMouseBlob(prev => ({
          ...prev,
          scaleX: 1,
          scaleY: 1,
          rotate: 0,
        }));
      }, 100);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (stopTimeout) clearTimeout(stopTimeout);
    };
  }, []);

  // Both blobs use the same base hues — blob1 is brighter, blob2 is softer
  const blob1Colors = COLOR_PALETTE.map(c => c.blob1);
  const blob2Colors = COLOR_PALETTE.map(c => c.blob2);
  const glowColors  = COLOR_PALETTE.map(c => c.glow);

  // Shared transition config for the color+drift sync
  const driftTransition = {
    duration: COLOR_CYCLE_DURATION,
    repeat: Infinity,
    repeatType: "mirror" as const,
    ease: "easeInOut" as const,
  };

  return (
    <div 
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden gpu-accelerated"
      style={{ opacity: isReady ? 1 : 0, transition: "opacity 0.5s ease-out" }}
    >
      {isReady && (
        <>
          {/* Blob 1 — Brighter, top-left anchor, drifts with color */}
          <div className="absolute top-[20%] left-[24%] -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <motion.div
              animate={{ 
                background: blob1Colors,
                x: BLOB1_DRIFT_X,
                y: BLOB1_DRIFT_Y,
                scale: BLOB1_SCALE,
                rotate: BLOB1_ROTATE,
                borderRadius: FLUID_BLOB_PATH_1,
              }}
              transition={{ 
                background: driftTransition,
                x: driftTransition,
                y: driftTransition,
                scale: driftTransition,
                rotate: driftTransition,
                borderRadius: { duration: 11, repeat: Infinity, ease: "easeInOut" },
              }}
              className="w-[55vw] h-[55vw] max-w-[650px] max-h-162.5 blur-[50px] md:blur-[80px] will-change-transform gpu-accelerated"
            />
          </div>

          {/* Blob 2 — Softer, bottom-right anchor, drifts with color */}
          <div className="absolute bottom-[12%] right-[14%] translate-x-1/4 translate-y-1/4 pointer-events-none">
            <motion.div
              animate={{ 
                background: blob2Colors,
                x: BLOB2_DRIFT_X,
                y: BLOB2_DRIFT_Y,
                scale: BLOB2_SCALE,
                rotate: BLOB2_ROTATE,
                borderRadius: FLUID_BLOB_PATH_2,
              }}
              transition={{ 
                background: driftTransition,
                x: driftTransition,
                y: driftTransition,
                scale: driftTransition,
                rotate: driftTransition,
                borderRadius: { duration: 12, repeat: Infinity, ease: "easeInOut" },
              }}
              className="w-[50vw] h-[50vw] max-w-[580px] max-h-[580px] blur-[50px] md:blur-[80px] will-change-transform gpu-accelerated"
            />
          </div>

          {/* Interactive Fluid Mouse Follower Blob */}
          {isMounted && (
            <div 
              className="fixed top-0 left-0 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0 hidden md:block"
              style={{
                opacity: mouseBlob.visible ? 1 : 0,
                transition: "opacity 0.4s ease-out",
              }}
            >
              <motion.div 
                animate={{
                  x: mouseBlob.x,
                  y: mouseBlob.y,
                  scaleX: mouseBlob.scaleX,
                  scaleY: mouseBlob.scaleY,
                  rotate: mouseBlob.rotate,
                  borderRadius: FLUID_BLOB_PATH_MOUSE,
                  background: glowColors,
                }}
                transition={{
                  x: { type: "spring", damping: 26, stiffness: 180 },
                  y: { type: "spring", damping: 26, stiffness: 180 },
                  scaleX: { duration: 0.18, ease: "easeOut" },
                  scaleY: { duration: 0.18, ease: "easeOut" },
                  rotate: { duration: 0.22, ease: "easeOut" },
                  borderRadius: { duration: 8, repeat: Infinity, ease: "easeInOut" },
                  background: { duration: 22, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" },
                }}
                className="w-[32vw] h-[32vw] max-w-[380px] max-h-[380px] blur-[44px] md:blur-[64px] will-change-transform gpu-accelerated"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
