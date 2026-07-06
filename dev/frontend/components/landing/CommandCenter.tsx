"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface CommandCenterProps {
  user: { name: string };
}

export function CommandCenter({ user }: CommandCenterProps) {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // GSAP boot-up animation sequence
  useEffect(() => {
    let ctx: ReturnType<typeof import("gsap").gsap.context> | undefined;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReducedMotion) return;

    const initGSAP = async () => {
      const { gsap } = await import("gsap");
      ctx = gsap.context(() => {
        const tl = gsap.timeline({
          defaults: { ease: "power2.out" },
        });

        tl.from("[data-boot='status']", {
          opacity: 0,
          duration: 0.4,
        })
          .from(
            "[data-boot='panel']",
            {
              opacity: 0,
              scale: 0.96,
              y: 16,
              duration: 0.5,
            },
            "+=0.05"
          )
          .from(
            "[data-boot='label']",
            {
              opacity: 0,
              y: 8,
              duration: 0.35,
            },
            "-=0.2"
          )
          .from(
            "[data-boot='input']",
            {
              opacity: 0,
              y: 8,
              duration: 0.35,
            },
            "-=0.15"
          )
          .from(
            "[data-boot='divider']",
            {
              opacity: 0,
              scaleX: 0,
              duration: 0.3,
            },
            "-=0.1"
          )
          .from(
            "[data-boot='cta']",
            {
              opacity: 0,
              y: 8,
              duration: 0.35,
            },
            "-=0.15"
          )
          .from(
            "[data-boot='footer']",
            {
              opacity: 0,
              duration: 0.3,
            },
            "-=0.1"
          );
      }, containerRef);
    };

    initGSAP();
    return () => ctx?.revert();
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.length > 3) router.push(`/room/${joinCode.toUpperCase()}`);
  };

  return (
    <div
      ref={containerRef}
      className="min-h-[100dvh] flex flex-col items-center justify-center px-4 relative"
    >
      {/* System status indicator */}
      <div
        data-boot="status"
        className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-2.5"
      >
        <div
          className="w-1.5 h-1.5 rounded-full bg-[#00FFB2] shadow-[0_0_8px_#00FFB2]"
          style={{ animation: "subtle-pulse 3s ease-in-out infinite" }}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">
          System Online
        </span>
      </div>

      {/* Main console panel */}
      <div
        data-boot="panel"
        className="w-full max-w-md bg-[#0F0F12] border border-white/[0.06] rounded-2xl p-8 md:p-10 shadow-[0_0_80px_rgba(0,0,0,0.5)] relative overflow-hidden"
      >
        {/* Top accent glow line */}
        <div className="absolute top-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-[#00FFB2]/30 to-transparent" />

        {/* Subtle corner dots — hardware aesthetic */}
        <div className="absolute top-3 left-3 w-1 h-1 rounded-full bg-white/[0.08]" />
        <div className="absolute top-3 right-3 w-1 h-1 rounded-full bg-white/[0.08]" />
        <div className="absolute bottom-3 left-3 w-1 h-1 rounded-full bg-white/[0.08]" />
        <div className="absolute bottom-3 right-3 w-1 h-1 rounded-full bg-white/[0.08]" />

        <form onSubmit={handleJoin} className="flex flex-col items-center">
          {/* Label */}
          <label
            data-boot="label"
            htmlFor="cc-room-code"
            className="block font-mono text-[10px] uppercase tracking-[0.25em] text-white/35 mb-4 text-center"
          >
            Enter Room Code
          </label>

          {/* Room code input */}
          <div data-boot="input" className="relative w-full">
            <input
              id="cc-room-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={joinCode}
              onChange={(e) =>
                setJoinCode(
                  e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                )
              }
              placeholder="— — — — — —"
              autoComplete="off"
              className="w-full bg-[#050507] border border-white/[0.08] rounded-xl px-6 py-4 text-center text-2xl md:text-3xl font-mono font-bold tracking-[0.3em] text-[#F0F0F0] outline-none placeholder:text-white/15 transition-all duration-300 focus:border-[#00FFB2]/40 focus:shadow-[0_0_30px_rgba(0,255,178,0.08)]"
              aria-label="Room code"
            />
          </div>

          {/* Submit button — appears when code has enough chars */}
          <div className="h-16 flex items-center justify-center mt-2">
            <AnimatePresence>
              {joinCode.length > 3 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 8 }}
                  transition={{ type: "spring", bounce: 0.5, duration: 0.5 }}
                  type="submit"
                  className="w-12 h-12 rounded-full bg-[#00FFB2] text-[#050507] flex items-center justify-center hover:bg-[#00FFB2]/90 transition-colors shadow-[0_0_20px_rgba(0,255,178,0.3)] cursor-pointer"
                >
                  <ArrowRight className="w-5 h-5 ml-0.5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </form>

        {/* Divider */}
        <div data-boot="divider" className="flex items-center gap-4 my-1">
          <div className="flex-1 h-px bg-white/[0.06]" />
          <span className="font-mono text-[9px] uppercase tracking-widest text-white/15">
            or
          </span>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>

        {/* Start New Session CTA */}
        <div data-boot="cta" className="mt-4">
          <Link
            href="/hub"
            className="w-full h-12 rounded-xl border border-[#7B61FF]/25 bg-[#7B61FF]/[0.06] text-[#7B61FF] flex items-center justify-center gap-2 font-bold text-sm tracking-widest uppercase hover:bg-[#7B61FF]/[0.12] hover:border-[#7B61FF]/40 transition-all duration-300"
          >
            Start New Session
          </Link>
        </div>
      </div>

      {/* Bottom welcome + hub link */}
      <div
        data-boot="footer"
        className="mt-8 flex flex-col items-center gap-2"
      >
        <span className="font-mono text-[11px] text-white/20">
          Welcome back,{" "}
          <span className="text-white/45">{user.name}</span>
        </span>
        <Link
          href="/hub"
          className="font-mono text-[10px] uppercase tracking-widest text-white/15 hover:text-[#00FFB2]/50 transition-colors"
        >
          Go to Hub ↗
        </Link>
      </div>
    </div>
  );
}
