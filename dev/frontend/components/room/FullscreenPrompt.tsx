"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize, AlertTriangle, Lock } from "lucide-react";

type PromptState = "hidden" | "initial" | "asking" | "locked";

export function FullscreenPrompt() {
  const [promptState, setPromptState] = useState<PromptState>("hidden");
  const hasEnteredOnce = useRef(false);
  const isLocked = useRef(false);

  useEffect(() => {
    const checkFullscreen = () => {
      // Detect if running on mobile device or installed PWA standalone mode
      const isMobileOrPWA = typeof window !== "undefined" && (
        /mobi|android|iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (window.navigator as any).standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator.maxTouchPoints > 0 && window.innerWidth < 1024)
      );

      if (isMobileOrPWA) {
        setPromptState("hidden");
        return;
      }

      // Check if browser actually supports fullscreen API
      const isFullscreenSupported = document.fullscreenEnabled || (document as any).webkitFullscreenEnabled;
      
      if (!isFullscreenSupported) {
        setPromptState("hidden");
        return;
      }

      // Hide prompt if loader is active in the document
      const isLoaderActive = document.querySelector(".fullscreen-loader-active") !== null;
      if (isLoaderActive) {
        setPromptState("hidden");
        return;
      }

      // Check standard Fullscreen API first
      let isFullscreen = document.fullscreenElement != null || (document as any).webkitFullscreenElement != null;
      
      // Fallback for F11 or OS-level fullscreen where the API might return null
      if (!isFullscreen) {
        // Allow a small threshold for UI elements like a 1px border
        isFullscreen = Math.abs(window.innerHeight - window.screen.height) <= 2;
      }
      
      if (!isFullscreen) {
        if (!hasEnteredOnce.current) {
          // First time joining, they need to enter fullscreen to start
          setPromptState("initial");
        } else {
          // They escaped fullscreen after already entering
          // Only show 'asking' if we aren't already locked
          setPromptState(isLocked.current ? "locked" : "asking");
        }
      } else {
        // They are in fullscreen, hide prompt and mark as entered
        hasEnteredOnce.current = true;
        setPromptState("hidden");
      }
    };

    // Small delay to allow browser to settle on initial load
    const timer = setTimeout(checkFullscreen, 500);

    // Also listen to webkit prefix for Safari
    const handleFullscreenChange = () => checkFullscreen();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    // Observe body for changes (e.g. loader mount/unmount) to re-evaluate fullscreen prompt
    const observer = new MutationObserver(() => checkFullscreen());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearTimeout(timer);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      observer.disconnect();
    };
  }, []);

  const requestFullscreen = async () => {
    try {
      const docEl = document.documentElement as any;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      } else {
        // Fallback if API doesn't exist
        setPromptState("hidden");
      }
    } catch (err) {
      console.warn("Fullscreen request failed", err);
      // If the request fails (e.g., due to strict browser policies), just hide it so user isn't stuck forever
      setPromptState("hidden");
    }
  };

  const handleEscapeYes = () => {
    isLocked.current = true;
    setPromptState("locked");
  };

  const handleEscapeNo = () => {
    requestFullscreen();
  };

  if (promptState === "hidden") return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      >
        {/* Strict Blurred Background blocking all interactions */}
        <div className="absolute inset-0 bg-background/50 backdrop-blur-3xl pointer-events-auto" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="relative z-10 w-full max-w-sm pointer-events-auto"
        >
          <div className="bg-background/90 border border-foreground/10 p-6 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.5)] overflow-hidden">
            {promptState === "initial" && (
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mb-5 border border-blue-500/30">
                  <Maximize className="w-8 h-8 text-blue-400" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-3">Immersive Mode Required</h3>
                <p className="text-sm text-foreground/60 mb-8 leading-relaxed">
                  This room requires full screen to ensure the spatial audio environment is perfectly mapped to your screen.
                </p>
                <button
                  onClick={requestFullscreen}
                  className="w-full py-4 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] active:scale-95 uppercase tracking-widest"
                >
                  Enter Fullscreen
                </button>
                <button
                  onClick={() => {
                    hasEnteredOnce.current = true;
                    setPromptState("hidden");
                  }}
                  className="w-full mt-3 py-3 text-foreground/50 hover:text-foreground text-xs font-bold transition-all uppercase tracking-widest"
                >
                  I'm already in fullscreen
                </button>
              </div>
            )}

            {promptState === "asking" && (
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mb-5 border border-yellow-500/30">
                  <AlertTriangle className="w-8 h-8 text-yellow-400" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-3">Escape Full Screen?</h3>
                <p className="text-sm text-foreground/60 mb-8 leading-relaxed">
                  Do you want to escape the full screen? If you do, the session will be locked and you will not be able to use the website.
                </p>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={handleEscapeYes}
                    className="flex-1 py-4 bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm font-bold rounded-xl transition-all active:scale-95 uppercase tracking-widest"
                  >
                    Yes
                  </button>
                  <button
                    onClick={handleEscapeNo}
                    className="flex-1 py-4 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] active:scale-95 uppercase tracking-widest"
                  >
                    No
                  </button>
                </div>
              </div>
            )}

            {promptState === "locked" && (
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-5 border border-red-500/30">
                  <Lock className="w-8 h-8 text-red-400" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-3">Session Locked</h3>
                <p className="text-sm text-foreground/60 mb-8 leading-relaxed">
                  You have escaped the full screen environment. The website is now inaccessible until you return to immersive mode.
                </p>
                <button
                  onClick={requestFullscreen}
                  className="w-full py-4 bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm font-bold rounded-xl transition-all active:scale-95 uppercase tracking-widest"
                >
                  Return to Fullscreen
                </button>
                <button
                  onClick={() => {
                    isLocked.current = false;
                    hasEnteredOnce.current = true;
                    setPromptState("hidden");
                  }}
                  className="w-full mt-3 py-3 text-foreground/50 hover:text-foreground text-xs font-bold transition-all uppercase tracking-widest"
                >
                  Continue in Window
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
