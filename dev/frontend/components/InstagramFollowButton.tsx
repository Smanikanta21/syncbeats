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
          "text-foreground/60 hover:text-foreground",
          className
        )}
        aria-label="Follow SyncBeats on Instagram"
      >
        <InstagramIcon className="w-4 h-4 shrink-0" />
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
          "inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.035] px-4 py-2.5 text-sm font-semibold text-foreground/75 transition-colors duration-300 hover:border-foreground/20 hover:bg-foreground/[0.07] hover:text-foreground active:scale-[0.98]",
          className
        )}
      >
        <InstagramIcon className="w-4 h-4 shrink-0" />
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
          "inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity duration-300 hover:opacity-85 active:scale-[0.98]",
          className
        )}
      >
        <InstagramIcon className="w-4 h-4 shrink-0 text-white" />
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
      whileHover={{ scale: 1.01, borderColor: "var(--glass-border-hover)" }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "group relative w-full h-14 rounded-2xl",
        "bg-foreground/4 dark:bg-white/[0.05]",
        "backdrop-blur-2xl border border-foreground/15 dark:border-white/10",
        "flex items-center justify-center gap-3 px-6",
        "text-foreground font-semibold text-sm",
        "transition-all duration-500 cursor-pointer overflow-hidden select-none",
        className
      )}
    >
      {/* Keep Instagram's identity in its icon; the surrounding control follows
          SyncBeats' neutral smoked-glass palette. */}
      <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-tr from-[#833ab4] via-[#fd1d1d] to-[#fcb045] transition-transform duration-300 group-hover:scale-105">
        <InstagramIcon className="w-4 h-4 text-white shrink-0" />
      </div>

      <span className="relative z-10 font-semibold">
        {showHandle ? "Follow @syncbeats.in" : "Follow on Instagram"}
      </span>
    </motion.a>
  );
}
