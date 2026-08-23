"use client";

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
  variant?: "default" | "outline" | "compact" | "pill";
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
          "inline-flex items-center gap-2 px-4 py-2 rounded-full border border-pink-500/30 bg-pink-500/10 text-pink-500 dark:text-pink-400 hover:bg-pink-500/20 hover:border-pink-500/50 font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-sm hover:shadow-pink-500/20 active:scale-95",
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
          "inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-bold text-xs tracking-wider uppercase bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] hover:opacity-95 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg hover:shadow-pink-500/25 transition-all duration-300",
          className
        )}
      >
        <InstagramIcon className="w-4 h-4 shrink-0 text-white" />
        <span>{showHandle ? "@syncbeats.in" : "Follow Us"}</span>
      </a>
    );
  }

  return (
    <a
      href={instagramUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group relative inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-2xl font-bold text-xs sm:text-sm text-white tracking-wide overflow-hidden shadow-lg hover:shadow-pink-500/30 transition-all duration-300 active:scale-98",
        "bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045]",
        className
      )}
    >
      <span className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      <InstagramIcon className="w-5 h-5 text-white transition-transform group-hover:scale-110 shrink-0" />
      <span className="relative z-10 uppercase tracking-wider">
        {showHandle ? "Follow @syncbeats.in on Instagram" : "Follow on Instagram"}
      </span>
    </a>
  );
}
