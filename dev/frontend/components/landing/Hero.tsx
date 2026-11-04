"use client";

import { useState, useRef } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Disc3, 
  Sliders, 
  Volume2,
  Activity,
  Cpu,
  Wifi
} from "lucide-react";
import { LiveRoomShowcase } from "./LiveRoomShowcase";

interface CuratedTrack {
  id: string;
  title: string;
  artist: string;
  duration: string;
  genre: string;
}

const CURATED_TRACKS: CuratedTrack[] = [
  {
    id: "starboy",
    title: "Starboy",
    artist: "The Weeknd, Daft Punk",
    duration: "3:50",
    genre: "Electro-Pop",
  },
  {
    id: "end-of-beginning",
    title: "End of Beginning",
    artist: "Djo",
    duration: "2:39",
    genre: "Indie Rock",
  },
  {
    id: "shape-of-my-heart",
    title: "Shape of My Heart",
    artist: "Sting",
    duration: "4:39",
    genre: "Acoustic",
  },
];

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);

  const activeTrack = CURATED_TRACKS[activeTrackIndex];

  // Scroll-based parallax animations
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 24,
    restDelta: 0.001,
  });

  // Parallax offsets for side cards (never overlapping the center stage)
  const leftCardY = useTransform(smoothProgress, [0, 1], [0, -35]);
  const rightCardY = useTransform(smoothProgress, [0, 1], [0, -45]);
  const stageScale = useTransform(smoothProgress, [0, 0.8], [1, 0.98]);

  const handleNext = () => {
    setActiveTrackIndex((prev) => (prev + 1) % CURATED_TRACKS.length);
  };

  const handlePrev = () => {
    setActiveTrackIndex((prev) => (prev - 1 + CURATED_TRACKS.length) % CURATED_TRACKS.length);
  };

  return (
    <section 
      ref={containerRef}
      className="relative z-10 flex w-full flex-col items-center px-4 pt-20 pb-16 sm:px-6 sm:pt-28 md:pt-32 lg:px-8"
    >
      {/* Editorial Master Card with SyncBeats Smoked Glass Canvas */}
      <div className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-[2.5rem] lg:rounded-[3rem] border border-foreground/10 bg-foreground/[0.02] p-5 sm:p-8 md:p-12 shadow-[var(--glass-shadow)] backdrop-blur-3xl">
        
        {/* Subtle Ambient Temperature Glows (SyncBeats Warm & Cool Tints) */}
        <div className="pointer-events-none absolute -left-32 -top-32 -z-10 h-96 w-96 rounded-full bg-(--warm-tint)/30 blur-3xl dark:bg-amber-500/5" />
        <div className="pointer-events-none absolute -right-32 -bottom-32 -z-10 h-96 w-96 rounded-full bg-(--cool-tint)/30 blur-3xl dark:bg-cyan-500/5" />

        {/* Delicate Audio Wave Geometry Contour Lines */}
        <svg 
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-10 dark:opacity-15"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="50%" cy="30%" r="280" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 6" />
          <circle cx="50%" cy="30%" r="440" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="50%" cy="30%" r="620" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="6 8" />
          <circle cx="50%" cy="30%" r="820" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>

        {/* Master Heading Block */}
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
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

        {/* Clean Balanced Stage: Dedicated Non-Overlapping Columns */}
        <div className="mt-10 flex flex-col items-center justify-center gap-6 xl:flex-row xl:items-start xl:gap-8">
          
          {/* Left Column: Curated Queue & Vinyl Player (Visible on XL screens, 0% overlap) */}
          <motion.aside 
            style={{ y: leftCardY }}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="hidden w-64 shrink-0 flex-col gap-4 xl:flex"
          >
            {/* Editorial Label */}
            <div>
              <span className="font-display text-2xl font-bold tracking-tight text-foreground/80">
                Feel
              </span>
              <p className="mt-0.5 text-xs text-foreground/50 leading-relaxed">
                Lossless multi-channel sound staged in your browser.
              </p>
            </div>

            {/* Vinyl Preview & Live Equalizer Card */}
            <div className="rounded-2xl border border-foreground/10 bg-background/80 p-4 shadow-sm backdrop-blur-xl">
              <div className="flex items-center gap-3">
                {/* Rotating Vinyl Record */}
                <motion.div
                  animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
                  transition={isPlaying ? { duration: 6, repeat: Infinity, ease: "linear" } : { duration: 0 }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-950 shadow-md border border-white/20"
                >
                  <div className="h-3.5 w-3.5 rounded-full bg-foreground/30 border border-white/30" />
                </motion.div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">{activeTrack.title}</p>
                  <p className="truncate text-[10px] text-foreground/50">{activeTrack.artist}</p>
                </div>
              </div>

              {/* Dynamic Equalizer Bars */}
              <div className="my-3 flex h-4 items-center justify-center gap-0.5">
                {[8, 14, 6, 16, 11, 8, 18, 10, 14, 6, 12, 5].map((h, i) => (
                  <motion.span
                    key={i}
                    animate={isPlaying ? { height: [h * 0.35, h, h * 0.25] } : { height: 3 }}
                    transition={isPlaying ? { duration: 0.8, repeat: Infinity, repeatType: "reverse", delay: i * 0.05 } : { duration: 0.2 }}
                    className="w-0.5 rounded-full bg-foreground/75"
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>

              {/* Mini Controls */}
              <div className="flex items-center justify-between pt-1 border-t border-foreground/10">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="p-1 text-foreground/50 hover:text-foreground transition-colors cursor-pointer"
                  aria-label="Previous"
                >
                  <SkipBack className="h-3 w-3 fill-current" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background shadow-xs transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause className="h-2.5 w-2.5 fill-current" />
                  ) : (
                    <Play className="h-2.5 w-2.5 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  className="p-1 text-foreground/50 hover:text-foreground transition-colors cursor-pointer"
                  aria-label="Next"
                >
                  <SkipForward className="h-3 w-3 fill-current" />
                </button>
              </div>
            </div>

            {/* Room Queue Selector */}
            <div className="rounded-2xl border border-foreground/10 bg-background/80 p-3 shadow-sm backdrop-blur-xl">
              <div className="mb-2 flex items-center justify-between text-foreground/60 px-1">
                <span className="font-mono text-[9px] font-semibold tracking-wider uppercase">Demo Tracks</span>
                <Sliders className="h-2.5 w-2.5" />
              </div>

              <div className="space-y-1">
                {CURATED_TRACKS.map((t, idx) => {
                  const isActive = activeTrackIndex === idx;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setActiveTrackIndex(idx);
                        setIsPlaying(true);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left transition-all cursor-pointer ${
                        isActive 
                          ? "border border-foreground/15 bg-foreground/10 text-foreground" 
                          : "hover:bg-foreground/5 text-foreground/75"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Disc3 className={`h-3 w-3 shrink-0 ${isActive && isPlaying ? "animate-spin text-foreground" : "text-foreground/40"}`} />
                        <span className="truncate text-[11px] font-medium">{t.title}</span>
                      </div>
                      <span className="font-mono text-[9px] text-foreground/40 shrink-0">{t.duration}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.aside>

          {/* Center Stage: Interactive Playground & Room Launcher (100% Unobstructed) */}
          <motion.div 
            style={{ scale: stageScale }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-3xl shrink-0"
          >
            <LiveRoomShowcase />
          </motion.div>

          {/* Right Column: Audio Specs & Engine Telemetry (Visible on XL screens, 0% overlap) */}
          <motion.aside 
            style={{ y: rightCardY }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="hidden w-64 shrink-0 flex-col gap-4 xl:flex"
          >
            {/* Editorial Label */}
            <div>
              <span className="font-display text-2xl font-bold tracking-tight text-foreground/80">
                Sound
              </span>
              <p className="mt-0.5 text-xs text-foreground/50 leading-relaxed">
                Precision master clock alignment. Real-time sub-25ms sync.
              </p>
            </div>

            {/* Architecture Telemetry Specs */}
            <div className="rounded-2xl border border-foreground/10 bg-background/80 p-4 shadow-sm backdrop-blur-xl">
              <div className="mb-3 flex items-center gap-1.5 font-mono text-[9px] font-semibold uppercase text-foreground/50">
                <Activity className="h-3 w-3" />
                <span>Engine Telemetry</span>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div>
                  <div className="flex justify-between text-foreground/50 text-[10px]">
                    <span>P2P LATENCY</span>
                    <span className="text-foreground font-semibold">&lt; 25 ms</span>
                  </div>
                  <div className="mt-1 h-1 w-full rounded-full bg-foreground/10 overflow-hidden">
                    <div className="h-full w-4/5 rounded-full bg-foreground/80" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-foreground/50 text-[10px]">
                    <span>CLOCK DRIFT</span>
                    <span className="text-foreground font-semibold">&lt; 0.2 ms</span>
                  </div>
                  <div className="mt-1 h-1 w-full rounded-full bg-foreground/10 overflow-hidden">
                    <div className="h-full w-[95%] rounded-full bg-foreground/80" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-foreground/50 text-[10px]">
                    <span>SAMPLE RATE</span>
                    <span className="text-foreground font-semibold">48.0 kHz</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Platform Badges */}
            <div className="rounded-2xl border border-foreground/10 bg-background/80 p-3.5 shadow-sm backdrop-blur-xl">
              <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] font-semibold uppercase text-foreground/50">
                <Cpu className="h-3 w-3" />
                <span>Native Stack</span>
              </div>

              <div className="space-y-2 text-xs text-foreground/75">
                <div className="flex items-center gap-2">
                  <Wifi className="h-3.5 w-3.5 text-foreground/50 shrink-0" />
                  <span className="text-[11px]">WebRTC Data Channels</span>
                </div>
                <div className="flex items-center gap-2">
                  <Volume2 className="h-3.5 w-3.5 text-foreground/50 shrink-0" />
                  <span className="text-[11px]">Web Audio API Master Clock</span>
                </div>
              </div>
            </div>
          </motion.aside>

        </div>

        {/* Minimalist Bottom Bar */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-foreground/10 pt-4 text-xs text-foreground/50">
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
