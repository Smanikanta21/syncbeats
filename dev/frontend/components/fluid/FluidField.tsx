"use client";

/**
 * FluidField — the room's background.
 *
 * A real fluid simulation (see ./sim.ts) whose forces come from the music. Each
 * detected onset injects a shove and a stain of ink; the field carries them, so
 * a kick blooms, gets dragged by whatever the last kick left behind, and curls
 * away. The background is not decorated by the song, it is displaced by it.
 *
 * The room previously had no ambient treatment at all — flat `bg-background`
 * behind the whole UI.
 *
 * Three things feed it, all of which already existed:
 *   - VisualizerContext's shared RAF loop for continuous bass/mid/treble energy
 *     (one FFT read for the whole app — this adds no second read)
 *   - BeatContext's `subscribeToBeat` for discrete onsets
 *   - colorExtractor's `extractTwoColorsFromImage` for the dye palette, which
 *     was written, exported, and never called by anything until now
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

import { useBeatEngine } from "../../context/BeatContext";
import { useOptionalVisualizer } from "../../context/VisualizerContext";
import { useDevicePerf } from "../../hooks/useDevicePerf";
import { useSettings } from "../../hooks/useSettings";
import { useAlbumPalette } from '../../hooks/useAlbumPalette';
import { useAmbientMode } from '../../hooks/useAmbientMode';
import { usePageVisible } from '../../hooks/usePageVisible';
import { cn } from "../../lib/utils";
import {
  QUALITY_FOR_TIER,
  createFluidSim,
  hexToRgb01,
  nextLowerQuality,
  type FluidSim,
  type Quality,
} from "./sim";
import { advanceImmersiveMotion, immersivePhase, INITIAL_IMMERSIVE_MOTION, type MusicBands } from "./music";

/** Neutral slate idle palette, shared visually with the landing atmosphere. */
const IDLE_DYE: [number, number, number] = hexToRgb01("#94a3b8");
const IDLE_FIELD: [number, number, number] = hexToRgb01("#64748b");

/** Below this measured frame rate, for SUSTAINED_MS, step down the ladder. */
const TARGET_FPS = 30;
const MIN_FPS = 22;
const SUSTAINED_MS = 3000;

type Props = {
  isPlaying: boolean;
  /** Room clock anchor — the shared timeline every device derives beats from. */
  startEpoch?: number | null;
  /**
   * This device's NTP offset from the server clock, as estimated by useRoom.
   *
   * Required for the shared bloom to actually work. `startEpoch` is a SERVER
   * epoch, so comparing it against a bare `Date.now()` measures elapsed time in
   * each device's own skewed clock — which can differ by tens or hundreds of
   * milliseconds and hands neighbouring phones different beat indices. The whole
   * point is that they agree.
   */
  clockOffset?: number;
  /** Current track's cover art, for the dye palette. */
  coverUrl?: string | null;
  /**
   * Fires with whether the solver is actually running. The room uses it to
   * soften SpatialBeatNodes beneath the fluid, and keeps that layer as a
   * fallback when the solver can't run.
   */
  onActiveChange?: (active: boolean) => void;
  className?: string;
};

