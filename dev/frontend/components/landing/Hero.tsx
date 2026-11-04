"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { RoomCodeEntry } from "./RoomCodeEntry";
import { LiveRoomShowcase } from "./LiveRoomShowcase";

export function Hero() {
  return (
    <section className="relative z-10 flex w-full flex-col items-center px-5 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-28 lg:px-12 lg:pt-32">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        {/* Subtle Eyebrow */}
        <motion.p 
          initial={{ opacity: 0, y: 8 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.4 }} 
          className="mb-4 font-mono text-xs font-semibold tracking-widest text-foreground/50 uppercase"
        >
          Instant Web Audio Synchronization
        </motion.p>

        {/* Master Heading */}
        <motion.h1 
          initial={{ opacity: 0, y: 14 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }} 
          className="font-display text-4xl font-semibold tracking-tight leading-[1.04] text-balance sm:text-6xl md:text-7xl lg:text-[5rem]"
        >
          Turn every phone into a speaker.
        </motion.h1>

        {/* Ultra-Short, Punchy Value Prop (No wall of text) */}
        <motion.p 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.45, delay: 0.1 }} 
          className="mt-4 max-w-lg text-base text-foreground/60 text-pretty sm:text-lg"
        >
          Instant multi-device surround sound in your browser. No Bluetooth limits, zero app downloads.
        </motion.p>

        {/* Tactile Fast Room Action */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.45, delay: 0.16 }}
          className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <RoomCodeEntry className="w-full sm:w-auto" />
          <span className="hidden text-sm text-foreground/35 sm:block">or</span>
          <Link 
            href="/hub" 
            className="group flex h-14 items-center justify-center gap-2 rounded-2xl bg-foreground px-6 text-sm font-semibold text-background shadow-md transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
          >
            Start a Free Room
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>

      {/* The Interactive Soundstage Playground — Centerpiece */}
      <motion.div 
        initial={{ opacity: 0, y: 24, scale: 0.985 }} 
        animate={{ opacity: 1, y: 0, scale: 1 }} 
        transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }} 
        className="mx-auto mt-10 w-full max-w-5xl"
      >
        <LiveRoomShowcase />
      </motion.div>
    </section>
  );
}
