"use client";

import { useEffect, useRef } from "react";

/**
 * Prevents the screen from sleeping while `active` is true.
 *
 * Uses BOTH approaches simultaneously for maximum cross-platform coverage:
 *  1. Screen Wake Lock API  — native, works on Chrome/Edge/Safari 16.4+
 *  2. Silent AudioContext   — fallback & supplement for iOS, Android battery saver,
 *                             and any browser where the native API gets dropped
 *
 * The silent audio node runs at 0.0001 gain (inaudible) and keeps the OS audio
 * session alive, which prevents the screen from dimming on both iOS and Android.
 */
export function useWakeLock(active: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const silentCtxRef = useRef<AudioContext | null>(null);
  const silentOscRef = useRef<OscillatorNode | null>(null);

  // ── Native Screen Wake Lock ──────────────────────────────────────────────────

  const acquireNative = async () => {
    if (!("wakeLock" in navigator)) return;
    if (wakeLockRef.current && !wakeLockRef.current.released) return;
    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      const sentinel = wakeLockRef.current;
      if (sentinel) {
        sentinel.addEventListener("release", () => {
          console.log("[WakeLock] Native lock released — will re-acquire on next visibility.");
        });
      }
      console.log("[WakeLock] Native lock acquired.");
    } catch (err: any) {
      // Silently ignore: battery saver, permissions, etc.
      console.warn("[WakeLock] Native lock failed:", err.message);
    }
  };

  const releaseNative = async () => {
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      try { await wakeLockRef.current.release(); } catch (_) {}
      wakeLockRef.current = null;
    }
  };

  // ── Silent Audio Loop (iOS + Android battery saver fallback) ─────────────────
  // An inaudible oscillator keeps the OS audio session active, preventing
  // the screen from dimming on platforms where the native API is unsupported or unreliable.

  const acquireSilentAudio = () => {
    if (silentCtxRef.current) return; // already running
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001; // ~inaudible but keeps audio session alive
      osc.frequency.value = 1;  // 1 Hz — below human hearing range
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      silentCtxRef.current = ctx;
      silentOscRef.current = osc;
      console.log("[WakeLock] Silent audio session started.");
    } catch (e) {
      console.warn("[WakeLock] Silent audio failed:", e);
    }
  };

  const releaseSilentAudio = () => {
    try {
      silentOscRef.current?.stop();
      silentCtxRef.current?.close();
    } catch (_) {}
    silentOscRef.current = null;
    silentCtxRef.current = null;
    console.log("[WakeLock] Silent audio session stopped.");
  };

  // ── Orchestration ─────────────────────────────────────────────────────────────

  const acquire = async () => {
    // Run both simultaneously — native for browsers that support it,
    // silent audio as universal supplement
    await acquireNative();
    acquireSilentAudio();
  };

  const release = async () => {
    await releaseNative();
    releaseSilentAudio();
  };

  useEffect(() => {
    if (active) {
      acquire();
    } else {
      release();
    }
    return () => { release(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Re-acquire native lock when tab becomes visible again
  // (browsers force-release the native lock when the tab is backgrounded)
  useEffect(() => {
    if (!active) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        acquireNative(); // silent audio survives background; native needs re-acquire
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
