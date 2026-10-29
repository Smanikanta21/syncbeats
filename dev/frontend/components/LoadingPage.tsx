"use client";

import { motion, useReducedMotion } from "framer-motion";
import { SyncBeatsMark } from "./brand/SyncBeatsLogo";

export interface LoadingState {
  title: string;
  detail: string;
  progress?: number;
  priority?: number;
}

export function LoadingPage({ title, detail, progress }: LoadingState) {
  const reducedMotion = useReducedMotion();
  const boundedProgress = typeof progress === "number"
    ? Math.max(0, Math.min(100, progress))
    : null;

  return (
    <motion.main
      role="status"
      aria-live="polite"
      aria-label={`${title}. ${detail}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000] flex min-h-dvh items-center justify-center overflow-hidden bg-background px-6 text-foreground"
    >
      <div className="pointer-events-none absolute inset-0 opacity-50" aria-hidden="true">
        <div className="absolute -left-36 top-[12%] h-80 w-80 rounded-full bg-foreground/[0.055] blur-[100px]" />
        <div className="absolute -right-32 bottom-[8%] h-96 w-96 rounded-full bg-foreground/[0.045] blur-[110px]" />
      </div>
      <div className="relative flex w-full max-w-sm flex-col items-center text-center">
        <SyncBeatsMark className="mb-9 h-12 w-12 rounded-2xl" />
        <div className="mb-5 flex h-8 items-end gap-1" aria-hidden="true">
          {[0, 1, 2, 3, 4].map(index => (
            <motion.span
              key={index}
              className="w-1 rounded-full bg-foreground/75"
              animate={reducedMotion ? { height: 13, opacity: 0.7 } : { height: [8, 25, 11, 19, 8], opacity: [0.42, 0.95, 0.6, 0.82, 0.42] }}
              transition={reducedMotion ? { duration: 0 } : { duration: 1.35, repeat: Infinity, ease: "easeInOut", delay: index * 0.11 }}
            />
          ))}
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-xs text-sm leading-6 text-foreground/55">{detail}</p>
        <div className="mt-7 h-px w-44 overflow-hidden rounded-full bg-foreground/10">
          {boundedProgress === null ? (
            <motion.div
              className="h-full w-2/5 rounded-full bg-foreground/55"
              animate={reducedMotion ? { x: 0 } : { x: ["-100%", "250%"] }}
              transition={reducedMotion ? { duration: 0 } : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : (
            <motion.div className="h-full rounded-full bg-foreground/70" animate={{ width: `${boundedProgress}%` }} transition={{ duration: 0.3 }} />
          )}
        </div>
      </div>
    </motion.main>
  );
}
