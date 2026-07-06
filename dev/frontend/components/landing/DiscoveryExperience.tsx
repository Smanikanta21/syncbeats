"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Zap,
  Smartphone,
  Shield,
  QrCode,
  Globe,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WaveformBar } from "./WaveformBar";
import { LandingFooter } from "./LandingFooter";

const steps = [
  {
    num: "01",
    title: "CREATE A ROOM",
    desc: "Upload or search for your favorite track. Your room gets a unique 6-digit code.",
    color: "#00FFB2",
  },
  {
    num: "02",
    title: "SHARE THE CODE",
    desc: "Send the code or QR to friends. Works on any device with a browser — no app needed.",
    color: "#7B61FF",
  },
  {
    num: "03",
    title: "INSTANT SYNC",
    desc: "Sub-millisecond peer-to-peer audio alignment. Every device plays as one.",
    color: "#FF3D71",
  },
];

const features = [
  {
    icon: Zap,
    title: "Peer-to-Peer",
    desc: "No server relay. Direct device-to-device audio streaming.",
  },
  {
    icon: Smartphone,
    title: "Any Device",
    desc: "Phone, laptop, tablet — if it has a browser, it works.",
  },
  {
    icon: Shield,
    title: "Private Rooms",
    desc: "Your music stays yours. Room-level access control.",
  },
  {
    icon: QrCode,
    title: "QR Join",
    desc: "Scan to connect instantly. Zero friction.",
  },
  {
    icon: Globe,
    title: "Zero Install",
    desc: "Pure web. Nothing to download. Ever.",
  },
  {
    icon: Users,
    title: "Spatial Audio",
    desc: "Position devices in 3D space for surround sound.",
  },
];

