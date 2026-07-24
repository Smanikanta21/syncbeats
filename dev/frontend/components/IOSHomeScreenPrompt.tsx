"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Share, PlusSquare, Smartphone, ArrowDown, Sparkles, Check } from "lucide-react";

export function IOSHomeScreenPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect iOS device (iPhone, iPad, iPod)
    const userAgent = window.navigator.userAgent || "";
    const isIOSDevice =
      /iPad|iPhone|iPod/.test(userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);

    // Detect if app is already running as PWA (Standalone mode)
    const isStandalone =
      ("standalone" in window.navigator && (window.navigator as any).standalone === true) ||
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches;

    setIsIOS(isIOSDevice);

    // If iOS and NOT running in standalone mode -> MUST show prompt to add to home screen
    if (isIOSDevice && !isStandalone) {
      setShowPrompt(true);
    } else {
      setShowPrompt(false);
    }
  }, []);

  if (!showPrompt || !isIOS) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-3xl pointer-events-auto select-none overflow-hidden"
      >
        {/* Ambient background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[90vw] h-[90vw] max-w-[400px] max-h-[400px] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className="relative z-10 w-full max-w-sm"
        >
          <div className="bg-background/95 dark:bg-black/95 border border-primary/30 p-6 rounded-[32px] shadow-[0_30px_90px_rgba(0,0,0,0.8)] flex flex-col items-center text-center">
            {/* Top Icon Badge */}
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center shadow-lg">
                <Smartphone className="w-8 h-8 text-primary animate-pulse" />
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-5 w-5 bg-primary items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white" />
                </span>
              </span>
            </div>

            <h2 className="text-lg font-black text-foreground tracking-tight uppercase mb-1">
              Add to Home Screen Required
            </h2>
            <p className="text-xs text-foreground/60 mb-5 leading-relaxed">
              To use SyncBeats on iOS with full-screen 3D spatial audio and zero Safari address bars, you must add this app to your Home Screen.
            </p>

            {/* Step-by-Step Guidance Cards */}
            <div className="w-full space-y-2.5 mb-6 text-left">
              {/* Step 1 */}
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-foreground/5 border border-foreground/10">
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                  <Share className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-bold text-foreground">1. Tap Share Button</span>
                  <span className="text-[9px] text-foreground/50">Tap the Share icon at the bottom of Safari</span>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-foreground/5 border border-foreground/10">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                  <PlusSquare className="w-4 h-4 text-purple-400" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-bold text-foreground">2. Add to Home Screen</span>
                  <span className="text-[9px] text-foreground/50">Scroll down and select "Add to Home Screen"</span>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-foreground/5 border border-foreground/10">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-bold text-foreground">3. Launch from Home Screen</span>
                  <span className="text-[9px] text-foreground/50">Open SyncBeats icon on your iOS Home Screen</span>
                </div>
              </div>
            </div>

            {/* Bottom Animated Pointer Arrow pointing down to Safari toolbar */}
            <div className="flex flex-col items-center gap-1 text-primary animate-bounce mt-1">
              <span className="text-[10px] font-black uppercase tracking-widest">Tap Share Below</span>
              <ArrowDown className="w-5 h-5 stroke-[2.5]" />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
