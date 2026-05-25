"use client";
import {useState, useEffect} from 'react'
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { Play, ArrowRight, Pause, SkipForward, SkipBack, Share2, Smartphone, Speaker ,X,Minus,Plus} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

export function Hero() {
  const router = useRouter();
  const { user } = useAuth();
  const [isPlaying, setIsPlaying] = useState(true);
  const progressControls = useAnimation();

  useEffect(() => {
    if (isPlaying) {
      progressControls.start({ width: "100%", transition: { duration: 240, ease: "linear" } });
    } else {
      progressControls.stop();
    }
  }, [isPlaying, progressControls]);

  const handleCTA = () => {
    if (user) {
      router.push("/hub");
    } else {
      router.push("/login");
    }
  };
  return (
    <header className="relative min-h-[90vh] flex items-center justify-center pt-24 md:pt-32 px-4 sm:px-6 lg:px-8 overflow-hidden pb-20" role="banner">
      {/* Decorative Orbs behind hero (Minute Silver Glow) - Hidden on mobile for INP performance */}
      <div className="hidden sm:block absolute top-1/4 left-1/4 w-[300px] h-[300px] sm:w-[600px] sm:h-[600px] bg-foreground/5 rounded-full blur-[80px] sm:blur-[120px] animate-blob pointer-events-none" aria-hidden="true" />
      <div className="hidden sm:block absolute bottom-1/4 right-1/4 w-[250px] h-[250px] sm:w-[500px] sm:h-[500px] bg-foreground/5 rounded-full blur-[60px] sm:blur-[100px] animate-blob animation-delay-2000 pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">

        {/* Left Column: Text & CTA */}
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-[5.5rem] font-black tracking-tighter mb-6 leading-[1.1]"
          >
            <span className="text-foreground text-glow-subtle">Turn every phone into</span><br />
            <span className="text-foreground/70 drop-shadow-[0_0_15px_rgba(228,228,231,0.2)]">one massive speaker.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-lg md:text-xl text-foreground/50 max-w-xl mb-10 leading-relaxed font-medium"
          >
            Universal AirPlay for the web. Sync your music perfectly across all devices in the room without downloading an app or struggling with bluetooth pairing.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex flex-col sm:flex-row gap-4 w-full"
          >
            {/* Subtle silver glow underneath the primary button */}
            <div className="absolute top-1/2 left-32 -translate-x-1/2 -translate-y-1/2 w-48 h-24 bg-foreground/5 rounded-full blur-[40px] pointer-events-none" aria-hidden="true" />

            <motion.button
              onClick={handleCTA}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="group relative h-14 md:px-8 px-4 rounded-full bg-foreground text-background font-bold text-lg transition-all flex items-center justify-center gap-2 overflow-hidden shadow-lg z-10 w-full sm:w-auto"
              aria-label="Start a Session"
            >
              <span className="relative z-10 flex items-center gap-2">
                Start a Session <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" aria-hidden="true" focusable="false" />
              </span>
            </motion.button>

            <motion.button
              onClick={handleCTA}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="group h-14 px-8 rounded-full glass-panel text-foreground font-bold text-lg border hover:border-foreground/20 transition-all flex items-center justify-center gap-3 z-10 w-full sm:w-auto"
              aria-label="Join via Code"
            >
              <div className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center group-hover:bg-foreground/10 transition-colors">
                <Play className="w-4 h-4 fill-foreground" aria-hidden="true" focusable="false" />
              </div>
              Join via Code
            </motion.button>
          </motion.div>
        </div>

        {/* Right Column: Windows Music Player UI */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1.2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="relative md:block hidden w-full max-w-[280px] sm:max-w-md lg:max-w-lg mx-auto lg:mx-0 lg:ml-auto mt-8 lg:mt-0"
        >
          {/* Subtle backlight glow for the player */}
          <div className="absolute -inset-4 bg-foreground/5 filter blur-[40px] sm:blur-[60px] rounded-[3rem] pointer-events-none opacity-50" />

          <div className="relative glass-panel rounded-[2rem] sm:rounded-3xl shadow-xl backdrop-blur-3xl overflow-hidden group">

            {/* Top Bar */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-foreground/10">
              <div className="flex items-center gap-1.5 sm:gap-2 group/mac">
                <div className="w-4 h-4 border border-foreground/10 rounded-full bg-red-500 flex justify-center items-center ">
                  <X className="w-2.5 h-2.5 text-black/70 stroke-3 opacity-0 group-hover/mac:opacity-100 transition-opacity" />
                </div>
                <div className="w-4 h-4 border border-foreground/10 rounded-full bg-yellow-500 flex justify-center items-center">
                  <Minus className="w-2.5 h-2.5 text-black/70 stroke-3 opacity-0 group-hover/mac:opacity-100 transition-opacity" />
                </div>
                <div className="w-4 h-4 border border-foreground/10 rounded-full bg-green-500 flex justify-center items-center">
                  <Plus className="w-2.5 h-2.5 text-black/70 stroke-3 opacity-0 group-hover/mac:opacity-100 transition-opacity" />
                </div>
              </div>
              <p className="text-[10px] sm:text-xs font-semibold text-foreground/40 tracking-wider">LIVING ROOM SESSION</p>
              <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-foreground/40 hover:text-foreground cursor-pointer transition-colors" />
            </div>

            {/* Player Body */}
            <div className="p-5 sm:p-8 pb-6 sm:pb-10 flex flex-col items-center">

              {/* Cover Art Mockup */}
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="w-36 h-36 sm:w-64 sm:h-64 rounded-xl sm:rounded-2xl bg-gradient-to-br from-foreground/20 to-foreground/5 shadow-2xl flex items-center justify-center mb-6 sm:mb-8 relative overflow-hidden transition-all duration-500"
              >
                <div className="absolute inset-0 bg-background/10" />
                <div className="absolute inset-0 flex items-center justify-center gap-2">
                  {[...Array(8)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={isPlaying ? { height: ["20px", "60px", "20px"] } : { height: "20px" }}
                      transition={isPlaying ? { duration: 0.6, repeat: Infinity, delay: i * 0.15 } : { duration: 0.3 }}
                      className="w-3 bg-foreground/60 rounded-full"
                    />
                  ))}
                </div>
              </motion.div>

              {/* Track Info */}
              <h3 className="text-xl sm:text-2xl font-bold text-foreground mb-1 leading-tight">Midnight City</h3>
              <p className="text-sm sm:text-base text-foreground/50 font-medium mb-6 sm:mb-8">M83</p>

              {/* Progress Bar */}
              <div className="w-full mb-6 sm:mb-8 px-2 sm:px-0">
                <div className="w-full h-1 sm:h-1.5 bg-foreground/10 rounded-full overflow-hidden relative">
                  <motion.div
                    initial={{ width: "30%" }} // Start at ~1:14
                    animate={progressControls}
                    className="absolute top-0 left-0 h-full bg-foreground/60"
                  />
                </div>
                <div className="flex justify-between mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-foreground/40 font-medium tracking-wide">
                  <span>01:14</span>
                  <span>04:03</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-6 sm:gap-8 w-full">
                <SkipBack className="w-6 h-6 sm:w-8 sm:h-8 text-foreground/30 hover:text-foreground cursor-pointer transition-colors" />
                <div onClick={()=>{setIsPlaying(!isPlaying)}} className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-foreground text-background flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-all shadow-lg overflow-hidden">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={isPlaying ? "pause" : "play"}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ duration: 0.15, ease: "easeInOut" }}
                      className="flex items-center justify-center"
                    >
                      {isPlaying ? <Pause className="w-5 h-5 sm:w-8 sm:h-8 fill-currentColor" /> : <Play className="w-5 h-5 sm:w-8 sm:h-8 fill-currentColor" />}
                    </motion.div>
                  </AnimatePresence>
                </div>
                <SkipForward className="w-6 h-6 sm:w-8 sm:h-8 text-foreground/30 hover:text-foreground cursor-pointer transition-colors" />
              </div>

              {/* Connected Devices Plaque */}
              <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-foreground/10 w-full flex items-center justify-center gap-2 sm:gap-3">
                <div className="flex -space-x-2 sm:-space-x-3">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-background flex items-center justify-center border sm:border-2 border-background/50 shadow-md z-30">
                    <Smartphone className="w-3 h-3 sm:w-4 sm:h-4 text-foreground/60" />
                  </div>
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-background flex items-center justify-center border sm:border-2 border-background/50 shadow-md z-20">
                    <Speaker className="w-3 h-3 sm:w-4 sm:h-4 text-foreground/60" />
                  </div>
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-background flex items-center justify-center border sm:border-2 border-background/50 shadow-md z-10">
                    <Smartphone className="w-3 h-3 sm:w-4 sm:h-4 text-foreground/60" />
                  </div>
                </div>
                <span className="text-[10px] sm:text-xs font-semibold text-foreground/50 ml-1 sm:ml-2">+2 in sync</span>
              </div>

            </div>

          </div>
        </motion.div>

      </div>
    </header>
  );
}
