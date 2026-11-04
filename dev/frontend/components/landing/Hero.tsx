"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { RoomCodeEntry } from "./RoomCodeEntry";
import { LiveRoomShowcase } from "./LiveRoomShowcase";

export function Hero() {
  return (
    <section className="relative z-10 flex w-full flex-col items-center px-5 pb-20 pt-28 sm:px-8 sm:pb-24 sm:pt-32 lg:px-12 lg:pt-36">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
        {/* Top Editorial Metadata (Clean typography — zero pill capsules) */}
        <motion.div 
          initial={{ opacity: 0, y: 8 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.45 }} 
          className="mb-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs font-medium tracking-wide text-foreground/50 uppercase"
        >
          <span className="font-semibold text-foreground/80">
            Sub-25ms Web Audio Synchronization
          </span>
          <span className="text-foreground/20 hidden sm:inline">/</span>
          <a 
            href="#mac-app"
            className="flex items-center gap-1 text-foreground/75 transition-colors hover:text-foreground normal-case font-medium"
          >
            <span>🍎 macOS Native App Coming Soon</span>
            <span className="text-foreground/40">→</span>
          </a>
        </motion.div>

        {/* Master Heading — Centered, balanced, no collision with any container */}
        <motion.h1 
          initial={{ opacity: 0, y: 16 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} 
          className="max-w-4xl font-display text-4xl font-semibold tracking-tight leading-[1.04] text-balance sm:text-6xl md:text-7xl lg:text-[5.25rem]"
        >
          Turn every phone into a synchronized speaker.
        </motion.h1>

        {/* Subtitle / Product Clarity */}
        <motion.p 
          initial={{ opacity: 0, y: 12 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.5, delay: 0.12 }} 
          className="mt-6 max-w-2xl text-lead text-foreground/65 text-pretty leading-relaxed"
        >
          Play music across any phone, laptop, and tablet in real time. Ultra-low latency synchronization over Web Audio with zero app downloads. Stream together from YouTube, Spotify playlists, or local tracks.
        </motion.p>

        {/* Fast Call to Action Cluster */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.5, delay: 0.18 }}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
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

        {/* Trust & Spec Micro-Assurances */}
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-foreground/50"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-foreground/40" />
            100% Free Forever
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-foreground/40" />
            Zero App Installation
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-foreground/40" />
            Safari, Chrome, Edge & Firefox
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-foreground/40" />
            3D Spatial Audio Stage
          </span>
        </motion.div>
      </div>

      {/* Centerpiece: Interactive Live Soundstage Showcase (Spacious, Centered, No Overlap) */}
      <motion.div 
        initial={{ opacity: 0, y: 28, scale: 0.985 }} 
        animate={{ opacity: 1, y: 0, scale: 1 }} 
        transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }} 
        className="mx-auto mt-12 w-full max-w-5xl"
      >
        <LiveRoomShowcase />
      </motion.div>
    </section>
  );
}
