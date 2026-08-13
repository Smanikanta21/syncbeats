"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useScroll, useTransform, AnimatePresence, Variants } from "framer-motion";
import { Play, Users, Zap, QrCode, Smartphone, Laptop, Speaker, CheckCircle2, Music, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { JoinRoomModal } from "./JoinRoomModal";

export function HowItWorksScroll() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [scrollDirection, setScrollDirection] = useState<"down" | "up">("down");
  const [mounted, setMounted] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const prevStepRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  // Track active step and direction based on scroll progress
  useEffect(() => {
    if (!mounted) return;
    const unsubscribe = scrollYProgress.on("change", (latest) => {
      let newStep = 0;
      if (latest < 0.33) {
        newStep = 0;
      } else if (latest < 0.66) {
        newStep = 1;
      } else {
        newStep = 2;
      }

      if (newStep !== prevStepRef.current) {
        setScrollDirection(newStep > prevStepRef.current ? "down" : "up");
        prevStepRef.current = newStep;
        setActiveStep(newStep);
      }
    });
    return () => unsubscribe();
  }, [scrollYProgress, mounted]);

  const progressBarWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  const scrollToStep = (index: number) => {
    if (!containerRef.current) return;
    setScrollDirection(index > activeStep ? "down" : "up");
    prevStepRef.current = index;
    setActiveStep(index);

    const rect = containerRef.current.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const targetY = scrollTop + rect.top + (rect.height / 3) * index;
    
    window.scrollTo({
      top: targetY,
      behavior: "smooth"
    });
  };

  const steps = [
    {
      step: "01",
      title: "Create Room",
      subtitle: "Instant Session",
      desc: "Start a session in one click. Upload audio files or stream live — no login required.",
      icon: Play,
    },
    {
      step: "02",
      title: "Invite Friends",
      subtitle: "Universal Link",
      desc: "Share your 6-digit room code or scan the QR code with any nearby phone, tablet, or laptop.",
      icon: Users,
    },
    {
      step: "03",
      title: "Auto-Sync",
      subtitle: "Sub-Millisecond Engine",
      desc: "Devices connect automatically and synchronize playback with microsecond precision.",
      icon: Zap,
    }
  ];

  // Dynamic Direction-Aware Semi-Circular Arc Trajectory Variants (Desktop)
  const arcCardVariants: Variants = {
    initial: (dir: "down" | "up") => ({ 
      opacity: 0, 
      x: dir === "down" ? 160 : -160, 
      y: dir === "down" ? 50 : -50, 
      rotate: dir === "down" ? 12 : -12, 
      scale: 0.88 
    }),
    animate: { 
      opacity: 1, 
      x: 0, 
      y: 0, 
      rotate: 0, 
      scale: 1,
      transition: { 
        type: "spring" as const, 
        stiffness: 170, 
        damping: 22,
        mass: 0.8
      } 
    },
    exit: (dir: "down" | "up") => ({ 
      opacity: 0, 
      x: dir === "down" ? -160 : 160, 
      y: dir === "down" ? -50 : 50, 
      rotate: dir === "down" ? -12 : 12, 
      scale: 0.88,
      transition: { 
        duration: 0.35, 
        ease: "easeInOut" 
      } 
    })
  };

  // Dynamic Direction-Aware Semi-Circular Arc Trajectory Variants (Mobile Phone Card)
  const mobilePhoneArcVariants: Variants = {
    initial: (dir: "down" | "up") => ({ 
      opacity: 0, 
      x: dir === "down" ? 120 : -120, 
      y: dir === "down" ? 40 : -40, 
      rotate: dir === "down" ? 10 : -10, 
      scale: 0.85 
    }),
    animate: { 
      opacity: 1, 
      x: 0, 
      y: 0, 
      rotate: 0, 
      scale: 1,
      transition: { 
        type: "spring" as const, 
        stiffness: 180, 
        damping: 24,
        mass: 0.8
      } 
    },
    exit: (dir: "down" | "up") => ({ 
      opacity: 0, 
      x: dir === "down" ? -120 : 120, 
      y: dir === "down" ? -40 : 40, 
      rotate: dir === "down" ? -10 : 10, 
      scale: 0.85,
      transition: { 
        duration: 0.3, 
        ease: "easeInOut" 
      } 
    })
  };

  const textArcVariants: Variants = {
    initial: (dir: "down" | "up") => ({ 
      opacity: 0, 
      x: dir === "down" ? 60 : -60, 
      y: dir === "down" ? 20 : -20, 
      rotate: dir === "down" ? 4 : -4 
    }),
    animate: { 
      opacity: 1, 
      x: 0, 
      y: 0, 
      rotate: 0,
      transition: { 
        type: "spring" as const, 
        stiffness: 190, 
        damping: 24 
      } 
    },
    exit: (dir: "down" | "up") => ({ 
      opacity: 0, 
      x: dir === "down" ? -60 : 60, 
      y: dir === "down" ? -20 : 20, 
      rotate: dir === "down" ? -4 : 4,
      transition: { 
        duration: 0.3, 
        ease: "easeInOut" 
      } 
    })
  };

  return (
    <div ref={containerRef} className="relative w-full h-[280vh] select-none z-10">
      
      {/* Join Room Modal Triggered directly on mobile phone interaction */}
      <JoinRoomModal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)} />

      {/* Sticky Fullscreen Viewport for both Mobile and Desktop */}
      <div className="sticky top-0 h-screen w-full flex flex-col items-center justify-between py-6 md:py-10 px-4 sm:px-8 lg:px-16 overflow-hidden">
        
        {/* Section Title Header */}
        <div className="text-center flex flex-col items-center max-w-3xl z-20 mt-2 md:mt-4 shrink-0">
          <span className="px-3.5 py-1 rounded-full border border-foreground/10 bg-foreground/5 text-[10px] sm:text-[11px] font-bold tracking-widest uppercase text-foreground/60 mb-2 md:mb-3 inline-block">
            How It Works
          </span>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground">
            ZERO SETUP. <span className="text-foreground/40">INFINITE SPEAKERS.</span>
          </h2>
        </div>

        {/* Step Indicator Navigation Tabs */}
        <div className="w-full max-w-sm sm:max-w-xl z-20 my-2 md:my-4 shrink-0">
          <div className="relative flex items-center justify-between p-1 sm:p-1.5 rounded-2xl glass-panel border border-foreground/15 bg-background/50 backdrop-blur-xl">
            {/* Animated Progress Line Fill */}
            <motion.div 
              className="absolute left-1 sm:left-1.5 top-1 sm:top-1.5 bottom-1 sm:bottom-1.5 bg-foreground/10 rounded-xl pointer-events-none"
              style={{
                width: "calc((100% - 8px) / 3)",
                x: `${activeStep * 100}%`
              }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
            />

            {steps.map((s, idx) => (
              <button
                key={idx}
                onClick={() => scrollToStep(idx)}
                className={cn(
                  "relative z-10 flex-1 py-2 sm:py-2.5 px-2 sm:px-3 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer",
                  activeStep === idx ? "text-foreground" : "text-foreground/40 hover:text-foreground/70"
                )}
              >
                <span className="font-mono text-[9px] sm:text-[10px] opacity-60">{s.step}</span>
                <span className="tracking-wide">{s.title}</span>
              </button>
            ))}
          </div>

          {/* Top Progress Bar matching dynamic accent color */}
          <div className="w-full h-1 bg-foreground/10 rounded-full mt-2 sm:mt-3 overflow-hidden">
            <motion.div 
              className="h-full transition-all duration-700" 
              style={{ width: progressBarWidth, background: "var(--accent-color, rgb(52, 211, 153))" }} 
            />
          </div>
        </div>

        {/* ========================================================================= */}
        {/* DESKTOP VIEW: Horizontal 2-Column Showcase (md:flex)                      */}
        {/* ========================================================================= */}
        <div className="hidden md:flex w-full max-w-6xl flex-1 flex-row items-center justify-center gap-12 relative z-20 min-h-0">
          
          {/* Left Column: Step Description (Arc Motion) */}
          <div className="w-5/12 text-left flex flex-col justify-center min-h-[220px]">
            <div className="relative w-full">
              <AnimatePresence mode="wait" custom={scrollDirection} initial={false}>
                <motion.div
                  key={activeStep}
                  custom={scrollDirection}
                  variants={textArcVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="space-y-4"
                >
                  <div 
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors duration-700"
                    style={{ 
                      color: "var(--accent-color, rgb(52, 211, 153))", 
                      backgroundColor: "var(--accent-glow, rgba(52, 211, 153, 0.15))", 
                      borderColor: "var(--accent-border, rgba(52, 211, 153, 0.3))",
                      borderWidth: "1px"
                    }}
                  >
                    <span>Step {steps[activeStep].step}</span>
                    <span>•</span>
                    <span>{steps[activeStep].subtitle}</span>
                  </div>

                  <h3 className="text-4xl lg:text-5xl font-black text-foreground tracking-tight">
                    {steps[activeStep].title}
                  </h3>

                  <p className="text-foreground/70 text-lg leading-relaxed max-w-md">
                    {steps[activeStep].desc}
                  </p>

                  <div className="pt-2 flex items-center gap-3 text-xs font-medium text-foreground/50">
                    <CheckCircle2 className="w-4 h-4 shrink-0 transition-colors duration-700" style={{ color: "var(--accent-color, rgb(52, 211, 153))" }} />
                    <span>Works on iOS, Android, macOS, Windows & Linux</span>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Right Column: Desktop-Shaped Horizontal Glass Card */}
          <div className="w-7/12 h-96 relative rounded-3xl glass-panel border border-foreground/15 overflow-hidden flex items-center justify-center p-6 shadow-2xl hover:bg-background/20 dark:hover:bg-black/20 hover:backdrop-blur-3xl hover:border-foreground/30 transition-all duration-500">
            <AnimatePresence mode="wait" custom={scrollDirection}>
              {activeStep === 0 && (
                <motion.div 
                  key="desktop-step0"
                  custom={scrollDirection}
                  variants={arcCardVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-foreground/5 via-transparent to-foreground/5"
                >
                  <div className="relative flex items-center justify-center">
                    <motion.div 
                      animate={{ scale: [1, 1.8, 2.4], opacity: [0.6, 0.3, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
                      className="absolute w-32 h-32 border rounded-full transition-colors duration-700"
                      style={{ borderColor: "var(--accent-border, rgba(52, 211, 153, 0.4))" }}
                    />
                    <motion.div 
                      animate={{ scale: [1, 1.4, 2], opacity: [0.8, 0.4, 0] }}
                      transition={{ duration: 3, repeat: Infinity, delay: 0.5, ease: "easeOut" }}
                      className="absolute w-32 h-32 border rounded-full transition-colors duration-700"
                      style={{ borderColor: "var(--accent-border, rgba(52, 211, 153, 0.6))" }}
                    />
                    
                    <div 
                      className="w-28 h-28 rounded-full bg-foreground text-background flex items-center justify-center z-10 relative transition-all duration-700"
                      style={{ boxShadow: "0 0 50px var(--accent-glow, rgba(52, 211, 153, 0.35))" }}
                    >
                      <Music className="w-12 h-12 text-background animate-pulse" />
                    </div>
                  </div>

                  <div className="mt-6 px-4 py-2 rounded-xl bg-background/80 backdrop-blur-md border border-foreground/15 text-xs font-mono font-bold flex items-center gap-2 shadow-lg z-10">
                    <span className="w-2 h-2 rounded-full animate-ping transition-colors duration-700" style={{ background: "var(--accent-color, rgb(52, 211, 153))" }} />
                    <span>ROOM CREATED • READY FOR STREAMING</span>
                  </div>
                </motion.div>
              )}

              {activeStep === 1 && (
                <motion.div 
                  key="desktop-step1"
                  custom={scrollDirection}
                  variants={arcCardVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-foreground/5 via-transparent to-foreground/5"
                >
                  <div className="flex flex-row items-center gap-8 z-10">
                    <div className="relative w-36 h-36 bg-background/80 backdrop-blur-xl border border-foreground/20 rounded-2xl flex items-center justify-center overflow-hidden shadow-2xl p-3">
                      <QrCode className="w-full h-full text-foreground/80" />
                      <motion.div 
                        animate={{ top: ["-10%", "110%", "-10%"] }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
                        className="absolute left-0 right-0 h-1 transition-colors duration-700"
                        style={{ background: "var(--accent-color, rgb(52, 211, 153))", boxShadow: "0 0 15px var(--accent-color, rgb(52, 211, 153))" }}
                      />
                    </div>

                    <div className="flex flex-col items-start gap-2">
                      <span className="text-[10px] font-mono font-bold tracking-widest text-foreground/50 uppercase">Room Passcode</span>
                      <div className="px-6 py-3.5 rounded-2xl bg-foreground/10 border border-foreground/20 backdrop-blur-md flex items-center gap-2 text-3xl font-black font-mono tracking-widest text-foreground shadow-lg">
                        <span>9</span><span>4</span><span>8</span><span>2</span><span>1</span><span>0</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-semibold mt-1 transition-colors duration-700" style={{ color: "var(--accent-color, rgb(52, 211, 153))" }}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Scan or share to join instant hub</span>
                      </div>
                    </div>
                  </div>

                  <div className="absolute inset-x-8 bottom-6 flex items-center justify-around opacity-60">
                    <div className="p-2 px-3 rounded-xl bg-background/60 border border-foreground/10 flex items-center gap-1.5 text-[11px] font-bold">
                      <Smartphone className="w-4 h-4" /> Mobile
                    </div>
                    <div className="p-2 px-3 rounded-xl bg-background/60 border border-foreground/10 flex items-center gap-1.5 text-[11px] font-bold">
                      <Laptop className="w-4 h-4" /> Laptop
                    </div>
                    <div className="p-2 px-3 rounded-xl bg-background/60 border border-foreground/10 flex items-center gap-1.5 text-[11px] font-bold">
                      <Speaker className="w-4 h-4" /> Speaker
                    </div>
                  </div>
                </motion.div>
              )}

              {activeStep === 2 && (
                <motion.div 
                  key="desktop-step2"
                  custom={scrollDirection}
                  variants={arcCardVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-foreground/5 via-transparent to-foreground/5"
                >
                  <div className="flex items-end justify-center gap-3 h-36 mb-6">
                    {[40, 75, 55, 95, 60, 85, 45, 90, 70, 50, 80, 65].map((h, i) => (
                      <motion.div
                        key={i}
                        animate={{ height: [`${h * 0.3}%`, `${h}%`, `${h * 0.3}%`] }}
                        transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" }}
                        className="w-3 rounded-full transition-colors duration-700"
                        style={{ background: "var(--accent-color, rgb(52, 211, 153))", boxShadow: "0 0 12px var(--accent-glow, rgba(52, 211, 153, 0.5))" }}
                      />
                    ))}
                  </div>

                  <div className="px-5 py-2.5 rounded-full bg-background/90 backdrop-blur-xl border border-foreground/15 text-xs font-mono font-bold text-foreground flex items-center gap-3 shadow-xl">
                    <span className="w-2.5 h-2.5 rounded-full animate-ping transition-colors duration-700" style={{ background: "var(--accent-color, rgb(52, 211, 153))" }} />
                    <span className="transition-colors duration-700" style={{ color: "var(--accent-color, rgb(52, 211, 153))" }}>SYNC ENGINE ACTIVE</span>
                    <span className="text-foreground/30">•</span>
                    <span>0.1ms LATENCY</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* MOBILE VIEW: Vertical Portrait Mobile-Shaped Phone Card (md:hidden)       */}
        {/* ========================================================================= */}
        <div className="md:hidden w-full flex-1 flex flex-col items-center justify-between relative z-20 min-h-0 py-2">
          
          {/* Compact Step Text Header */}
          <div className="w-full text-center shrink-0 min-h-[95px] flex flex-col justify-center items-center px-2">
            <AnimatePresence mode="wait" custom={scrollDirection} initial={false}>
              <motion.div
                key={activeStep}
                custom={scrollDirection}
                variants={textArcVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="space-y-1.5"
              >
                <div 
                  className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors duration-700"
                  style={{ 
                    color: "var(--accent-color, rgb(52, 211, 153))", 
                    backgroundColor: "var(--accent-glow, rgba(52, 211, 153, 0.15))", 
                    borderColor: "var(--accent-border, rgba(52, 211, 153, 0.3))",
                    borderWidth: "1px"
                  }}
                >
                  <span>Step {steps[activeStep].step}</span>
                  <span>•</span>
                  <span>{steps[activeStep].subtitle}</span>
                </div>

                <h3 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                  {steps[activeStep].title}
                </h3>

                <p className="text-foreground/70 text-xs sm:text-sm leading-relaxed max-w-xs mx-auto">
                  {steps[activeStep].desc}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Portrait Mobile-Shaped Smartphone Mockup Card Showcase (Clickable to open JoinRoomModal) */}
          <div 
            onClick={() => setIsJoinModalOpen(true)}
            className="w-[300px] xs:w-[330px] sm:w-[360px] h-[370px] xs:h-[410px] sm:h-[440px] rounded-[42px] glass-panel border-2 border-foreground/20 shadow-2xl relative overflow-hidden flex items-center justify-center p-5 my-auto cursor-pointer group active:scale-98 hover:bg-background/20 dark:hover:bg-black/20 hover:backdrop-blur-3xl hover:border-foreground/40 transition-all duration-500"
          >
            {/* Top Phone Speaker Pill Notch */}
            <div className="w-20 h-3.5 rounded-full bg-foreground/20 absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none" />

            <AnimatePresence mode="wait" custom={scrollDirection}>
              {activeStep === 0 && (
                <motion.div 
                  key="mobile-step0"
                  custom={scrollDirection}
                  variants={mobilePhoneArcVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-foreground/5 via-transparent to-foreground/5 space-y-4"
                >
                  <div className="relative flex items-center justify-center">
                    <motion.div 
                      animate={{ scale: [1, 1.7, 2.3], opacity: [0.6, 0.3, 0] }}
                      transition={{ duration: 2.8, repeat: Infinity, ease: "easeOut" }}
                      className="absolute w-28 h-28 border rounded-full transition-colors duration-700"
                      style={{ borderColor: "var(--accent-border, rgba(52, 211, 153, 0.4))" }}
                    />
                    <div 
                      className="w-22 h-22 rounded-full bg-foreground text-background flex items-center justify-center z-10 relative transition-all duration-700 group-hover:scale-110"
                      style={{ boxShadow: "0 0 45px var(--accent-glow, rgba(52, 211, 153, 0.35))" }}
                    >
                      <Music className="w-9 h-9 text-background animate-pulse" />
                    </div>
                  </div>

                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsJoinModalOpen(true); }}
                    className="px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest text-white shadow-xl flex items-center gap-2 transition-transform active:scale-95 cursor-pointer z-20 pointer-events-auto mt-2"
                    style={{ background: "var(--accent-gradient, linear-gradient(135deg, #10b981 0%, #14b8a6 100%))" }}
                  >
                    <ArrowRight className="w-4 h-4 text-white" />
                    <span>ENTER CODE TO JOIN</span>
                  </button>
                </motion.div>
              )}

              {activeStep === 1 && (
                <motion.div 
                  key="mobile-step1"
                  custom={scrollDirection}
                  variants={mobilePhoneArcVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-foreground/5 via-transparent to-foreground/5 space-y-4"
                >
                  <div className="relative w-24 h-24 sm:w-28 sm:h-28 bg-background/80 backdrop-blur-xl border border-foreground/20 rounded-2xl flex items-center justify-center overflow-hidden shadow-2xl p-3">
                    <QrCode className="w-full h-full text-foreground/80" />
                    <motion.div 
                      animate={{ top: ["-10%", "110%", "-10%"] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
                      className="absolute left-0 right-0 h-1 transition-colors duration-700"
                      style={{ background: "var(--accent-color, rgb(52, 211, 153))", boxShadow: "0 0 15px var(--accent-color, rgb(52, 211, 153))" }}
                    />
                  </div>

                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsJoinModalOpen(true); }}
                    className="px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest text-white shadow-xl flex items-center gap-2 transition-transform active:scale-95 cursor-pointer z-20 pointer-events-auto"
                    style={{ background: "var(--accent-gradient, linear-gradient(135deg, #10b981 0%, #14b8a6 100%))" }}
                  >
                    <ArrowRight className="w-4 h-4 text-white" />
                    <span>ENTER CODE TO JOIN</span>
                  </button>
                </motion.div>
              )}

              {activeStep === 2 && (
                <motion.div 
                  key="mobile-step2"
                  custom={scrollDirection}
                  variants={mobilePhoneArcVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-foreground/5 via-transparent to-foreground/5 space-y-5"
                >
                  <div className="flex items-end justify-center gap-2 h-24 sm:h-28">
                    {[40, 75, 55, 95, 60, 85, 45, 90, 65, 80].map((h, i) => (
                      <motion.div
                        key={i}
                        animate={{ height: [`${h * 0.3}%`, `${h}%`, `${h * 0.3}%`] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.09, ease: "easeInOut" }}
                        className="w-2.5 rounded-full transition-colors duration-700"
                        style={{ background: "var(--accent-color, rgb(52, 211, 153))", boxShadow: "0 0 10px var(--accent-glow, rgba(52, 211, 153, 0.5))" }}
                      />
                    ))}
                  </div>

                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsJoinModalOpen(true); }}
                    className="px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest text-white shadow-xl flex items-center gap-2 transition-transform active:scale-95 cursor-pointer z-20 pointer-events-auto"
                    style={{ background: "var(--accent-gradient, linear-gradient(135deg, #10b981 0%, #14b8a6 100%))" }}
                  >
                    <ArrowRight className="w-4 h-4 text-white" />
                    <span>TAP TO JOIN ROOM</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>

        {/* Scroll Instruction Hint */}
        <div className="text-[9px] sm:text-[10px] font-mono font-bold tracking-widest text-foreground/30 uppercase z-20 shrink-0 mt-1">
          Scroll to advance steps
        </div>

      </div>
    </div>
  );
}
