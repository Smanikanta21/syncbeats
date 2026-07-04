"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Music2, Shuffle, Repeat, Repeat1, Plus, Disc,
  Trash2, Play
} from "lucide-react";
import type { TrackQueueItem } from "../../lib/types";

type RepeatMode = "off" | "track" | "all";

interface RoomQueueProps {
  queue: TrackQueueItem[];
  isHost: boolean;
  roomId: string;
  onTrackSelect?: (item: TrackQueueItem) => void;
  onAddSong?: () => void;
  onRemoveTrack?: (id: string) => void;
  isPlaying?: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
}

function cleanTitle(t: string) {
  return (
    t
      .replace(/\s*[\[\(].*?(official|music|video|audio|lyric|hd|hq|4k|live).*?[\)\]]/gi, "")
      .replace(/\s*-\s*.*?(official|music|video|audio).*$/gi, "")
      .trim() || t
  );
}

function ytThumb(trackUrl: string | null | undefined) {
  if (!trackUrl) return null;
  const m = trackUrl.match(/^ws-p2p:yt:([^_]+)_/);
  return m ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : null;
}

export function RoomQueue({
  queue, isHost, roomId, onTrackSelect, onAddSong, onRemoveTrack, isPlaying = false,
  shuffle, repeatMode, onToggleShuffle, onToggleRepeat
}: RoomQueueProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const RepeatIcon = repeatMode === "track" ? Repeat1 : Repeat;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Music2 className="w-4 h-4 text-foreground dark:text-foreground" />
          <span className="text-xs font-black uppercase tracking-widest text-foreground/50">Queue</span>
          {queue.length > 0 && (
            <span className="text-[10px] font-black text-foreground/20">{queue.length}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Shuffle */}
          <button
            onClick={onToggleShuffle}
            className={`p-2 rounded-xl transition-all duration-200 ${
              shuffle
                ? "bg-foreground/20 text-foreground dark:text-foreground"
                : "text-foreground/30 hover:text-foreground/60 hover:bg-foreground/[0.05]"
            }`}
            title="Shuffle"
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>

          {/* Repeat */}
          <button
            onClick={onToggleRepeat}
            className={`p-2 rounded-xl transition-all duration-200 relative ${
              repeatMode !== "off"
                ? "bg-foreground/20 text-foreground dark:text-foreground"
                : "text-foreground/30 hover:text-foreground/60 hover:bg-foreground/[0.05]"
            }`}
            title={`Repeat: ${repeatMode}`}
          >
            <RepeatIcon className="w-3.5 h-3.5" />
          </button>

          {/* Add */}
          <button
            onClick={onAddSong}
            className="p-2 rounded-xl text-foreground/30 hover:text-foreground/60 hover:bg-foreground/[0.05] transition-all"
            title="Add song"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Queue list */}
      {queue.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-foreground/[0.05] flex items-center justify-center">
            <Disc className="w-6 h-6 text-foreground/20 animate-[spin_6s_linear_infinite]" />
          </div>
          <div>
            <p className="text-foreground/30 text-sm font-semibold">Queue is empty</p>
            <p className="text-foreground/15 text-xs mt-1">Add songs to get the party started</p>
          </div>
          <button
            onClick={onAddSong}
            className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground/20 text-foreground dark:text-foreground text-xs font-bold hover:bg-foreground/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add a song
          </button>
        </div>
      ) : (
        <div
          ref={listRef}
          data-lenis-prevent="true"
          className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(128,128,128,0.15) transparent" }}
        >
          {queue.map((item, idx) => {
            const thumb = ytThumb(item.trackUrl);
            const isCurrent = item.isCurrent;
            const isHovered = hoveredId === item.id;

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                onHoverStart={() => setHoveredId(item.id)}
                onHoverEnd={() => setHoveredId(null)}
                className={`relative flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer group transition-all duration-150 ${
                  isCurrent
                    ? "bg-foreground/20 border border-foreground/20"
                    : "border border-transparent hover:bg-foreground/[0.04]"
                }`}
                onClick={() => onTrackSelect?.(item)}
              >
                {/* Track number / playing indicator */}
                <div className="w-5 shrink-0 flex items-center justify-center">
                  {isCurrent ? (
                    <div className="flex gap-[2px] h-4 items-end">
                      {isPlaying ? (
                        <>
                          <motion.div
                            className="w-[3px] rounded-full bg-foreground text-background dark:bg-foreground"
                            animate={{ height: ["30%", "100%", "60%", "100%", "30%"] }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                          />
                          <motion.div
                            className="w-[3px] rounded-full bg-foreground text-background dark:bg-foreground"
                            animate={{ height: ["100%", "30%", "100%", "50%", "100%"] }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: "linear", delay: 0.2 }}
                          />
                          <motion.div
                            className="w-[3px] rounded-full bg-foreground text-background dark:bg-foreground"
                            animate={{ height: ["60%", "100%", "30%", "80%", "60%"] }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: "linear", delay: 0.4 }}
                          />
                        </>
                      ) : (
                        <>
                          <div className="w-[3px] h-[30%] rounded-full bg-foreground text-background dark:bg-foreground opacity-50" />
                          <div className="w-[3px] h-[60%] rounded-full bg-foreground text-background dark:bg-foreground opacity-50" />
                          <div className="w-[3px] h-[40%] rounded-full bg-foreground text-background dark:bg-foreground opacity-50" />
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      <span className="text-[11px] font-bold text-foreground/20 group-hover:opacity-0 transition-opacity">
                        {idx + 1}
                      </span>
                      {isHovered && (
                        <Play className="absolute w-3.5 h-3.5 text-foreground/60 fill-foreground/60" />
                      )}
                    </>
                  )}
                </div>

                {/* Thumbnail */}
                <div className={`w-9 h-9 rounded-lg shrink-0 overflow-hidden flex items-center justify-center ${thumb ? "" : "bg-foreground/10"}`}>
                  {thumb ? (
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Disc className={`w-5 h-5 ${isCurrent ? "text-foreground dark:text-foreground" : "text-foreground/30"}`} />
                  )}
                </div>

                {/* Title + Added by */}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold truncate ${isCurrent ? "text-foreground dark:text-foreground" : "text-foreground/80"}`}>
                    {cleanTitle(item.title)}
                  </div>
                  {item.addedByName && (
                    <div className="text-[10px] text-foreground/25 truncate mt-0.5">
                      Added by {item.addedByName}
                    </div>
                  )}
                </div>

                {/* Remove button (host only) */}
                {isHost && isHovered && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={e => { e.stopPropagation(); onRemoveTrack?.(item.id); }}
                    className="shrink-0 p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </motion.button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
