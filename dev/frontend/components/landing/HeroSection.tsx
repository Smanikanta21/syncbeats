"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center mt-12 md:mt-24 mb-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="max-w-4xl mx-auto flex flex-col items-center w-full"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel border border-foreground/10 mb-8 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-bold tracking-widest uppercase text-foreground/80">Available Now</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-[1.1] mb-8 drop-shadow-sm">
          One Track.<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-foreground via-foreground/80 to-foreground/40">
            Every Phone.
          </span><br />
          Zero Lag.
        </h1>
        
        <p className="text-lg md:text-xl text-foreground/60 font-medium max-w-2xl mb-12 leading-relaxed">
          Instantly turn your friends&apos; phones into a perfectly synchronized, high-fidelity spatial audio system. No downloads, no Bluetooth pairing. Just drop a track and hit play.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
          <Link href="/login" className="w-full sm:w-auto h-14 px-8 flex items-center justify-center gap-2 rounded-2xl bg-foreground text-background text-sm font-black tracking-widest uppercase hover:scale-[1.02] active:scale-95 transition-all shadow-[0_10px_40px_rgba(0,0,0,0.15)]">
            Start a Room <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
