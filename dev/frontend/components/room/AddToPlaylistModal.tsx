"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Loader2, Music2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddToPlaylistModalProps {
  isOpen: boolean;
  track: {
    id: string; // The youtube video ID
    title: string;
    artist?: string;
    thumbnail?: string;
  } | null;
  playlists: any[]; // The user's YouTube playlists
  onAdd: (playlistId: string, videoId: string) => Promise<void>;
  onClose: () => void;
}

export function AddToPlaylistModal({
  isOpen,
  track,
  playlists,
  onAdd,
  onClose,
}: AddToPlaylistModalProps) {
  const [addingToId, setAddingToId] = useState<string | null>(null);
  const [addedToId, setAddedToId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !track) return null;

  const handleAdd = async (playlistId: string) => {
    setAddingToId(playlistId);
    setError(null);
    try {
      await onAdd(playlistId, track.id);
      setAddedToId(playlistId);
      setTimeout(() => {
        setAddedToId(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to add track to playlist");
    } finally {
      setAddingToId(null);
    }
  };

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
                Add to YouTube Playlist
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

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded-lg">
              {error}
            </div>
          )}

          {/* Playlist List */}
          <div className="max-h-60 overflow-y-auto space-y-2 pr-1 -mr-1 custom-scrollbar">
            {playlists.length === 0 ? (
              <p className="text-sm text-white/50 text-center py-4">
                No YouTube playlists found.
              </p>
            ) : (
              playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => handleAdd(playlist.id)}
                  disabled={addingToId !== null || addedToId === playlist.id}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/10 active:bg-white/5 transition-colors disabled:opacity-50 text-left"
                >
                  <img
                    src={playlist.thumbnail || playlist.coverUrl}
                    alt=""
                    className="w-10 h-10 object-cover rounded-lg bg-white/5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {playlist.title || playlist.name}
                    </p>
                    <p className="text-[10px] text-white/50 uppercase tracking-widest">
                      {playlist.itemCount} Tracks
                    </p>
                  </div>
                  <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white/5">
                    {addingToId === playlist.id ? (
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : addedToId === playlist.id ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <Plus className="w-4 h-4 text-white" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
