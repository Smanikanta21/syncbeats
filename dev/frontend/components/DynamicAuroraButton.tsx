"use client";

import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import Link from "next/link";

interface DynamicAuroraButtonProps {
  children: React.ReactNode;
  className?: string;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
}

export function DynamicAuroraButton({
  children,
  className = "",
  href,
  onClick,
  type = "button",
}: DynamicAuroraButtonProps) {
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 60, damping: 25 });

  // SyncBeats Signature Ambient Glow Colors (Refined & Matching Website Aesthetics)
  // 0% (Hero): Cobalt Blue
  // 33% (Features): Electric Violet
  // 66% (Devices): Cyber Cyan/Teal
  // 100% (Contact): Neon Emerald
  const borderGlowColor = useTransform(
    smoothProgress,
    [0, 0.33, 0.66, 1],
    [
      "rgba(59, 130, 246, 0.70)",   // Cobalt
      "rgba(139, 92, 246, 0.70)",   // Violet
      "rgba(20, 184, 166, 0.70)",    // Teal
      "rgba(16, 185, 129, 0.70)",   // Emerald
    ]
  );

  const shadowGlow = useTransform(
    smoothProgress,
    [0, 0.33, 0.66, 1],
    [
      "0 0 25px rgba(59, 130, 246, 0.35)",
      "0 0 25px rgba(139, 92, 246, 0.35)",
      "0 0 25px rgba(20, 184, 166, 0.35)",
      "0 0 25px rgba(16, 185, 129, 0.35)",
    ]
  );

  const hoverShadowGlow = useTransform(
    smoothProgress,
    [0, 0.33, 0.66, 1],
    [
      "0 0 45px rgba(59, 130, 246, 0.65)",
      "0 0 45px rgba(139, 92, 246, 0.65)",
      "0 0 45px rgba(20, 184, 166, 0.65)",
      "0 0 45px rgba(16, 185, 129, 0.65)",
    ]
  );

  if (href) {
    return (
      <motion.div
        style={{ borderColor: borderGlowColor, boxShadow: shadowGlow }}
        whileHover={{ scale: 1.04, boxShadow: hoverShadowGlow.get() }}
        whileTap={{ scale: 0.96 }}
        className={`rounded-full border-2 bg-foreground text-background transition-all duration-300 inline-flex items-center justify-center shrink-0 cursor-pointer overflow-hidden ${className}`}
      >
        <Link
          href={href}
          onClick={onClick}
          className="w-full h-full flex items-center justify-center text-background font-black tracking-widest uppercase transition-colors duration-300 whitespace-nowrap"
        >
          {children}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.button
      type={type}
      onClick={onClick}
      style={{ borderColor: borderGlowColor, boxShadow: shadowGlow }}
      whileHover={{ scale: 1.04, boxShadow: hoverShadowGlow.get() }}
      whileTap={{ scale: 0.96 }}
      className={`rounded-full border-2 bg-foreground text-background font-black tracking-widest uppercase flex items-center justify-center transition-all duration-300 cursor-pointer overflow-hidden whitespace-nowrap ${className}`}
    >
      {children}
    </motion.button>
  );
}
