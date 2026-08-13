"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Share, PlusSquare, X, Smartphone } from "lucide-react";
import Image from "next/image";

export function IOSHomeScreenPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Only run in browser
    if (typeof window === "undefined") return;

    // Check if user previously dismissed prompt
    const isDismissed = localStorage.getItem("sb_ios_prompt_dismissed");
    if (isDismissed) return;

    // Detect iOS device (iPhone / iPad / iPod)
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Check if running as standalone PWA
    const isStandalone = 
      (window.navigator as any).standalone === true || 
      window.matchMedia("(display-mode: standalone)").matches;

    // Show prompt only on iOS WebKit browsers running outside standalone PWA mode
    if (isIOS && !isStandalone) {
      // Delay prompt appearance by 2 seconds so landing page loads cleanly first
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setShowPrompt(false);
    try {
      localStorage.setItem("sb_ios_prompt_dismissed", "true");
    } catch {}
  };

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto pointer-events-auto"
        >
          <div className="glass-panel p-5 rounded-3xl border border-foreground/15 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-2xl relative overflow-hidden flex flex-col gap-4">
            
            {/* Subtle Top Ambient Glow */}
            <div className="absolute -top-10 -right-10 w-36 h-36 bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 rounded-full blur-2xl pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-foreground/10 flex items-center justify-center border border-foreground/10 shrink-0">
                  <Image src="/syncbeats-icon.svg" alt="SyncBeats" width={24} height={24} />
                </div>
                <div>
                  <h4 className="text-sm font-black tracking-tight text-foreground">Install SyncBeats PWA</h4>
                  <p className="text-xs text-foreground/60 font-medium">Add to Home Screen for Full Screen GPU Audio</p>
                </div>
              </div>

              <button
                onClick={handleDismiss}
                className="w-8 h-8 rounded-full bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center text-foreground/60 hover:text-foreground transition-colors"
                aria-label="Dismiss iOS Install Prompt"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Instructions Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold z-10">
              <div className="bg-foreground/5 border border-foreground/10 rounded-2xl p-3 flex flex-col items-center text-center gap-1.5">
                <div className="w-7 h-7 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <Share className="w-4 h-4" />
                </div>
                <span className="text-foreground/80">1. Tap <strong className="text-foreground">Share</strong> icon below</span>
              </div>

              <div className="bg-foreground/5 border border-foreground/10 rounded-2xl p-3 flex flex-col items-center text-center gap-1.5">
                <div className="w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <PlusSquare className="w-4 h-4" />
                </div>
                <span className="text-foreground/80">2. Select <strong className="text-foreground">Add to Home Screen</strong></span>
              </div>
            </div>

            {/* Pointer Indicator Arrow */}
            <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400 pt-1 z-10">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Enjoy 120Hz Fullscreen Experience</span>
            </div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
