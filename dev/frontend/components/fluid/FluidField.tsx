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
import { useReducedMotion } from "framer-motion";

import { useBeatEngine } from "../../context/BeatContext";
import { useOptionalVisualizer } from "../../context/VisualizerContext";
import { useDevicePerf } from "../../hooks/useDevicePerf";
import { useSettings } from "../../hooks/useSettings";
import { extractTwoColorsFromImage } from "../../lib/colorExtractor";
import { cn } from "../../lib/utils";
import {
  QUALITY_FOR_TIER,
  beatIndexAt,
  beatSplatPoint,
  createFluidSim,
  hexToRgb01,
  nextLowerQuality,
  type FluidSim,
  type Quality,
} from "./sim";

/** Neutral slate idle palette, shared visually with the landing atmosphere. */
const IDLE_DYE: [number, number, number] = hexToRgb01("#94a3b8");
const IDLE_FIELD: [number, number, number] = hexToRgb01("#64748b");

/**
 * How coarsely a beat's moment is quantised into a shared index.
 *
 * Onset DETECTION is already synchronised for free: every device is playing the
 * same audio within ~25ms, so their local FFTs see the same transient at the
 * same time. What has to be agreed is only WHERE to put the ink, which comes
 * from the beat's index off the room's shared `startEpoch`.
 *
 * ponytail: at 480ms quantum and ~25ms of clock spread, roughly 5% of beats
 * land either side of a boundary and those devices splat in different places
 * for one beat. Good enough — the shared blooms are the effect, and an
 * occasional disagreement is invisible. The exact fix is the server stamping a
 * beat index onto the schedule payload; do that if it ever reads as sloppy.
 */
const BEAT_QUANTUM_MS = 480;

