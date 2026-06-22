"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export default function Preloader() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Force scroll to top on load to prevent GSAP/Framer Motion from breaking if browser restores scroll position
    window.scrollTo(0, 0);
    
    // Keep preloader visible for a moment to hide hydration flashes
    const timer = setTimeout(() => {
      setIsLoading(false);
      // Refresh ScrollTrigger after preloader is gone so pinning dimensions are calculated correctly
      setTimeout(() => {
        ScrollTrigger.refresh();
      }, 100);
    }, 800); 

    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, y: "-100%" }}
          transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background text-foreground overflow-hidden"
        >
          {/* Subtle animated background */}
          <div className="absolute inset-0 pointer-events-none opacity-50">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] bg-violet-600/20 blur-[120px] rounded-full mix-blend-screen animate-pulse duration-3000" />
          </div>

          <motion.div
            initial={{ scale: 0.8, opacity: 0, filter: "blur(10px)" }}
            animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex items-center gap-4 relative z-10"
          >
            <Image 
              src="/syncbeats-icon.svg" 
              alt="SyncBeats Logo" 
              width={48} 
              height={48} 
              className="animate-pulse drop-shadow-2xl" 
              priority
            />
            <h1 className="text-3xl md:text-5xl font-black tracking-tighter drop-shadow-xl">
              SYNC<span className="text-zinc-500">BEATS</span>
            </h1>
          </motion.div>
          
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: "200px" }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            className="h-1 bg-foreground/20 rounded-full mt-12 overflow-hidden relative"
          >
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="absolute inset-0 w-1/2 bg-foreground rounded-full"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
