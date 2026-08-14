"use client";

import { useEffect, useRef } from "react";

// A 1-pixel transparent MP4 video. This is the industry standard approach (used by nosleep.js)
// to keep the screen awake on iOS Safari and Android Chrome when native WakeLock is unavailable
// or gets silently dropped by battery saver modes.
const NO_SLEEP_VIDEO_URI =
  "data:video/mp4;base64,AAAAHGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQAAAAhmcmVlAAAAG21kYXQAAAGzABAHAAABthMQvFwAAAAPq0+0XAAAAZ5tb292AAAAbG12aGQAAAAAzh+S1M4fktQAAVQAAAFUAQAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEDAAABAAAAAAB0cmFrAAAAXHRraGQAAAADzh+S1M4fktQAAAABAAAAAAABVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAEAAAAAAXNtZWhkAAAAEGRpbmYAAAAHZHJlZgAAAAEAAAAOaW1wdAAAAAAAAAAAAAAAAAAAAOxtaW5mAAAAEHNtaGQAAAAAAAAAAAAAAHhkaW5mAAAAHGRyZWYAAAABAAAAEHVybCAAAAABAAABbHN0YmwAAABXc3RzZAAAAAAAAAABAAAAR21wNGEAAAAAAAAAAQABAAAAJAAAAAAAAAAAIQAAACQAAAAAEAAAFQBtcDRhAAAAAAAAAAABAAAAAAAAAAAAAAABAgAAABhzdHRzAAAAAAAAAAEAAAABAAAALAAAABxzdHNjAAAAAAAAAAEAAAABAAAAAQAAAAEAAAAUc3RzegAAAAAAAAAsAAAAAQAAABRzdGNvAAAAAAAAAAEAAABgAAAAGHN0c3MAAAAAAAAAAQAAAAE=";

/**
 * Prevents the screen from sleeping while `active` is true.
 *
 * Uses a hybrid approach:
 *  1. Native Screen Wake Lock API (Chrome/Edge/Safari 16.4+)
 *  2. Hidden looping video (iOS fallback & Android battery saver bypass)
 */
export function useWakeLock(active: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // ── Native Screen Wake Lock ──────────────────────────────────────────────────

  const acquireNative = async () => {
    if (!("wakeLock" in navigator)) return;
    if (wakeLockRef.current && !wakeLockRef.current.released) return;
    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      const sentinel = wakeLockRef.current;
      if (sentinel) {
        sentinel.addEventListener("release", () => {
          console.log("[WakeLock] Native lock released.");
        });
      }
      console.log("[WakeLock] Native lock acquired.");
    } catch (err: any) {
      console.warn("[WakeLock] Native lock failed:", err.message);
    }
  };

  const releaseNative = async () => {
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      try { await wakeLockRef.current.release(); } catch (_) {}
      wakeLockRef.current = null;
    }
  };

  // ── Video Fallback ──────────────────────────────────────────────────────────

  const acquireVideo = () => {
    if (typeof document === "undefined") return;

    if (!videoRef.current) {
      const video = document.createElement("video");
      video.setAttribute("playsinline", "true");
      // Do NOT use the "muted" attribute — iOS PWA requires an unmuted (but
      // near-silent) audio element to register an active audio session.
      // Without an active session, WebAudio silences when the screen locks.
      video.volume = 0.001; // virtually silent to the user, but NOT muted
      video.setAttribute("loop", "true");
      video.setAttribute("src", NO_SLEEP_VIDEO_URI);
      video.style.position = "absolute";
      video.style.opacity = "0";
      video.style.width = "1px";
      video.style.height = "1px";
      video.style.pointerEvents = "none";
      document.body.appendChild(video);
      videoRef.current = video;
    }

    try {
      videoRef.current.play().catch(e => {
        // Play might be rejected if not called inside a user gesture.
        // However, if the user interacts with the screen later, we can retry.
        console.warn("[WakeLock] Video fallback play rejected:", e);
      });
      console.log("[WakeLock] Video fallback started.");
    } catch (e) {}
  };

  const releaseVideo = () => {
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.src = "";
        videoRef.current.load();
        videoRef.current.remove();
      } catch (_) {}
      videoRef.current = null;
      console.log("[WakeLock] Video fallback stopped.");
    }
  };

  // ── Orchestration ─────────────────────────────────────────────────────────────

  const acquire = async () => {
    await acquireNative();
    acquireVideo();
  };

  const release = async () => {
    await releaseNative();
    releaseVideo();
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

  // Re-acquire locks when tab becomes visible again (including PWA page restore)
  useEffect(() => {
    if (!active) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        acquireNative();
        // Re-play video if it paused (e.g. due to battery saver interrupting it)
        if (videoRef.current && videoRef.current.paused) {
          acquireVideo();
        }
      }
    };
    // pageshow fires on iOS PWA when the user returns to the app via the app switcher
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        acquireNative();
        if (videoRef.current && videoRef.current.paused) acquireVideo();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Try to acquire the video lock on any user interaction if it failed initially
  useEffect(() => {
    if (!active) return;
    
    const handleInteraction = () => {
      if (videoRef.current && videoRef.current.paused) {
        acquireVideo();
      }
      if (!wakeLockRef.current || wakeLockRef.current.released) {
        acquireNative();
      }
    };

    document.addEventListener('touchstart', handleInteraction, { passive: true });
    document.addEventListener('click', handleInteraction, { passive: true });
    
    return () => {
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('click', handleInteraction);
    };
  }, [active]);
}
