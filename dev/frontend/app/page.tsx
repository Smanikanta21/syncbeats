"use client";

import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "framer-motion";
import { ArrowRight, Smartphone, Laptop, Speaker, Headphones, Radio, Mic2, Play, Users, Zap, Globe, Shield, QrCode, Mail, MapPin, Send } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "../components/ThemeToggle";
import { useState, useEffect, ChangeEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Magnetic from "../components/Magnetic";

import { FeaturesExplanation } from "../components/FeaturesExplanation";

import { getSocket } from "../lib/socket";
import { roomsApi } from "../lib/api";
import { cn } from "@/lib/utils";
import { DynamicAuroraButton } from "../components/DynamicAuroraButton";


const MouseGradient = dynamic(() => import("../components/MouseGradient").then(mod => mod.MouseGradient), { ssr: false });

export default function LandingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isScrolled, setIsScrolled] = useState(false);
  const [hoveredStep, setHoveredStep] = useState<number | null>(0);
  const [isRoomPlaying, setIsRoomPlaying] = useState(false);
  
  const { scrollY } = useScroll(); // Track window scroll natively

  useMotionValueEvent(scrollY, "change", (latest) => {
    // If scrolled past 100px, transition the nav
    if (latest > 100 && !isScrolled) setIsScrolled(true);
    else if (latest <= 100 && isScrolled) setIsScrolled(false);
  });

  // When user is logged in, check if their default room is playing a song to sync ambient background & beat visuals (without playing sound)
  useEffect(() => {
    if (!user) {
      setIsRoomPlaying(false);
      return;
    }
    const socket = getSocket();

    roomsApi.default()
      .then((res) => {
        if (!res?.roomId) return;
        const roomId = res.roomId;
        socket.emit("room:join", {
          roomId,
          displayName: user.name || "User",
          userId: user.id,
        });

        const handleSnapshot = (snap: any) => {
          if (snap) {
            setIsRoomPlaying(snap.isPlaying || snap.state === "PLAYING");
          }
        };

        const handleStateChanged = (snap: any) => {
          if (snap) {
            setIsRoomPlaying(snap.isPlaying || snap.state === "PLAYING");
          }
        };

        socket.on("room:snapshot", handleSnapshot);
        socket.on("room:stateChanged", handleStateChanged);
      })
      .catch(() => {});

    return () => {
      socket.off("room:snapshot");
      socket.off("room:stateChanged");
    };
  }, [user]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.length > 3) router.push(`/room/${joinCode.toUpperCase()}`);
  };

  return (
    <div className={cn('w-full', 'bg-transparent', 'text-foreground', 'overflow-x-clip', 'font-sans', 'relative', 'selection:bg-foreground', 'selection:text-background', 'custom-scrollbar')}>
      
      {/* Interactive Mouse Gradient Follower (Fixed) */}
      <MouseGradient />



      {/* Dynamic Snapping Navbar Wrapper */}
      <div className={cn('fixed', 'top-0', 'left-0', 'right-0', 'z-50', 'flex', 'justify-center', 'pointer-events-none', 'pt-6')}>
        <motion.header 
          initial={false}
          animate={{
            width: isScrolled ? "min(calc(100% - 32px), 1024px)" : "100%",
            paddingLeft: "24px",
            paddingRight: "24px",
            paddingTop: "12px",
            paddingBottom: "12px",
            borderRadius: isScrolled ? "9999px" : "0px",
          }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className={`pointer-events-auto flex items-center justify-between transition-all duration-300 ${isScrolled ? 'glass-panel shadow-xl' : 'bg-transparent border-transparent'}`}
        >
        <motion.div initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} className={cn('flex', 'items-center')}>
          <Link href="/" className={cn('text-xl', 'md:text-2xl', 'font-black', 'tracking-tighter', 'text-foreground', 'group', 'flex', 'items-center', 'gap-3')}>
            <Image src="/syncbeats-icon.svg" alt="SyncBeats Logo" width={isScrolled ? 28 : 36} height={isScrolled ? 28 : 36} priority className={cn('group-hover:scale-110', 'md:block', 'hidden', 'transition-all', 'duration-300')} />
            <span>SYNC<span className={cn('text-zinc-500', 'transition-colors', 'group-hover:text-foreground')}>BEATS</span></span>
          </Link>
        </motion.div>
        
        <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} className={cn('flex', 'items-center', 'gap-3', 'md:gap-4')}>
          {user ? (
            <Magnetic>
              <DynamicAuroraButton href="/hub" className={`${isScrolled ? 'h-10 px-6 text-xs' : 'h-12 px-8 text-xs md:text-sm'}`}>
                Launch Hub
              </DynamicAuroraButton>
            </Magnetic>
          ) : (
            <>
            <Link href="/login" className={`hidden sm:flex ${isScrolled ? 'h-10 px-4' : 'h-12 px-6'} rounded-full items-center justify-center text-xs md:text-sm font-bold tracking-widest uppercase text-foreground/80 hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 border border-transparent transition-all duration-300`}>
              Login
            </Link>
            <Magnetic>
              <DynamicAuroraButton href="/login" className={`${isScrolled ? 'h-10 px-6 text-xs' : 'h-12 px-8 text-xs md:text-sm'}`}>
                Start Session
              </DynamicAuroraButton>
            </Magnetic>
            </>
          )}
          <AnimatePresence>
            {isScrolled && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5, width: 0 }}
                animate={{ opacity: 1, scale: 1, width: "auto" }}
                exit={{ opacity: 0, scale: 0.5, width: 0 }}
                transition={{ duration: 0.2 }}
                className={cn('overflow-hidden', 'flex', 'rounded-full', 'items-center')}
              >
                <ThemeToggle />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        </motion.header>
      </div>

      {/* SECTION 1: Central Immersive Core */}
      <section className={cn('relative', 'z-10', 'w-full', 'min-h-dvh', 'snap-start', 'snap-always', 'shrink-0', 'flex', 'flex-col', 'items-center', 'justify-center', 'px-4', 'py-24')}>
        
        {/* Massive Typography Behind */}
        <div className={cn('absolute', 'inset-0', 'flex', 'items-center', 'justify-center', 'pointer-events-none', 'opacity-[0.03]', 'dark:opacity-5', 'select-none', 'overflow-hidden')}>
          <h1 className={cn('text-[25vw]', 'font-black', 'tracking-tighter', 'leading-none', 'whitespace-nowrap', 'blur-[1px]')}>SPATIAL</h1>
        </div>

        {/* The Core Ring UI */}
        <div className={cn('relative', 'w-full', 'h-125', 'md:h-175', 'flex', 'flex-col', 'items-center', 'justify-center', 'group', 'mb-10')}>
          
          {/* Pulsing Rings for Desktop */}
          <div className={cn('hidden', 'md:block', 'absolute', 'top-1/2', 'left-1/2', '-translate-x-1/2', '-translate-y-1/2', 'w-120', 'h-120', 'rounded-full', 'border', 'border-foreground/10', 'border-dashed', 'animate-[spin_60s_linear_infinite]')} />
          <div className={cn('hidden', 'md:block', 'absolute', 'top-1/2', 'left-1/2', '-translate-x-1/2', '-translate-y-1/2', 'w-140', 'h-140', 'rounded-full', 'border', 'border-foreground/5', 'animate-[spin_40s_linear_infinite_reverse]')} />
          <div className={cn('hidden', 'md:block', 'absolute', 'top-1/2', 'left-1/2', '-translate-x-1/2', '-translate-y-1/2', 'w-160', 'h-160', 'rounded-full', 'border', 'border-foreground/5', 'animate-[spin_20s_linear_infinite]')} />
          <div className={cn('hidden', 'md:block', 'absolute', 'top-1/2', 'left-1/2', '-translate-x-1/2', '-translate-y-1/2', 'w-180', 'h-180', 'rounded-full', 'border', 'border-foreground/5', 'animate-[spin_50s_linear_infinite_reverse]')} />

          {/* Orbiting Elements Desktop */}
          <div className={cn('hidden', 'md:block')}>
            <OrbitingNode Icon={Smartphone} delay={0} radius={240} duration={25} />
            <OrbitingNode Icon={Speaker} delay={-12} radius={280} duration={30} reverse />
            <OrbitingNode Icon={Laptop} delay={-5} radius={320} duration={35} />
            <OrbitingNode Icon={Headphones} delay={-20} radius={360} duration={40} reverse />
          </div>

          {/* Pulsing Rings for Mobile */}
          <div className={cn('md:hidden', 'absolute', 'top-1/2', 'left-1/2', '-translate-x-1/2', '-translate-y-1/2', 'w-75', 'h-75', 'rounded-full', 'border', 'border-foreground/10', 'border-dashed', 'animate-[spin_60s_linear_infinite]')} />
          <div className={cn('md:hidden', 'absolute', 'top-1/2', 'left-1/2', '-translate-x-1/2', '-translate-y-1/2', 'w-90', 'h-90', 'rounded-full', 'border', 'border-foreground/5', 'animate-[spin_40s_linear_infinite_reverse]')} />

          {/* Orbiting Elements Mobile */}
          <div className="md:hidden">
            <OrbitingNode Icon={Smartphone} delay={0} radius={150} duration={20} />
            <OrbitingNode Icon={Speaker} delay={-10} radius={180} duration={25} reverse />
          </div>

          {/* Central Glass Core */}
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", bounce: 0.5 }}
            className={cn('w-56', 'h-56', 'md:w-96', 'md:h-96', 'rounded-full', 'glass-panel', 'flex', 'flex-col', 'items-center', 'justify-center', 'p-6', 'md:p-8', 'text-center', 'relative', 'z-20', 'shadow-[0_20px_80px_rgba(0,0,0,0.15)]', 'overflow-hidden')}
          >
            {/* Subtle internal glow */}
            <div className={cn('absolute', 'inset-0', 'bg-linear-to-b', 'from-white/10', 'to-transparent', 'pointer-events-none')} />

             <form onSubmit={handleJoin} className={cn('absolute', 'inset-0', 'flex', 'flex-col', 'items-center', 'justify-center', 'z-10', 'w-full', 'px-6', 'md:px-14')}>
                <div className={cn('flex', 'flex-col', 'items-center', 'justify-center', 'w-full', '-mt-4', 'md:-mt-8')}>
                  <h2 className={cn('text-[10px]', 'md:text-sm', 'font-black', 'tracking-[0.3em]', 'uppercase', 'text-foreground/70', 'mb-3', 'md:mb-6')}>Enter Room Code</h2>
                  <input
                    type="tel"
                    maxLength={6}
                    value={joinCode}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="------"
                    autoComplete="off"
                    suppressHydrationWarning
                    className={cn('w-full', 'bg-transparent', 'border-b-2', 'border-foreground/40', 'focus:border-foreground', 'pb-2', 'text-center', 'text-3xl', 'md:text-4xl', 'font-black', 'tracking-[0.15em]', 'outline-none', 'transition-colors', 'placeholder:text-foreground/40', 'uppercase')}
                  />
                </div>
                
                <div className={cn('absolute', 'bottom-6', 'md:bottom-12', 'left-0', 'right-0', 'flex', 'justify-center')}>
                  <AnimatePresence>
                    {joinCode.length > 0 && (
                      <motion.button 
                        initial={{ opacity: 0, scale: 0.3, y: 10 }}
                        animate={{ 
                          opacity: 1, 
                          scale: 0.4 + (joinCode.length * 0.1), 
                          y: 0 
                        }}
                        exit={{ opacity: 0, scale: 0.3, y: 10 }}
                        transition={{ type: "spring", bounce: 0.6, duration: 0.6 }}
                        type="submit"
                        className={cn('w-12', 'h-12', 'md:w-16', 'md:h-16', 'rounded-full', 'bg-foreground', 'text-background', 'flex', 'items-center', 'justify-center', 'hover:bg-foreground/90', 'transition-colors', 'shadow-[0_0_20px_rgba(var(--foreground-rgb),0.3)]')}
                      >
                        <ArrowRight className={cn('w-5', 'h-5', 'md:w-7', 'md:h-7', 'ml-0.5', 'md:ml-1')} />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
             </form>
          </motion.div>
        </div>

        {/* Scroll Hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className={cn('absolute', 'bottom-8', 'left-1/2', '-translate-x-1/2', 'flex', 'flex-col', 'items-center', 'gap-2', 'pointer-events-none')}
        >
          <span className={cn('text-[10px]', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/40')}>Scroll to explore</span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            className={cn('w-5', 'h-8', 'rounded-full', 'border-2', 'border-foreground/10', 'flex', 'justify-center', 'pt-1')}
          >
            <div className={cn('w-1', 'h-2', 'rounded-full', 'bg-foreground/30')} />
          </motion.div>
        </motion.div>

      </section>

      {/* SECTION 2: How It Works */}
      <section className={cn('relative', 'z-10', 'w-full', 'min-h-dvh', 'snap-start', 'snap-always', 'shrink-0', 'flex', 'flex-col', 'items-center', 'justify-center', 'py-24')}>
        <div className={cn('max-w-7xl', 'mx-auto', 'px-4', 'sm:px-6', 'lg:px-8', 'w-full', 'text-center', 'flex', 'flex-col', 'items-center')}>
           <motion.span 
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ duration: 0.5, delay: 0.2 }}
             className={cn('px-4', 'py-1.5', 'rounded-full', 'border', 'border-foreground/10', 'bg-foreground/5', 'text-xs', 'font-bold', 'tracking-widest', 'uppercase', 'text-foreground/60', 'mb-8', 'inline-block')}
           >
             How it works
           </motion.span>
           <motion.h1 
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ duration: 0.5, delay: 0.3 }}
             className={cn('text-6xl', 'md:text-7xl', 'font-black', 'tracking-tighter', 'mb-8', 'text-foreground')}
           >
             ZERO SETUP. <br className="md:hidden" /> <span className="text-zinc-500">INFINITE SPEAKERS.</span>
           </motion.h1>
           <motion.p 
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             transition={{ duration: 0.5, delay: 0.4 }}
             className={cn('text-lg', 'md:text-xl', 'text-gray-500', 'max-w-2xl', 'leading-relaxed', 'mb-16')}
           >
             No bluetooth pairing, no tangled wires. Just open the link on any device with a browser, and our sub-millisecond sync engine automatically aligns the audio perfectly.
           </motion.p>
           
           <motion.div 
             initial="hidden"
             animate="visible"
             variants={{
               visible: { transition: { staggerChildren: 0.1, delayChildren: 0.5 } },
               hidden: {}
             }}
             onMouseLeave={() => setHoveredStep(0)}
             className={cn('flex', 'flex-col', 'md:flex-row', 'gap-6', 'md:gap-8', 'w-full', 'h-137.5', 'md:h-100')}
           >
             {[
               { icon: Play, title: "1. Create Room", desc: "Start a session and upload your favorite tracks instantly." },
               { icon: Users, title: "2. Invite Friends", desc: "Share your 6-digit code or QR code with anyone nearby." },
               { icon: Zap, title: "3. Auto-Sync", desc: "Devices connect and perfectly synchronize audio playback." }
             ].map((step, i) => {
               const isExpanded = hoveredStep === i;
               
               return (
                 <motion.div 
                   layout
                   key={i} 
                   variants={{
                     hidden: { opacity: 0, y: 40, scale: 0.9 },
                     visible: { opacity: 1, y: 0, scale: 1 }
                   }}
                   transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                   onMouseEnter={() => setHoveredStep(i)}
                   onClick={() => setHoveredStep(i)}
                   className={`glass-panel rounded-3xl relative overflow-hidden cursor-pointer border-foreground/10 flex flex-col md:flex-row transition-all duration-300 ${isExpanded ? 'h-87.5 md:h-full md:w-[60%] shadow-2xl' : 'h-17.5 md:h-full md:w-[20%] opacity-80 md:opacity-60 hover:opacity-100 hover:bg-foreground/5'}`}
                 >
                   
                   {/* Collapsed State Content */}
                   <AnimatePresence mode="popLayout">
                     {!isExpanded && (
                       <motion.div 
                         initial={{ opacity: 0 }}
                         animate={{ opacity: 1 }}
                         exit={{ opacity: 0 }}
                         transition={{ duration: 0.2 }}
                         className={cn('w-full', 'h-full', 'p-4', 'md:p-6', 'flex', 'flex-col', 'items-center', 'justify-start', 'md:justify-center', 'gap-4', 'text-left', 'md:text-center', 'z-20', 'absolute', 'inset-0')}
                       >
                         {/* Mobile Collapsed Layout */}
                         <div className={cn('md:hidden', 'flex', 'items-center', 'gap-4', 'px-2', 'w-full')}>
                           <div className={cn('w-10', 'h-10', 'rounded-full', 'bg-foreground/5', 'flex', 'items-center', 'justify-center', 'shrink-0')}>
                             <step.icon className={cn('w-5', 'h-5', 'text-foreground/60')} />
                           </div>
                           <span className={cn('text-foreground/80', 'font-bold', 'truncate')}>{step.title}</span>
                         </div>
                         {/* Desktop Collapsed Layout */}
                         <div className={cn('hidden', 'md:flex', 'flex-row', 'items-center', 'gap-4')}>
                           <step.icon className={cn('w-10', 'h-10', 'text-foreground/40')} />
                           <span className={cn('text-foreground/30', 'font-bold', 'tracking-widest')}>0{i + 1}</span>
                         </div>
                       </motion.div>
                     )}
                   </AnimatePresence>

                   {/* Expanded State Content */}
                   <AnimatePresence>
                     {isExpanded && (
                       <>
                         <motion.div 
                           initial={{ opacity: 0, x: -20 }}
                           animate={{ opacity: 1, x: 0 }}
                           exit={{ opacity: 0, x: -20 }}
                           transition={{ delay: 0.1, duration: 0.3 }}
                           className={cn('w-full', 'md:w-1/2', 'p-6', 'md:p-10', 'flex', 'flex-col', 'justify-center', 'items-start', 'text-left', 'z-20', 'h-1/2', 'md:h-full')}
                         >
                           <div className={cn('hidden', 'md:flex', 'w-16', 'h-16', 'rounded-full', 'bg-foreground/5', 'items-center', 'justify-center', 'mb-6')}>
                             <step.icon className={cn('w-8', 'h-8', 'text-foreground/80')} />
                           </div>
                           <h3 className={cn('text-xl', 'md:text-3xl', 'font-black', 'mb-2', 'md:mb-4')}>{step.title}</h3>
                           <p className={cn('text-foreground/50', 'leading-relaxed', 'text-xs', 'md:text-base')}>
                             {step.desc}
                           </p>
                         </motion.div>

                         <motion.div 
                           initial={{ opacity: 0, scale: 0.9 }}
                           animate={{ opacity: 1, scale: 1 }}
                           exit={{ opacity: 0, scale: 0.9 }}
                           transition={{ delay: 0.2, duration: 0.4 }}
                           className={cn('w-full', 'md:w-1/2', 'h-1/2', 'md:h-full', 'relative', 'flex', 'items-center', 'justify-center', 'z-10', 'bg-linear-to-b', 'md:bg-linear-to-r', 'from-transparent', 'to-foreground/5', 'border-t', 'md:border-t-0', 'md:border-l', 'border-foreground/5')}
                         >
                           {/* Graphic Overlays */}
                           <div className={cn('absolute', 'inset-0', 'bg-background/20', 'z-0')} />
                           
                           <div className={cn('relative', 'z-10')}>
                             {i === 0 && (
                               <div className={cn('relative', 'flex', 'items-center', 'justify-center')}>
                                 <motion.div animate={{ scale: [1, 2.5], opacity: [0.5, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }} className={cn('absolute', 'w-20', 'h-20', 'border', 'border-foreground/30', 'rounded-full')} />
                                 <motion.div animate={{ scale: [1, 2.5], opacity: [0.5, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 1 }} className={cn('absolute', 'w-20', 'h-20', 'border', 'border-foreground/30', 'rounded-full')} />
                                 <div className={cn('w-16', 'h-16', 'bg-foreground', 'text-background', 'rounded-full', 'flex', 'items-center', 'justify-center', 'shadow-[0_0_30px_rgba(var(--foreground-rgb),0.5)]')}>
                                   <Play className={cn('w-8', 'h-8', 'ml-1')} />
                                 </div>
                               </div>
                             )}
                             {i === 1 && (
                               <div className={cn('relative', 'w-32', 'h-32', 'bg-background/50', 'backdrop-blur-md', 'border', 'border-foreground/20', 'rounded-2xl', 'flex', 'items-center', 'justify-center', 'overflow-hidden', 'shadow-2xl')}>
                                 <QrCode className={cn('w-16', 'h-16', 'text-foreground/40')} />
                                 <motion.div 
                                   animate={{ top: ['-10%', '110%', '-10%'] }} 
                                   transition={{ duration: 3, repeat: Infinity, ease: "linear" }} 
                                   className={cn('absolute', 'left-0', 'right-0', 'h-0.5', 'bg-foreground', 'shadow-[0_0_15px_rgba(var(--foreground-rgb),1)]')} 
                                 />
                               </div>
                             )}
                             {i === 2 && (
                               <div className={cn('flex', 'items-center', 'justify-center', 'gap-3', 'h-24')}>
                                 {[...Array(5)].map((_, idx) => (
                                   <motion.div
                                     key={idx}
                                     animate={{ height: ['20%', '100%', '20%'] }}
                                     transition={{ duration: 0.8, repeat: Infinity, delay: idx * 0.15, ease: "easeInOut" }}
                                     className={cn('w-4', 'bg-foreground', 'rounded-full', 'shadow-[0_0_15px_rgba(var(--foreground-rgb),0.5)]')}
                                   />
                                 ))}
                               </div>
                             )}
                           </div>
                         </motion.div>
                       </>
                     )}
                   </AnimatePresence>
                 </motion.div>
               )
             })}
           </motion.div>
        </div>
      </section>

      {/* SECTION 3: GSAP Features Deep Dive */}
      <FeaturesExplanation />

      {/* SECTION 4: Footer CTA */}
      <section className={cn('relative', 'z-10', 'w-full', 'flex', 'flex-col', 'items-center', 'justify-between', 'px-6', 'py-24')}>
        

        {/* Contact Section */}
        <div id="contact" className={cn('max-w-7xl', 'mx-auto', 'px-4', 'sm:px-6', 'lg:px-8', 'w-full', 'mt-24', 'mb-12', 'flex', 'flex-col', 'gap-12')}>
           <div className="text-center">
             <h2 className={cn('text-4xl', 'md:text-5xl', 'font-black', 'tracking-tight', 'mb-4')}>Contact Us</h2>
             <p className={cn('text-foreground/50', 'font-medium', 'max-w-2xl', 'mx-auto')}>Have questions, feedback, or need support? We'd love to hear from you.</p>
           </div>
           
           <div className={cn('grid', 'grid-cols-1', 'md:grid-cols-2', 'gap-8')}>
             <div className={cn('glass-panel', 'p-8', 'md:p-12', 'rounded-[2.5rem]', 'border', 'border-foreground/10', 'flex', 'flex-col', 'justify-center', 'shadow-lg')}>
               <h3 className={cn('text-2xl', 'font-bold', 'mb-8')}>Get in touch</h3>
               <div className="space-y-6">
                 <div className={cn('flex', 'items-center', 'gap-4')}>
                   <div className={cn('w-12', 'h-12', 'rounded-full', 'bg-foreground/5', 'flex', 'items-center', 'justify-center', 'shrink-0')}>
                     <Mail className={cn('w-5', 'h-5', 'text-foreground/80')} />
                   </div>
                   <div>
                     <p className={cn('text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50', 'mb-1')}>Email</p>
                     <a href="mailto:support@syncbeats.app" className={cn('text-lg', 'font-bold', 'hover:opacity-80', 'transition-opacity')}>support@syncbeats.app</a>
                   </div>
                 </div>
                 <div className={cn('flex', 'items-center', 'gap-4')}>
                   <div className={cn('w-12', 'h-12', 'rounded-full', 'bg-foreground/5', 'flex', 'items-center', 'justify-center', 'shrink-0')}>
                     <MapPin className={cn('w-5', 'h-5', 'text-foreground/80')} />
                   </div>
                   <div>
                     <p className={cn('text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50', 'mb-1')}>Location</p>
                     <p className={cn('text-lg', 'font-bold')}>India</p>
                   </div>
                 </div>
               </div>
             </div>
             <div className={cn('glass-panel', 'p-8', 'md:p-12', 'rounded-[2.5rem]', 'border', 'border-foreground/10', 'flex', 'flex-col', 'gap-6', 'shadow-lg')}>
               <div>
                 <label htmlFor="name" className={cn('block', 'text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/60', 'mb-2')}>Name</label>
                  <input type="text" id="name" className={cn('w-full', 'bg-foreground/5', 'border', 'border-foreground/10', 'rounded-xl', 'px-4', 'py-3', 'text-foreground', 'outline-none', 'focus:border-foreground/30', 'focus:ring-1', 'focus:ring-foreground/30', 'transition-all', 'placeholder:text-foreground/40')} placeholder="Your name" />
               </div>
               <div>
                 <label htmlFor="email" className={cn('block', 'text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/60', 'mb-2')}>Email</label>
                  <input type="email" id="email" className={cn('w-full', 'bg-foreground/5', 'border', 'border-foreground/10', 'rounded-xl', 'px-4', 'py-3', 'text-foreground', 'outline-none', 'focus:border-foreground/30', 'focus:ring-1', 'focus:ring-foreground/30', 'transition-all', 'placeholder:text-foreground/40')} placeholder="your@email.com" />
               </div>
               <div>
                 <label htmlFor="message" className={cn('block', 'text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/60', 'mb-2')}>Message</label>
                  <textarea id="message" rows={4} className={cn('w-full', 'bg-foreground/5', 'border', 'border-foreground/10', 'rounded-xl', 'px-4', 'py-3', 'text-foreground', 'outline-none', 'focus:border-foreground/30', 'focus:ring-1', 'focus:ring-foreground/30', 'transition-all', 'resize-none', 'placeholder:text-foreground/40')} placeholder="How can we help?" />
               </div>
                <DynamicAuroraButton type="submit" className="w-full h-14 rounded-2xl gap-3 text-xs md:text-sm mt-2">
                  <Send className="w-4 h-4 text-zinc-950 fill-zinc-950" /> Send Message
                </DynamicAuroraButton>
             </div>
           </div>
        </div>

        {/* Footer */}
        <footer className={cn('max-w-7xl', 'mx-auto', 'px-4', 'sm:px-6', 'lg:px-8', 'w-full', 'flex', 'flex-col', 'md:flex-row', 'items-center', 'justify-between', 'pt-8', 'mt-6', 'md:mt-12', 'text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/40', 'border-t', 'border-foreground/5')}>
           <div className={cn('flex', 'items-center', 'gap-3', 'mb-4', 'md:mb-0')}>
             <Image src="/syncbeats-icon.svg" alt="Logo" width={20} height={20} className={cn('opacity-50', 'grayscale', 'md:block', 'hidden')} />
             SYNCBEATS © {new Date().getFullYear()}
           </div>
           <div className={cn('flex', 'items-center', 'gap-4', 'sm:gap-6')}>
             <Link href="/privacy-policy" className={cn('hover:text-foreground', 'transition-colors')}>Privacy</Link>
             <Link href="/terms-of-service" className={cn('hover:text-foreground', 'transition-colors')}>Terms</Link>
             <Link href="/cookie-settings" className={cn('hover:text-foreground', 'transition-colors')}>Cookies</Link>
             <Link href="#contact" className={cn('hover:text-foreground', 'transition-colors')}>Contact</Link>
             <div className={cn('flex', 'items-center', 'gap-3', 'ml-2', 'border-l', 'border-foreground/10', 'pl-4', 'sm:pl-6')}>
               <a href="https://github.com/smanikanta21" target="_blank" rel="noopener noreferrer" className={cn('hover:text-foreground', 'transition-colors')} title="GitHub">
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.02c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A4.8 4.8 0 0 0 8 18v4"></path></svg>
               </a>
               <a href="https://www.linkedin.com/in/siraparapu-shiva-sankar-mani-kanta-622a85323?utm_source=share_via&utm_content=profile&utm_medium=member_ios" target="_blank" rel="noopener noreferrer" className={cn('hover:text-foreground', 'transition-colors')} title="LinkedIn">
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
               </a>
             </div>
           </div>
        </footer>
      </section>

    </div>
    
  );
}

function OrbitingNode({ Icon, delay, radius, duration, reverse = false }: any) {
  return (
    <motion.div 
      className={cn('absolute', 'top-1/2', 'left-1/2', 'w-10', 'h-10', 'md:w-12', 'md:h-12', '-ml-5', '-mt-5', 'md:-ml-6', 'md:-mt-6', 'pointer-events-none')}
      animate={{ rotate: reverse ? -360 : 360 }}
      transition={{ duration, repeat: Infinity, ease: "linear", delay }}
    >
      <motion.div 
        className={cn('w-10', 'h-10', 'md:w-14', 'md:h-14', 'rounded-full', 'glass-panel', 'flex', 'items-center', 'justify-center', 'border', 'border-foreground/10', 'shadow-[0_10px_30px_rgba(0,0,0,0.1)]', 'relative')}
        style={{ y: -radius }}
        animate={{ rotate: reverse ? 360 : -360 }}
        transition={{ duration, repeat: Infinity, ease: "linear", delay }}
      >
        <Icon className={cn('w-4', 'h-4', 'md:w-6', 'md:h-6', 'text-foreground/60')} />
      </motion.div>
    </motion.div>
  );
}
