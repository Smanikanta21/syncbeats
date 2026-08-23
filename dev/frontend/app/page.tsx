"use client";

import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "framer-motion";
import { ArrowRight, Smartphone, Laptop, Speaker, Headphones, Radio, Mic2, Play, Users, Zap, Globe, Shield, QrCode, Mail, MapPin, Send, Clipboard, Camera } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "../components/ThemeToggle";
import { useState, useEffect, ChangeEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import Magnetic from "../components/Magnetic";
import { MouseGradient } from "../components/MouseGradient";
import { FeaturesExplanation } from "../components/FeaturesExplanation";
import { CircularJoinRing } from "../components/CircularJoinRing";
import { HowItWorksScroll } from "../components/HowItWorksScroll";

import { toast } from "sonner";
import { getSocket } from "../lib/socket";
import { roomsApi } from "../lib/api";
import { cn } from "@/lib/utils";
import { DynamicAuroraButton } from "../components/DynamicAuroraButton";
import { InstagramIcon } from "../components/InstagramFollowButton";

export default function LandingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [hoveredStep, setHoveredStep] = useState<number | null>(0);
  const [isRoomPlaying, setIsRoomPlaying] = useState(false);
  
  const [contactForm, setContactForm] = useState({ name: "", email: "", message: "" });
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name.trim() || !contactForm.email.trim() || !contactForm.message.trim()) {
      toast.error("Please fill in all fields before sending.");
      return;
    }
    setIsSubmittingContact(true);
    setTimeout(() => {
      toast.success("Thank you! Your message has been sent successfully.");
      setContactForm({ name: "", email: "", message: "" });
      setIsSubmittingContact(false);
    }, 600);
  };
  
  const { scrollY } = useScroll(); // Track window scroll natively

  useMotionValueEvent(scrollY, "change", (latest) => {
    // If scrolled past 80px, transition the nav
    if (latest > 80 && !isScrolled) setIsScrolled(true);
    else if (latest <= 80 && isScrolled) setIsScrolled(false);
  });

  // When user is logged in, check if their default room is playing a song to sync ambient background & beat visuals
  useEffect(() => {
    if (!user) {
      setIsRoomPlaying(false);
      return;
    }

    roomsApi.default()
      .then((res) => {
        if (!res?.roomId) return;
        return roomsApi.get(res.roomId);
      })
      .then((details) => {
        if (details?.live) {
          const isLivePlaying = Boolean(details.live.isPlaying && details.live.startEpoch != null);
          setIsRoomPlaying(isLivePlaying);
        } else {
          setIsRoomPlaying(false);
        }
      })
      .catch(() => {
        setIsRoomPlaying(false);
      });
  }, [user]);

  return (
    <div className={cn('w-full', 'bg-transparent', 'text-foreground', 'overflow-x-clip', 'font-sans', 'relative', 'selection:bg-foreground', 'selection:text-background', 'custom-scrollbar')}>
      
      {/* Dynamic Instant Ambient Background */}
      <MouseGradient />

      {/* Dynamic Snapping Navbar Wrapper */}
      <div 
        className={cn('fixed', 'left-0', 'right-0', 'z-50', 'flex', 'justify-center', 'pointer-events-none', 'px-3', 'sm:px-0')}
        style={{
          top: "max(0.75rem, env(safe-area-inset-top, 0px))",
        }}
      >
        <motion.header 
          initial={false}
          animate={{
            width: isScrolled ? "min(calc(100% - 24px), 1024px)" : "100%",
            paddingLeft: isScrolled ? "16px" : "20px",
            paddingRight: isScrolled ? "16px" : "20px",
            paddingTop: "10px",
            paddingBottom: "10px",
            borderRadius: isScrolled ? "9999px" : "0px",
          }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className={`pointer-events-auto flex items-center justify-between transition-all duration-300 ${isScrolled ? 'glass-panel shadow-xl' : 'bg-transparent border-transparent'}`}
        >
        <motion.div initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} className={cn('flex', 'items-center')}>
          <Link href="/" className={cn('text-lg', 'sm:text-xl', 'md:text-2xl', 'font-black', 'tracking-tighter', 'text-foreground', 'group', 'flex', 'items-center', 'gap-2.5')}>
            <Image src="/syncbeats-icon.svg" alt="SyncBeats Logo" width={isScrolled ? 26 : 32} height={isScrolled ? 26 : 32} priority className={cn('group-hover:scale-110', 'block', 'transition-all', 'duration-300', 'shrink-0', 'rounded-lg', 'overflow-hidden')} />
            <span>SYNC<span className={cn('text-zinc-500', 'transition-colors', 'group-hover:text-foreground')}>BEATS</span></span>
          </Link>
        </motion.div>
        
        <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} className={cn('flex', 'items-center', 'gap-2', 'sm:gap-3', 'md:gap-4')}>
          {user ? (
            <Magnetic>
              <DynamicAuroraButton href="/hub" className={`${isScrolled ? 'h-9 px-4 text-[11px] sm:text-xs' : 'h-11 px-6 text-xs md:text-sm'}`}>
                Launch Hub
              </DynamicAuroraButton>
            </Magnetic>
          ) : (
            <>
            <Link href="/login" className={`hidden sm:flex ${isScrolled ? 'h-9 px-3 text-xs' : 'h-11 px-4 sm:px-6 text-xs md:text-sm'} rounded-full items-center justify-center font-bold tracking-widest uppercase text-foreground/80 hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 border border-transparent transition-all duration-300`}>
              Login
            </Link>
            <Magnetic>
              <DynamicAuroraButton href="/login" className={`${isScrolled ? 'h-9 px-4 text-[11px] sm:text-xs' : 'h-11 px-6 text-xs md:text-sm'}`}>
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
      <section className={cn('relative', 'z-10', 'w-full', 'min-h-dvh', 'md:snap-start', 'md:snap-always', 'shrink-0', 'flex', 'flex-col', 'items-center', 'justify-center', 'px-4', 'pt-28', 'pb-16', 'md:py-24')}>
        
        {/* Massive Typography Behind */}
        <div className={cn('absolute', 'inset-0', 'flex', 'items-center', 'justify-center', 'pointer-events-none', 'opacity-[0.03]', 'dark:opacity-5', 'select-none', 'overflow-hidden')}>
          <h1 className={cn('text-[18vw]', 'md:text-[25vw]', 'font-black', 'tracking-tighter', 'leading-none', 'whitespace-nowrap', 'blur-[1px]')}>SPATIAL</h1>
        </div>

        {/* The Core Ring UI */}
        <CircularJoinRing className="mb-6 md:mb-10" />

        {/* Scroll Hint */}
        <div className="absolute bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none z-20">
          <span className={cn('text-[10px]', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/40')}>Scroll to explore</span>
          <div className="w-5 h-8 rounded-full border-2 border-foreground/15 flex justify-center pt-1 animate-bounce">
            <div className="w-1 h-2 rounded-full bg-foreground/30" />
          </div>
        </div>

      </section>

      {/* SECTION 2: How It Works (Lenis Scroll-Driven Interactive Animation) */}
      <HowItWorksScroll />

      {/* SECTION 3: GSAP Features Deep Dive */}
      <FeaturesExplanation />

      {/* SECTION 4: Footer CTA & Contact */}
      <section className={cn('relative', 'z-10', 'w-full', 'flex', 'flex-col', 'items-center', 'justify-between', 'px-4', 'sm:px-6', 'py-16', 'md:py-24')}>
        
        {/* Contact Section */}
        <div id="contact" className={cn('max-w-7xl', 'mx-auto', 'w-full', 'mt-12', 'md:mt-24', 'mb-12', 'flex', 'flex-col', 'gap-8', 'md:gap-12')}>
           <div className="text-center">
             <h2 className={cn('text-3xl', 'md:text-5xl', 'font-black', 'tracking-tight', 'mb-3', 'md:mb-4')}>Contact Us</h2>
             <p className={cn('text-foreground/50', 'font-medium', 'text-sm', 'md:text-base', 'max-w-2xl', 'mx-auto')}>Have questions, feedback, or need support? We'd love to hear from you.</p>
           </div>
           
           <div className={cn('grid', 'grid-cols-1', 'md:grid-cols-2', 'gap-6', 'md:gap-8')}>
             <div className={cn('glass-panel', 'p-6', 'md:p-12', 'rounded-3xl', 'md:rounded-[2.5rem]', 'border', 'border-foreground/10', 'flex', 'flex-col', 'justify-center', 'shadow-lg', 'hover:bg-background/20', 'dark:hover:bg-black/20', 'hover:backdrop-blur-3xl', 'hover:border-foreground/30', 'hover:shadow-2xl', 'transition-all', 'duration-500')}>
               <h3 className={cn('text-xl', 'md:text-2xl', 'font-bold', 'mb-6', 'md:mb-8')}>Get in touch</h3>
               <div className="space-y-6">
                 <div className={cn('flex', 'items-center', 'gap-4')}>
                   <div className={cn('w-10', 'h-10', 'md:w-12', 'md:h-12', 'rounded-full', 'bg-foreground/5', 'flex', 'items-center', 'justify-center', 'shrink-0')}>
                     <Mail className={cn('w-5', 'h-5', 'text-foreground/80')} />
                   </div>
                   <div>
                     <p className={cn('text-[10px]', 'md:text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50', 'mb-0.5')}>Email</p>
                     <a href="mailto:support@syncbeats.in" className={cn('text-base', 'md:text-lg', 'font-bold', 'hover:opacity-80', 'transition-opacity')}>support@syncbeats.in</a>
                   </div>
                 </div>
                 <div className={cn('flex', 'items-center', 'gap-4')}>
                   <div className={cn('w-10', 'h-10', 'md:w-12', 'md:h-12', 'rounded-full', 'bg-foreground/5', 'flex', 'items-center', 'justify-center', 'shrink-0')}>
                     <MapPin className={cn('w-5', 'h-5', 'text-foreground/80')} />
                   </div>
                   <div>
                     <p className={cn('text-[10px]', 'md:text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50', 'mb-0.5')}>Location</p>
                     <p className={cn('text-base', 'md:text-lg', 'font-bold')}>India</p>
                   </div>
                 </div>
                 <div className={cn('flex', 'items-center', 'gap-4')}>
                   <div className={cn('w-10', 'h-10', 'md:w-12', 'md:h-12', 'rounded-full', 'bg-foreground/5', 'flex', 'items-center', 'justify-center', 'shrink-0')}>
                     <InstagramIcon className={cn('w-5', 'h-5', 'text-foreground/80')} />
                   </div>
                   <div>
                     <p className={cn('text-[10px]', 'md:text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50', 'mb-0.5')}>Instagram</p>
                     <a href="https://www.instagram.com/syncbeats.in/" target="_blank" rel="noopener noreferrer" className={cn('text-base', 'md:text-lg', 'font-bold', 'hover:opacity-80', 'transition-opacity')}>@syncbeats.in</a>
                   </div>
                 </div>
               </div>
             </div>

             <form onSubmit={handleContactSubmit} className={cn('glass-panel', 'p-6', 'md:p-12', 'rounded-3xl', 'md:rounded-[2.5rem]', 'border', 'border-foreground/10', 'flex', 'flex-col', 'gap-4', 'md:gap-6', 'shadow-lg', 'hover:bg-background/20', 'dark:hover:bg-black/20', 'hover:backdrop-blur-3xl', 'hover:border-foreground/30', 'hover:shadow-2xl', 'transition-all', 'duration-500')}>
               <div>
                 <label htmlFor="name" className={cn('block', 'text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/60', 'mb-2')}>Name</label>
                  <input type="text" id="name" required value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} className={cn('w-full', 'bg-foreground/5', 'border', 'border-foreground/10', 'rounded-xl', 'px-4', 'py-3.5', 'text-foreground', 'text-base', 'outline-none', 'focus:border-foreground/30', 'focus:ring-1', 'focus:ring-foreground/30', 'transition-all', 'placeholder:text-foreground/40')} placeholder="Your name" />
               </div>
               <div>
                 <label htmlFor="email" className={cn('block', 'text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/60', 'mb-2')}>Email</label>
                  <input type="email" id="email" required value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} className={cn('w-full', 'bg-foreground/5', 'border', 'border-foreground/10', 'rounded-xl', 'px-4', 'py-3.5', 'text-foreground', 'text-base', 'outline-none', 'focus:border-foreground/30', 'focus:ring-1', 'focus:ring-foreground/30', 'transition-all', 'placeholder:text-foreground/40')} placeholder="your@email.com" />
               </div>
               <div>
                 <label htmlFor="message" className={cn('block', 'text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/60', 'mb-2')}>Message</label>
                  <textarea id="message" rows={4} required value={contactForm.message} onChange={e => setContactForm(f => ({ ...f, message: e.target.value }))} className={cn('w-full', 'bg-foreground/5', 'border', 'border-foreground/10', 'rounded-xl', 'px-4', 'py-3.5', 'text-foreground', 'text-base', 'outline-none', 'focus:border-foreground/30', 'focus:ring-1', 'focus:ring-foreground/30', 'transition-all', 'resize-none', 'placeholder:text-foreground/40')} placeholder="How can we help?" />
               </div>
                <DynamicAuroraButton type="submit" disabled={isSubmittingContact} className="w-full h-14 rounded-2xl gap-3 text-xs md:text-sm mt-2">
                  <Send className="w-4 h-4 text-foreground fill-foreground/80" /> {isSubmittingContact ? "Sending..." : "Send Message"}
                </DynamicAuroraButton>
             </form>
           </div>
        </div>

        {/* Footer */}
        <footer className={cn('max-w-7xl', 'mx-auto', 'px-4', 'sm:px-6', 'lg:px-8', 'w-full', 'flex', 'flex-col', 'md:flex-row', 'items-center', 'justify-between', 'pt-8', 'mt-6', 'md:mt-12', 'text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/75', 'border-t', 'border-foreground/5')}>
           <div className={cn('flex', 'items-center', 'gap-3', 'mb-4', 'md:mb-0')}>
             <Image src="/syncbeats-icon.svg" alt="Logo" width={20} height={20} className="opacity-50 grayscale block" />
             SYNCBEATS © {new Date().getFullYear()}
           </div>
           <div className={cn('flex', 'items-center', 'gap-4', 'sm:gap-6')}>
             <Link href="/privacy-policy" className={cn('hover:text-foreground', 'transition-colors')}>Privacy</Link>
             <Link href="/terms-of-service" className={cn('hover:text-foreground', 'transition-colors')}>Terms</Link>
             <Link href="/cookie-settings" className={cn('hover:text-foreground', 'transition-colors')}>Cookies</Link>
             <a
                href="#contact"
                onClick={(e) => {
                  e.preventDefault();
                  const el = document.getElementById("contact");
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth" });
                  } else {
                    router.push("/contact");
                  }
                }}
                className={cn('hover:text-foreground', 'transition-colors', 'cursor-pointer')}
              >
                Contact
              </a>
             <div className={cn('flex', 'items-center', 'gap-3', 'ml-2', 'border-l', 'border-foreground/10', 'pl-4', 'sm:pl-6')}>
               <a href="https://www.instagram.com/syncbeats.in/" target="_blank" rel="noopener noreferrer" className={cn('hover:text-foreground', 'transition-colors')} title="Instagram @syncbeats.in">
                 <InstagramIcon className="w-4 h-4" />
               </a>
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
