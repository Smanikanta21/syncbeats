"use client";

import { motion } from "framer-motion";
import { Disc } from "lucide-react";

interface LoadingScreenProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingScreen({ message = "Loading...", fullScreen = true }: LoadingScreenProps) {
  const containerClasses = fullScreen
    ? "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/80 backdrop-blur-md"
    : "w-full h-full min-h-[400px] flex flex-col items-center justify-center bg-transparent";

  return (
    <div className={containerClasses}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center gap-6"
      >
        <div className="relative">
          <div className="w-20 h-20 rounded-full border border-foreground/10 flex items-center justify-center bg-foreground/5 shadow-2xl relative z-10">
            <Disc className="w-10 h-10 text-foreground animate-[spin_2s_linear_infinite]" />
          </div>
          {/* Glowing aura */}
          <div className="absolute inset-0 bg-foreground/20 blur-xl rounded-full animate-pulse" />
        </div>
        <p className="text-sm font-bold tracking-widest uppercase text-foreground/50 animate-pulse">
          {message}
        </p>
      </motion.div>
    </div>
  );
}
