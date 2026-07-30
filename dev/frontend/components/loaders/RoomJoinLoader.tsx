"use client";

import React from "react";
import { motion } from "framer-motion";
import { Disc, Radio, Wifi } from "lucide-react";

interface RoomJoinLoaderProps {
  roomId?: string;
  stage?: string;
}

export function RoomJoinLoader({ roomId, stage = "Connecting to room..." }: RoomJoinLoaderProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-xl p-6">
      <div className="flex flex-col items-center text-center space-y-6 max-w-sm">
        {/* Animated Disc / Waves */}
        <div className="relative flex items-center justify-center">
          <motion.div
            animate={{ scale: [1, 1.25, 1], opacity: [0.3, 0.7, 0.3] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            className="absolute w-28 h-28 rounded-full border border-amber-400/40 bg-amber-500/10"
          />
          <div className="w-20 h-20 rounded-full bg-foreground/10 border border-foreground/20 flex items-center justify-center shadow-2xl relative z-10">
            <Radio className="w-10 h-10 text-amber-400 animate-pulse" />
          </div>
        </div>

        {/* Room Details */}
        <div>
          <span className="text-xs font-extrabold uppercase tracking-[0.25em] text-foreground/50">
            SyncBeats Session
          </span>
          <h2 className="text-2xl font-black text-foreground mt-1">
            {roomId ? `Room #${roomId}` : "Joining Room"}
          </h2>
          <div className="flex items-center justify-center gap-2 mt-3 text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3.5 py-1.5 rounded-full">
            <Wifi className="w-3.5 h-3.5 animate-pulse" />
            <span>{stage}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
