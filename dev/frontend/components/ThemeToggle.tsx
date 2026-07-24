"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";

/* ─── Hardware-Accelerated Liquid Celestial Theme Transition ─────────────── */
export function runCelestialTransition(
  originX: number,
  originY: number,
  toDark: boolean,
  onSwap: () => void,
  onDone: () => void,
) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const canvas = document.createElement("canvas");
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: `${W}px`,
    height: `${H}px`,
    zIndex: "99999",
    pointerEvents: "none",
    transform: "translate3d(0,0,0)",
    willChange: "transform",
  });
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d", { alpha: true })!;
  ctx.scale(dpr, dpr);

  const maxR = Math.hypot(
    Math.max(originX, W - originX),
    Math.max(originY, H - originY),
  );

  // Pre-calculated particles (zero GC overhead)
  const COUNT = toDark ? 50 : 35;
  const particles = Array.from({ length: COUNT }, () => ({
    angle: Math.random() * Math.PI * 2,
    speed: 3 + Math.random() * 5,
    dist: 0,
    size: toDark ? 1.2 + Math.random() * 2 : 2 + Math.random() * 2.5,
    twinkleSeed: Math.random() * Math.PI * 2,
  }));

  const rays = toDark
    ? []
    : Array.from({ length: 12 }, (_, i) => ({
        angle: (i / 12) * Math.PI * 2,
        len: 0,
      }));

  const DURATION = 600; // Fast, fluid 600ms sweep
  const start = performance.now();
  let swapped = false;

  // Silky Sine Ease-In-Out (Zero acceleration jerk at start, zero deceleration jerk at end)
  function easeInOutSine(t: number) {
    return (1 - Math.cos(t * Math.PI)) / 2;
  }

  function frame(now: number) {
    const raw = Math.min((now - start) / DURATION, 1);
    const e = easeInOutSine(raw);
    const r = Math.max(1, maxR * e);

    // Swap theme immediately as wave begins sweeping so underlying DOM updates under the wave
    if (!swapped && raw >= 0.02) {
      swapped = true;
      onSwap();
    }

    ctx.clearRect(0, 0, W, H);

    // ── 1. Soft Expanding Radial Wave ──
    const innerR = Math.max(0, r * 0.35);
    const grad = ctx.createRadialGradient(originX, originY, innerR, originX, originY, r);
    if (toDark) {
      grad.addColorStop(0, "rgba(9, 9, 11, 1)");
      grad.addColorStop(0.75, "rgba(9, 9, 11, 0.98)");
      grad.addColorStop(0.92, "rgba(9, 9, 11, 0.5)");
      grad.addColorStop(1, "rgba(9, 9, 11, 0)");
    } else {
      grad.addColorStop(0, "rgba(255, 255, 255, 1)");
      grad.addColorStop(0.75, "rgba(255, 255, 255, 0.98)");
      grad.addColorStop(0.92, "rgba(255, 255, 255, 0.5)");
      grad.addColorStop(1, "rgba(255, 255, 255, 0)");
    }
    ctx.beginPath();
    ctx.arc(originX, originY, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // ── 2. Glowing Wave Edge Ring ──
    if (r > 10 && raw < 0.95) {
      const ringAlpha = Math.sin(raw * Math.PI) * 0.75;
      const ringWidth = Math.max(4, 18 * (1 - raw * 0.5));
      const ringGrad = ctx.createRadialGradient(
        originX, originY, Math.max(0, r - ringWidth),
        originX, originY, r + ringWidth
      );
      if (toDark) {
        ringGrad.addColorStop(0, "rgba(167, 139, 250, 0)");
        ringGrad.addColorStop(0.5, `rgba(167, 139, 250, ${ringAlpha})`);
        ringGrad.addColorStop(1, "rgba(167, 139, 250, 0)");
      } else {
        ringGrad.addColorStop(0, "rgba(251, 191, 36, 0)");
        ringGrad.addColorStop(0.5, `rgba(251, 191, 36, ${ringAlpha})`);
        ringGrad.addColorStop(1, "rgba(251, 191, 36, 0)");
      }
      ctx.beginPath();
      ctx.arc(originX, originY, r + ringWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = ringGrad;
      ctx.fill();
    }

    // ── 3. Solar Ray Streaks ──
    for (const ray of rays) {
      ray.len = r * 0.3 * (1 - raw);
      const rayAlpha = Math.max(0, (1 - raw * 1.5) * 0.5);
      if (rayAlpha > 0) {
        const x1 = originX + Math.cos(ray.angle) * (r * 0.08);
        const y1 = originY + Math.sin(ray.angle) * (r * 0.08);
        const x2 = originX + Math.cos(ray.angle) * (r * 0.08 + ray.len);
        const y2 = originY + Math.sin(ray.angle) * (r * 0.08 + ray.len);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(255, 215, 0, ${rayAlpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // ── 4. Stardust Particles ──
    for (const p of particles) {
      p.dist += p.speed * (1 + e * 2);
      const pAlpha = Math.max(0, 1 - raw * 1.5);
      if (pAlpha > 0) {
        p.twinkleSeed += 0.12;
        const twinkle = 0.7 + 0.3 * Math.sin(p.twinkleSeed);
        const px = originX + Math.cos(p.angle) * p.dist;
        const py = originY + Math.sin(p.angle) * p.dist;
        ctx.beginPath();
        ctx.arc(px, py, p.size * twinkle, 0, Math.PI * 2);
        ctx.fillStyle = toDark
          ? `rgba(196, 181, 253, ${pAlpha})`
          : `rgba(252, 211, 77, ${pAlpha})`;
        ctx.fill();
      }
    }

    if (raw < 1) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
      onDone();
    }
  }

  requestAnimationFrame(frame);
}

interface ThemeToggleProps {
  size?: "sm" | "md";
  className?: string;
}

/* ─── Component ────────────────────────────────────────────────────────── */
export function ThemeToggle({ size = "sm", className }: ThemeToggleProps) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const transitioning = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = useCallback(
    (e: React.MouseEvent) => {
      if (transitioning.current) return;
      transitioning.current = true;

      const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
      const x = e.clientX;
      const y = e.clientY;

      runCelestialTransition(
        x,
        y,
        nextTheme === "dark",
        () => {
          // Instant CSS Root Mutation (non-blocking)
          document.documentElement.setAttribute("data-theme", nextTheme);
          
          // Defer React's virtual DOM reconciliation to macro-task
          setTimeout(() => {
            setTheme(nextTheme);
            try {
              const ch = new BroadcastChannel("theme-sync");
              ch.postMessage({ theme: nextTheme, x, y });
              ch.close();
            } catch {}
          }, 0);
        },
        () => {
          transitioning.current = false;
        },
      );
    },
    [resolvedTheme, setTheme],
  );

  // if (!mounted) return null;

  // return (
  //   <button
  //     onClick={toggleTheme}
  //     className={cn(
  //       "rounded-full glass-panel hover:scale-110 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-accent-primary/50 flex items-center justify-center shrink-0",
  //       size === "sm" ? "p-1.5 w-7 h-7" : "p-2 w-8 h-8",
  //       className
  //     )}
  //     aria-label="Toggle theme"
  //   >
  //     <AnimatePresence mode="wait" initial={false}>
  //       <motion.div
  //         key={resolvedTheme}
  //         initial={{ scale: 0.5, opacity: 0, rotate: -60 }}
  //         animate={{ scale: 1, opacity: 1, rotate: 0 }}
  //         exit={{ scale: 0.5, opacity: 0, rotate: 60 }}
  //         transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
  //       >
  //         {resolvedTheme === "dark" ? (
  //           <Moon className={cn(size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4", "text-foreground")} />
  //         ) : (
  //           <Sun className={cn(size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4", "text-foreground/80")} />
  //         )}
  //       </motion.div>
  //     </AnimatePresence>
  //   </button>
  // );
}
