"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Smartphone, Radio, Settings2, Share2, Play, Zap, Globe, Shield } from "lucide-react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

const features = [
  {
    id: "island",
    title: "The Dynamic Island",
    description: "Your control center. Access playback controls, network stats, search YouTube, and manage incoming requests seamlessly from anywhere in the room.",
    icon: Smartphone,
    color: "from-cyan-500/50 via-blue-500/40 to-purple-600/45",
    borderHover: "group-hover:border-cyan-500/40 group-hover:shadow-[0_0_60px_-15px_rgba(6,182,212,0.35)]",
    accent: "group-hover:text-cyan-400 group-hover:bg-cyan-500/10 group-hover:border-cyan-500/30",
    buttonHover: "group-hover:bg-cyan-400 group-hover:text-zinc-950 group-hover:border-cyan-300 group-hover:shadow-[0_0_25px_rgba(34,211,238,0.8)]",
  },
  {
    id: "sync",
    title: "Custom Sync Correction",
    description: "Bluetooth headphones introduce hidden delays. Our engine auto-detects most hardware latency, but the Custom Sync Correction slider lets you dial in the perfect offset manually.",
    icon: Settings2,
    color: "from-emerald-400/50 via-teal-500/40 to-green-500/45",
    borderHover: "group-hover:border-emerald-500/40 group-hover:shadow-[0_0_60px_-15px_rgba(16,185,129,0.35)]",
    accent: "group-hover:text-emerald-400 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/30",
    buttonHover: "group-hover:bg-emerald-400 group-hover:text-zinc-950 group-hover:border-emerald-300 group-hover:shadow-[0_0_25px_rgba(52,211,153,0.8)]",
  },
  {
    id: "spatial",
    title: "Spatial Audio Routing",
    description: "Turn 5 phones into a surround sound system. In the Devices panel, drag a participant to the Left or Right to isolate their audio output channel.",
    icon: Radio,
    color: "from-amber-400/50 via-orange-500/40 to-red-500/45",
    borderHover: "group-hover:border-orange-500/40 group-hover:shadow-[0_0_60px_-15px_rgba(249,115,22,0.35)]",
    accent: "group-hover:text-orange-400 group-hover:bg-orange-500/10 group-hover:border-orange-500/30",
    buttonHover: "group-hover:bg-orange-400 group-hover:text-zinc-950 group-hover:border-orange-300 group-hover:shadow-[0_0_25px_rgba(251,146,60,0.8)]",
  },
  {
    id: "p2p",
    title: "WebTorrent P2P Sharing",
    description: "Upload local tracks without waiting for slow servers. Our WebRTC integration directly shares chunks of your audio file with everyone else in the room instantly.",
    icon: Share2,
    color: "from-purple-500/50 via-indigo-500/40 to-pink-500/45",
    borderHover: "group-hover:border-purple-500/40 group-hover:shadow-[0_0_60px_-15px_rgba(168,85,247,0.35)]",
    accent: "group-hover:text-purple-400 group-hover:bg-purple-500/10 group-hover:border-purple-500/30",
    buttonHover: "group-hover:bg-purple-400 group-hover:text-zinc-950 group-hover:border-purple-300 group-hover:shadow-[0_0_25px_rgba(192,132,252,0.8)]",
  },
  {
    id: "precision",
    title: "Sub-millisecond Precision",
    description: "Client-side predictive offset ensures audio frames align flawlessly across all connected devices.",
    icon: Zap,
    color: "from-yellow-400/50 via-amber-500/40 to-emerald-500/45",
    borderHover: "group-hover:border-amber-500/40 group-hover:shadow-[0_0_60px_-15px_rgba(245,158,11,0.35)]",
    accent: "group-hover:text-amber-400 group-hover:bg-amber-500/10 group-hover:border-amber-500/30",
    buttonHover: "group-hover:bg-amber-400 group-hover:text-zinc-950 group-hover:border-amber-300 group-hover:shadow-[0_0_25px_rgba(251,191,36,0.8)]",
  },
  {
    id: "native",
    title: "Browser Native",
    description: "Works on iOS, Android, macOS, and Windows directly in the browser.",
    icon: Globe,
    color: "from-sky-400/50 via-blue-500/40 to-cyan-500/45",
    borderHover: "group-hover:border-sky-500/40 group-hover:shadow-[0_0_60px_-15px_rgba(14,165,233,0.35)]",
    accent: "group-hover:text-sky-400 group-hover:bg-sky-500/10 group-hover:border-sky-500/30",
    buttonHover: "group-hover:bg-sky-400 group-hover:text-zinc-950 group-hover:border-sky-300 group-hover:shadow-[0_0_25px_rgba(56,189,248,0.8)]",
  },
  {
    id: "private",
    title: "Private Sessions",
    description: "End-to-end control. You decide who can join and what plays in your secure room.",
    icon: Shield,
    color: "from-emerald-400/50 via-green-500/40 to-teal-500/45",
    borderHover: "group-hover:border-emerald-500/40 group-hover:shadow-[0_0_60px_-15px_rgba(16,185,129,0.35)]",
    accent: "group-hover:text-emerald-400 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/30",
    buttonHover: "group-hover:bg-emerald-400 group-hover:text-zinc-950 group-hover:border-emerald-300 group-hover:shadow-[0_0_25px_rgba(52,211,153,0.8)]",
  }
];

