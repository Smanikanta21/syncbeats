"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function GlobalLoadingScreen() {
  // A sleek, minimal 5-bar audio wave animation
  const bars = [1, 2, 3, 4, 5];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-3xl"
    >
      <div className="flex flex-col items-center gap-8">
        
        {/* Minimal Audio Wave */}
        <div className="flex items-end justify-center gap-1.5 h-16 w-32 relative">
          {/* Subtle glow behind the waveform */}
          <div className="absolute inset-0 bg-foreground/5 blur-2xl rounded-full" />
          
          {bars.map((bar, i) => (
            <motion.div
              key={bar}
              initial={{ height: "20%" }}
              animate={{ height: ["20%", "100%", "20%"] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.15, // Staggered ripple effect
              }}
              className="w-1.5 bg-foreground rounded-full relative z-10 shadow-[0_0_15px_rgba(255,255,255,0.3)] dark:shadow-[0_0_15px_rgba(255,255,255,0.15)]"
            />
          ))}
        </div>

        {/* Elegant Text */}
        <motion.div 
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="flex flex-col items-center gap-2"
        >
          <h2 className="text-sm font-black tracking-[0.3em] text-foreground uppercase">
            SyncBeats
          </h2>
          <div className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-foreground/40 animate-pulse" style={{ animationDelay: "0ms" }} />
            <span className="w-1 h-1 rounded-full bg-foreground/40 animate-pulse" style={{ animationDelay: "150ms" }} />
            <span className="w-1 h-1 rounded-full bg-foreground/40 animate-pulse" style={{ animationDelay: "300ms" }} />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
