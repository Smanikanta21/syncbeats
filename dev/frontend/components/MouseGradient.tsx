"use client";

import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { useState, useEffect } from "react";

export function MouseGradient() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 60, damping: 25 });

  // Dynamically map scroll progress (0% -> 100%) to vivid color stages
  // 0% (Hero): Emerald / Mint Green
  // 33% (Features): Electric Cyan / Blue
  // 66% (Devices): Deep Violet / Purple
  // 100% (Community/Footer): Vivid Rose / Coral
  const colorOrb1 = useTransform(
    smoothProgress,
    [0, 0.33, 0.66, 1],
    [
      "rgba(16, 185, 129, 0.45)",  // Emerald
      "rgba(56, 189, 248, 0.45)",   // Cyan
      "rgba(123, 97, 255, 0.45)",   // Violet
      "rgba(244, 63, 94, 0.45)",    // Rose
    ]
  );

  const colorOrb2 = useTransform(
    smoothProgress,
    [0, 0.33, 0.66, 1],
    [
      "rgba(45, 212, 191, 0.40)",   // Teal
      "rgba(59, 130, 246, 0.40)",   // Electric Blue
      "rgba(168, 85, 247, 0.40)",   // Purple
      "rgba(251, 113, 133, 0.40)",  // Coral
    ]
  );

  const mouseGlowColor = useTransform(
    smoothProgress,
    [0, 0.33, 0.66, 1],
    [
      "rgba(52, 211, 153, 0.40)",   // Mint
      "rgba(14, 165, 233, 0.40)",   // Sky Blue
      "rgba(192, 132, 252, 0.40)",  // Lavender
      "rgba(244, 114, 182, 0.40)",  // Pink
    ]
  );

  useEffect(() => {
    // Skip mousemove listener on mobile
    if (typeof window !== "undefined" && window.innerWidth < 768) return;

    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <>
      {/* Scroll-Driven Dynamic Ambient Background Orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Top-Center Main Glow */}
        <motion.div
          style={{ background: colorOrb1 }}
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85vw] h-[85vw] max-w-[950px] max-h-[950px] rounded-full blur-[120px] transition-colors duration-700"
        />

        {/* Bottom-Right Secondary Glow */}
        <motion.div
          style={{ background: colorOrb2 }}
          className="absolute bottom-10 right-10 w-[65vw] h-[65vw] max-w-[750px] max-h-[750px] rounded-full blur-[130px] transition-colors duration-700"
        />
      </div>

      {/* Dynamic Interactive Mouse Following Glow */}
      <motion.div 
        style={{ background: mouseGlowColor }}
        className="fixed w-[45vw] h-[45vw] max-w-[600px] max-h-[600px] rounded-full blur-[90px] pointer-events-none z-0 hidden md:block"
        animate={{
          x: mousePos.x - (typeof window !== "undefined" ? window.innerWidth / 2 : 0),
          y: mousePos.y - (typeof window !== "undefined" ? window.innerHeight / 2 : 0),
        }}
        transition={{ type: "tween", ease: "easeOut", duration: 0.35 }}
      />
    </>
  );
}
