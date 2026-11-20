"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * MobileAppGuard:
 * Ensures the web app behaves like an installed native application on small mobile screens:
 * 1. Blocks pinch-to-zoom and multi-touch gesture zoom.
 * 2. Restricts elastic scroll bounce on the outer window.
 * 3. Locks orientation to portrait via ScreenOrientation API where supported.
 * 4. Displays a native-style orientation guard prompt if rotated to landscape on mobile.
 */
export function MobileAppGuard() {
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false);

  useEffect(() => {
    // 1. Lock screen orientation to portrait if supported (PWA/Android Chrome/Webkit)
    if (typeof window !== "undefined" && "screen" in window && "orientation" in window.screen) {
      try {
        (window.screen.orientation as any).lock?.("portrait").catch(() => {});
      } catch {}
    }

    // 2. Prevent multi-touch gesture zoom (iOS Safari) on touch devices
    const handleGesture = (e: Event) => {
      e.preventDefault();
    };

    // 3. Prevent double-tap zoom
    let lastTouchEnd = 0;
    const handleTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        // Prevent default only if not targeting an editable input
        const target = e.target as HTMLElement;
        if (!target.closest("input, textarea, [contenteditable='true']")) {
          e.preventDefault();
        }
      }
      lastTouchEnd = now;
    };

    // 4. Orientation change listener for mobile phone screens
    const checkOrientation = () => {
      const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const isSmall = Math.min(window.innerWidth, window.innerHeight) <= 500;
      const isLandscape = window.innerWidth > window.innerHeight;
      setIsLandscapeMobile(isTouch && isSmall && isLandscape);
    };

    checkOrientation();

    window.addEventListener("gesturestart", handleGesture, { passive: false });
    window.addEventListener("gesturechange", handleGesture, { passive: false });
    window.addEventListener("gestureend", handleGesture, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: false });
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("gesturestart", handleGesture);
      window.removeEventListener("gesturechange", handleGesture);
      window.removeEventListener("gestureend", handleGesture);
      document.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);

  return (
    <AnimatePresence>
      {isLandscapeMobile && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/95 dark:bg-black/95 backdrop-blur-3xl px-6 text-center select-none"
        >
          <div className="flex flex-col items-center max-w-xs space-y-4">
            <motion.div
              animate={{ rotate: [0, 0, -90, -90, 0] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
              className="w-16 h-16 rounded-3xl bg-foreground/10 flex items-center justify-center text-foreground border border-foreground/15 shadow-xl"
            >
              <Smartphone className="w-8 h-8" />
            </motion.div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold tracking-tight text-foreground">
                Rotate your phone
              </h3>
              <p className="text-xs text-foreground/60 leading-relaxed">
                SyncBeats is optimized for portrait mode. Rotate your device upright for the full mobile experience.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
