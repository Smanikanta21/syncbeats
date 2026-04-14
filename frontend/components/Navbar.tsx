"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, Sparkles, X } from "lucide-react";
import Link from "next/link";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed top-4 sm:top-6 left-4 right-4 md:left-16 md:right-16 lg:left-32 lg:right-32 z-50 flex flex-col items-center pointer-events-none">
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
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 text-[#cbd5e1] hover:text-white transition-colors active:scale-90"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </motion.nav>

      {/* Mobile Menu Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="w-full mt-4 max-w-sm bg-black/90 backdrop-blur-3xl border border-[#cbd5e1]/30 rounded-[2rem] p-6 flex flex-col gap-6 shadow-2xl pointer-events-auto md:hidden"
          >
            <div className="flex flex-col gap-4 items-center">
              <a href="#how-it-works" onClick={() => setIsOpen(false)} className="text-lg font-semibold text-[#cbd5e1] hover:text-white transition-colors">Workflow</a>
              <a href="#features" onClick={() => setIsOpen(false)} className="text-lg font-semibold text-[#cbd5e1] hover:text-white transition-colors">Features</a>
              
              <Link href="/login" onClick={() => setIsOpen(false)} className="h-12 w-full mt-2 flex items-center justify-center rounded-full bg-[#f8fafc] text-black text-base font-bold active:scale-[0.98] transition-transform shadow-[0_0_20px_rgba(248,250,252,0.4)]">
                Get Started
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
