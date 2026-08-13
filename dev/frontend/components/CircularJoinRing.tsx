"use client";

import { useState, ChangeEvent, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Smartphone, Laptop, Speaker, Headphones, Clipboard } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface CircularJoinRingProps {
  onSuccess?: () => void;
  className?: string;
}

export function CircularJoinRing({ onSuccess, className = "" }: CircularJoinRingProps) {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length >= 4) {
      const code = joinCode.trim().toUpperCase();
      onSuccess?.();
      router.push(`/room/${code}`);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        const cleaned = text.trim().toUpperCase().slice(0, 6);
        if (cleaned) setJoinCode(cleaned);
      }
    } catch {}
  };

  return (
    <div className={cn("relative flex items-center justify-center select-none", className)}>
      {/* Pulsing Concentric Outer Rings Desktop */}
      <div className="hidden sm:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] h-[440px] rounded-full border border-foreground/20 border-dashed animate-[spin_60s_linear_infinite] pointer-events-none z-10" />
      <div className="hidden sm:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full border border-foreground/15 animate-[spin_40s_linear_infinite_reverse] pointer-events-none z-10" />
      <div className="hidden sm:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-foreground/10 animate-[spin_25s_linear_infinite] pointer-events-none z-10" />
      <div className="hidden sm:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[680px] h-[680px] rounded-full border border-foreground/5 animate-[spin_35s_linear_infinite_reverse] pointer-events-none z-10" />

      {/* Orbiting Elements Desktop */}
      <div className="hidden sm:block pointer-events-none absolute inset-0 z-30">
        <OrbitingNode Icon={Smartphone} initialAngle={45} radius={220} duration={25} />
        <OrbitingNode Icon={Speaker} initialAngle={135} radius={260} duration={30} reverse />
        <OrbitingNode Icon={Laptop} initialAngle={225} radius={300} duration={35} />
        <OrbitingNode Icon={Headphones} initialAngle={315} radius={340} duration={40} reverse />
      </div>

      {/* Pulsing Concentric Outer Rings Mobile */}
      <div className="sm:hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] rounded-full border border-foreground/20 border-dashed animate-[spin_60s_linear_infinite] pointer-events-none z-10" />
      <div className="sm:hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] rounded-full border border-foreground/15 animate-[spin_40s_linear_infinite_reverse] pointer-events-none z-10" />

      {/* Orbiting Elements Mobile */}
      <div className="sm:hidden pointer-events-none absolute inset-0 z-30">
        <OrbitingNode Icon={Smartphone} initialAngle={30} radius={140} duration={20} />
        <OrbitingNode Icon={Speaker} initialAngle={210} radius={170} duration={25} reverse />
      </div>

      {/* Central Signature Circular Glass Core */}
      <motion.div 
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.03 }}
        transition={{ type: "spring", bounce: 0.4 }}
        className="w-60 h-60 sm:w-80 sm:h-80 md:w-96 md:h-96 rounded-full glass-panel flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 text-center relative z-20 shadow-[0_25px_90px_rgba(0,0,0,0.3)] overflow-hidden border border-foreground/15 hover:border-foreground/40 hover:bg-background/20 dark:hover:bg-black/20 hover:backdrop-blur-3xl hover:shadow-[0_35px_110px_rgba(0,0,0,0.5)] transition-all duration-500 group cursor-pointer"
      >
        {/* Internal Gradient Glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none transition-opacity duration-500 group-hover:opacity-60" />

        <form onSubmit={handleJoin} className="absolute inset-0 flex flex-col items-center justify-center z-10 w-full px-5 sm:px-8 md:px-14">
          <div className="flex flex-col items-center justify-center w-full -mt-3 sm:-mt-4 md:-mt-8">
            <h2 className="text-[10px] sm:text-xs md:text-sm font-black tracking-[0.25em] uppercase text-foreground/70 mb-2 sm:mb-4 md:mb-6">
              Enter Room Code
            </h2>

            <div className="relative w-full">
              <input
                name="syncbeats-room-join-code"
                type="text"
                inputMode="text"
                maxLength={6}
                value={joinCode}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="------"
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
                className="w-full bg-transparent border-b-2 border-foreground/40 pb-1 sm:pb-2 text-center text-2xl sm:text-3xl md:text-4xl font-black tracking-[0.15em] outline-none transition-colors duration-700 placeholder:text-foreground/30 uppercase focus:border-[var(--accent-color,rgb(52,211,153))]"
              />

              {joinCode.length === 0 && (
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-foreground/10 text-foreground/70 text-[10px] font-bold flex items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  Paste
                </button>
              )}
            </div>
          </div>

          <div className="absolute bottom-3 sm:bottom-6 md:bottom-12 left-0 right-0 flex justify-center">
            <AnimatePresence>
              {joinCode.length > 0 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.4, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.4, y: 10 }}
                  transition={{ type: "spring", bounce: 0.5, duration: 0.4 }}
                  type="submit"
                  className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-foreground/90 transition-colors shadow-[0_0_25px_rgba(var(--foreground-rgb),0.4)] cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 md:w-7 md:h-7 ml-0.5 md:ml-1 text-background" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function OrbitingNode({ Icon, initialAngle = 0, radius, duration, reverse = false, className = "" }: any) {
  const targetAngle = reverse ? initialAngle - 360 : initialAngle + 360;

  return (
    <motion.div 
      className={cn('absolute top-1/2 left-1/2 w-0 h-0 flex items-center justify-center pointer-events-none z-30', className)}
      initial={{ rotate: initialAngle }}
      animate={{ rotate: targetAngle }}
      transition={{ duration, repeat: Infinity, ease: "linear" }}
    >
      <motion.div 
        className="w-10 h-10 md:w-12 md:h-12 rounded-full glass-panel flex items-center justify-center border border-foreground/20 shadow-lg relative z-30 shrink-0 bg-background/80 dark:bg-black/80 backdrop-blur-md"
        style={{ y: -radius }}
        initial={{ rotate: -initialAngle }}
        animate={{ rotate: -targetAngle }}
        transition={{ duration, repeat: Infinity, ease: "linear" }}
      >
        <Icon className="w-4 h-4 md:w-5 md:h-5 text-foreground/80" />
      </motion.div>
    </motion.div>
  );
}
