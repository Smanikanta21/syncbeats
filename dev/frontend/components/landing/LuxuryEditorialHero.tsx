"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  MoreVertical, 
  ArrowUpRight,
  Disc3,
  Sliders,
  Sparkles
} from "lucide-react";
import { SyncBeatsMark } from "../brand/SyncBeatsLogo";

interface SuggestedTrack {
  id: string;
  title: string;
  artist: string;
  duration: string;
  coverGradient: string;
}

const TRACKS: SuggestedTrack[] = [
  {
    id: "hush",
    title: "Will Armex - Hush",
    artist: "Will Armex",
    duration: "3:12",
    coverGradient: "from-amber-600/40 via-red-600/30 to-purple-800/40",
  },
  {
    id: "end-of-beginning",
    title: "End of Beginning",
    artist: "Djo",
    duration: "2:39",
    coverGradient: "from-rose-500/50 via-amber-500/40 to-indigo-600/50",
  },
  {
    id: "shape-of-my-heart",
    title: "Shape of My Heart",
    artist: "Sting",
    duration: "4:39",
    coverGradient: "from-blue-600/50 via-teal-500/40 to-slate-800/50",
  },
  {
    id: "come-undone",
    title: "Come Undone",
    artist: "Duran Duran",
    duration: "4:17",
    coverGradient: "from-purple-600/50 via-pink-500/40 to-red-800/50",
  },
];

