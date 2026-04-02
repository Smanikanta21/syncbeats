"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { Disc, Pause, SkipForward, SkipBack, Smartphone, Speaker } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function DynamicIsland() {
  const pathname = usePathname();
  const router = useRouter();

  // Ensures client-hydration matches
  const [mounted, setMounted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!mounted) return null;

  const isRoom = pathname.includes("/room/");
  const isProfile = pathname.includes("/profile");

  const isRoomExpanded = isRoom && !isScrolled;
  const isRoomCompact = isRoom && isScrolled;

  return (
    <div className="fixed top-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
      <motion.div
         layout
         animate={{
           boxShadow: isRoomExpanded
            ? "0px 20px 80px rgba(0,0,0,0.8)" // Heavy dark shadow for the massive Expanded Player
            : ["0px 0px 15px rgba(255,255,255,0.05)", "0px 0px 40px rgba(255,255,255,0.15)", "0px 0px 15px rgba(255,255,255,0.05)"] // Breathing silver glow for standard Nav Drop
         }}
         transition={{ 
           layout: { type: "spring", stiffness: 500, damping: 35, mass: 0.8 },
           boxShadow: { duration: 4, repeat: Infinity, ease: "easeInOut" }
         }}
         className={`pointer-events-auto bg-black/80 backdrop-blur-3xl overflow-hidden ${
           isRoomExpanded 
             ? "w-11/12 max-w-2xl rounded-[2.5rem] border border-white/10" 
             : "w-[90%] max-w-5xl rounded-full border border-white/10"
         }`}
      >
        <AnimatePresence mode="popLayout" initial={false}>
         
         {/* STATE 1: MASSIVE EXPANDED ROOM PLAYER */}
         {isRoomExpanded && (
             <motion.div 
               key="room-player-expanded"
               initial={{ opacity: 0, filter: "blur(10px)" }} 
               animate={{ opacity: 1, filter: "blur(0px)" }} 
               exit={{ opacity: 0, filter: "blur(10px)", transition: { duration: 0.1 } }}
               className="p-6 md:p-8 flex flex-col"
             >
                <div className="flex items-center justify-between mb-8">
                  <span className="text-xs font-bold tracking-widest text-zinc-500 uppercase flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Live Session
                  </span>
                  <button onClick={() => router.push("/hub")} className="text-xs font-semibold bg-white/5 hover:bg-white/10 px-4 py-1.5 rounded-full text-zinc-300 transition-colors">
                    Leave Room
                  </button>
                </div>
                
                <div className="flex items-center gap-6 mb-8">
                  <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gradient-to-br from-zinc-800 to-zinc-700 rounded-2xl flex items-center justify-center border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex-shrink-0">
                     <Disc className="w-10 h-10 text-white/50 animate-[spin_4s_linear_infinite]" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl sm:text-3xl font-black text-white mb-1 tracking-tight">Midnight City</h3>
                    <p className="text-zinc-400 font-medium text-lg">M83</p>
                  </div>
                </div>

                <div className="w-full mb-8">
                  <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden relative">
                    <motion.div 
                       initial={{ width: "0%" }} animate={{ width: "35%" }} 
                       transition={{ duration: 1 }}
                       className="absolute left-0 top-0 bottom-0 bg-white rounded-full" 
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-zinc-500 font-medium">
                    <span>01:14</span><span>04:03</span>
                  </div>
                </div>

                <div className="flex justify-center items-center gap-8 mb-6">
                  <SkipBack className="w-8 h-8 text-white/30 hover:text-white cursor-pointer transition-colors" />
                  <div className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                    <Pause className="w-8 h-8" fill="currentColor" />
                  </div>
                  <SkipForward className="w-8 h-8 text-white/30 hover:text-white cursor-pointer transition-colors" />
                </div>

                <div className="pt-6 border-t border-white/10 flex items-center justify-between">
                   <div className="flex -space-x-3">
                     <div className="w-8 h-8 rounded-full bg-zinc-700 border-2 border-black flex items-center justify-center z-20"><Smartphone className="w-4 h-4 text-white"/></div>
                     <div className="w-8 h-8 rounded-full bg-zinc-800 border-2 border-black flex items-center justify-center z-10"><Speaker className="w-4 h-4 text-white"/></div>
                   </div>
                   <span className="text-xs font-semibold text-green-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> 0ms Latency
                   </span>
                </div>
             </motion.div>
         )}

         {/* STATE 2: COMPACT MINI-PLAYER SCROLL-SNAP */}
         {isRoomCompact && (
             <motion.div 
               key="room-player-compact"
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0, transition: { duration: 0.1 } }}
               className="px-6 md:px-8 py-3 flex items-center justify-between w-full h-full"
             >
                {/* Left: Tiny Album Art & Song */}
                <div className="flex items-center gap-4 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                  <div className="w-10 h-10 bg-gradient-to-br from-zinc-800 to-zinc-700 rounded-full flex items-center justify-center border border-white/10 overflow-hidden group-hover:scale-105 transition-transform">
                     <Disc className="w-5 h-5 text-white/50 animate-[spin_4s_linear_infinite]" />
                  </div>
                  <div className="text-left hidden sm:block">
                     <h4 className="text-sm font-bold text-white leading-tight mb-0.5">Midnight City</h4>
                     <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">M83</p>
                  </div>
                </div>

                {/* Right: Controls & Actions */}
                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="flex items-center gap-3 sm:gap-5">
                    <SkipBack className="w-4 h-4 sm:w-5 sm:h-5 text-white/50 hover:text-white cursor-pointer transition-colors" />
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white text-black flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform">
                      <Pause className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" />
                    </div>
                    <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 text-white/50 hover:text-white cursor-pointer transition-colors" />
                  </div>
                  
                  <div className="hidden sm:block w-px h-6 bg-white/10" />
                  
                  <button onClick={() => router.push("/hub")} className="hidden sm:block text-xs font-semibold text-zinc-400 hover:text-red-400 transition-colors uppercase tracking-widest">
                    Leave
                  </button>
                </div>
             </motion.div>
         )}

         {/* STATE 3: DEFAULT HUB NAV */}
         {(!isRoom) && (
             <motion.div 
               key="hub-nav"
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0, transition: { duration: 0.1 } }}
               className="px-4 sm:px-6 md:px-8 py-4 flex items-center justify-between w-full h-full"
             >
                <Link href="/hub" className="flex items-center gap-2 sm:gap-3 group">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                    <Disc className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-300 animate-[spin_4s_linear_infinite]" />
                  </div>
                  <span className="text-base sm:text-lg font-black tracking-widest text-zinc-200 group-hover:text-white transition-colors">SYNC<span className="text-zinc-500">BEATS</span></span>
                </Link>

                <div className="flex items-center gap-4">
                  {isProfile ? (
                     <Link href="/hub" className="text-xs sm:text-sm font-semibold text-zinc-400 hover:text-white transition-colors uppercase tracking-widest">Done</Link>
                  ) : (
                    <Link href="/profile" className="flex items-center gap-3 cursor-pointer group">
                      <div className="text-right hidden sm:block">
                        <div className="text-sm font-bold text-zinc-200">Rick Rubin</div>
                        <div className="text-xs text-zinc-500 font-medium tracking-wide">rick@defjam.com</div>
                      </div>
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-600 flex items-center justify-center border-2 border-transparent group-hover:border-white/20 transition-all overflow-hidden shadow-[0_0_15px_rgba(255,255,255,0.05)]">
                          <span className="text-xs sm:text-sm font-bold text-white tracking-widest">RR</span>
                      </div>
                    </Link>
                  )}
                </div>
             </motion.div>
         )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
