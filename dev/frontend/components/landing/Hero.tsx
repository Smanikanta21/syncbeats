"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { Volume2 } from "lucide-react";
import { LiveRoomShowcase } from "./LiveRoomShowcase";

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll-based parallax & scale animations
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 24,
    restDelta: 0.001,
  });

  const stageScale = useTransform(smoothProgress, [0, 0.8], [1, 0.97]);
  const ringsOpacity = useTransform(smoothProgress, [0, 0.6, 1], [0.15, 0.25, 0.05]);

  return (
    <section 
      ref={containerRef}
      className="relative z-10 flex w-full flex-col items-center px-4 pt-20 pb-12 sm:px-6 sm:pt-28 md:pt-32 lg:px-8"
    >
      {/* Editorial Master Card with SyncBeats Smoked Glass Canvas */}
      <div className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-[2.5rem] lg:rounded-[3rem] border border-foreground/10 bg-foreground/[0.02] p-5 sm:p-8 md:p-12 shadow-[var(--glass-shadow)] backdrop-blur-3xl">
        
        {/* Subtle Ambient Temperature Glows (SyncBeats Warm & Cool Tints) */}
        <div className="pointer-events-none absolute -left-32 -top-32 -z-10 h-96 w-96 rounded-full bg-(--warm-tint)/30 blur-3xl dark:bg-amber-500/5" />
        <div className="pointer-events-none absolute -right-32 -bottom-32 -z-10 h-96 w-96 rounded-full bg-(--cool-tint)/30 blur-3xl dark:bg-cyan-500/5" />

        {/* Delicate Audio Wave Geometry Contour Lines (Parallax Responsive) */}
        <motion.svg 
          style={{ opacity: ringsOpacity }}
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="50%" cy="32%" r="260" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 6" />
          <circle cx="50%" cy="32%" r="420" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="50%" cy="32%" r="600" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="6 8" />
          <circle cx="50%" cy="32%" r="800" fill="none" stroke="currentColor" strokeWidth="1" />
        </motion.svg>

        {/* Master Heading Block */}
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-3 inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/5 px-3.5 py-1 text-[11px] font-mono tracking-widest uppercase text-foreground/60"
          >
            <span>Sub-25ms Synchronized Sound</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-4xl font-semibold tracking-tight leading-[1.04] text-balance sm:text-6xl md:text-7xl lg:text-[4.75rem]"
          >
            Turn every phone into a speaker.
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-3.5 max-w-lg text-base text-foreground/60 text-pretty"
          >
            Instant multi-device surround sound in your browser. Zero downloads, zero accounts.
          </motion.p>
        </div>

        {/* Center Stage: Interactive Playground & Direct Room Launcher (100% Unobstructed, No Clipping) */}
        <motion.div 
          style={{ scale: stageScale }}
          initial={{ opacity: 0, y: 22, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mt-8 w-full max-w-4xl"
        >
          <LiveRoomShowcase />
        </motion.div>

        {/* Minimalist Bottom Bar: Architecture & Tech Badges */}
        <div className="mx-auto mt-8 flex max-w-4xl flex-wrap items-center justify-between gap-4 border-t border-foreground/10 pt-4 text-xs text-foreground/50">
          <div className="flex items-center gap-2">
            <Volume2 className="h-3.5 w-3.5 text-foreground/60" />
            <span>Master clock drift correction & spatial stage panning</span>
          </div>

          <div className="flex items-center gap-4 font-mono text-[10px] font-semibold tracking-wider text-foreground/60 uppercase">
            <span>WEB AUDIO</span>
            <span className="text-foreground/20">/</span>
            <span>WEBRTC P2P</span>
            <span className="text-foreground/20">/</span>
            <span>COREAUDIO</span>
          </div>
        </div>

      </div>
    </section>
  );
}