/** Below this measured frame rate, for SUSTAINED_MS, step down the ladder. */
const MIN_FPS = 45;
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
  const reduced = useReducedMotion();
  const { tier } = useDevicePerf();
  const { settings } = useSettings();
  const { subscribeToBeat } = useBeatEngine();
  const visualizer = useOptionalVisualizer();

  // Null until the solver is up; set to false if this device can't run it, which
  // switches the render below to the static gradient for good.
  const [canRun, setCanRun] = useState<boolean | null>(null);

  const ambientOff = settings?.ambientEnabled === false;
  const wantSim =
    !reduced && !ambientOff && !settings?.reducedMotion && QUALITY_FOR_TIER[tier] !== null;

  // ── Dye palette ─────────────────────────────────────────────────────────────
  // Held in a ref so a new cover never re-renders the component; the RAF loop
  // just starts reading different numbers on its next frame.
  const inkRef = useRef<{ a: [number, number, number]; b: [number, number, number] }>({
    a: IDLE_DYE,
    b: IDLE_FIELD,
  });
  const inkTargetRef = useRef<{ a: [number, number, number]; b: [number, number, number] }>({
    a: IDLE_DYE,
    b: IDLE_FIELD,
  });

  useEffect(() => {
    if (!isPlaying || !settings?.dynamicBackgroundColors || !coverUrl) {
      // Keep a slate palette while idle, then let track colors enter gradually
      // after playback starts.
      inkRef.current = { a: IDLE_DYE, b: IDLE_FIELD };
      inkTargetRef.current = { a: IDLE_DYE, b: IDLE_FIELD };
      return;
    }
    let live = true;
    extractTwoColorsFromImage(coverUrl)
      .then(([primary, secondary]) => {
        if (!live) return;
        inkTargetRef.current = { a: hexToRgb01(primary), b: hexToRgb01(secondary) };
      })
      // Extraction already falls back internally; this only catches a rejected
      // promise. Staying on the slate idle palette is the right fallback.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [coverUrl, isPlaying, settings?.dynamicBackgroundColors]);

  // ── Solver + render loop ────────────────────────────────────────────────────
  // One effect owns the whole lifecycle. It deliberately does NOT depend on
  // `isPlaying` — tearing down and rebuilding every float target on each
  // play/pause would drop the field and cost a visible hitch. Playback state is
  // read through a ref instead.
  const playingRef = useRef(isPlaying);
  const epochRef = useRef(startEpoch);
  const offsetRef = useRef(clockOffset);

  useLayoutEffect(() => {
    playingRef.current = isPlaying;
    epochRef.current = startEpoch;
    offsetRef.current = clockOffset;
  }, [isPlaying, startEpoch, clockOffset]);

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
  const wakeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!wantSim) {
      const disableFrame = requestAnimationFrame(() => setCanRun(false));
      return () => cancelAnimationFrame(disableFrame);
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    let quality: Quality = QUALITY_FOR_TIER[tier]!;
    let sim: FluidSim | null = createFluidSim(canvas, quality);
    if (!sim) {
      // No WebGL2, or no float render targets. Not an error — just this device.
      setCanRun(false);
      return;
    }
    setCanRun(true);

    let raf = 0;
    let last = performance.now();
    let intensity = 0;
    let frameEma = 16.7;
    let slowSince = 0;
    let asleep = false;

    const dpr = () => Math.min(window.devicePixelRatio || 1, tier === "high" ? 1.75 : 1.25);
    const fit = () => sim?.resize(window.innerWidth, window.innerHeight, dpr());
    fit();

    /** Stamp one beat. Position is shared; colour and force depend on the band. */
    const splatBeat = (band: "bass" | "mid" | "treble", strength: number) => {
      if (!sim || !playingRef.current) return;
      wake();

      // Server clock, not this device's — see beatIndexAt. Null means the track
      // isn't scheduled yet, so fall back to a local clock: the field still
      // responds, it just isn't aligned across devices until the epoch lands.
      const shared = beatIndexAt(Date.now(), offsetRef.current, epochRef.current, BEAT_QUANTUM_MS);
      const idx = shared ?? Math.round(performance.now() / BEAT_QUANTUM_MS);

      // Each band gets its own point on the spiral. Previously `mid` and
      // `treble` shared one expression, so they stamped the same spot and their
      // inks just piled up instead of spreading.
      const seed = band === "bass" ? idx : band === "mid" ? idx * 2 + 1 : idx * 3 + 2;
      const { x, y } = beatSplatPoint(seed);
      // Push outward from frame centre, so a hit reads as expanding rather than
      // as something falling in from off screen.
      const ox = x - 0.5;
      const oy = y - 0.5;
      const mag = Math.hypot(ox, oy) || 1;

      const force = band === "bass" ? 7000 : band === "mid" ? 3800 : 1700;
      const radius = band === "bass" ? 0.012 : band === "mid" ? 0.006 : 0.0022;
      const ink = band === "mid" ? inkRef.current.b : inkRef.current.a;
      const gain = strength * (band === "treble" ? 0.35 : 1);

      sim.splat(
        x,
        y,
        (ox / mag) * force * gain,
        (oy / mag) * force * gain,
        [ink[0] * gain, ink[1] * gain, ink[2] * gain],
        radius,
      );
    };

    const unsub = [
      subscribeToBeat("bass", (i) => splatBeat("bass", Math.min(1, Math.max(0.35, i)))),
      subscribeToBeat("mid", (i) => splatBeat("mid", Math.min(1, Math.max(0.3, i)))),
      subscribeToBeat("treble", (i) => splatBeat("treble", Math.min(1, Math.max(0.25, i)))),
    ];

    function frame(now: number) {
      const dt = Math.max(0.001, (now - last) / 1000);
      last = now;

      // Frame-interval EMA as the load signal. It is a proxy — other work on the
      // page moves it too — but a device that cannot hold 45fps with the field
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
            frameEma = 16.7;
          } else {
            // Bottom of the ladder and still too slow. Give up rather than keep
            // a janky field up — the static gradient is a fine room background.
            setCanRun(false);
            return;
          }
        }
      } else {
        slowSince = 0;
      }

      const v = visualizer?.dataRef.current;
      const energy = v ? Math.min(1, v.bassEnergy * 0.6 + v.midEnergy * 0.3 + v.trebleEnergy * 0.1) : 0;

      // Album art can change at a track boundary. Ease the dye over the next
      // couple seconds so the room blooms into the new palette instead of
      // flashing to it on the first beat.
      const paletteEase = 1 - Math.exp(-dt / 1.8);
      for (let channel = 0; channel < 3; channel++) {
        inkRef.current.a[channel] += (inkTargetRef.current.a[channel] - inkRef.current.a[channel]) * paletteEase;
        inkRef.current.b[channel] += (inkTargetRef.current.b[channel] - inkRef.current.b[channel]) * paletteEase;
      }

      const target = playingRef.current ? 0.55 + 0.45 * energy : 0;
      intensity += (target - intensity) * Math.min(1, dt * 2.2);

      if (!playingRef.current) {
        // Paused: pull the ink out rather than freezing mid-swirl, which reads
        // as a hung canvas. Once it is gone, stop burning frames entirely.
        sim!.fadeOut(0.94);
        if (intensity < 0.01) {
          asleep = true;
          raf = 0;
          sim!.step(dt, 0);
          return;
        }
      }

      sim!.step(dt, intensity);
      raf = requestAnimationFrame(frame);
    }

    function wake() {
      if (!asleep || document.hidden) return;
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
  }, [wantSim, tier, subscribeToBeat, visualizer]);

  // Resuming playback has to restart a loop that put itself to sleep while
  // paused. The effect above cannot see `isPlaying`, so reach in via the handle.
  useEffect(() => {
    if (isPlaying) wakeRef.current?.();
  }, [isPlaying]);

  // Tell the room whether the solver really came up, so it can stand down its
  // own ambient layer (or keep it, as the fallback).
  useEffect(() => {
    onActiveChange?.(canRun === true);
  }, [canRun, onActiveChange]);

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
        className="absolute inset-0 h-full w-full transition-opacity duration-[2400ms] ease-out motion-reduce:transition-none"
        style={{
          display: canRun === true ? "block" : "none",
          opacity: isPlaying ? 1 : 0,
        }}
      />
    </div>
  );
}
