"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export const InstagramIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

interface InstagramFollowButtonProps {
  className?: string;
  variant?: "default" | "outline" | "compact" | "pill" | "glass";
  showHandle?: boolean;
}

export function InstagramFollowButton({
  className,
  variant = "default",
  showHandle = true,
}: InstagramFollowButtonProps) {
  const instagramUrl = "https://www.instagram.com/syncbeats.in/";

  if (variant === "compact") {
    return (
      <a
        href={instagramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-semibold transition-all duration-300 hover:opacity-90",
          "text-pink-500 hover:text-pink-400 dark:text-pink-400 dark:hover:text-pink-300",
          className
        )}
        aria-label="Follow SyncBeats on Instagram"
      >
        <InstagramIcon className={cn('w-4', 'h-4', 'shrink-0')} />
        <span>Follow @syncbeats.in</span>
      </a>
    );
  }

  if (variant === "outline") {
    return (
      <a
        href={instagramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-pink-500/30 bg-pink-500/10 text-pink-500 dark:text-pink-400 hover:bg-pink-500/20 hover:border-pink-500/50 font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-sm hover:shadow-pink-500/20 active:scale-95",
          className
        )}
      >
        <InstagramIcon className={cn('w-4', 'h-4', 'shrink-0')} />
        <span>{showHandle ? "Follow @syncbeats.in" : "Follow on Instagram"}</span>
      </a>
    );
  }

  if (variant === "pill") {
    return (
      <a
        href={instagramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-bold text-xs tracking-wider uppercase bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] hover:opacity-95 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg hover:shadow-pink-500/25 transition-all duration-300",
          className
        )}
      >
        <InstagramIcon className={cn('w-4', 'h-4', 'shrink-0', 'text-white')} />
        <span>{showHandle ? "@syncbeats.in" : "Follow Us"}</span>
      </a>
    );
  }

  // Default & Glass Variant — Sleek Glassmorphic Button matching SyncBeats UI
  return (
    <motion.a
      href={instagramUrl}
      target="_blank"
      rel="noopener noreferrer"
      whileHover={{ 
        scale: 1.02, 
        boxShadow: "0 12px 40px -10px rgba(225, 48, 108, 0.35), inset 0 1px 1px 0 rgba(255, 255, 255, 0.25)",
        borderColor: "rgba(225, 48, 108, 0.5)",
      }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "group relative w-full h-14 rounded-2xl",
        "bg-foreground/[0.04] dark:bg-white/[0.05]",
        "backdrop-blur-2xl border border-foreground/15 dark:border-white/10",
        "flex items-center justify-center gap-3 px-6",
        "text-foreground font-black text-xs md:text-sm tracking-widest uppercase",
        "transition-all duration-500 cursor-pointer overflow-hidden select-none",
        className
      )}
    >
      {/* Ambient Instagram Gradient Hover Glow */}
      <span className="absolute inset-0 bg-gradient-to-r from-[#833ab4]/15 via-[#fd1d1d]/15 to-[#fcb045]/15 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {/* Vibrant Instagram Icon Badge */}
      <div className="relative z-10 w-7 h-7 rounded-lg bg-gradient-to-tr from-[#833ab4] via-[#fd1d1d] to-[#fcb045] flex items-center justify-center shrink-0 shadow-md shadow-pink-500/20 group-hover:scale-110 transition-transform duration-300">
        <InstagramIcon className="w-4 h-4 text-white shrink-0" />
      </div>

      {/* Label with Hover Gradient Text */}
      <span className="relative z-10 font-black tracking-widest uppercase transition-all duration-300 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-pink-400 group-hover:via-rose-400 group-hover:to-amber-300">
        {showHandle ? "Follow @syncbeats.in" : "Follow on Instagram"}
      </span>
    </motion.a>
  );
}