export function DiscoveryExperience() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

  // Scroll listener for navbar transition
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // GSAP cinematic animations
  useEffect(() => {
    let ctx: ReturnType<typeof import("gsap").gsap.context> | undefined;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReducedMotion) return;

    const init = async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        /* ---- Hero cinematic stagger ---- */
        const heroTl = gsap.timeline({
          defaults: { ease: "power3.out" },
        });

        heroTl
          .from("[data-hero='nav']", {
            y: -30,
            opacity: 0,
            duration: 0.5,
          })
          .from(
            "[data-hero='line1'] span",
            { y: 70, opacity: 0, duration: 0.7 },
            "+=0.05"
          )
          .from(
            "[data-hero='line2'] span",
            { y: 70, opacity: 0, duration: 0.7 },
            "-=0.45"
          )
          .from(
            "[data-hero='sub']",
            { y: 18, opacity: 0, duration: 0.5 },
            "-=0.35"
          )
          .from(
            "[data-hero='input']",
            {
              y: 18,
              opacity: 0,
              scale: 0.96,
              duration: 0.5,
            },
            "-=0.25"
          )
          .from(
            "[data-hero='wave']",
            { opacity: 0, scaleY: 0, duration: 0.4 },
            "-=0.2"
          )
          .from(
            "[data-hero='scroll']",
            { opacity: 0, y: 8, duration: 0.3 },
            "-=0.1"
          );

        /* ---- How It Works — scroll reveal ---- */
        gsap.utils
          .toArray<HTMLElement>("[data-step]")
          .forEach((step, i) => {
            gsap.from(step, {
              scrollTrigger: {
                trigger: step,
                start: "top 88%",
                toggleActions: "play none none none",
              },
              x: i % 2 === 0 ? -50 : 50,
              opacity: 0,
              duration: 0.6,
              ease: "power2.out",
            });
          });

        /* ---- Features grid — scroll stagger ---- */
        gsap.from("[data-feature]", {
          scrollTrigger: {
            trigger: featuresRef.current,
            start: "top 82%",
            toggleActions: "play none none none",
          },
          y: 35,
          opacity: 0,
          stagger: 0.08,
          duration: 0.45,
          ease: "power2.out",
        });

        /* ---- Final CTA ---- */
        gsap.from("[data-cta='final']", {
          scrollTrigger: {
            trigger: "[data-cta='final']",
            start: "top 88%",
            toggleActions: "play none none none",
          },
          y: 25,
          opacity: 0,
          duration: 0.5,
          ease: "power2.out",
        });
      }, rootRef);
    };

    init();
    return () => ctx?.revert();
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.length > 3) router.push(`/room/${joinCode.toUpperCase()}`);
  };

  return (
    <div ref={rootRef} className="w-full">
      {/* ============================================ */}
      {/* FLOATING NAVBAR                              */}
      {/* ============================================ */}
      <nav
        data-hero="nav"
        className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none pt-4 md:pt-6 px-4"
      >
        <div
          className={`pointer-events-auto flex items-center justify-between w-full max-w-5xl px-5 py-3 rounded-2xl transition-all duration-500 ${
            isScrolled
              ? "bg-[#0F0F12]/95 md:bg-[#0F0F12]/80 md:backdrop-blur-xl border border-white/6 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
              : "bg-transparent border border-transparent"
          }`}
        >
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-lg md:text-xl font-black tracking-tighter text-white">
              SYNC
              <span className="text-white/35 group-hover:text-white/60 transition-colors">
                BEATS
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="hidden sm:flex h-9 px-4 rounded-xl items-center justify-center text-[11px] font-bold tracking-widest uppercase text-white/40 hover:text-white/70 transition-colors"
            >
              Login
            </Link>
            <Link
              href="/login"
              className="h-9 px-5 rounded-xl bg-white text-[#050507] flex items-center justify-center text-[11px] font-bold tracking-widest uppercase hover:bg-white/90 active:scale-[0.97] transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ============================================ */}
      {/* SECTION 1 — HERO                             */}
      {/* ============================================ */}
      <section className="relative min-h-dvh flex flex-col items-center justify-center px-4 pt-24 pb-16">
        {/* Headline */}
        <div className="text-center mb-8 md:mb-10">
          <h1 className="text-[clamp(2.8rem,10vw,7rem)] font-black tracking-tighter leading-[0.9] mb-6">
            <div data-hero="line1" className="overflow-hidden pb-1">
              <span className="block text-white">EVERY DEVICE.</span>
            </div>
            <div data-hero="line2" className="overflow-hidden pb-1">
              <span className="block text-[#00FFB2]">PERFECT SYNC.</span>
            </div>
          </h1>
          <p
            data-hero="sub"
            className="text-base md:text-lg text-white/35 max-w-md mx-auto font-medium leading-relaxed"
          >
            Zero lag. Peer-to-peer. No Bluetooth, no wires.
            <br className="hidden sm:block" />
            Turn any device into a wireless speaker.
          </p>
        </div>

        {/* Room code input */}
        <div data-hero="input" className="w-full max-w-sm">
          <form onSubmit={handleJoin} className="flex flex-col items-center">
            <div className="relative w-full">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={joinCode}
                onChange={(e) =>
                  setJoinCode(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                  )
                }
                placeholder="Enter Room Code"
                autoComplete="off"
                aria-label="Room code"
                className="w-full bg-[#0F0F12] border border-white/8 rounded-xl px-5 py-3.5 text-center text-lg font-mono font-bold tracking-[0.2em] text-white outline-none placeholder:text-white/20 placeholder:tracking-widest placeholder:text-sm transition-all duration-300 focus:border-[#00FFB2]/40 focus:shadow-[0_0_30px_rgba(0,255,178,0.06)]"
              />
              <AnimatePresence>
                {joinCode.length > 3 && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ type: "spring", bounce: 0.5 }}
                    type="submit"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg bg-[#00FFB2] text-[#050507] flex items-center justify-center hover:bg-[#00FFB2]/90 transition-colors cursor-pointer"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
            <Link
              href="/login"
              className="mt-3 text-[11px] font-bold tracking-widest uppercase text-white/20 hover:text-[#7B61FF]/60 transition-colors"
            >
              or Get Started Free →
            </Link>
          </form>
        </div>

        {/* Waveform visualizer */}
        <div data-hero="wave" className="mt-12 md:mt-16 origin-bottom">
          <WaveformBar barCount={18} className="h-10 md:h-14 opacity-35" />
        </div>

        {/* Scroll indicator */}
        <div
          data-hero="scroll"
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/15">
            Scroll
          </span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{
              repeat: Infinity,
              duration: 1.5,
              ease: "easeInOut",
            }}
            className="w-4 h-7 rounded-full border border-white/10 flex justify-center pt-1.5"
          >
            <div className="w-0.5 h-1.5 rounded-full bg-white/20" />
          </motion.div>
        </div>
      </section>

      {/* ============================================ */}
      {/* SECTION 2 — HOW IT WORKS                     */}
      {/* ============================================ */}
      <section className="relative px-4 py-24 md:py-32">
        <div className="max-w-3xl mx-auto">
          {/* Section badge */}
          <div className="text-center mb-14 md:mb-16">
            <span className="inline-block font-mono text-[10px] uppercase tracking-[0.3em] text-[#7B61FF] px-4 py-1.5 rounded-full border border-[#7B61FF]/20 bg-[#7B61FF]/5">
              How It Works
            </span>
          </div>

          {/* Steps */}
          <div className="flex flex-col gap-5">
            {steps.map((step, i) => (
              <div
                key={step.num}
                data-step
                className="group relative bg-[#0F0F12]/50 border border-white/4 rounded-2xl p-6 md:p-8 hover:border-white/8 hover:bg-[#0F0F12]/70 transition-all duration-300"
              >
                {/* Neon accent line (left edge) */}
                <div
                  className="absolute left-0 top-[20%] bottom-[20%] w-px transition-opacity duration-300 opacity-50 group-hover:opacity-100"
                  style={{ backgroundColor: `${step.color}66` }}
                />

                <div className="flex items-start gap-5">
                  <span
                    className="font-mono text-sm font-bold tracking-widest shrink-0 pt-0.5"
                    style={{ color: `${step.color}80` }}
                  >
                    {step.num}
                  </span>
                  <div>
                    <h3 className="text-lg md:text-xl font-black tracking-tight text-white mb-2">
                      {step.title}
                    </h3>
                    <p className="text-sm md:text-[15px] text-white/30 leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* SECTION 3 — FEATURES                         */}
      {/* ============================================ */}
      <section ref={featuresRef} className="relative px-4 py-24 md:py-32">
        <div className="max-w-4xl mx-auto">
          {/* Section badge */}
          <div className="text-center mb-14 md:mb-16">
            <span className="inline-block font-mono text-[10px] uppercase tracking-[0.3em] text-[#00FFB2] px-4 py-1.5 rounded-full border border-[#00FFB2]/20 bg-[#00FFB2]/5">
              Built Different
            </span>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feat) => (
              <div
                key={feat.title}
                data-feature
                className="group bg-[#0F0F12]/40 border border-white/4 rounded-2xl p-6 hover:border-white/8 hover:bg-[#0F0F12]/60 transition-all duration-300"
              >
                <feat.icon className="w-5 h-5 text-[#00FFB2]/50 mb-4 group-hover:text-[#00FFB2]/90 transition-colors duration-300" />
                <h4 className="text-sm font-bold tracking-tight text-white mb-1.5">
                  {feat.title}
                </h4>
                <p className="text-xs text-white/25 leading-relaxed">
                  {feat.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* SECTION 4 — FINAL CTA                        */}
      {/* ============================================ */}
      <section className="relative px-4 py-24 md:py-32">
        <div data-cta="final" className="max-w-lg mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-black tracking-tighter text-white mb-4">
            Ready to sync?
          </h2>
          <p className="text-sm text-white/25 mb-8 max-w-xs mx-auto">
            Free. No sign-up required to join a room.
          </p>
          <Link
            href="/login"
            className="inline-flex h-14 px-10 rounded-2xl bg-[#00FFB2] text-[#050507] items-center justify-center text-sm font-bold tracking-widest uppercase hover:bg-[#00FFB2]/90 active:scale-[0.97] transition-all shadow-[0_0_40px_rgba(0,255,178,0.12)]"
          >
            Start Listening
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </div>
      </section>

      {/* ============================================ */}
      {/* FOOTER                                       */}
      {/* ============================================ */}
      <LandingFooter />
    </div>
  );
}
