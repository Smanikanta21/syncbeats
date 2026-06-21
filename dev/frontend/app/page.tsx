"use client";

import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "framer-motion";
import { ArrowRight, Smartphone, Laptop, Speaker, Headphones, Radio, Mic2, Play, Users, Zap, Globe, Shield, QrCode, Mail, MapPin, Send } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "../components/ThemeToggle";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const AmbientBackground = dynamic(() => import("../components/AmbientBackground").then(mod => mod.AmbientBackground), { ssr: false });
const FeaturesExplanation = dynamic(() => import("../components/FeaturesExplanation").then(mod => mod.FeaturesExplanation), { ssr: false });
const MouseGradient = dynamic(() => import("../components/MouseGradient").then(mod => mod.MouseGradient), { ssr: false });

export default function LandingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isScrolled, setIsScrolled] = useState(false);
  const [hoveredStep, setHoveredStep] = useState<number | null>(0);
  
  const { scrollY } = useScroll(); // Track window scroll natively

  useMotionValueEvent(scrollY, "change", (latest) => {
    // If scrolled past 100px, transition the nav
    if (latest > 100 && !isScrolled) setIsScrolled(true);
    else if (latest <= 100 && isScrolled) setIsScrolled(false);
  });



  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.length > 3) router.push(`/room/${joinCode.toUpperCase()}`);
  };

  return (
    <div className="w-full bg-transparent text-foreground overflow-x-clip font-sans relative selection:bg-foreground selection:text-background custom-scrollbar">
      
      {/* Interactive Mouse Gradient Follower (Fixed) */}
      <MouseGradient />

      {/* Ambient Background Gradients for Continuity */}
      <AmbientBackground syncWithAudio={false} />

      {/* Dynamic Snapping Navbar Wrapper */}
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none pt-6">
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
        <motion.div initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} className="flex items-center">
          <Link href="/" className="text-xl md:text-2xl font-black tracking-tighter text-foreground group flex items-center gap-3">
            <Image src="/syncbeats-icon.svg" alt="SyncBeats Logo" width={isScrolled ? 28 : 36} height={isScrolled ? 28 : 36} className="group-hover:scale-110 md:block hidden transition-all duration-300" />
            <span>SYNC<span className="text-zinc-500 transition-colors group-hover:text-foreground">BEATS</span></span>
          </Link>
        </motion.div>
        
        <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} className="flex items-center gap-3 md:gap-4">
          {user ? (
            <Link href="/hub" className={`${isScrolled ? 'h-10 px-6' : 'h-12 px-8'} rounded-full glass-panel flex items-center justify-center text-sm font-bold tracking-widest uppercase hover:scale-105 transition-all`}>
              Launch Hub
            </Link>
          ) : (
            <>
            <Link href="/login" className={`hidden sm:flex ${isScrolled ? 'h-10 px-4' : 'h-12 px-6'} rounded-full items-center justify-center text-xs md:text-sm font-bold tracking-widest uppercase hover:bg-foreground/5 transition-all`}>
              Login
            </Link>
            <Link href="/login" className={`${isScrolled ? 'h-10 px-6' : 'h-12 px-8'} rounded-full bg-foreground text-background flex items-center justify-center text-xs md:text-sm font-bold tracking-widest uppercase hover:scale-105 active:scale-95 transition-all shadow-[0_10px_30px_rgba(0,0,0,0.3)]`}>
              Start Session
            </Link>
            </>
          )}
          <AnimatePresence>
            {isScrolled && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5, width: 0 }}
                animate={{ opacity: 1, scale: 1, width: "auto" }}
                exit={{ opacity: 0, scale: 0.5, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden flex rounded-full items-center"
              >
                <ThemeToggle />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        </motion.header>
      </div>

      {/* SECTION 1: Central Immersive Core */}
      <section className="relative z-10 w-full min-h-[100dvh] snap-start snap-always shrink-0 flex flex-col items-center justify-center px-4 pt-24 pb-10">
        
        {/* Massive Typography Behind */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] dark:opacity-5 select-none overflow-hidden">
          <h1 className="text-[25vw] font-black tracking-tighter leading-none whitespace-nowrap blur-[1px]">SPATIAL</h1>
        </div>

        {/* The Core Ring UI */}
        <div className="relative w-full h-[500px] md:h-[700px] flex flex-col items-center justify-center group mb-10">
          
          {/* Pulsing Rings for Desktop */}
          <div className="hidden md:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full border border-foreground/10 border-dashed animate-[spin_60s_linear_infinite]" />
          <div className="hidden md:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] rounded-full border border-foreground/5 animate-[spin_40s_linear_infinite_reverse]" />
          <div className="hidden md:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[640px] rounded-full border border-foreground/5 animate-[spin_20s_linear_infinite]" />
          <div className="hidden md:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[720px] rounded-full border border-foreground/5 animate-[spin_50s_linear_infinite_reverse]" />

          {/* Orbiting Elements Desktop */}
          <div className="hidden md:block">
            <OrbitingNode Icon={Smartphone} delay={0} radius={240} duration={25} />
            <OrbitingNode Icon={Speaker} delay={-12} radius={280} duration={30} reverse />
            <OrbitingNode Icon={Laptop} delay={-5} radius={320} duration={35} />
            <OrbitingNode Icon={Headphones} delay={-20} radius={360} duration={40} reverse />
          </div>

          {/* Pulsing Rings for Mobile */}
          <div className="md:hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full border border-foreground/10 border-dashed animate-[spin_60s_linear_infinite]" />
          <div className="md:hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] rounded-full border border-foreground/5 animate-[spin_40s_linear_infinite_reverse]" />

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
            className="w-56 h-56 md:w-96 md:h-96 rounded-full glass-panel flex flex-col items-center justify-center p-6 md:p-8 text-center relative z-20 shadow-[0_20px_80px_rgba(0,0,0,0.15)] overflow-hidden"
          >
            {/* Subtle internal glow */}
            <div className="absolute inset-0 bg-linear-to-b from-white/10 to-transparent pointer-events-none" />

             <form onSubmit={handleJoin} className="absolute inset-0 flex flex-col items-center justify-center z-10 w-full px-6 md:px-14">
                <div className="flex flex-col items-center justify-center w-full -mt-4 md:-mt-8">
                  <h2 className="text-[10px] md:text-sm font-black tracking-[0.3em] uppercase text-foreground/50 mb-3 md:mb-6">Enter Room Code</h2>
                  <input
                    type="tel"
                    maxLength={6}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="------"
                    className="w-full bg-transparent border-b-2 border-foreground/20 focus:border-foreground pb-2 text-center text-3xl md:text-4xl font-black tracking-[0.15em] outline-none transition-colors placeholder:text-foreground/10 uppercase"
                  />
                </div>
                
                <div className="absolute bottom-6 md:bottom-12 left-0 right-0 flex justify-center">
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
                        className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-foreground/90 transition-colors shadow-[0_0_20px_rgba(var(--foreground-rgb),0.3)]"
                      >
                        <ArrowRight className="w-5 h-5 md:w-7 md:h-7 ml-0.5 md:ml-1" />
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
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">Scroll to explore</span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            className="w-5 h-8 rounded-full border-2 border-foreground/10 flex justify-center pt-1"
          >
            <div className="w-1 h-2 rounded-full bg-foreground/30" />
          </motion.div>
        </motion.div>

      </section>

      {/* SECTION 2: How It Works */}
      <section className="relative z-10 w-full min-h-[100dvh] snap-start snap-always shrink-0 flex flex-col items-center justify-center px-6 pt-28 pb-10">
        <div className="max-w-5xl w-full text-center flex flex-col items-center">
           <motion.span 
             initial={{ opacity: 0, y: 20 }}
             whileInView={{ opacity: 1, y: 0 }}
             viewport={{ once: true }}
             className="px-4 py-1.5 rounded-full border border-foreground/10 bg-foreground/5 text-xs font-bold tracking-widest uppercase text-foreground/60 mb-8 inline-block"
           >
             How it works
           </motion.span>
           <motion.h2 
             initial={{ opacity: 0, y: 30 }}
             whileInView={{ opacity: 1, y: 0 }}
             viewport={{ once: true }}
             transition={{ delay: 0.1 }}
             className="text-4xl md:text-6xl font-black tracking-tighter mb-8 text-foreground"
           >
             ZERO SETUP. <br className="md:hidden" /> <span className="text-zinc-500">INFINITE SPEAKERS.</span>
           </motion.h2>
           <motion.p 
             initial={{ opacity: 0 }}
             whileInView={{ opacity: 1 }}
             viewport={{ once: true }}
             transition={{ delay: 0.2 }}
             className="text-lg md:text-xl text-foreground/60 max-w-2xl leading-relaxed mb-16"
           >
             No bluetooth pairing, no tangled wires. Just open the link on any device with a browser, and our sub-millisecond sync engine automatically aligns the audio perfectly.
           </motion.p>
           
           <motion.div 
             initial="hidden"
             whileInView="visible"
             viewport={{ once: true, margin: "-50px" }}
             variants={{
               visible: { transition: { staggerChildren: 0.2 } },
               hidden: {}
             }}
             onMouseLeave={() => setHoveredStep(0)}
             className="flex flex-col md:flex-row gap-3 md:gap-6 w-full h-[550px] md:h-[400px]"
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
                   className={`glass-panel rounded-3xl relative overflow-hidden cursor-pointer border-foreground/10 flex flex-col md:flex-row transition-all duration-300 ${isExpanded ? 'h-[350px] md:h-full md:w-[60%] shadow-2xl' : 'h-[70px] md:h-full md:w-[20%] opacity-80 md:opacity-60 hover:opacity-100 hover:bg-foreground/5'}`}
                 >
                   
                   {/* Collapsed State Content */}
                   <AnimatePresence mode="popLayout">
                     {!isExpanded && (
                       <motion.div 
                         initial={{ opacity: 0 }}
                         animate={{ opacity: 1 }}
                         exit={{ opacity: 0 }}
                         transition={{ duration: 0.2 }}
                         className="w-full h-full p-4 md:p-6 flex flex-col items-center justify-start md:justify-center gap-4 text-left md:text-center z-20 absolute inset-0"
                       >
                         {/* Mobile Collapsed Layout */}
                         <div className="md:hidden flex items-center gap-4 px-2 w-full">
                           <div className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center shrink-0">
                             <step.icon className="w-5 h-5 text-foreground/60" />
                           </div>
                           <span className="text-foreground/80 font-bold truncate">{step.title}</span>
                         </div>
                         {/* Desktop Collapsed Layout */}
                         <div className="hidden md:flex flex-row items-center gap-4">
                           <step.icon className="w-10 h-10 text-foreground/40" />
                           <span className="text-foreground/30 font-bold tracking-widest">0{i + 1}</span>
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
                           className="w-full md:w-1/2 p-6 md:p-10 flex flex-col justify-center items-start text-left z-20 h-1/2 md:h-full"
                         >
                           <div className="hidden md:flex w-16 h-16 rounded-full bg-foreground/5 items-center justify-center mb-6">
                             <step.icon className="w-8 h-8 text-foreground/80" />
                           </div>
                           <h3 className="text-xl md:text-3xl font-black mb-2 md:mb-4">{step.title}</h3>
                           <p className="text-foreground/50 leading-relaxed text-xs md:text-base">
                             {step.desc}
                           </p>
                         </motion.div>

                         <motion.div 
                           initial={{ opacity: 0, scale: 0.9 }}
                           animate={{ opacity: 1, scale: 1 }}
                           exit={{ opacity: 0, scale: 0.9 }}
                           transition={{ delay: 0.2, duration: 0.4 }}
                           className="w-full md:w-1/2 h-1/2 md:h-full relative flex items-center justify-center z-10 bg-gradient-to-b md:bg-gradient-to-r from-transparent to-foreground/5 border-t md:border-t-0 md:border-l border-foreground/5"
                         >
                           {/* Graphic Overlays */}
                           <div className="absolute inset-0 bg-background/20 z-0" />
                           
                           <div className="relative z-10">
                             {i === 0 && (
                               <div className="relative flex items-center justify-center">
                                 <motion.div animate={{ scale: [1, 2.5], opacity: [0.5, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }} className="absolute w-20 h-20 border border-foreground/30 rounded-full" />
                                 <motion.div animate={{ scale: [1, 2.5], opacity: [0.5, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 1 }} className="absolute w-20 h-20 border border-foreground/30 rounded-full" />
                                 <div className="w-16 h-16 bg-foreground text-background rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(var(--foreground-rgb),0.5)]">
                                   <Play className="w-8 h-8 ml-1" />
                                 </div>
                               </div>
                             )}
                             {i === 1 && (
                               <div className="relative w-32 h-32 bg-background/50 backdrop-blur-md border border-foreground/20 rounded-2xl flex items-center justify-center overflow-hidden shadow-2xl">
                                 <QrCode className="w-16 h-16 text-foreground/40" />
                                 <motion.div 
                                   animate={{ top: ['-10%', '110%', '-10%'] }} 
                                   transition={{ duration: 3, repeat: Infinity, ease: "linear" }} 
                                   className="absolute left-0 right-0 h-0.5 bg-foreground shadow-[0_0_15px_rgba(var(--foreground-rgb),1)]" 
                                 />
                               </div>
                             )}
                             {i === 2 && (
                               <div className="flex items-center justify-center gap-3 h-24">
                                 {[...Array(5)].map((_, idx) => (
                                   <motion.div
                                     key={idx}
                                     animate={{ height: ['20%', '100%', '20%'] }}
                                     transition={{ duration: 0.8, repeat: Infinity, delay: idx * 0.15, ease: "easeInOut" }}
                                     className="w-4 bg-foreground rounded-full shadow-[0_0_15px_rgba(var(--foreground-rgb),0.5)]"
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
      <section className="relative z-10 w-full flex flex-col items-center justify-between px-6 pt-28">
        <div className="flex-1 w-full flex flex-col items-center justify-center pb-10">
           <div className="mb-16"></div>

           <Link href="/login" className="h-14 px-10 rounded-full bg-foreground text-background flex items-center justify-center text-lg font-bold tracking-widest uppercase hover:scale-105 active:scale-95 transition-all shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
             Start Your Session Now
           </Link>
        </div>

        {/* Contact Section */}
        <div id="contact" className="w-full max-w-5xl mt-24 mb-12 flex flex-col gap-12">
           <div className="text-center">
             <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Contact Us</h2>
             <p className="text-foreground/50 font-medium max-w-2xl mx-auto">Have questions, feedback, or need support? We'd love to hear from you.</p>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="glass-panel p-8 md:p-12 rounded-[2.5rem] border border-foreground/10 flex flex-col justify-center shadow-lg">
               <h3 className="text-2xl font-bold mb-8">Get in touch</h3>
               <div className="space-y-6">
                 <div className="flex items-center gap-4">
                   <div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center shrink-0">
                     <Mail className="w-5 h-5 text-foreground/80" />
                   </div>
                   <div>
                     <p className="text-xs font-bold uppercase tracking-widest text-foreground/50 mb-1">Email</p>
                     <a href="mailto:support@syncbeats.app" className="text-lg font-bold hover:opacity-80 transition-opacity">support@syncbeats.app</a>
                   </div>
                 </div>
                 <div className="flex items-center gap-4">
                   <div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center shrink-0">
                     <MapPin className="w-5 h-5 text-foreground/80" />
                   </div>
                   <div>
                     <p className="text-xs font-bold uppercase tracking-widest text-foreground/50 mb-1">Location</p>
                     <p className="text-lg font-bold">India</p>
                   </div>
                 </div>
               </div>
             </div>
             <div className="glass-panel p-8 md:p-12 rounded-[2.5rem] border border-foreground/10 flex flex-col gap-6 shadow-lg">
               <div>
                 <label htmlFor="name" className="block text-xs font-bold uppercase tracking-widest text-foreground/60 mb-2">Name</label>
                 <input type="text" id="name" className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 outline-none focus:border-foreground/30 transition-colors" placeholder="Your name" />
               </div>
               <div>
                 <label htmlFor="email" className="block text-xs font-bold uppercase tracking-widest text-foreground/60 mb-2">Email</label>
                 <input type="email" id="email" className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 outline-none focus:border-foreground/30 transition-colors" placeholder="your@email.com" />
               </div>
               <div>
                 <label htmlFor="message" className="block text-xs font-bold uppercase tracking-widest text-foreground/60 mb-2">Message</label>
                 <textarea id="message" rows={4} className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 outline-none focus:border-foreground/30 transition-colors resize-none" placeholder="How can we help?" />
               </div>
               <button className="w-full h-14 bg-foreground text-background rounded-xl font-bold tracking-widest uppercase flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all mt-2">
                 <Send className="w-4 h-4" /> Send Message
               </button>
             </div>
           </div>
        </div>

        {/* Footer */}
        <footer className="w-full max-w-5xl flex flex-col md:flex-row items-center justify-between pt-8 mt-12 text-xs font-bold uppercase tracking-widest text-foreground/40 border-t border-foreground/5">
           <div className="flex items-center gap-3 mb-4 md:mb-0">
             <Image src="/syncbeats-icon.svg" alt="Logo" width={20} height={20} className="opacity-50 grayscale md:block hidden" />
             SYNCBEATS © {new Date().getFullYear()}
           </div>
           <div className="flex items-center gap-4 sm:gap-6">
             <Link href="/privacy-policy" className="hover:text-foreground transition-colors">Privacy</Link>
             <Link href="/terms-of-service" className="hover:text-foreground transition-colors">Terms</Link>
             <Link href="/cookie-settings" className="hover:text-foreground transition-colors">Cookies</Link>
             <Link href="#contact" className="hover:text-foreground transition-colors">Contact</Link>
             <div className="flex items-center gap-3 ml-2 border-l border-foreground/10 pl-4 sm:pl-6">
               <a href="https://github.com/smanikanta21" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors" title="GitHub">
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.02c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A4.8 4.8 0 0 0 8 18v4"></path></svg>
               </a>
               <a href="https://www.linkedin.com/in/siraparapu-shiva-sankar-mani-kanta-622a85323?utm_source=share_via&utm_content=profile&utm_medium=member_ios" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors" title="LinkedIn">
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
      className="absolute top-1/2 left-1/2 w-10 h-10 md:w-12 md:h-12 -ml-5 -mt-5 md:-ml-6 md:-mt-6 pointer-events-none"
      animate={{ rotate: reverse ? -360 : 360 }}
      transition={{ duration, repeat: Infinity, ease: "linear", delay }}
    >
      <motion.div 
        className="w-10 h-10 md:w-14 md:h-14 rounded-full glass-panel flex items-center justify-center border border-foreground/10 shadow-[0_10px_30px_rgba(0,0,0,0.1)] relative"
        style={{ y: -radius }}
        animate={{ rotate: reverse ? 360 : -360 }}
        transition={{ duration, repeat: Infinity, ease: "linear", delay }}
      >
        <Icon className="w-4 h-4 md:w-6 md:h-6 text-foreground/60" />
      </motion.div>
    </motion.div>
  );
}
