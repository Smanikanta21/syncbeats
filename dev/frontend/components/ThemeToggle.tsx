"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";

interface ThemeToggleProps {
  size?: "sm" | "md";
  className?: string;
}

export function runCelestialTransition(
  _originX: number,
  _originY: number,
  _toDark: boolean,
  onSwap: () => void,
  onDone: () => void,
) {
  onSwap();
  onDone();
}

/* ─── Standard Clean Theme Switcher ─────────────────────────────────────── */
export function ThemeToggle({ size = "sm", className }: ThemeToggleProps) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.preventDefault();
      const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", nextTheme);
      setTheme(nextTheme);
      try {
        const ch = new BroadcastChannel("theme-sync");
        ch.postMessage({ theme: nextTheme });
        ch.close();
      } catch {}
    },
    [resolvedTheme, setTheme],
  );

  if (!mounted) return null;

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "rounded-full glass-panel hover:scale-110 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-accent-primary/50 flex items-center justify-center shrink-0 cursor-pointer",
        size === "sm" ? "p-1.5 w-7 h-7" : "p-2 w-8 h-8",
        className
      )}
      aria-label="Toggle theme"
      title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={resolvedTheme}
          initial={{ scale: 0.6, opacity: 0, rotate: -45 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.6, opacity: 0, rotate: 45 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          {resolvedTheme === "dark" ? (
            <Moon className={cn(size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4", "text-foreground")} />
          ) : (
            <Sun className={cn(size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4", "text-amber-400")} />
          )}
        </motion.div>
      </AnimatePresence>
    </button>
  );
}
