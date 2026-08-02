"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, ServerOff, RefreshCw, AlertTriangle } from "lucide-react";
import { useConnection } from "../context/ConnectionContext";

export function ConnectionStatusModal() {
  const { isOnline, isServerReachable, serverError, retryNow } = useConnection();

  // Show modal if user is offline OR server is unreachable
  const isOffline = !isOnline;
  const isServerDown = isOnline && (!isServerReachable || !!serverError);
  const shouldShowModal = isOffline || isServerDown;

  return (
    <AnimatePresence>
      {shouldShowModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-4 select-none touch-none pointer-events-auto"
        >
          {/* Animated Background Glow */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vw] h-[70vw] rounded-full blur-[140px] opacity-25 animate-pulse ${
                isOffline ? "bg-amber-600/30" : "bg-red-600/30"
              }`}
            />
          </div>

          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 260 }}
            className="w-full max-w-md bg-background/95 dark:bg-[#0B0F17]/95 border border-foreground/15 dark:border-white/10 rounded-[2.5rem] p-7 flex flex-col items-center text-center shadow-[0_32px_80px_rgba(0,0,0,0.7)] relative z-10 overflow-hidden"
          >
            {/* Icon Banner */}
            <div
              className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-5 border shadow-2xl ${
                isOffline
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-500 shadow-amber-500/20"
                  : "bg-red-500/10 border-red-500/30 text-red-500 shadow-red-500/20"
              }`}
            >
              {isOffline ? (
                <WifiOff className="w-10 h-10 animate-bounce" />
              ) : (
                <ServerOff className="w-10 h-10 animate-pulse" />
              )}
            </div>

            {/* Title */}
            <h2 className="text-2xl font-black tracking-tight text-foreground mb-2">
              {isOffline ? "Network Connection Lost" : "Cannot Reach SyncBeats Server"}
            </h2>

            {/* Description */}
            <p className="text-sm text-foreground/60 leading-relaxed mb-6 max-w-xs font-medium">
              {isOffline
                ? "Your internet connection was interrupted. Please check your Wi-Fi or mobile data."
                : "Unable to connect to the SyncBeats server. The server might be restarting or temporarily offline."}
            </p>

            {/* Status Indicator Pill */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-foreground/5 border border-foreground/10 text-xs font-bold text-foreground/70 mb-6">
              <span
                className={`w-2 h-2 rounded-full animate-ping ${
                  isOffline ? "bg-amber-500" : "bg-red-500"
                }`}
              />
              <span>
                {isOffline ? "Waiting for internet..." : "Attempting automatic reconnection..."}
              </span>
            </div>

            {/* Action Button */}
            <button
              type="button"
              onClick={retryNow}
              className="w-full py-3.5 rounded-2xl bg-foreground text-background font-bold text-sm tracking-wide shadow-xl hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Retry Connection</span>
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
