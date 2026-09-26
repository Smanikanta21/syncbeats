"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { useDevicePerf } from "../../hooks/useDevicePerf";

/**
 * PhaseField — the login page's hero.
 *
 * Draws one sine trace per frequency band. They start out of phase, each
 * carrying its own band hue, and converge onto a single horizon line while the
 * hues collapse toward the foreground colour: out of sync is many voices, in
 * sync is one. That's the thing SyncBeats actually does (NTP offset estimation
 * plus drift correction, ~25ms), so it's the product's own trick rather than
 * decoration.
 *
 * Bumping `perturb` re-scatters partially and re-converges — used when the
 * viewer switches between signing in and signing up.
 */

/** Band hues from the room's ambient light nodes: sub, bass, low-mid, mid, upper-mid, high. */
const BAND_HUES = [320, 0, 40, 120, 200, 280];

const CONVERGE_MS = 2400;
/**
 * A mode switch re-scatters to here rather than to 0 — a short re-converge
 * reads as an answer to the click, where a full replay reads as a page reload.
 */
const PERTURB_FROM = 0.32;

/** Where the traces settle, as a fraction of height — below the auth panel, so
 *  the convergence sweeps down past the card rather than behind its middle. */
const HORIZON = 0.86;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function PhaseField({ perturb = 0 }: { perturb?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const { isLow, frameInterval } = useDevicePerf();

  // The rAF loop reads these through refs so a theme change or a perturb
  // doesn't tear down and restart the animation.
  const themeRef = useRef(resolvedTheme);
  const originRef = useRef<{ t0: number; from: number } | null>(null);

  themeRef.current = resolvedTheme;

  useEffect(() => {
    // Skip the very first run: the field already converges on mount.
    if (perturb === 0) return;
    originRef.current = { t0: performance.now(), from: PERTURB_FROM };
  }, [perturb]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // globals.css neutralises CSS animation under prefers-reduced-motion, but
    // it can't see a rAF loop — so honour the preference here. These viewers
    // get the converged frame, which is the composed state anyway.
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const traceCount = isLow ? 3 : BAND_HUES.length;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const draw = (progress: number, now: number) => {
      ctx.clearRect(0, 0, width, height);
      if (!width || !height) return;

      const isDark = themeRef.current !== "light";
      // Converged traces land on the foreground colour of the active theme.
      const targetLight = isDark ? 96 : 8;
      const horizonY = height * HORIZON;
      // Once aligned the wave keeps breathing, so the page isn't dead still.
      const breathe = Math.sin(now * 0.0006) * (progress > 0.98 ? 1 : 0);
      const step = isLow ? 12 : 6;

      for (let i = 0; i < traceCount; i++) {
        const hue = BAND_HUES[i];
        // Golden-angle offsets: varied spread without Math.random, so server
        // and client agree and every reload composes identically.
        const phase0 = (i * 2.39996) % (Math.PI * 2);
        const spread = (i / Math.max(1, traceCount - 1) - 0.5) * 2;
        const y0 = height * 0.5 + spread * height * 0.3;
        const freq = (1.1 + i * 0.37) * ((Math.PI * 2) / Math.max(width, 1));

        // A little residual spread keeps the converged state a luminous band
        // rather than a single hairline.
        const phase = lerp(phase0, i * 0.03, progress);
        const centerY = lerp(y0, horizonY + i * 0.9, progress);
        const amp = lerp(height * 0.1, height * 0.035 * (1 + breathe * 0.18), progress);
        const sat = lerp(72, 0, progress);
        const light = lerp(58, targetLight, progress);
        const alpha = lerp(0.55, isDark ? 0.75 : 0.5, progress);

        ctx.beginPath();
        for (let x = 0; x <= width; x += step) {
          const y = centerY + Math.sin(x * freq + phase) * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    };

    if (prefersReduced) {
      draw(1, 0);
      const onResize = () => {
        resize();
        draw(1, 0);
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    originRef.current = { t0: performance.now(), from: 0 };

    let rafId = 0;
    let lastFrame = 0;

    const frame = (now: number) => {
      rafId = requestAnimationFrame(frame);
      if (now - lastFrame < frameInterval) return;
      lastFrame = now;

      const origin = originRef.current;
      if (!origin) return;
      const { t0, from } = origin;
      const eased = easeOutCubic(Math.min(1, (now - t0) / CONVERGE_MS));
      draw(from + (1 - from) * eased, now);
    };

    rafId = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, [isLow, frameInterval]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 h-full w-full"
    />
  );
}