export function FluidField({
  isPlaying,
  startEpoch,
  clockOffset = 0,
  coverUrl,
  onActiveChange,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = usePrefersReducedMotion();
  // This renderer grades its own 30fps loop; the generic 35/48fps calibration
  // would compete with its quality ladder and recreate an otherwise healthy field.
  const { tier } = useDevicePerf({ calibrate: false, respectReducedMotion: false });
  const { settings } = useSettings();
  const { mode, immersiveIntensity } = useAmbientMode();
  const visible = usePageVisible();
  const { subscribeToBeat } = useBeatEngine();
  const visualizerDataRef = useOptionalVisualizer()?.dataRef;

  // Null until the solver is up; set to false if this device can't run it, which
  // switches the render below to the static gradient for good.
  const [canRun, setCanRun] = useState<boolean | null>(null);

  const wantSim =
    mode === 'immersive' && visible && !reduced && !settings?.reducedMotion && QUALITY_FOR_TIER[tier] !== null;
  const palette = useAlbumPalette(coverUrl, wantSim);

  // ── Dye palette ─────────────────────────────────────────────────────────────
  // Held in a ref so a new cover never re-renders the component; the RAF loop
  // just starts reading different numbers on its next frame.
  const inkRef = useRef<{ a: [number, number, number]; b: [number, number, number] }>({
    a: [...IDLE_DYE],
    b: [...IDLE_FIELD],
  });
  const wakeRef = useRef<(() => void) | null>(null);
  const inkTargetRef = useRef<{ a: [number, number, number]; b: [number, number, number] }>({
    a: [...IDLE_DYE],
    b: [...IDLE_FIELD],
  });

  useEffect(() => {
    const colors = palette ?? settings.gradientSettings.nodes.map(node => node.color);
    inkTargetRef.current = { a: hexToRgb01(colors[0] || '#94a3b8'), b: hexToRgb01(colors[1] || colors[0] || '#64748b') };
    wakeRef.current?.();
  }, [palette, settings.gradientSettings.nodes]);

  // ── Solver + render loop ────────────────────────────────────────────────────
  // One effect owns the whole lifecycle. It deliberately does NOT depend on
  // `isPlaying` — tearing down and rebuilding every float target on each
  // play/pause would drop the field and cost a visible hitch. Playback state is
  // read through a ref instead.
  const playingRef = useRef(isPlaying);
  const epochRef = useRef(startEpoch);
  const offsetRef = useRef(clockOffset);
  const intensityRef = useRef(immersiveIntensity / 100);

  useLayoutEffect(() => {
    playingRef.current = isPlaying;
    epochRef.current = startEpoch;
    offsetRef.current = clockOffset;
    intensityRef.current = immersiveIntensity / 100;
  }, [isPlaying, startEpoch, clockOffset, immersiveIntensity]);

  /**
   * Handle onto the running loop's `wake()`. The effect below owns the solver
   * and cannot see `isPlaying`, so resuming playback has to reach in and restart
   * a sleeping loop from outside.
   *
   * This was briefly done by dispatching a synthetic `window.resize`, which
   * worked only because the resize handler happened to be cheap — and fired
   * every other resize listener on the page (Lenis, layout measurement) as a
   * side effect. A ref is the honest version.
   */

  useEffect(() => {
    if (!wantSim) {
      const disableFrame = requestAnimationFrame(() => setCanRun(false));
      return () => cancelAnimationFrame(disableFrame);
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    let quality: Quality = QUALITY_FOR_TIER[tier]!;
    let sim: FluidSim | null = null;
    try { sim = createFluidSim(canvas, quality); }
    catch { /* Shader/context failure uses the room's lighter background. */ }
    if (!sim) {
      // No WebGL2, or no float render targets. Not an error — just this device.
      setCanRun(false);
      return;
    }
    setCanRun(true);

    let raf = 0;
    let last = performance.now();
    let motionState = INITIAL_IMMERSIVE_MOTION;
    const onsets: MusicBands = [0, 0, 0];
    let phase = immersivePhase(Date.now(), offsetRef.current, epochRef.current);
    let frameEma = 1000 / TARGET_FPS;
    let slowSince = 0;
    let asleep = false;

    const dpr = () => Math.min(window.devicePixelRatio || 1, 1);
    const fit = () => sim?.resize(window.innerWidth, window.innerHeight, dpr());
    fit();

    const onset = (band: number, strength: number) => {
      if (!sim || !playingRef.current || document.hidden) return;
      onsets[band] = Math.max(onsets[band], Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : 0);
      wake();
    };
    const unsub = [
      subscribeToBeat('bass', strength => onset(0, strength)),
      subscribeToBeat('mid', strength => onset(1, strength)),
      subscribeToBeat('treble', strength => onset(2, strength)),
    ];

    function frame(now: number) {
      if (!sim) return;
      // Allow sub-millisecond timestamp rounding at 60/120 Hz, so a nominal
      // 33.333 ms frame isn't accidentally skipped and mistaken for GPU lag.
      if (now - last < 1000 / TARGET_FPS - 0.5) { raf = requestAnimationFrame(frame); return; }
      const dt = Math.max(0.001, (now - last) / 1000);
      last = now;

      // Frame-interval EMA as the load signal. It is a proxy — other work on the
      // page moves it too — but a device that cannot hold 22fps with the field
      // up should drop quality regardless of who is to blame.
      //
      // Derived from `dt`, not from `now - last`: `last` is reassigned above, so
      // `now - last` is always 0 here. Reading it would have halved the measured
      // interval, reported ~2x the real frame rate, and left the downgrade
      // ladder permanently unreachable on exactly the slow devices it exists for.
      frameEma += (dt * 1000 - frameEma) * 0.05;
      const fps = 1000 / Math.max(frameEma, 1);
      if (fps < MIN_FPS) {
        if (!slowSince) slowSince = now;
        else if (now - slowSince > SUSTAINED_MS) {
          slowSince = 0;
          const next = nextLowerQuality(quality);
          if (next) {
            quality = next;
            sim!.setQuality(next);
            frameEma = 1000 / TARGET_FPS;
          } else {
            // Bottom of the ladder and still too slow. Give up rather than keep
            // a janky field up — the static gradient is a fine room background.
            setCanRun(false);
            sim.dispose();
            sim = null;
            raf = 0;
            return;
          }
        }
      } else {
        slowSince = 0;
      }

      const v = visualizerDataRef?.current;
      const playing = playingRef.current;
      const energy: MusicBands = v ? [v.bassEnergy, v.midEnergy, v.trebleEnergy] : [0, 0, 0];
      motionState = advanceImmersiveMotion(motionState, energy, onsets, playing, dt, intensityRef.current);
      onsets.fill(0);

      // Change covers gradually, including when the user changes tracks paused.
      const paletteEase = 1 - Math.exp(-dt / 1.4);
      let paletteDelta = 0;
      for (let channel = 0; channel < 3; channel++) {
        for (const key of ['a', 'b'] as const) {
          const delta = inkTargetRef.current[key][channel] - inkRef.current[key][channel];
          paletteDelta = Math.max(paletteDelta, Math.abs(delta));
          inkRef.current[key][channel] += delta * paletteEase;
        }
      }
      phase = playing ? immersivePhase(Date.now(), offsetRef.current, epochRef.current) : phase + dt * motionState.motion;
      sim.step(dt, motionState.opacity, {
        time: phase, motion: motionState.motion, bands: motionState.bands,
        intensity: intensityRef.current, paletteA: inkRef.current.a, paletteB: inkRef.current.b,
      });

      // Let the last currents settle, then retain a quiet, static field.
      if (!playing && motionState.motion < 0.015 && paletteDelta < 0.02
        && Math.abs(motionState.opacity - 0.25 * intensityRef.current) < 0.005) {
        asleep = true;
        raf = 0;
        return;
      }

      raf = requestAnimationFrame(frame);
    }

    function wake() {
      if (!sim || !asleep || document.hidden) return;
      asleep = false;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    const onVisibility = () => {
      if (document.hidden) {
        // A backgrounded tab still gets throttled rAF callbacks on some
        // browsers; a phone in a pocket should not be running a fluid solver.
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        asleep = true;
      } else {
        wake();
      }
    };

    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    document.addEventListener("visibilitychange", onVisibility);
    wakeRef.current = wake;
    raf = requestAnimationFrame(frame);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      wakeRef.current = null;
      unsub.forEach((u) => u());
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
      document.removeEventListener("visibilitychange", onVisibility);
      sim?.dispose();
      sim = null;
    };
    // `isPlaying` / `startEpoch` / the ink palette are all read through refs on
    // purpose — see the note above the effect.
  }, [wantSim, tier, subscribeToBeat, visualizerDataRef]);

  // Resuming playback has to restart a loop that put itself to sleep while
  // paused. The effect above cannot see `isPlaying`, so reach in via the handle.
  useEffect(() => {
    wakeRef.current?.();
  }, [isPlaying, immersiveIntensity]);

  // Tell the room whether the solver really came up, so it can stand down its
  // own ambient layer (or keep it, as the fallback).
  useEffect(() => {
    onActiveChange?.(wantSim && canRun === true);
  }, [canRun, wantSim, onActiveChange]);

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none fixed inset-0 z-0 overflow-hidden", className)}
      // A live WebGL surface must never be snapshotted by a cross-page view
      // transition — the capture is expensive and lands as a blank rectangle.
      style={{ viewTransitionName: "none" }}
    >
      {/* No CSS fallback here on purpose. When the solver can't run, the room
          keeps SpatialBeatNodes' gradient layer up instead — it is beat-driven,
          user-configurable and already built, so a second static wash would be
          strictly worse and more code. */}
      <canvas
        ref={canvasRef}
        data-immersive-fluid
        className="absolute inset-0 h-full w-full transition-opacity duration-[2400ms] ease-out motion-reduce:transition-none"
        style={{
          display: canRun === true ? "block" : "none",
          opacity: canRun === true ? 1 : 0,
        }}
      />
    </div>
  );
}
