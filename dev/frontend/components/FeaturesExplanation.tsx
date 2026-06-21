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
    color: "from-blue-500/20 to-purple-500/20"
  },
  {
    id: "sync",
    title: "Custom Sync Correction",
    description: "Bluetooth headphones introduce hidden delays. Our engine auto-detects most hardware latency, but the Custom Sync Correction slider lets you dial in the perfect offset manually.",
    icon: Settings2,
    color: "from-emerald-500/20 to-teal-500/20"
  },
  {
    id: "spatial",
    title: "Spatial Audio Routing",
    description: "Turn 5 phones into a surround sound system. In the Devices panel, drag a participant to the Left or Right to isolate their audio output channel.",
    icon: Radio,
    color: "from-orange-500/20 to-red-500/20"
  },
  {
    id: "p2p",
    title: "WebTorrent P2P Sharing",
    description: "Upload local tracks without waiting for slow servers. Our WebRTC integration directly shares chunks of your audio file with everyone else in the room instantly.",
    icon: Share2,
    color: "from-indigo-500/20 to-pink-500/20"
  },
  {
    id: "precision",
    title: "Sub-millisecond Precision",
    description: "Client-side predictive offset ensures audio frames align flawlessly across all connected devices.",
    icon: Zap,
    color: "from-yellow-500/20 to-amber-500/20"
  },
  {
    id: "native",
    title: "Browser Native",
    description: "Works on iOS, Android, macOS, and Windows directly in the browser.",
    icon: Globe,
    color: "from-cyan-500/20 to-blue-500/20"
  },
  {
    id: "private",
    title: "Private Sessions",
    description: "End-to-end control. You decide who can join and what plays in your secure room.",
    icon: Shield,
    color: "from-green-500/20 to-emerald-500/20"
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
    <section ref={containerRef} className="relative z-10 w-full min-h-[100dvh] flex flex-col items-center justify-center pt-28 pb-10 overflow-hidden bg-background">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-foreground/[0.02] to-background pointer-events-none" />
      
      <div className="text-center mb-16 md:mb-24 px-6 relative z-20">
        <span className="px-4 py-1.5 rounded-full border border-foreground/10 bg-foreground/5 text-xs font-bold tracking-widest uppercase text-foreground/60 mb-6 inline-block">
          Deep Dive
        </span>
        <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-6">
          MASTER THE <span className="text-zinc-500">ROOM</span>
        </h2>
        <p className="text-foreground/50 max-w-2xl mx-auto md:text-lg">
          SyncBeats is packed with advanced audio routing and network features. Here's how to get the most out of your session.
        </p>
      </div>

      <div className="w-full pl-6 md:pl-[10vw]">
        <div ref={scrollWrapperRef} className="flex flex-col md:flex-row gap-8 md:gap-8 pb-12 pr-[10vw] w-max items-center md:items-stretch">
          {features.map((feature, i) => (
            <div 
              key={feature.id}
              className="feature-card w-[85vw] md:w-[400px] shrink-0 h-[450px] glass-panel rounded-[2.5rem] p-8 md:p-10 flex flex-col border border-foreground/10 relative overflow-hidden group hover:border-foreground/20 transition-colors"
            >
            <div className={`absolute -right-20 -top-20 w-64 h-64 bg-gradient-to-br ${feature.color} rounded-full blur-[80px] opacity-30`} />
            
            <div className="w-16 h-16 rounded-full bg-foreground/5 flex items-center justify-center mb-8 relative z-10 border border-foreground/10 shadow-lg">
              <feature.icon className="w-8 h-8 text-foreground" />
            </div>
            
            <h3 className="text-2xl font-black mb-4 relative z-10">{feature.title}</h3>
            <p className="text-foreground/60 leading-relaxed relative z-10 text-sm md:text-base">
              {feature.description}
            </p>
            
            <div className="mt-auto relative z-10">
              <div className="w-10 h-10 rounded-full border border-foreground/20 flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-all cursor-pointer">
                <Play className="w-4 h-4 ml-0.5" />
              </div>
            </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
