"use client";

import { motion } from "framer-motion";
import Image from "next/image";

export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-background text-foreground relative flex items-center justify-center overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vw] h-[70vw] max-w-[600px] max-h-[600px] bg-emerald-500/10 dark:bg-emerald-500/15 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[50vw] h-[50vw] max-w-[450px] max-h-[450px] bg-sky-500/10 dark:bg-sky-500/15 blur-[100px] rounded-full" />
      </div>

      {/* Sleek Glassmorphic SyncBeats Center Loader */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="relative z-10 glass-panel bg-foreground/3 dark:bg-white/[0.04] backdrop-blur-3xl border border-foreground/10 dark:border-white/10 rounded-3xl p-8 flex flex-col items-center gap-5 shadow-2xl"
      >
        <div className="relative flex items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-foreground/5 dark:bg-white/5 border border-foreground/10 flex items-center justify-center shadow-inner">
            <Image
              src="/syncbeats-icon.svg"
              alt="SyncBeats"
              width={28}
              height={28}
              className="opacity-90 animate-pulse"
            />
          </div>
        </div>

        {/* Audio Equalizer Bars */}
        <div className="flex items-center gap-1.5 h-6">
          {[0.4, 0.8, 1, 0.6, 0.9, 0.5, 0.7].map((h, i) => (
            <motion.div
              key={i}
              animate={{
                height: ["30%", `${h * 100}%`, "30%"],
                opacity: [0.4, 1, 0.4],
              }}
              transition={{
                duration: 0.8 + i * 0.1,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.1,
              }}
              className="w-1 bg-gradient-to-t from-emerald-500 to-cyan-400 rounded-full"
            />
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-foreground/50">
          <span>Loading</span>
          <span className="inline-flex gap-0.5">
            <span className="animate-bounce delay-0">.</span>
            <span className="animate-bounce delay-150">.</span>
            <span className="animate-bounce delay-300">.</span>
          </span>
        </div>
      </motion.div>
    </div>
  );
}
