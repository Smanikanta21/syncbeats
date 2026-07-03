"use client";

import { useAudio } from "../context/AudioContext";
import { useEffect, useRef } from "react";
import { motion, useSpring, useMotionValue } from "framer-motion";

export function GlobalBackground() {
  const { getRawAudioData } = useAudio();
  const reqRef = useRef<number | null>(null);

  // Use motion values for smooth hardware-accelerated updates
  const bassScale = useMotionValue(1);
  const bassOpacity = useMotionValue(1);
  
  // Spring config for smooth beat decay
  const springScale = useSpring(bassScale, { stiffness: 300, damping: 20 });
  const springOpacity = useSpring(bassOpacity, { stiffness: 300, damping: 20 });

  useEffect(() => {
    const updateLoop = () => {
      const data = getRawAudioData ? getRawAudioData() : null;
      if (data && data.length > 0) {
        // Calculate bass energy (first ~10 bins for low frequencies)
        let sum = 0;
        const binCount = 10;
        for (let i = 0; i < binCount; i++) {
          sum += data[i] || 0;
        }
        const avg = sum / binCount;
        
        // Normalize 0-255 to 0-1
        const normalizedBass = avg / 255;
        
        // Scale from 1.0 to 1.1 based on bass intensity
        bassScale.set(1 + normalizedBass * 0.15);
        
        // Opacity from 1.0 to 1.4 for brightening effect
        bassOpacity.set(1 + normalizedBass * 0.5);
      } else {
        // Decay back to normal when no audio
        bassScale.set(1);
        bassOpacity.set(1);
      }
      
      reqRef.current = requestAnimationFrame(updateLoop);
    };

    reqRef.current = requestAnimationFrame(updateLoop);
    return () => {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
    };
  }, [getRawAudioData, bassScale, bassOpacity]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* DESKTOP LAYER (Heavy, high fidelity) */}
      <motion.div 
        className="hidden md:block absolute inset-0"
        style={{ scale: springScale, opacity: springOpacity }}
      >
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-sky-600/10 dark:bg-sky-900/20 blur-[120px] rounded-full mix-blend-screen animate-pulse duration-8000" />
        <div className="absolute top-[20%] right-[-20%] w-[60vw] h-[60vw] bg-emerald-500/10 dark:bg-emerald-900/20 blur-[150px] rounded-full mix-blend-screen animate-pulse duration-12000 delay-1000" />
        <div className="absolute bottom-[-20%] left-[20%] w-[70vw] h-[70vw] bg-blue-500/10 dark:bg-blue-900/20 blur-[130px] rounded-full mix-blend-screen animate-pulse duration-10000 delay-500" />
        <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
      </motion.div>

      {/* MOBILE LAYER (Optimized, lightweight) */}
      <motion.div 
        className="block md:hidden absolute inset-0"
        style={{ scale: springScale, opacity: springOpacity }}
      >
        <div className="absolute top-[-10%] left-[-10%] w-[70vw] h-[70vw] bg-[radial-gradient(circle,var(--tw-gradient-stops))] from-sky-600/15 dark:from-sky-900/25 to-transparent mix-blend-screen animate-pulse duration-16000 will-change-transform" />
        <div className="absolute top-[20%] right-[-20%] w-[80vw] h-[80vw] bg-[radial-gradient(circle,var(--tw-gradient-stops))] from-emerald-500/15 dark:from-emerald-900/25 to-transparent mix-blend-screen animate-pulse duration-24000 delay-1000 will-change-transform" />
        <div className="absolute bottom-[-20%] left-[20%] w-[90vw] h-[90vw] bg-[radial-gradient(circle,var(--tw-gradient-stops))] from-blue-500/15 dark:from-blue-900/25 to-transparent mix-blend-screen animate-pulse duration-20000 delay-500 will-change-transform" />
        <div className="absolute inset-0 opacity-[0.05] dark:opacity-[0.08]" style={{ backgroundImage: 'url("/noise.png")', backgroundRepeat: 'repeat', backgroundSize: '150px' }} />
      </motion.div>
    </div>
  );
}
