"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { RoomCodeEntry } from "./RoomCodeEntry";
import { LiveRoomShowcase } from "./LiveRoomShowcase";

export function Hero() {
  return (
    <section className="relative z-10 flex min-h-[min(940px,100svh)] w-full items-center px-5 pb-16 pt-24 sm:px-8 sm:pb-20 lg:px-12 lg:pt-28">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-12 xl:gap-16">
        <div className="relative z-10">
          {/* Top badges */}
          <motion.div 
            initial={{ opacity: 0, y: 8 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.45 }} 
            className="mb-5 flex flex-wrap items-center gap-2"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 bg-foreground/5 px-3 py-1 text-xs font-semibold text-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Sub-25ms Web Audio Sync
            </span>

            <a 
              href="#mac-app"
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-background/60 px-3 py-1 text-xs font-medium text-foreground/75 transition-colors hover:border-foreground/30 hover:text-foreground backdrop-blur-md"
            >
              <span>🍎 macOS App Coming Soon</span>
            </a>
          </motion.div>

          {/* Main Title */}
          <motion.h1 
            initial={{ opacity: 0, y: 16 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} 
            className="font-display text-hero font-semibold text-balance tracking-tight"
          >
            Turn every phone into a synchronized speaker.
          </motion.h1>

          {/* Subtitle / Product Clarity */}
          <motion.p 
            initial={{ opacity: 0, y: 12 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.5, delay: 0.12 }} 
            className="mt-6 max-w-[46ch] text-lead text-foreground/60 text-pretty leading-relaxed"
          >
            Play music across any phone, laptop, and tablet in real time. Ultra-low latency synchronization over Web Audio with zero app downloads. Stream from YouTube, Spotify playlists, or local tracks.
          </motion.p>

          {/* Fast Call to Action */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <RoomCodeEntry className="w-full sm:w-auto" />
            <span className="hidden text-sm text-foreground/35 sm:block">or</span>
            <Link 
              href="/hub" 
              className="group flex h-14 items-center justify-center gap-2 rounded-2xl bg-foreground px-6 text-sm font-semibold text-background shadow-md transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
            >
              Start a Free Room
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          {/* Trust & Spec Micro-Assurances */}
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-foreground/50">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-foreground/40" />
              100% Free
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-foreground/40" />
              Nothing to Install
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-foreground/40" />
              Works on iOS, Android & Desktop
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-foreground/40" />
              Spatial Audio Stage
            </span>
          </div>
        </div>

        {/* Right: Live Interactive Soundstage Showcase */}
        <motion.div 
          initial={{ opacity: 0, y: 20, scale: 0.985 }} 
          animate={{ opacity: 1, y: 0, scale: 1 }} 
          transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }} 
          className="w-full"
        >
          <LiveRoomShowcase />
        </motion.div>
      </div>
    </section>
  );
}
