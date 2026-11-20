"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "../lib/utils";

interface MarqueeTextProps {
  children: React.ReactNode;
  className?: string;
  speed?: number; // pixels per second
  pauseDuration?: number; // seconds to pause at start & end
  repeatDelay?: number; // seconds before restarting cycle
}

/**
 * MarqueeText:
 * Displays text statically if it fits within its container.
 * If the content overflows, smoothly scrolls back and forth (ping-pong)
 * with reading pauses at both ends and a graceful edge fade mask.
 */
export function MarqueeText({
  children,
  className,
  speed = 28,
  pauseDuration = 2,
  repeatDelay = 1,
}: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [overflowDistance, setOverflowDistance] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    const measure = () => {
      const containerWidth = container.clientWidth;
      const textWidth = textEl.scrollWidth;
      if (textWidth > containerWidth + 2) {
        setIsOverflowing(true);
        setOverflowDistance(textWidth - containerWidth);
      } else {
        setIsOverflowing(false);
        setOverflowDistance(0);
      }
    };

    measure();

    const observer = new ResizeObserver(() => {
      measure();
    });

    observer.observe(container);
    observer.observe(textEl);

    return () => observer.disconnect();
  }, [children]);

  const scrollTime = overflowDistance > 0 ? overflowDistance / speed : 0;
  const totalDuration = scrollTime * 2 + pauseDuration * 2;

  const t0 = 0;
  const t1 = totalDuration > 0 ? pauseDuration / totalDuration : 0.2;
  const t2 = totalDuration > 0 ? (pauseDuration + scrollTime) / totalDuration : 0.5;
  const t3 = totalDuration > 0 ? (pauseDuration * 2 + scrollTime) / totalDuration : 0.7;
  const t4 = 1;

  const titleText = typeof children === "string" ? children : undefined;

  return (
    <div
      ref={containerRef}
      title={titleText}
      className={cn("relative overflow-hidden w-full max-w-full block min-w-0", className)}
      style={{
        maskImage: isOverflowing
          ? "linear-gradient(to right, black calc(100% - 20px), transparent 100%)"
          : undefined,
        WebkitMaskImage: isOverflowing
          ? "linear-gradient(to right, black calc(100% - 20px), transparent 100%)"
          : undefined,
      }}
    >
      <motion.span
        ref={textRef}
        className="inline-block whitespace-nowrap will-change-transform"
        animate={
          isOverflowing && overflowDistance > 0
            ? {
                x: [0, 0, -overflowDistance, -overflowDistance, 0],
                transition: {
                  duration: totalDuration,
                  times: [t0, t1, t2, t3, t4],
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatDelay,
                },
              }
            : { x: 0 }
        }
      >
        {children}
      </motion.span>
    </div>
  );
}