export function FeaturesExplanation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollWrapperRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();

    mm.add("(min-width: 768px)", () => {
      // Desktop horizontal scroll
      if (scrollWrapperRef.current) {
        const scrollWidth = scrollWrapperRef.current.scrollWidth;
        const amountToScroll = scrollWidth - window.innerWidth + 100;
        
        gsap.to(scrollWrapperRef.current, {
          x: -amountToScroll,
          ease: "none",
          scrollTrigger: {
            trigger: containerRef.current,
            start: "center center",
            end: `+=${amountToScroll}`,
            scrub: 1,
            pin: true,
            invalidateOnRefresh: true,
          }
        });
      }
    });

    mm.add("(max-width: 767px)", () => {
      // Mobile vertical fade up
      const cards = gsap.utils.toArray('.feature-card');
      cards.forEach((card: any) => {
        gsap.from(card, {
          y: 50,
          opacity: 0,
          duration: 0.8,
          scrollTrigger: {
            trigger: card,
            start: "top 85%",
            toggleActions: "play none none reverse"
          }
        });
      });
    });

    // Refresh ScrollTrigger after a short delay to account for dynamic imports
    setTimeout(() => {
      ScrollTrigger.refresh();
    }, 100);

    return () => mm.revert();
  }, { scope: containerRef });

  return (
    <section ref={containerRef} className="relative z-10 w-full min-h-[100dvh] flex flex-col items-center justify-center py-24 overflow-hidden bg-background">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-foreground/[0.02] to-background pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-16 md:mb-24 relative z-20">
        <span className="px-4 py-1.5 rounded-full border border-foreground/10 bg-foreground/5 text-xs font-bold tracking-widest uppercase text-foreground/60 mb-6 inline-block">
          Deep Dive
        </span>
        <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-6">
          MASTER THE <span className="text-zinc-500">ROOM</span>
        </h2>
        <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto">
          SyncBeats is packed with advanced audio routing and network features. Here's how to get the most out of your session.
        </p>
      </div>

      <div className="w-full px-4 md:px-0 md:pl-[10vw]">
        <div ref={scrollWrapperRef} className="flex flex-col md:flex-row gap-6 md:gap-8 pb-12 md:pr-[10vw] w-full md:w-max items-center md:items-stretch">
          {features.map((feature, i) => (
            <div 
              key={feature.id}
              className={`feature-card will-change-transform w-full max-w-md md:w-[400px] shrink-0 h-auto md:h-[450px] glass-panel rounded-3xl md:rounded-[2.5rem] p-6 md:p-10 flex flex-col border border-foreground/10 relative overflow-hidden group transition-all duration-500 ${feature.borderHover}`}
            >
              {/* Vibrant Aurora Background Glow */}
              <div className={`absolute -right-10 -top-10 w-72 h-72 bg-gradient-to-br ${feature.color} rounded-full blur-[65px] opacity-40 md:opacity-20 group-hover:opacity-100 group-hover:scale-125 transition-all duration-500 pointer-events-none`} />
              
              {/* Secondary Soft Bottom Aurora Glow */}
              <div className={`absolute -left-10 -bottom-10 w-60 h-60 bg-gradient-to-tr ${feature.color} rounded-full blur-[70px] opacity-20 md:opacity-0 group-hover:opacity-60 transition-all duration-500 pointer-events-none`} />

              <div className={`w-14 h-14 md:w-16 md:h-16 rounded-full bg-foreground/5 flex items-center justify-center mb-6 md:mb-8 relative z-10 border border-foreground/10 shadow-lg transition-all duration-300 ${feature.accent}`}>
                <feature.icon className="w-7 h-7 md:w-8 md:h-8 transition-transform duration-300 group-hover:scale-110" />
              </div>
              
              <h3 className="text-xl md:text-2xl font-black mb-3 md:mb-4 relative z-10 transition-colors duration-300 group-hover:text-foreground">{feature.title}</h3>
              <p className="text-foreground/70 md:text-foreground/60 leading-relaxed relative z-10 text-xs md:text-base mb-6 md:mb-0 transition-colors duration-300 group-hover:text-foreground/85">
                {feature.description}
              </p>
              
              <div className="mt-auto relative z-10 pt-2">
                <div className={`w-10 h-10 md:w-11 md:h-11 rounded-full border border-foreground/20 flex items-center justify-center transition-all duration-500 ease-out cursor-pointer hover:scale-115 active:scale-95 ${feature.buttonHover}`}>
                  <Play className="w-4 h-4 ml-0.5 fill-current" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
