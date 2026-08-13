"use client";

import React, { useState, useRef, useEffect, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";

interface HoverExpandPillProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  active?: boolean;
  activeColor?: string;
  title?: string;
  delayMs?: number;
  groupId?: string;
  className?: string;
}

export function HoverExpandPill({
  icon: Icon,
  label,
  onClick,
  active = false,
  activeColor = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(52,211,153,0.15)]",
  title,
  delayMs = 700,
  groupId = "global-pill-group",
  className,
}: HoverExpandPillProps) {
  const [isHovered, setIsHovered] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const instanceId = useId();

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsHovered(true);

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("hover-pill:expand", {
          detail: { groupId, instanceId },
        })
      );
    }
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, delayMs);
  };

  useEffect(() => {
    const handleOtherPillExpand = (e: CustomEvent<{ groupId: string; instanceId: string }>) => {
      if (e.detail?.groupId === groupId && e.detail?.instanceId !== instanceId) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsHovered(false);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("hover-pill:expand" as any, handleOtherPillExpand);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (typeof window !== "undefined") {
        window.removeEventListener("hover-pill:expand" as any, handleOtherPillExpand);
      }
    };
  }, [groupId, instanceId]);

  return (
    <motion.button
      layout
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      title={title || label}
      className={cn(
        "h-7 px-2 rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer select-none overflow-hidden shrink-0 active:scale-95",
        active
          ? activeColor
          : "bg-foreground/5 text-foreground/70 border-foreground/10 hover:bg-foreground/10 hover:text-foreground",
        className
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <AnimatePresence initial={false}>
        {isHovered && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ type: "spring", stiffness: 450, damping: 28 }}
            className="text-[10px] font-extrabold uppercase tracking-wider whitespace-nowrap overflow-hidden"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
