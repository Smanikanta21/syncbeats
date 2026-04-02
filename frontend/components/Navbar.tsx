"use client";

import { motion } from "framer-motion";
import { Menu, Sparkles } from "lucide-react";
import Link from "next/link";

export function Navbar() {
  return (
    <div className="fixed top-6 left-4 right-4 md:left-16 md:right-16 lg:left-32 lg:right-32 z-50 flex justify-center pointer-events-none">
      <motion.nav 
        initial={{ y: -100, opacity: 0 }}
        animate={{ 
          y: 0, 
          opacity: 1,
          boxShadow: [
            "0px 0px 20px rgba(200, 203, 212, 0.2)", 
            "0px 0px 50px rgba(200, 203, 212, 0.4)", 
            "0px 0px 20px rgba(200, 203, 212, 0.2)"
          ] 
        }}
        transition={{ 
          y: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
          opacity: { duration: 0.8 },
          boxShadow: { duration: 3, repeat: Infinity, ease: "easeInOut" }
        }}
        className="w-full max-w-5xl bg-black/80 backdrop-blur-3xl border border-[#cbd5e1]/40 rounded-full px-6 md:px-8 py-4 flex items-center justify-between pointer-events-auto"
      >
        <div className="flex items-center gap-4">
          <span className="text-2xl font-black tracking-tighter text-zinc-200">SYNC<span className="text-zinc-500">BEATS</span></span>
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-primary/10 border border-accent-primary/20">
            <Sparkles className="w-3 h-3 text-accent-primary animate-pulse" />
            <span className="text-accent-primary text-[10px] font-bold uppercase tracking-widest">Beta</span>
          </div>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          <a href="#how-it-works" className="text-sm font-semibold text-[#cbd5e1] hover:text-white transition-colors">Workflow</a>
          <a href="#features" className="text-sm font-semibold text-[#cbd5e1] hover:text-white transition-colors">Features</a>
          {/* <a href="#about" className="text-sm font-semibold text-[#cbd5e1] hover:text-white transition-colors">Story</a> */}
          
          <Link href="/login" className="h-10 px-6 flex items-center justify-center rounded-full bg-[#f8fafc] text-black text-sm font-bold hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(248,250,252,0.4)] hover:shadow-[0_0_30px_rgba(248,250,252,0.6)]">
            Get Started
          </Link>
        </div>

        {/* Mobile Nav toggle */}
        <div className="md:hidden">
          <button className="p-2 text-[#cbd5e1] hover:text-white transition-colors active:scale-90">
            <Menu size={24} />
          </button>
        </div>
      </motion.nav>
    </div>
  );
}
