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
  MoreVertical,
  Volume2
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

  // Scroll-based animations & parallax hooks
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 24,
    restDelta: 0.001,
  });

  // Parallax transforms for typography and floating cards
  const feelX = useTransform(smoothProgress, [0, 1], ["0%", "-12%"]);
  const soundX = useTransform(smoothProgress, [0, 1], ["0%", "12%"]);
  const feelOpacity = useTransform(smoothProgress, [0, 0.7, 1], [0.85, 0.4, 0]);
  const soundOpacity = useTransform(smoothProgress, [0, 0.7, 1], [0.85, 0.4, 0]);
  
  const vinylY = useTransform(smoothProgress, [0, 1], [0, -70]);
  const queueY = useTransform(smoothProgress, [0, 1], [0, -50]);
  const stageScale = useTransform(smoothProgress, [0, 0.8], [1, 0.96]);

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
      {/* Editorial Canvas Card with SyncBeats Smoked Glass & Temperature Gradients */}
      <div className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-[2.5rem] lg:rounded-[3rem] border border-foreground/10 bg-foreground/[0.02] p-5 sm:p-8 md:p-12 shadow-[var(--glass-shadow)] backdrop-blur-3xl">
        
        {/* Subtle Ambient Temperature Fields (SyncBeats Warm & Cool Tints) */}
        <div className="pointer-events-none absolute -left-32 -top-32 -z-10 h-96 w-96 rounded-full bg-(--warm-tint)/30 blur-3xl dark:bg-amber-500/5" />
        <div className="pointer-events-none absolute -right-32 -bottom-32 -z-10 h-96 w-96 rounded-full bg-(--cool-tint)/30 blur-3xl dark:bg-cyan-500/5" />

        {/* Delicate Audio Wave Geometry Contour Lines */}
        <svg 
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-10 dark:opacity-15"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="50%" cy="35%" r="280" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 6" />
          <circle cx="50%" cy="35%" r="440" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="50%" cy="35%" r="620" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="6 8" />
          <circle cx="50%" cy="35%" r="820" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>

        {/* Master Heading Block: Centered Title + Eyebrow */}
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

        {/* Bold Typographic Editorial Flanks (Scroll-linked Parallax) */}
        <div className="relative mt-10 w-full">
          
          {/* Left Flank: "Feel" */}
          <motion.div 
            style={{ x: feelX, opacity: feelOpacity }}
            className="pointer-events-none absolute -left-2 top-0 z-0 hidden select-none lg:block"
          >
            <span className="font-display text-[7.5rem] xl:text-[9rem] font-bold tracking-tight text-foreground/[0.08] leading-none block">
              Feel
            </span>
            <p className="mt-1 max-w-[22ch] text-xs font-light text-foreground/45 leading-relaxed">
              High-end audio performance in a refined form across every device.
            </p>
          </motion.div>

          {/* Right Flank: "Sound" */}
          <motion.div 
            style={{ x: soundX, opacity: soundOpacity }}
            className="pointer-events-none absolute -right-2 top-0 z-0 hidden select-none text-right lg:block"
          >
            <span className="font-display text-[7.5rem] xl:text-[9rem] font-bold tracking-tight text-foreground/[0.08] leading-none block">
              Sound
            </span>
            <p className="mt-1 max-w-[22ch] text-xs font-light text-foreground/45 leading-relaxed ml-auto">
              Precision master clock alignment. Real-time sub-25ms sync.
            </p>
          </motion.div>

          {/* Center Stage: Interactive Playground & Direct Room Launcher */}
          <motion.div 
            style={{ scale: stageScale }}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 mx-auto w-full max-w-4xl"
          >
            <LiveRoomShowcase />
          </motion.div>

          {/* Floating UI Widget #1: Left Vinyl Player Card (Scroll Parallax) */}
          <motion.div 
            style={{ y: vinylY }}
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="absolute -left-4 bottom-8 z-20 hidden flex-col items-center xl:flex"
          >
            {/* Spinning Photorealistic Vinyl Record */}
            <div className="relative -mb-8 z-0">
              <motion.div
                animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
                transition={isPlaying ? { duration: 6, repeat: Infinity, ease: "linear" } : { duration: 0 }}
                className="relative flex h-20 w-20 items-center justify-center rounded-full bg-zinc-950 shadow-xl border border-white/15 dark:border-white/20"
                style={{
                  backgroundImage: `
                    radial-gradient(circle at center, transparent 38%, rgba(255,255,255,0.08) 39%, transparent 40%),
                    radial-gradient(circle at center, transparent 48%, rgba(255,255,255,0.06) 49%, transparent 50%),
                    radial-gradient(circle at center, transparent 58%, rgba(255,255,255,0.08) 59%, transparent 60%),
                    radial-gradient(circle at center, transparent 68%, rgba(255,255,255,0.05) 69%, transparent 70%),
                    radial-gradient(circle at center, transparent 78%, rgba(255,255,255,0.07) 79%, transparent 80%)
                  `,
                }}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground/20 border border-white/20">
                  <div className="h-1.5 w-1.5 rounded-full bg-white" />
                </div>
              </motion.div>
            </div>

            {/* Smoked Glass Player Box */}
            <div className="relative z-10 w-52 rounded-2xl border border-foreground/15 bg-background/85 p-3.5 shadow-xl backdrop-blur-2xl">
              <div className="text-center">
                <h4 className="truncate text-xs font-semibold text-foreground">
                  {activeTrack.title}
                </h4>
                <p className="truncate text-[10px] text-foreground/50">
                  {activeTrack.artist}
                </p>
              </div>

              {/* Animated Waveform Equalizer */}
              <div className="my-2.5 flex h-5 items-center justify-center gap-0.5">
                {[10, 18, 8, 20, 14, 10, 22, 12, 18, 8, 16, 6].map((h, i) => (
                  <motion.span
                    key={i}
                    animate={isPlaying ? { height: [h * 0.35, h, h * 0.25] } : { height: 3 }}
                    transition={isPlaying ? { duration: 0.8, repeat: Infinity, repeatType: "reverse", delay: i * 0.05 } : { duration: 0.2 }}
                    className="w-0.5 rounded-full bg-foreground/75"
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>

              {/* Player Controls */}
              <div className="flex items-center justify-center gap-3 pt-0.5">
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
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background shadow-xs transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause className="h-3 w-3 fill-current" />
                  ) : (
                    <Play className="h-3 w-3 fill-current ml-0.5" />
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
          </motion.div>

          {/* Floating UI Widget #2: Right "Suggested Sounds / Live Room Queue" (Scroll Parallax) */}
          <motion.div 
            style={{ y: queueY }}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.35 }}
            className="absolute -right-4 top-12 z-20 hidden w-64 rounded-2xl border border-foreground/15 bg-background/85 p-3.5 shadow-xl backdrop-blur-2xl xl:block"
          >
            <div className="mb-2 flex items-center justify-between text-foreground/60">
              <span className="font-mono text-[10px] font-semibold tracking-wider uppercase">Live Room Queue</span>
              <Sliders className="h-3 w-3" />
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
                    className={`flex w-full items-center justify-between rounded-xl p-2 text-left transition-all cursor-pointer ${
                      isActive 
                        ? "border border-foreground/15 bg-foreground/10 text-foreground shadow-xs" 
                        : "hover:bg-foreground/5 text-foreground/75"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/5">
                        <Disc3 className={`h-3.5 w-3.5 ${isActive && isPlaying ? "animate-spin text-foreground" : "text-foreground/50"}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold leading-tight text-foreground">
                          {t.title}
                        </p>
                        <p className="truncate text-[10px] text-foreground/50">
                          {t.artist}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 pl-1.5 font-mono text-[9px] text-foreground/40">
                      <span>{t.duration}</span>
                      <MoreVertical className="h-3 w-3" />
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* Minimalist Partnership & Architecture Badges (Matching Image #1 Reference Style) */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-foreground/10 pt-4 text-xs text-foreground/50">
          <div className="flex items-center gap-2">
            <Volume2 className="h-3.5 w-3.5 text-foreground/60" />
            <span>Real-time master clock drift correction & spatial pan</span>
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
