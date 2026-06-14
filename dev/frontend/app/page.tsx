"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Disc, Play, Headphones, Radio, ArrowRight } from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";
import { Footer } from "../components/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden relative">
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[30%] -left-[10%] w-[70vw] h-[70vw] bg-foreground/5 blur-[120px] rounded-full" />
        <div className="absolute top-[40%] -right-[20%] w-[60vw] h-[60vw] bg-foreground/5 blur-[100px] rounded-full" />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-8 md:px-12 md:py-10">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-foreground/10 flex items-center justify-center">
            <Disc className="w-5 h-5 text-foreground animate-[spin_4s_linear_infinite]" />
          </div>
          <span className="text-xl font-black tracking-widest text-foreground">
            SYNC<span className="text-foreground/50">BEATS</span>
          </span>
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-6"
        >
          <ThemeToggle />
          <Link href="/login" className="text-sm font-bold tracking-widest uppercase hover:opacity-70 transition-opacity">
            Login
          </Link>
          <Link href="/login" className="h-10 px-6 hidden sm:flex items-center justify-center rounded-xl bg-foreground text-background text-sm font-bold tracking-widest uppercase hover:scale-105 active:scale-95 transition-all">
            Get Started
          </Link>
        </motion.div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-4xl mx-auto flex flex-col items-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-foreground/5 border border-foreground/10 mb-8 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-bold tracking-widest uppercase text-foreground/80">Available Now</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-[1.1] mb-8">
            One Track.<br />
            <span className="text-transparent bg-clip-text bg-linear-to-r from-foreground via-foreground/80 to-foreground/40">
              Every Phone.
            </span><br />
            Zero Lag.
          </h1>
          
          <p className="text-lg md:text-xl text-foreground/60 font-medium max-w-2xl mb-12 leading-relaxed">
            Instantly turn your friends' phones into a perfectly synchronized, high-fidelity spatial audio system. No downloads, no Bluetooth pairing. Just drop a track and hit play.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <Link href="/login" className="w-full sm:w-auto h-14 px-8 flex items-center justify-center gap-2 rounded-2xl bg-foreground text-background text-sm font-black tracking-widest uppercase hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(0,0,0,0.2)] dark:shadow-[0_0_40px_rgba(255,255,255,0.2)]">
              Start a Room <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>

        {/* Feature Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mt-32 mb-20"
        >
          <div className="p-8 rounded-3xl bg-foreground/5 border border-foreground/10 backdrop-blur-xl text-left">
            <div className="w-12 h-12 rounded-2xl bg-foreground/10 flex items-center justify-center mb-6">
              <Radio className="w-6 h-6 text-foreground" />
            </div>
            <h3 className="text-xl font-bold mb-3">Sub-millisecond Sync</h3>
            <p className="text-foreground/60 font-medium text-sm leading-relaxed">Our advanced WebAudio engine continuously calculates clock drift to ensure every device fires at the exact same millisecond.</p>
          </div>
          <div className="p-8 rounded-3xl bg-foreground/5 border border-foreground/10 backdrop-blur-xl text-left">
            <div className="w-12 h-12 rounded-2xl bg-foreground/10 flex items-center justify-center mb-6">
              <Headphones className="w-6 h-6 text-foreground" />
            </div>
            <h3 className="text-xl font-bold mb-3">Lossless P2P Streaming</h3>
            <p className="text-foreground/60 font-medium text-sm leading-relaxed">Upload FLAC or WAV files directly from your device. Tracks are seeded peer-to-peer using WebTorrent, bypassing slow servers.</p>
          </div>
          <div className="p-8 rounded-3xl bg-foreground/5 border border-foreground/10 backdrop-blur-xl text-left">
            <div className="w-12 h-12 rounded-2xl bg-foreground/10 flex items-center justify-center mb-6">
              <Play className="w-6 h-6 text-foreground" />
            </div>
            <h3 className="text-xl font-bold mb-3">YouTube Integration</h3>
            <p className="text-foreground/60 font-medium text-sm leading-relaxed">Paste a YouTube link and SyncBeats automatically proxies the audio stream to every phone in the room instantly.</p>
          </div>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