export function LuxuryEditorialHero() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);

  const activeTrack = TRACKS[currentTrackIndex];

  const handleNext = () => {
    setCurrentTrackIndex((prev) => (prev + 1) % TRACKS.length);
  };

  const handlePrev = () => {
    setCurrentTrackIndex((prev) => (prev - 1 + TRACKS.length) % TRACKS.length);
  };

  return (
    <section className="relative z-10 w-full px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
      {/* The Master Luxury Editorial Canvas Card */}
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] lg:rounded-[3rem] border border-white/10 bg-[#420a12] shadow-2xl">
        {/* Deep Ruby & Crimson Ambient Backdrops */}
        <div 
          className="absolute inset-0 -z-10 bg-radial-[at_50%_40%] from-[#8c1828] via-[#4d0b15] to-[#26050a]"
        />

        {/* Delicate Golden / Wine Geometric Contour Lines */}
        <svg 
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="gold-wire" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f7d794" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#e17055" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#6c0d18" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <circle cx="50%" cy="40%" r="280" fill="none" stroke="url(#gold-wire)" strokeWidth="1" strokeDasharray="4 6" />
          <circle cx="50%" cy="40%" r="420" fill="none" stroke="url(#gold-wire)" strokeWidth="1" />
          <circle cx="50%" cy="40%" r="580" fill="none" stroke="url(#gold-wire)" strokeWidth="1" strokeDasharray="6 8" />
          <circle cx="50%" cy="40%" r="760" fill="none" stroke="url(#gold-wire)" strokeWidth="1" />
        </svg>

        {/* Top Editorial Navbar inside Card */}
        <header className="relative z-20 flex items-center justify-between px-6 pt-6 sm:px-10 sm:pt-8">
          {/* Left Navigation Links */}
          <nav className="hidden items-center gap-7 text-xs font-medium tracking-wide text-white/80 md:flex">
            <a href="#features" className="transition-colors hover:text-white">Products</a>
            <a href="#presets" className="transition-colors hover:text-white">Sound</a>
            <a href="#presets" className="transition-colors hover:text-white">Presets</a>
            <a href="#mac-app" className="inline-flex items-center gap-1.5 transition-colors hover:text-white">
              <span>Mac App</span>
              <span className="rounded-md border border-white/20 bg-white/10 px-1.5 py-0.2 text-[9px] font-mono tracking-widest uppercase">Soon</span>
            </a>
          </nav>

          {/* Center Brand Wordmark */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/10 backdrop-blur-md transition-transform group-hover:scale-105">
              <SyncBeatsMark className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="font-display text-sm font-bold tracking-[0.28em] text-white uppercase">
              SyncBeats
            </span>
          </Link>

          {/* Right Action Button */}
          <Link
            href="/hub"
            className="group inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 shadow-md transition-all hover:bg-zinc-100 hover:shadow-lg active:scale-95"
          >
            <span>Explore Collection</span>
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </header>

        {/* Center Stage: Hero Typography + Photographic Portrait */}
        <div className="relative min-h-[520px] sm:min-h-[620px] md:min-h-[700px] lg:min-h-[760px] w-full flex items-center justify-between px-6 sm:px-10 lg:px-16 overflow-hidden">
          
          {/* Left Large Headline: "Feel" */}
          <div className="relative z-10 flex flex-col items-start select-none max-w-sm sm:max-w-md">
            <motion.h1 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="font-display text-6xl sm:text-8xl md:text-9xl lg:text-[10rem] font-bold leading-none tracking-tight text-white"
            >
              Feel
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-4 text-xs sm:text-sm font-light leading-relaxed text-white/75 max-w-[26ch] sm:max-w-[28ch]"
            >
              High-end audio performance in a refined form. Designed to elevate every moment across every device.
            </motion.p>
          </div>

          {/* Centerpiece Photographic Portrait */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative h-full w-full max-w-2xl sm:max-w-3xl flex items-center justify-center">
              {/* Radial gradient blend on edges */}
              <div 
                className="relative h-[85%] sm:h-[90%] lg:h-[95%] w-full"
                style={{
                  maskImage: "radial-gradient(ellipse at center, black 55%, transparent 85%)",
                  WebkitMaskImage: "radial-gradient(ellipse at center, black 55%, transparent 85%)",
                }}
              >
                <Image
                  src="/images/landing/luxury_audio_hero.jpg"
                  alt="SyncBeats High-End Audio Immersion"
                  fill
                  priority
                  className="object-contain object-center scale-105 filter drop-shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
                />
              </div>
            </div>
          </div>

          {/* Right Large Headline: "Sound" */}
          <div className="relative z-10 flex flex-col items-end select-none">
            <motion.h2 
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="font-display text-6xl sm:text-8xl md:text-9xl lg:text-[10rem] font-bold leading-none tracking-tight text-white"
            >
              Sound
            </motion.h2>
          </div>

          {/* Floating UI Widget #1: Top-Right "Suggested Sounds" (Frosted Glass Queue) */}
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="absolute right-4 top-20 sm:right-8 sm:top-24 md:right-12 md:top-28 z-30 w-60 sm:w-72 rounded-2xl border border-white/15 bg-black/35 p-3.5 sm:p-4 shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-2.5 flex items-center justify-between text-white/70">
              <span className="text-[11px] font-medium tracking-wide uppercase font-mono">Suggested Sounds</span>
              <Sliders className="h-3 w-3" />
            </div>

            <div className="space-y-1.5">
              {TRACKS.slice(1).map((track, i) => {
                const isActive = activeTrack.id === track.id;
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => {
                      setCurrentTrackIndex(i + 1);
                      setIsPlaying(true);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition-all cursor-pointer ${
                      isActive 
                        ? "bg-white/20 text-white shadow-inner" 
                        : "hover:bg-white/10 text-white/80"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Album Art Icon */}
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${track.coverGradient} border border-white/10 shadow-sm`}>
                        <Disc3 className={`h-4 w-4 ${isActive && isPlaying ? "animate-spin text-white" : "text-white/70"}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-white leading-tight">
                          {track.title}
                        </p>
                        <p className="truncate text-[10px] text-white/60">
                          {track.artist}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 pl-2">
                      <span className="font-mono text-[10px] text-white/50">{track.duration}</span>
                      <MoreVertical className="h-3.5 w-3.5 text-white/40" />
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Floating UI Widget #2: Bottom-Left Luxury Vinyl Player Card */}
          <motion.div 
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="absolute left-4 bottom-6 sm:left-8 sm:bottom-10 md:left-14 md:bottom-12 z-30 flex flex-col items-center"
          >
            {/* Spinning Photorealistic Vinyl Record protruding from the card */}
            <div className="relative -mb-10 z-0">
              <motion.div
                animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
                transition={isPlaying ? { duration: 6, repeat: Infinity, ease: "linear" } : { duration: 0 }}
                className="relative flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-full bg-zinc-950 shadow-[0_10px_30px_rgba(0,0,0,0.8)] border border-white/20"
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
                {/* Center Vinyl Label */}
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-[#991b1b] border-2 border-white/30 shadow-inner">
                  <div className="h-2 w-2 rounded-full bg-white shadow-xs" />
                </div>
              </motion.div>
            </div>

            {/* White Pristine Player Box */}
            <div className="relative z-10 w-56 sm:w-64 rounded-3xl bg-white p-4 sm:p-5 text-zinc-950 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)]">
              {/* Track Title */}
              <div className="text-center">
                <h3 className="truncate text-xs sm:text-sm font-bold tracking-tight text-zinc-950">
                  {activeTrack.title}
                </h3>
                <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5">
                  {activeTrack.artist} · 48kHz Lossless
                </p>
              </div>

              {/* Animated Waveform Bars */}
              <div className="my-3 flex h-7 items-center justify-center gap-1">
                {[14, 22, 10, 26, 18, 12, 28, 16, 24, 12, 20, 8, 22, 16, 26, 12].map((height, i) => (
                  <motion.span
                    key={i}
                    animate={isPlaying ? { height: [height * 0.4, height, height * 0.3] } : { height: 4 }}
                    transition={isPlaying ? { duration: 0.9, repeat: Infinity, repeatType: "reverse", delay: i * 0.05 } : { duration: 0.2 }}
                    className="w-1 rounded-full bg-zinc-900"
                    style={{ height: `${height}px` }}
                  />
                ))}
              </div>

              {/* Minimal Player Controls */}
              <div className="flex items-center justify-center gap-4 pt-1">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="p-1.5 text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer"
                  aria-label="Previous track"
                >
                  <SkipBack className="h-4 w-4 fill-current" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-950 text-white shadow-md transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4 fill-current" />
                  ) : (
                    <Play className="h-4 w-4 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  className="p-1.5 text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer"
                  aria-label="Next track"
                >
                  <SkipForward className="h-4 w-4 fill-current" />
                </button>
              </div>
            </div>
          </motion.div>

          {/* Floating UI Widget #3: Bottom-Right Partnership / Architecture Badges */}
          <div className="absolute right-6 bottom-6 sm:right-10 sm:bottom-10 z-20 flex flex-col items-end">
            <span className="font-mono text-[9px] sm:text-[10px] tracking-widest text-white/50 uppercase">
              Partnership & Architecture
            </span>
            <div className="mt-1 flex items-center gap-4 sm:gap-6 font-display font-black tracking-widest text-xs sm:text-sm text-white/80">
              <span className="hover:text-white transition-colors">SAMSUNG</span>
              <span className="text-white/30">/</span>
              <span className="italic hover:text-white transition-colors">MOVE</span>
              <span className="text-white/30">/</span>
              <span className="hover:text-white transition-colors">COREAUDIO</span>
            </div>
          </div>

        </div>

        {/* Sub-Card Anchor Bar: Direct Launcher Cue */}
        <div className="border-t border-white/10 bg-black/25 px-6 py-4 sm:px-10 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md">
          <div className="flex items-center gap-2 text-xs text-white/70">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            <span>Turn phones, tablets & laptops into one synchronized surround sound system</span>
          </div>

          <div className="flex items-center gap-4">
            <a 
              href="#interactive-stage"
              className="text-xs font-semibold text-white/90 hover:text-white underline underline-offset-4 transition-colors"
            >
              Test Live Soundstage ↓
            </a>
            <Link
              href="/hub"
              className="rounded-xl bg-white/15 px-4 py-2 text-xs font-semibold text-white hover:bg-white/25 transition-colors border border-white/20"
            >
              Launch Room Now
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
