"use client";

import { motion } from "framer-motion";
import { Play, ArrowRight, Sparkles, Pause, SkipForward, SkipBack, Share2, Smartphone, Speaker } from "lucide-react";

export function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center pt-24 md:pt-32 px-4 sm:px-6 lg:px-8 overflow-hidden pb-20">
      {/* Decorative Orbs behind hero (Minute Silver Glow) */}
      <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-white/5 rounded-full blur-[120px] animate-blob pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-zinc-400/5 rounded-full blur-[100px] animate-blob animation-delay-2000 pointer-events-none" />
      
      <div className="relative z-10 w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
        
        {/* Left Column: Text & CTA */}
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
          

          {/* Light Cement Text */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-black tracking-tighter mb-6 leading-[1.05]"
          >
            <span className="text-zinc-200">Turn every phone into</span><br />
            <span className="text-zinc-400 drop-shadow-[0_0_15px_rgba(228,228,231,0.2)]">one massive speaker.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-lg md:text-xl text-zinc-500 max-w-xl mb-10 leading-relaxed font-medium"
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
            <div className="absolute top-1/2 left-32 -translate-x-1/2 -translate-y-1/2 w-48 h-24 bg-white/5 rounded-full blur-[40px] pointer-events-none" />
            
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="group relative h-14 px-8 rounded-full bg-zinc-200 text-black font-bold text-lg transition-all flex items-center justify-center gap-2 overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] z-10 w-full sm:w-auto"
            >
              <span className="relative z-10 flex items-center gap-2">
                Start a Session <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </motion.button>
            
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="group h-14 px-8 rounded-full glass-panel text-zinc-300 font-bold text-lg hover:border-white/20 transition-all flex items-center justify-center gap-3 z-10 w-full sm:w-auto"
            >
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                <Play className="w-4 h-4 fill-zinc-300" />
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
          className="relative w-full max-w-lg mx-auto lg:mx-0 lg:ml-auto"
        >
          {/* Subtle backlight glow for the player */}
          <div className="absolute -inset-4 bg-zinc-500/10 filter blur-[60px] rounded-[3rem] pointer-events-none opacity-50" />
          
          <div className="relative glass-panel rounded-3xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-3xl overflow-hidden bg-black/60 group">
            
            {/* Top Bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-zinc-600/50" />
                <div className="w-3 h-3 rounded-full bg-zinc-600/50" />
                <div className="w-3 h-3 rounded-full bg-zinc-600/50" />
              </div>
              <span className="text-xs font-semibold text-zinc-500 tracking-wider">LIVING ROOM SESSION</span>
              <Share2 className="w-4 h-4 text-zinc-500 hover:text-white cursor-pointer" />
            </div>
            
            {/* Player Body */}
            <div className="p-8 pb-10 flex flex-col items-center">
              
              {/* Cover Art Mockup */}
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className="w-48 h-48 sm:w-64 sm:h-64 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-700 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center justify-center mb-8 relative overflow-hidden group-hover:shadow-[0_0_40px_rgba(255,255,255,0.1)] transition-all duration-500"
              >
                <div className="absolute inset-0 bg-black/10" />
                <div className="absolute inset-0 flex items-center justify-center gap-2">
                  {[...Array(5)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ height: ["20px", "60px", "20px"] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                      className="w-3 bg-zinc-400/80 rounded-full"
                    />
                  ))}
                </div>
              </motion.div>
              
              {/* Track Info */}
              <h3 className="text-2xl font-bold text-zinc-200 mb-1">Midnight City</h3>
              <p className="text-zinc-500 font-medium mb-8">M83</p>
              
              {/* Progress Bar */}
              <div className="w-full mb-8">
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden relative">
                  <motion.div 
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 240, ease: "linear" }}
                    className="absolute top-0 left-0 h-full bg-zinc-400"
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-zinc-500 font-medium tracking-wide">
                  <span>01:14</span>
                  <span>04:03</span>
                </div>
              </div>
              
              {/* Controls */}
              <div className="flex items-center justify-center gap-8 w-full">
                <SkipBack className="w-8 h-8 text-white/30 hover:text-white cursor-pointer transition-colors" />
                <div className="w-16 h-16 rounded-full bg-zinc-200 text-black flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                  <Pause className="w-8 h-8 fill-black" />
                </div>
                <SkipForward className="w-8 h-8 text-white/30 hover:text-white cursor-pointer transition-colors" />
              </div>

              {/* Connected Devices Plaque */}
              <div className="mt-8 pt-6 border-t border-white/5 w-full flex items-center justify-center gap-3">
                <div className="flex -space-x-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center border-2 border-black z-30">
                    <Smartphone className="w-4 h-4 text-zinc-300" />
                  </div>
                  <div className="w-8 h-8 rounded-full bg-zinc-600 flex items-center justify-center border-2 border-black z-20">
                    <Speaker className="w-4 h-4 text-zinc-300" />
                  </div>
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border-2 border-black z-10">
                    <Smartphone className="w-4 h-4 text-zinc-300" />
                  </div>
                </div>
                <span className="text-xs font-semibold text-zinc-500 ml-2">+2 in sync</span>
              </div>
              
            </div>
            
          </div>
        </motion.div>

      </div>
    </section>
  );
}
