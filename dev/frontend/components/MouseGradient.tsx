"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Time-driven spatial ambient color stages (independent of scroll!)
const COLOR_PALETTE = [
  { 
    main: "rgba(16, 185, 129, 0.45)", 
    secondary: "rgba(45, 212, 191, 0.40)", 
    glow: "rgba(52, 211, 153, 0.55)", 
    solid: "rgb(52, 211, 153)", 
    rgb: "52, 211, 153",
    gradient: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)",
  },
  { 
    main: "rgba(56, 189, 248, 0.45)", 
    secondary: "rgba(59, 130, 246, 0.40)", 
    glow: "rgba(14, 165, 233, 0.55)", 
    solid: "rgb(56, 189, 248)", 
    rgb: "56, 189, 248",
    gradient: "linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)",
  },
  { 
    main: "rgba(168, 85, 247, 0.45)", 
    secondary: "rgba(192, 132, 252, 0.40)", 
    glow: "rgba(192, 132, 252, 0.55)", 
    solid: "rgb(192, 132, 252)", 
    rgb: "192, 132, 252",
    gradient: "linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)",
  },
  { 
    main: "rgba(244, 63, 94, 0.45)", 
    secondary: "rgba(251, 113, 133, 0.40)", 
    glow: "rgba(244, 114, 182, 0.55)", 
    solid: "rgb(251, 113, 133)", 
    rgb: "251, 113, 133",
    gradient: "linear-gradient(135deg, #f43f5e 0%, #f472b6 100%)",
  },
  { 
    main: "rgba(245, 158, 11, 0.45)", 
    secondary: "rgba(251, 191, 36, 0.40)", 
    glow: "rgba(252, 211, 77, 0.55)", 
    solid: "rgb(251, 191, 36)", 
    rgb: "251, 191, 36",
    gradient: "linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)",
  },
];

export function MouseGradient() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMounted, setIsMounted] = useState(false);
  const [colorIndex, setColorIndex] = useState(0);

  // Time-driven ambient color shifting loop (independent of scroll!)
  useEffect(() => {
    setIsMounted(true);

    const interval = setInterval(() => {
      setColorIndex((prev) => (prev + 1) % COLOR_PALETTE.length);
    }, 4500); // Transitions palette stage every 4.5s continuously over time

    return () => clearInterval(interval);
  }, []);

  // Synchronize CSS custom properties on document root in real-time
  useEffect(() => {
    if (typeof document === "undefined") return;
    const current = COLOR_PALETTE[colorIndex];
    const root = document.documentElement;
    root.style.setProperty("--accent-color", current.solid);
    root.style.setProperty("--accent-glow", current.glow);
    root.style.setProperty("--accent-border", `rgba(${current.rgb}, 0.4)`);
    root.style.setProperty("--accent-rgb", current.rgb);
    root.style.setProperty("--accent-gradient", current.gradient);
  }, [colorIndex]);

  useEffect(() => {
    if (typeof window !== "undefined" && (window.innerWidth < 768 || window.matchMedia("(pointer: coarse)").matches)) return;

    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const winWidth = isMounted && typeof window !== "undefined" ? window.innerWidth : 1000;
  const winHeight = isMounted && typeof window !== "undefined" ? window.innerHeight : 800;

  const current = COLOR_PALETTE[colorIndex];

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden gpu-accelerated">
      {/* Top-Center Main Glow */}
      <motion.div
        animate={{ background: current.main }}
        transition={{ duration: 2.5, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85vw] h-[85vw] max-w-[950px] max-h-[950px] rounded-full blur-[120px] gpu-accelerated"
      />

      {/* Bottom-Right Secondary Glow */}
      <motion.div
        animate={{ background: current.secondary }}
        transition={{ duration: 2.5, ease: "easeInOut" }}
        className="absolute bottom-10 right-10 w-[65vw] h-[65vw] max-w-[750px] max-h-[750px] rounded-full blur-[130px] gpu-accelerated"
      />

      {/* Dynamic Interactive Mouse Following Glow (Desktop Only) */}
      {isMounted && (
        <motion.div 
          animate={{
            background: current.glow,
            x: mousePos.x - winWidth / 2,
            y: mousePos.y - winHeight / 2,
          }}
          transition={{
            background: { duration: 2.5, ease: "easeInOut" },
            x: { type: "tween", ease: "easeOut", duration: 0.35 },
            y: { type: "tween", ease: "easeOut", duration: 0.35 }
          }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[45vw] h-[45vw] max-w-[600px] max-h-[600px] rounded-full blur-[90px] pointer-events-none hidden md:block gpu-accelerated"
        />
      )}
    </div>
  );
}
