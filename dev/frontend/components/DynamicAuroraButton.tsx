"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const MotionLink = motion.create(Link);

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
  const glassStyle = {
    background: "rgba(255, 255, 255, 0.08)",
    backdropFilter: "blur(16px) saturate(180%)",
    WebkitBackdropFilter: "blur(16px) saturate(180%)",
    border: "1px solid var(--accent-border, rgba(52, 211, 153, 0.4))",
    boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.25), inset 0 1px 1px 0 rgba(255, 255, 255, 0.2), 0 0 25px var(--accent-glow, rgba(52, 211, 153, 0.35))",
  };

  if (href) {
    return (
      <MotionLink
        href={href}
        onClick={onClick}
        style={glassStyle}
        whileHover={{ 
          scale: 1.03, 
          boxShadow: "0 12px 40px 0 rgba(0, 0, 0, 0.35), inset 0 1px 1px 0 rgba(255, 255, 255, 0.3), 0 0 45px var(--accent-glow, rgba(52, 211, 153, 0.6))",
          backgroundColor: "rgba(255, 255, 255, 0.14)"
        }}
        whileTap={{ scale: 0.97 }}
        className={`rounded-full text-foreground font-black tracking-widest uppercase inline-flex items-center justify-center transition-all duration-700 cursor-pointer overflow-hidden whitespace-nowrap active:opacity-90 ${className}`}
      >
        {children}
      </MotionLink>
    );
  }

  return (
    <motion.button
      type={type}
      onClick={onClick}
      style={glassStyle}
      whileHover={{ 
        scale: 1.03, 
        boxShadow: "0 12px 40px 0 rgba(0, 0, 0, 0.35), inset 0 1px 1px 0 rgba(255, 255, 255, 0.3), 0 0 45px var(--accent-glow, rgba(52, 211, 153, 0.6))",
        backgroundColor: "rgba(255, 255, 255, 0.14)"
      }}
      whileTap={{ scale: 0.97 }}
      className={`rounded-full text-foreground font-black tracking-widest uppercase flex items-center justify-center transition-all duration-700 cursor-pointer overflow-hidden whitespace-nowrap active:opacity-90 ${className}`}
    >
      {children}
    </motion.button>
  );
}
