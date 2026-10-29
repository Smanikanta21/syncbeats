"use client";

import { motion, useSpring } from "framer-motion";
import { useEffect, useState } from "react";
import { ACCENT_CYCLE_S, accentAt } from "@/lib/accent";

/**
 * AccentEngine — the fluid ambient blobs.
 *
 * Used by AmbientField wherever the WebGL field can't or shouldn't run: no
 * WebGL, a low device tier, or a viewer who asked for reduced motion.
 *
 * The blobs read `--accent-blob-1` / `--accent-blob-2` back through `var()`
 * rather than holding a palette of their own, which is what makes desync
 * structurally impossible: globals.css owns the palette and everything on
 * screen is downstream of it. framer is left doing what it is
 * good at — the geometric drift, which is transform-only.
 *
 * The mouse follower's position and shape live on MotionValues, not state. The
 * version this replaced called setState from its mousemove handler, which
 * re-rendered the component and every framer child under it on every frame of
 * every pointer move.
 */

/** Stage 0, inlined as the `var()` fallback so the first paint is never bare. */
const STAGE_0 = accentAt();

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

// Wandering drift. Mirrored over ACCENT_CYCLE_S, same as the colour walk, so a
// blob is always in the same place for a given accent.
const BLOB1 = {
  x: [0, 120, -80, 140, -60, 0],
  y: [0, -90, 80, -40, 100, 0],
  scale: [1, 1.08, 0.95, 1.12, 0.98, 1],
  rotate: [0, 25, -15, 35, -20, 0],
};

const BLOB2 = {
  x: [0, -130, 100, -70, 90, 0],
  y: [0, 80, -100, 60, -70, 0],
  scale: [1, 0.94, 1.1, 0.96, 1.06, 1],
  rotate: [0, -30, 20, -25, 15, 0],
};

const drift = {
  duration: ACCENT_CYCLE_S,
  repeat: Infinity,
  repeatType: "mirror" as const,
  ease: "easeInOut" as const,
};

export function AccentEngine({ reduced = false }: { reduced?: boolean }) {
  // Gates the fade-in: rendering the blobs before the client has mounted would
  // flash them at full opacity on hydration.
  const [ready, setReady] = useState(false);
  const [pointerActive, setPointerActive] = useState(false);

  // Mouse follower position/shape live on MotionValues, not state.
  const mx = useSpring(0, { damping: 26, stiffness: 180 });
  const my = useSpring(0, { damping: 26, stiffness: 180 });
  const sx = useSpring(1, { damping: 30, stiffness: 400 });
  const sy = useSpring(1, { damping: 30, stiffness: 400 });
  const rot = useSpring(0, { damping: 30, stiffness: 300 });

  useEffect(() => setReady(true), []);

  // Fluid mouse follower — fine pointers only.
  useEffect(() => {
    if (reduced) return;
    if (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768) return;

    let lastX = 0;
    let lastY = 0;
    let lastT = performance.now();
    let settle: ReturnType<typeof setTimeout> | null = null;

    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      const dt = Math.max(now - lastT, 16);
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = now;

      // Velocity-driven elongation: the blob stretches along its travel and
      // narrows across it, conserving apparent area.
      const speed = Math.hypot(dx, dy) / dt;
      const stretch = Math.min(1 + speed * 0.15, 1.4);

      mx.set(e.clientX);
      my.set(e.clientY);
      sx.set(stretch);
      sy.set(1 / Math.sqrt(stretch));
      rot.set(Math.atan2(dy, dx) * (180 / Math.PI));
      setPointerActive(true);

      if (settle) clearTimeout(settle);
      settle = setTimeout(() => {
        sx.set(1);
        sy.set(1);
        rot.set(0);
      }, 100);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (settle) clearTimeout(settle);
    };
  }, [reduced, mx, my, sx, sy, rot]);

  return (
    <div
      aria-hidden="true"
      className="gpu-accelerated pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ opacity: ready ? 1 : 0, transition: "opacity 0.6s ease-out" }}
    >
      <div className="pointer-events-none absolute top-[20%] left-[24%] -translate-x-1/2 -translate-y-1/2">
        <motion.div
          animate={reduced ? undefined : { ...BLOB1, borderRadius: FLUID_BLOB_PATH_1 }}
          transition={{
            x: drift,
            y: drift,
            scale: drift,
            rotate: drift,
            borderRadius: { duration: 11, repeat: Infinity, ease: "easeInOut" },
          }}
          style={{ background: `var(--accent-blob-1, ${STAGE_0.blob1})` }}
          className="gpu-accelerated max-h-162.5 h-[55vw] w-[55vw] max-w-[650px] blur-[50px] will-change-transform md:blur-[80px]"
        />
      </div>

      <div className="pointer-events-none absolute right-[14%] bottom-[12%] translate-x-1/4 translate-y-1/4">
        <motion.div
          animate={reduced ? undefined : { ...BLOB2, borderRadius: FLUID_BLOB_PATH_2 }}
          transition={{
            x: drift,
            y: drift,
            scale: drift,
            rotate: drift,
            borderRadius: { duration: 12, repeat: Infinity, ease: "easeInOut" },
          }}
          style={{ background: `var(--accent-blob-2, ${STAGE_0.blob2})` }}
          className="gpu-accelerated h-[50vw] w-[50vw] max-h-[580px] max-w-[580px] blur-[50px] will-change-transform md:blur-[80px]"
        />
      </div>

      <div
        className="pointer-events-none fixed top-0 left-0 z-0 hidden -translate-x-1/2 -translate-y-1/2 md:block"
        style={{
          opacity: pointerActive ? 1 : 0,
          transition: "opacity 0.4s ease-out",
        }}
      >
        <motion.div
          animate={{ borderRadius: FLUID_BLOB_PATH_MOUSE }}
          transition={{ borderRadius: { duration: 8, repeat: Infinity, ease: "easeInOut" } }}
          style={{
            x: mx,
            y: my,
            scaleX: sx,
            scaleY: sy,
            rotate: rot,
            background: `var(--accent-blob-1, ${STAGE_0.blob1})`,
          }}
          className="gpu-accelerated h-[32vw] w-[32vw] max-h-[380px] max-w-[380px] blur-[44px] will-change-transform md:blur-[64px]"
        />
      </div>
    </div>
  );
}
