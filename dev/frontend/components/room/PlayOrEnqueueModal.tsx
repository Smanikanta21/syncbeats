"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Plus, X, Music2 } from "lucide-react";

interface PlayOrEnqueueModalProps {
  isOpen: boolean;
  track: {
    title: string;
    artist?: string;
    thumbnail?: string;
    url: string;
  } | null;
  onPlayNow: () => void;
  onAddToQueue: () => void;
  onClose: () => void;
}

export function PlayOrEnqueueModal({
  isOpen,
  track,
  onPlayNow,
  onAddToQueue,
  onClose,
}: PlayOrEnqueueModalProps) {
  if (!isOpen || !track) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          className="w-full max-w-sm bg-neutral-900/90 border border-white/10 p-5 rounded-3xl shadow-2xl backdrop-blur-2xl relative overflow-hidden flex flex-col gap-4 text-white"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Track Header */}
          <div className="flex items-center gap-3 pr-6">
            <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white/10 shrink-0 border border-white/10 shadow-lg flex items-center justify-center">
              {track.thumbnail ? (
                <img
                  src={track.thumbnail}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music2 className="w-6 h-6 text-white/50" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Track Selected
              </span>
              <h3 className="text-sm font-bold text-white truncate mt-1">
                {track.title}
              </h3>
              {track.artist && (
                <p className="text-xs text-white/50 truncate mt-0.5">
                  {track.artist}
                </p>
              )}
            </div>
          </div>

          <p className="text-xs text-white/70">
            A song is currently playing in the room. What would you like to do?
          </p>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5 mt-1">
            <button
              onClick={() => {
                onPlayNow();
                onClose();
              }}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white text-black font-extrabold text-xs shadow-lg hover:bg-white/90 active:scale-95 transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Play Now
            </button>
            <button
              onClick={() => {
                onAddToQueue();
                onClose();
              }}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/10 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add to Queue
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
