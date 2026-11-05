"use client";

import { motion } from "framer-motion";
import { LiveRoomShowcase } from "./LiveRoomShowcase";

export function Hero() {
  return (
    <section className="relative z-10 flex w-full flex-col items-center px-5 pb-12 pt-24 sm:px-8 sm:pb-16 sm:pt-28 lg:px-12 lg:pt-32">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        {/* Subtle Eyebrow */}
        <motion.p 
          initial={{ opacity: 0, y: 8 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.4 }} 
          className="mb-3 font-mono text-xs font-semibold tracking-widest text-foreground/50 uppercase"
        >
          Shared Listening in Lockstep
        </motion.p>

        {/* Master Heading */}
        <motion.h1 
          initial={{ opacity: 0, y: 14 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }} 
          className="font-display text-4xl font-semibold tracking-tight leading-[1.04] text-balance sm:text-6xl md:text-7xl lg:text-[4.75rem]"
        >
          Turn every phone into a speaker.
        </motion.h1>

        {/* Short, Punchy Subtitle */}
        <motion.p 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.45, delay: 0.1 }} 
          className="mt-3.5 max-w-md text-base text-foreground/60 text-pretty"
        >
          Instant multi-device surround sound in your browser. Zero downloads, zero accounts.
        </motion.p>
      </div>

      {/* The Interactive Playground & Direct Room Launcher */}
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.985 }} 
        animate={{ opacity: 1, y: 0, scale: 1 }} 
        transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }} 
        className="mx-auto mt-8 w-full max-w-5xl"
      >
        <LiveRoomShowcase />
      </motion.div>
    </section>
  );
}
