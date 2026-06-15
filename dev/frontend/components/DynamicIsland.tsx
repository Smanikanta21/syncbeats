"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import {
  Disc,
  Pause,
  Play,
  SkipForward,
  SkipBack,
  Upload,
  Music2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play as Youtube,
  Star,
  Cast,
  Activity,
  ChevronLeft,
  Search,
  Plus,
  FastForward,
  Rewind,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { SpatialAudioEngine } from "../audio/SpatialAudioEngine";
import { useAuth } from "../context/AuthContext";
import { useAudio } from "../context/AudioContext";
import { useUpload } from "../context/UploadContext";
import { getSocket } from "../lib/socket";
import { roomsApi } from "../lib/api";
import { formatTime } from "../hooks/useAudioPlayer";
import { ThemeToggle } from "./ThemeToggle";
import { useSyncInfo } from "../context/SyncContext";
import { useNetworkStats, qualityColor } from "../hooks/useNetworkStats";

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

const SPRING = {
  type: "spring" as const,
  stiffness: 320,
  damping: 32,
  mass: 1.1,
};
const COMPACT_WIDTH = 160;
const COMPACT_HEIGHT = 50;
const EXPANDED_HEIGHT = 350;

type IslandTab = "player" | "network" | "youtube";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const cleanTrackTitle = (title: string | undefined): string => {
  if (!title) return "Unknown Track";
  return (
    title
      .replace(
        /\s*[\[\(].*?(official|music|video|audio|lyric|lyrics|hd|hq|4k|live).*?[\)\]]/gi,
        "",
      )
      .replace(/\s*-\s*.*?(official|music|video|audio).*$/gi, "")
      .replace(/\s*[\[\(](official|lyric|lyrics|video)[\)\]]/gi, "")
      .trim() || "Unknown Track"
  );
};

// ─────────────────────────────────────────────────────────
// AudioBars
// ─────────────────────────────────────────────────────────

const AudioBars = ({
  isPlaying,
  isSmall,
}: {
  isPlaying: boolean;
  isSmall?: boolean;
}) => {
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPlaying) {
      if (barsRef.current) {
        const children = barsRef.current.children;
        for (let i = 0; i < children.length; i++) {
          (children[i] as HTMLElement).style.height = "20%";
        }
      }
      return;
    }

    let rafId: number;
    const currentHeights = [20, 20, 20, 20];
    const targetHeights = [20, 20, 20, 20];
    let lastShiftTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const data = SpatialAudioEngine.getInstance().getFrequencyData();

      let currentBeat = 0;
      if (data && data.length > 40) {
        let sum = 0;
        // Focus on a narrow band for punchy bass/kicks (bins 2-6)
        for (let i = 2; i <= 6; i++) {
          sum += data[i];
        }
        let avg = sum / 5;

        // Subtract a noise floor to make the bounces much more dynamic
        currentBeat = Math.max(0, avg - 100) * 1.5;
      }

      let newTarget = 20;
      if (currentBeat > 0) {
        newTarget = Math.min(20 + (currentBeat / 155) * 80, 100);
      }

      if (now - lastShiftTime > 90) {
        targetHeights[0] = targetHeights[1];
        targetHeights[1] = targetHeights[2];
        targetHeights[2] = targetHeights[3];
        targetHeights[3] = newTarget;
        lastShiftTime = now;
      } else {
        // Peak-hold the current bin for responsiveness
        if (newTarget > targetHeights[3]) {
          targetHeights[3] = newTarget;
        } else {
          // Allow it to decay a bit faster to emphasize the punch
          targetHeights[3] = targetHeights[3] * 0.85 + newTarget * 0.15;
        }
      }

      for (let i = 0; i < 4; i++) {
        currentHeights[i] += (targetHeights[i] - currentHeights[i]) * 0.4;

        if (barsRef.current) {
          const children = barsRef.current.children;
          if (children[i]) {
            (children[i] as HTMLElement).style.height = `${currentHeights[i]}%`;
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

  const hClass = isSmall ? "h-3.5" : "h-5";
  const wClass = isSmall ? "w-[3px]" : "w-1.5";
  const gapClass = isSmall ? "gap-[2px]" : "gap-1";

  return (
    <div ref={barsRef} className={`flex items-end ${gapClass} ${hClass}`}>
      <div
        className={`${wClass} bg-white/60 rounded-full`}
        style={{ height: "20%" }}
      />
      <div
        className={`${wClass} bg-white/60 rounded-full`}
        style={{ height: "20%" }}
      />
      <div
        className={`${wClass} bg-white/60 rounded-full`}
        style={{ height: "20%" }}
      />
      <div
        className={`${wClass} bg-white/60 rounded-full`}
        style={{ height: "20%" }}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// CompactProgressBar
// ─────────────────────────────────────────────────────────

const CompactProgressBar = ({ isPlaying }: { isPlaying: boolean }) => {
  const barRef = useRef<HTMLDivElement>(null);
  const audio = useAudio();

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const pos = audio.getTruePosition();
      const dur = Math.max(1, audio.duration);
      const progress = Math.min(1, pos / dur);

      if (barRef.current) barRef.current.style.width = `${progress * 100}%`;

      if (isPlaying) {
        rafId = requestAnimationFrame(tick);
      }
    };
    
    tick();

    if (isPlaying) {
      rafId = requestAnimationFrame(tick);
    }
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, audio]);

  return (
    <div className="w-[80%] mx-auto mt-0.5 h-0.75 bg-white/20 rounded-full overflow-hidden shrink-0">
      <div
        ref={barRef}
        className="h-full bg-white/80 rounded-full"
        style={{ width: "0%", transition: isPlaying ? "none" : "width 200ms ease" }}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// CompactState
// ─────────────────────────────────────────────────────────

interface CompactStateProps {
  isExpanded: boolean;
  effectivePlaying: boolean;
  trackTitle: string;
  trackUrl: string | null;
  progress: number;
  hasTrack: boolean;
  seekIndicator: { amount: number; text: string } | null;
  isReady: boolean;
  error: string | null;
  downloadProgress: number;
  showDetails: boolean;
  isRoom?: boolean;
  roomParticipants?: any[];
}

const CompactState = ({
  isExpanded,
  effectivePlaying,
  hasTrack,
  trackUrl,
  trackTitle,
  seekIndicator,
  isReady,
  error,
  downloadProgress,
  showDetails,
  isRoom,
  roomParticipants,
}: CompactStateProps) => {
  const isYt = !!trackUrl?.startsWith("youtube:");
  const ytMatch = trackUrl?.match(/^ws-p2p:yt:([^_]+)_/);
  const videoId = ytMatch ? ytMatch[1] : null;
  const thumbnailUrl = videoId
    ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    : null;
  const trackInitials = cleanTrackTitle(trackTitle)
    .substring(0, 2)
    .toUpperCase();

  const isRoomReady = isRoom && roomParticipants ? roomParticipants.every(p => p.isReady) : true;
  const isFullyReady = isReady && isRoomReady;
  const loadingParticipants = isRoom && roomParticipants ? roomParticipants.filter(p => !p.isReady) : [];

  if (!hasTrack) {
    return (
      <motion.div
        className="absolute inset-0 flex items-center pointer-events-none"
        animate={{ opacity: isExpanded ? 0 : 1 }}
        transition={{ duration: 0.15 }}
      >
        <div className="w-full h-full p-0.5">
          <div className="w-full h-full bg-white/10 rounded-full flex items-center px-4 text-white/50 text-sm gap-2">
            <Search className="w-4 h-4" />
            <span>Search YouTube or upload...</span>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="absolute inset-0 flex items-center pointer-events-none"
      animate={{
        opacity: isExpanded ? 0 : 1,
        scale: isExpanded ? 0.96 : 1,
        filter: isExpanded ? "blur(4px)" : "blur(0px)",
      }}
      transition={{
        opacity: { duration: 0.15, delay: isExpanded ? 0 : 0.2 },
        filter: { duration: 0.15, delay: isExpanded ? 0 : 0.2 },
        scale: SPRING,
      }}
      style={{ zIndex: isExpanded ? 0 : 1 }}
    >
      <div className="flex items-center px-3 w-full h-full gap-3">
        <div
          className={`flex items-center justify-center shrink-0 border overflow-hidden w-7 h-7 rounded-lg ${
            thumbnailUrl
              ? "border-white/20"
              : isYt
                ? "bg-[#FF0000]/10 border-[#FF0000]/20"
                : "bg-linear-to-br from-white/10 to-white/5 border-white/10"
          }`}
        >
          {thumbnailUrl ? (
            <img src={thumbnailUrl} className="w-full h-full object-cover" />
          ) : isYt ? (
            <Youtube className="w-4 h-4 text-[#FF0000]" />
          ) : (
            <Disc className={`w-4 h-4 text-white/40 ${effectivePlaying && !thumbnailUrl ? 'animate-[spin_4s_linear_infinite]' : ''}`} />
          )}
        </div>
        
        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="flex-1 min-w-0 overflow-hidden whitespace-nowrap"
            >
              <div className="flex flex-col justify-center min-w-0 pr-2">
                <div className="text-center text-white text-[11px] sm:text-xs font-semibold truncate leading-tight"> 
                  {cleanTrackTitle(trackTitle).split(/\s+/).slice(0, 6).join(" ")}
                </div>
                <CompactProgressBar isPlaying={effectivePlaying} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center pr-1 shrink-0 ml-auto pointer-events-auto">
          {seekIndicator ? (
            <div className="flex items-center gap-1 text-white/80 text-[11px] font-bold bg-white/10 px-2 py-1 rounded-full">
               {seekIndicator.amount > 0 ? <FastForward className="w-3 h-3" /> : <Rewind className="w-3 h-3" />}
               {seekIndicator.text}
            </div>
          ) : error ? (
            <div className="flex items-center gap-1 text-[#FF0000]/80 text-[10px] font-bold uppercase tracking-wider pr-1 group relative cursor-help">
              <AlertCircle className="w-3 h-3" /> Failed
              <div className="absolute bottom-full right-0 mb-2 w-48 bg-black/90 text-white text-[10px] p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-center border border-white/10 pointer-events-none normal-case tracking-normal">
                Tap the island to view error details.
              </div>
            </div>
          ) : !isFullyReady ? (
            <div className="flex items-center gap-1 text-white/50 text-[10px] font-bold uppercase tracking-wider pr-1">
              <Loader2 className="w-3 h-3 animate-spin" /> {loadingParticipants.length > 0 ? "Syncing..." : `${downloadProgress}%`}
            </div>
          ) : effectivePlaying ? (
            <AudioBars isPlaying={effectivePlaying} isSmall />
          ) : (
            <div className="flex items-center gap-1 text-white/50 text-[10px] font-bold uppercase tracking-wider pr-1">
              <Pause className="w-3 h-3" /> Paused
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────
// RealtimeProgressBar
// ─────────────────────────────────────────────────────────

const RealtimeProgressBar = ({ duration, onSeek, isPlaying }: { duration: number; onSeek: (pos: number) => void; isPlaying: boolean }) => {
  const barRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const leftTimeRef = useRef<HTMLSpanElement>(null);
  const rightTimeRef = useRef<HTMLSpanElement>(null);
  const audio = useAudio();

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const pos = audio.getTruePosition();
      const dur = Math.max(1, duration || audio.duration);
      const progress = Math.min(1, pos / dur);

      if (barRef.current) barRef.current.style.width = `${progress * 100}%`;
      if (handleRef.current) handleRef.current.style.left = `calc(${progress * 100}% - 6px)`;
      if (leftTimeRef.current) leftTimeRef.current.textContent = formatTime(pos);
      if (rightTimeRef.current) rightTimeRef.current.textContent = "-" + formatTime(Math.max(0, dur - pos));

      if (isPlaying) {
        rafId = requestAnimationFrame(tick);
      }
    };
    
    tick();

    if (isPlaying) {
      rafId = requestAnimationFrame(tick);
    }
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, duration, audio]);

  return (
    <div className="flex items-center gap-3 w-full mt-2">
      <span ref={leftTimeRef} className="text-[12px] font-medium text-white/50 font-mono w-9 text-right select-none pointer-events-none">
        0:00
      </span>
      <div
        className="relative flex-1 h-8 flex items-center cursor-pointer group"
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          onSeek(p * duration);
        }}
      >
        <div className="absolute w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            ref={barRef}
            className="h-full bg-white/80 rounded-full"
            style={{ width: "0%", transition: isPlaying ? "none" : "width 200ms ease" }}
          />
        </div>
        <div
          ref={handleRef}
          className="absolute w-3 h-3 rounded-full bg-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: "-6px" }}
        />
      </div>
      <span ref={rightTimeRef} className="text-[12px] font-medium text-white/50 font-mono w-9 text-left select-none pointer-events-none">
        -0:00
      </span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Expanded Tabs
// ─────────────────────────────────────────────────────────

const tabVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
    filter: "blur(4px)",
  }),
  center: {
    x: 0,
    opacity: 1,
    filter: "blur(0px)",
  },
  exit: (direction: number) => ({
    x: direction < 0 ? "100%" : "-100%",
    opacity: 0,
    filter: "blur(4px)",
  }),
};

const PlayerTab = ({
  effectivePlaying,
  trackTitle,
  trackUrl,
  isReady,
  error,
  downloadProgress,
  progress,
  displayTime,
  duration,
  hasTrack,
  onToggle,
  onNext,
  onPrev,
  onSeek,
  onTabChange,
  isRoom,
  roomParticipants,
}: any) => {
  const isYt = !!trackUrl?.startsWith("youtube:");
  const ytMatch = trackUrl?.match(/^ws-p2p:yt:([^_]+)_/);
  const videoId = ytMatch ? ytMatch[1] : null;
  const thumbnailUrl = videoId
    ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    : null;
  const trackInitials = cleanTrackTitle(trackTitle)
    .substring(0, 2)
    .toUpperCase();

  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const isRoomReady = isRoom && roomParticipants ? roomParticipants.every((p: any) => p.isReady) : true;
  const loadingParticipants = isRoom && roomParticipants ? roomParticipants.filter((p: any) => !p.isReady) : [];

  return (
    <div className="absolute inset-0 flex flex-col justify-evenly px-5 sm:px-8 py-8 sm:py-10">
      <div className="flex items-start gap-3 sm:gap-4 w-full">
        <div
          className={`flex items-center justify-center shrink-0 border overflow-hidden w-15 h-15 sm:w-17 sm:h-17 rounded-[14px] shadow-lg ${
            thumbnailUrl
              ? "border-white/20"
              : isYt
                ? "bg-[#FF0000]/10 border-[#FF0000]/20"
                : "bg-linear-to-br from-white/10 to-white/5 border-white/10"
          }`}
        >
          {thumbnailUrl ? (
            <img src={thumbnailUrl} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-black text-white/80">
              {trackInitials}
            </span>
          )}
        </div>
        <div className="flex flex-col justify-center flex-1 min-w-0 pt-1">
          <div className="font-semibold text-white text-[17px] truncate leading-tight">
            {cleanTrackTitle(trackTitle)}
          </div>
          
          <div
            className={`text-[13px] sm:text-[15px] truncate mt-0.5 transition-colors ${
              error ? "text-[#FF0000]/80 cursor-pointer hover:text-[#FF0000]" : "text-white/50"
            }`}
            onClick={(e) => {
              if (error) {
                e.stopPropagation();
                setShowErrorDetails((prev) => !prev);
              }
            }}
          >
            {error ? (
              <span className="flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Failed to pull • Tap for info</span>
            ) : isReady && !isRoomReady ? (
              "Syncing to peers..."
            ) : isReady ? (
              "Ready to play"
            ) : (
              `Buffering... ${downloadProgress}%`
            )}
          </div>

          <AnimatePresence>
            {error && showErrorDetails && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-[#FF0000]/10 border border-[#FF0000]/20 rounded-lg p-2.5 text-[11px] sm:text-xs text-[#FF0000]/90 leading-relaxed whitespace-normal cursor-text pointer-events-auto" onClick={e => e.stopPropagation()}>
                  <p className="font-bold mb-1">Track Transfer Failed</p>
                  <p className="opacity-80 wrap-break-word">{error}</p>
                  <p className="mt-1.5 opacity-80">
                    If this persists, ask the host to re-select the track. 
                  </p>
                </div>
              </motion.div>
            )}
            
            {hasTrack && isRoom && loadingParticipants.length > 0 && !error && !showErrorDetails && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="overflow-hidden"
              >
                 <div className="flex items-center gap-2 flex-wrap max-h-12 overflow-y-auto custom-scrollbar pr-1 pointer-events-auto" onClick={e => e.stopPropagation()}>
                    {loadingParticipants.map((p: any) => (
                       <div key={p.socketId} className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1">
                          <Loader2 className="w-3 h-3 text-white/50 animate-spin shrink-0" />
                          <span className="text-white/80 text-[10px] font-bold uppercase truncate max-w-20">{p.displayName}</span>
                       </div>
                    ))}
                 </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center shrink-0 pr-1 pt-1">
          {error ? (
             <AlertCircle className="w-5 h-5 text-[#FF0000]/80" />
          ) : (!isReady || !isRoomReady) ? (
             <Loader2 className="w-5 h-5 text-white/50 animate-spin" />
          ) : (
             <AudioBars isPlaying={effectivePlaying} isSmall={false} />
          )}
        </div>
      </div>

      <RealtimeProgressBar duration={duration} onSeek={onSeek} isPlaying={effectivePlaying} />

      <div className="flex items-center justify-between w-full">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTabChange("network");
          }}
          className="p-1 sm:p-2 hover:bg-white/10 rounded-full transition-colors pointer-events-auto active:scale-95"
        >
          <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-white/50 hover:text-white" />
        </button>

        <div className="flex items-center justify-center gap-6 sm:gap-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPrev(e);
            }}
            className="p-1 sm:p-2 hover:bg-white/10 rounded-full transition-colors active:scale-95"
          >
            <SkipBack
              className="w-7 h-7 sm:w-8 sm:h-8 text-white"
              fill="currentColor"
            />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(e);
            }}
            className="p-1 sm:p-2 hover:bg-white/10 rounded-full transition-colors active:scale-95"
          >
            {effectivePlaying ? (
              <Pause
                className="w-9 h-9 sm:w-10 sm:h-10 text-white"
                fill="currentColor"
              />
            ) : (
              <Play
                className="w-9 h-9 sm:w-10 sm:h-10 ml-1 text-white"
                fill="currentColor"
              />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNext(e);
            }}
            className="p-1 sm:p-2 hover:bg-white/10 rounded-full transition-colors active:scale-95"
          >
            <SkipForward
              className="w-7 h-7 sm:w-8 sm:h-8 text-white"
              fill="currentColor"
            />
          </button>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onTabChange("youtube");
          }}
          className="p-1 sm:p-2 hover:bg-white/10 rounded-full transition-colors pointer-events-auto active:scale-95"
        >
          <Youtube className="w-5 h-5 sm:w-6 sm:h-6 text-white/50 hover:text-white" />
        </button>
      </div>
    </div>
  );
};

const NetworkTab = ({
  onBack,
  netStats,
}: {
  onBack: () => void;
  netStats: any;
}) => {
  const history = netStats.history || [];
  const maxLat = Math.max(...history.map((h: any) => h.latency), 100);

  return (
    <div className="absolute inset-0 flex flex-col px-5 sm:px-8 py-8 sm:py-10">
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBack();
          }}
          className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h3 className="text-white font-bold tracking-widest uppercase">
          Network Health
        </h3>
      </div>

      <div className="flex-1 flex flex-col gap-4">
        <div className="flex justify-between items-end">
          <div className="flex flex-col">
            <span className="text-white/50 text-xs font-bold uppercase tracking-widest">
              Latency
            </span>
            <span
              className="text-white font-black text-3xl"
              style={{ color: qualityColor(netStats.quality) }}
            >
              {Math.round(netStats.latency || 0)}
              <span className="text-lg text-white/50 ml-1">ms</span>
            </span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-white/50 text-xs font-bold uppercase tracking-widest">
              Jitter
            </span>
            <span className="text-white font-bold text-xl">
              {Math.round(netStats.jitter || 0)}ms
            </span>
          </div>
        </div>

        <div className="w-full h-24 bg-white/5 rounded-xl border border-white/10 p-2 flex items-end gap-[2px]">
          {history.slice(-40).map((s: any, i: number) => {
            const hPct = Math.max(5, (s.latency / maxLat) * 100);
            return (
              <div
                key={i}
                className="flex-1 bg-white/40 rounded-sm transition-all duration-300"
                style={{ height: `${hPct}%` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

const YouTubeTab = ({
  roomId,
  onBack,
  onResultsCountChange,
  query,
  setQuery,
  isSearchOnly,
}: any) => {
  const upload = useUpload();
  const [results, setResults] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [enqueuing, setEnqueuing] = useState<string | null>(null);
  const [addedSongs, setAddedSongs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const sugs = await roomsApi.suggestYoutube(query);
        setSuggestions(sugs);
      } catch (err) {}
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (isSearching) {
      onResultsCountChange(1); // Force expand while searching
    } else {
      onResultsCountChange(
        showSuggestions && suggestions.length > 0
          ? suggestions.length
          : results.length,
      );
    }
  }, [
    isSearching,
    showSuggestions,
    suggestions.length,
    results.length,
    onResultsCountChange,
  ]);

  const performSearch = async (q: string) => {
    if (!q.trim()) return;
    setIsSearching(true);
    setShowSuggestions(false);
    try {
      const res = await roomsApi.searchYoutube(roomId, q);
      setResults(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  const handlePlay = async (result: any) => {
    setEnqueuing(result.url);
    try {
      const videoId =
        result.url.split("v=")[1]?.split("&")[0] ||
        result.url.split("youtu.be/")[1]?.split("?")[0];
      await upload.downloadYoutubeToP2P(roomId, videoId, result.title);
      setAddedSongs((prev) => new Set(prev).add(result.url));
    } catch (err) {
      console.error(err);
    } finally {
      setEnqueuing(null);
    }
  };

  const isCentered = !query.trim() && !isSearching && results.length === 0;
  const containerPadding = isSearchOnly ? "p-[2px]" : "px-5 sm:px-8 py-6";

  return (
    <div className={`absolute inset-0 flex flex-col ${containerPadding}`}>
      <motion.div
        layout
        transition={SPRING}
        className={`flex items-start gap-3 shrink-0 relative z-50 ${isCentered && !isSearchOnly ? "my-auto" : isSearchOnly ? "m-0 h-full" : "mb-4"}`}
      >
        {!isSearchOnly && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBack();
            }}
            className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors shrink-0 mt-0.5"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <form onSubmit={handleSearch} className="flex-1 relative h-full">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onClick={(e) => {
              e.stopPropagation();
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setShowSuggestions(false)}
            placeholder="Search YouTube or upload..."
            className={`w-full h-full bg-white/10 border border-white/20 rounded-full pl-10 ${query ? "pr-4" : "pr-10"} text-white text-sm placeholder-white/40 focus:outline-none focus:bg-white/20 transition-all ${!isSearchOnly ? "py-2.5" : ""}`}
            autoFocus={isSearchOnly}
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
          <AnimatePresence>
            {!query && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
              >
                <label
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 cursor-pointer text-white/50 hover:text-white transition-colors"
                  title="Upload Local File"
                >
                  {upload.isUploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        await upload.uploadFile(file, roomId);
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                  />
                </label>
              </motion.div>
            )}
          </AnimatePresence>
          <button type="submit" className="hidden" />
        </form>
      </motion.div>

      <AnimatePresence>
        {!isCentered && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            transition={{ ...SPRING, opacity: { duration: 0.2 } }}
            className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2 -mx-2 px-2 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {isSearching ? (
              <div className="flex-1 flex items-center justify-center min-h-[150px]">
                <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
              </div>
            ) : showSuggestions && suggestions.length > 0 ? (
              suggestions.map((s, idx) => (
                <div
                  key={idx}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Keep input focused/avoid blur
                    setQuery(s);
                    performSearch(s);
                  }}
                  className="px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded-xl cursor-pointer flex items-center gap-3 transition-colors"
                >
                  <Search className="w-3.5 h-3.5 text-white/40" />
                  {s}
                </div>
              ))
            ) : results.length > 0 ? (
              results.map((r) => {
                const isAdded = addedSongs.has(r.url);
                return (
                  <div
                    key={r.url}
                    className={`flex items-center gap-3 p-2 rounded-xl transition-all duration-300 group ${isAdded ? "bg-green-500/20 border border-green-500/30" : "bg-white/5 border border-transparent hover:bg-white/10"}`}
                  >
                    <img
                      src={r.thumbnail}
                      className="w-20 h-14 object-cover rounded-lg bg-black/50 shrink-0"
                    />
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="text-white text-sm font-bold truncate">
                        {r.title}
                      </div>
                      <div className="text-white/50 text-[10px] uppercase tracking-widest truncate">
                        {r.uploaderName}
                      </div>
                    </div>
                    <button
                      onClick={() => !isAdded && handlePlay(r)}
                      disabled={enqueuing === r.url || isAdded}
                      className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-full transition-all ${
                        isAdded
                          ? "bg-green-500 text-white"
                          : "bg-white/10 hover:bg-[#FF0000] text-white active:scale-90"
                      }`}
                    >
                      {enqueuing === r.url ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isAdded ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <Plus className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                );
              })
            ) : query ? (
              <div className="text-center text-white/40 text-sm mt-10">
                Press Enter to search
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// DynamicIsland
// ─────────────────────────────────────────────────────────

export function DynamicIsland() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, token } = useAuth();
  const audio = useAudio();
  const upload = useUpload();
  const {
    clockOffset,
    isRoomPlaying,
    participants: roomParticipants,
    pendingPlay,
    incomingTrack,
  } = useSyncInfo();

  const isRoom = pathname.includes("/room/");
  const [isExpanded, setIsExpanded] = useState(false);
  const localProgressRef = useRef(0);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const scrubTimeRef = useRef<number | null>(null);
  useEffect(() => {
    scrubTimeRef.current = scrubTime;
  }, [scrubTime]);

  const netStats = useNetworkStats(isRoom);
  const islandRef = useRef<HTMLDivElement>(null);

  // ── Tab State ──
  const [activeTab, setActiveTab] = useState<IslandTab>("player");
  const [slideDir, setSlideDir] = useState(1);
  const [ytResultsCount, setYtResultsCount] = useState(0);
  const [ytQuery, setYtQuery] = useState("");
  
  const [seekIndicator, setSeekIndicator] = useState<{ amount: number, text: string } | null>(null);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [forceShowDetails, setForceShowDetails] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [windowWidth, setWindowWidth] = useState(0);
  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (isExpanded && windowWidth < 768) {
      inactivityTimerRef.current = setTimeout(() => {
        setIsExpanded(false);
      }, 3000); // 3 seconds timeout
    }
  }, [isExpanded, windowWidth]);

  useEffect(() => {
    resetInactivityTimer();
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [isExpanded, windowWidth, resetInactivityTimer]);


  const showSeekIndicator = useCallback((amount: number) => {
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    const text = amount > 0 ? `+${amount}s` : `${Math.abs(amount)}s`;
    setSeekIndicator({ amount, text });
    seekTimeoutRef.current = setTimeout(() => {
      setSeekIndicator(null);
    }, 1500);
  }, []);

  const handleTabChange = useCallback(
    (newTab: IslandTab) => {
      const order = { network: -1, player: 0, youtube: 1 };
      setSlideDir(order[newTab] > order[activeTab] ? 1 : -1);
      setActiveTab(newTab);
    },
    [activeTab],
  );

  // If we close the island, eventually reset to player (optional, doing it instantly ruins exit animation)
  useEffect(() => {
    if (!isExpanded) {
      const t = setTimeout(() => {
        setActiveTab("player");
        setYtResultsCount(0);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [isExpanded]);



  const dynamicExpandedWidth =
    windowWidth > 0 ? Math.min(840, windowWidth - 32) : 640;

  const hasTrack = audio.hasTrack;
  const effectivePlaying = isRoom ? isRoomPlaying : audio.isPlaying;

  const dynamicCompactWidth = !hasTrack
    ? dynamicExpandedWidth
    : (windowWidth >= 768 ? 200 : COMPACT_WIDTH) + (effectivePlaying || forceShowDetails ? 60 : 0);

  const isYoutubeSearchOnly =
    !hasTrack && ytQuery.trim() === "" && ytResultsCount === 0;

  // Dynamic height
  const currentExpandedHeight = isYoutubeSearchOnly
    ? COMPACT_HEIGHT
    : activeTab === "youtube" && ytResultsCount > 0
      ? 550
      : EXPANDED_HEIGHT;

  const _isPlayingRef = useRef(false);
  const _getTruePosRef = useRef(audio.getTruePosition);
  const _durationRef = useRef(0);
  _isPlayingRef.current = audio.isPlaying;
  _getTruePosRef.current = audio.getTruePosition;
  _durationRef.current = audio.duration;

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      if (_isPlayingRef.current && scrubTimeRef.current === null) {
        const pos = _getTruePosRef.current();
        const dur = _durationRef.current;
        if (dur > 0) {
          const pct = Math.min(1, pos / dur);
          localProgressRef.current = pct;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const displayName = user?.name ?? "Guest";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const isProfile = pathname.includes("/profile");
  const roomId = isRoom
    ? (pathname.split("/room/")[1]?.split("/")[0] ?? "")
    : "";

  const displayTime = scrubTime !== null ? scrubTime : audio.currentTime || 0;
  const displayProgress =
    scrubTime !== null
      ? scrubTime / Math.max(audio.duration, 1)
      : localProgressRef.current;

  const handleToggle = useCallback(
    (e?: React.MouseEvent | KeyboardEvent) => {
      e?.stopPropagation();
      audio.unlockAudio();
      if (isRoom && roomId) {
        if (effectivePlaying || pendingPlay) {
          getSocket().emit("playback:pause", { roomId });
        } else {
          getSocket().emit("playback:play", { roomId });
        }
      } else {
        audio.toggle();
      }
    },
    [audio, isRoom, roomId, effectivePlaying, pendingPlay],
  );

  const handleNext = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      audio.unlockAudio();
      if (isRoom && roomId) getSocket().emit("playback:next", { roomId });
    },
    [audio, isRoom, roomId],
  );

  const handlePrev = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      audio.unlockAudio();
      if (isRoom && roomId) getSocket().emit("playback:prev", { roomId });
    },
    [audio, isRoom, roomId],
  );

  const handleSeek = useCallback(
    (posSecs: number) => {
      if (isRoom && roomId) {
        getSocket().emit("playback:seek", { roomId, position: posSecs * 1000 });
      } else {
        audio.seek(posSecs);
      }
    },
    [audio, isRoom, roomId],
  );

  const _keyboardStateRef = useRef({
    isRoom,
    roomId,
    effectivePlaying,
    pendingPlay,
  });
  useEffect(() => {
    _keyboardStateRef.current = {
      isRoom,
      roomId,
      effectivePlaying,
      pendingPlay,
    };
  }, [isRoom, roomId, effectivePlaying, pendingPlay]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable
      )
        return;

      const state = _keyboardStateRef.current;

      if (e.code === "Space") {
        e.preventDefault();
        audio.unlockAudio();
        if (state.isRoom && state.roomId) {
          if (state.effectivePlaying || state.pendingPlay) {
            getSocket().emit("playback:pause", { roomId: state.roomId });
          } else {
            getSocket().emit("playback:play", { roomId: state.roomId });
          }
        } else {
          audio.toggle();
        }
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        const newTime = Math.max(0, audio.getTruePosition() - 5);
        showSeekIndicator(-5);
        if (state.isRoom && state.roomId) {
          getSocket().emit("playback:seek", {
            roomId: state.roomId,
            position: newTime * 1000,
          });
        } else {
          audio.seek(newTime);
        }
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        const newTime = Math.min(audio.duration, audio.getTruePosition() + 5);
        showSeekIndicator(5);
        if (state.isRoom && state.roomId) {
          getSocket().emit("playback:seek", {
            roomId: state.roomId,
            position: newTime * 1000,
          });
        } else {
          audio.seek(newTime);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [audio]);

  useEffect(() => {
    if (!isExpanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!document.contains(e.target as Node)) return;
      if (islandRef.current && !islandRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    const id = requestAnimationFrame(() => {
      document.addEventListener("mousedown", handleClickOutside);
    });
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isExpanded]);

  if (!isRoom) {
    return (
      <div className="fixed top-4 sm:top-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <motion.div
          transition={SPRING}
          className="pointer-events-auto glass-panel bg-background/80 backdrop-blur-3xl w-[92%] max-w-5xl rounded-4xl px-4 sm:px-6 md:px-8 py-3.5 flex items-center justify-between shadow-2xl select-none"
        >
          <Link href="/hub" className="flex items-center gap-2 sm:gap-3 group">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-foreground/5 border border-foreground/10 flex items-center justify-center group-hover:bg-foreground/10 group-hover:scale-105 transition-all outline-none">
              <Disc className="w-4 h-4 sm:w-5 sm:h-5 text-foreground/70 animate-[spin_5s_linear_infinite]" />
            </div>
            <span className="text-base sm:text-lg font-black tracking-widest text-foreground transition-opacity hover:opacity-80">
              SYNC<span className="text-foreground/50">BEATS</span>
            </span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <ThemeToggle />
            <div className="w-px h-6 bg-foreground/10 hidden sm:block" />
            {isProfile ? (
              <Link
                href="/hub"
                className="h-9 px-5 flex items-center justify-center rounded-xl bg-foreground/10 text-foreground text-xs sm:text-sm font-bold tracking-widest uppercase hover:bg-foreground hover:text-background active:scale-95 transition-all"
              >
                Done
              </Link>
            ) : (
              <Link
                href="/profile"
                className="flex items-center gap-3 cursor-pointer group outline-none"
              >
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-bold text-foreground">
                    {displayName}
                  </div>
                  <div className="text-xs font-semibold text-foreground/40">
                    {user?.email ?? ""}
                  </div>
                </div>
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center border-2 border-transparent glass-panel group-active:scale-95 transition-all shadow-md">
                  <span className="text-xs sm:text-sm font-black text-foreground">
                    {initials}
                  </span>
                </div>
              </Link>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  const handlePointerDown = () => {
    resetInactivityTimer();
    if (isExpanded) return;
    setIsPressing(true);
    pressTimerRef.current = setTimeout(() => {
      if (!hasTrack) setActiveTab("youtube");
      setIsExpanded(true);
      setForceShowDetails(false);
      setIsPressing(false);
      pressTimerRef.current = null;
      
      // Haptic feedback for expanding
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 300); // 300ms hold
  };

  const handlePointerUp = () => {
    resetInactivityTimer();
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
      setIsPressing(false);
      
      // Short tap
      if (!isExpanded && hasTrack) {
        setForceShowDetails(true);
        setTimeout(() => setForceShowDetails(false), 3000);
      } else if (!isExpanded && !hasTrack) {
        setActiveTab("youtube");
        setIsExpanded(true);
      }
    }
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 pointer-events-none"
        animate={{
          opacity: isExpanded ? 1 : 0,
          backgroundColor: isExpanded ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0)",
        }}
        transition={SPRING}
        style={{
          pointerEvents: isExpanded ? "auto" : "none",
          backdropFilter: isExpanded ? "blur(2px)" : "blur(0px)",
          WebkitBackdropFilter: isExpanded ? "blur(2px)" : "blur(0px)",
        }}
        onClick={() => setIsExpanded(false)}
      />

      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-100 flex flex-col items-center pointer-events-none">
        <motion.div
          ref={islandRef}
          onPointerDown={(e) => {
            handlePointerDown();
            resetInactivityTimer();
          }}
          onPointerUp={(e) => {
            handlePointerUp();
            resetInactivityTimer();
          }}
          onPointerLeave={(e) => {
            handlePointerUp();
            resetInactivityTimer();
          }}
          onPointerMove={resetInactivityTimer}
          initial={false}
          transition={SPRING}
          animate={{
            width: isExpanded
              ? dynamicExpandedWidth
              : dynamicCompactWidth + (effectivePlaying || forceShowDetails ? 80 : 0),
            height: isExpanded ? currentExpandedHeight : COMPACT_HEIGHT,
            borderRadius: isExpanded ? 44 : COMPACT_HEIGHT / 2,
            scale: isPressing && !isExpanded ? 0.96 : 1,
          }}
          style={{
            backgroundColor: "#000000",
            cursor: isExpanded ? "default" : "pointer",
            position: "relative",
            overflow: "hidden",
            willChange: "width, height, border-radius",
            transform: "translateZ(0)",
          }}
          className="pointer-events-auto shadow-[0_30px_60px_rgba(0,0,0,0.5)] border border-white/8"
        >
          <CompactState
            isExpanded={isExpanded}
            effectivePlaying={effectivePlaying}
            trackTitle={audio.trackTitle}
            trackUrl={audio.trackUrl}
            progress={displayProgress}
            hasTrack={hasTrack}
            seekIndicator={seekIndicator}
            isReady={audio.isReady}
            error={audio.error}
            downloadProgress={audio.downloadProgress}
            showDetails={effectivePlaying || forceShowDetails}
            isRoom={isRoom}
            roomParticipants={roomParticipants}
          />

          <motion.div
            className="absolute inset-0 pointer-events-none"
            animate={{
              opacity: isExpanded ? 1 : 0,
              scale: isExpanded ? 1 : 0.96,
              filter: isExpanded ? "blur(0px)" : "blur(4px)",
            }}
            transition={{
              opacity: { duration: 0.2, delay: isExpanded ? 0.1 : 0 },
              filter: { duration: 0.2, delay: isExpanded ? 0.1 : 0 },
              scale: SPRING,
            }}
            style={{
              zIndex: isExpanded ? 1 : 0,
              pointerEvents: isExpanded ? "auto" : "none",
            }}
          >
            <AnimatePresence custom={slideDir} initial={false}>
              {activeTab === "player" && (
                <motion.div
                  key="player"
                  custom={slideDir}
                  variants={tabVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={SPRING}
                  className="absolute inset-0"
                >
                  <PlayerTab
                    effectivePlaying={effectivePlaying}
                    trackTitle={audio.trackTitle}
                    trackUrl={audio.trackUrl}
                    isReady={audio.isReady}
                    error={audio.error}
                    downloadProgress={audio.downloadProgress}
                    progress={displayProgress}
                    displayTime={displayTime}
                    duration={audio.duration}
                    hasTrack={hasTrack}
                    onToggle={handleToggle}
                    onNext={handleNext}
                    onPrev={handlePrev}
                    onSeek={handleSeek}
                    onTabChange={handleTabChange}
                    isRoom={isRoom}
                    roomParticipants={roomParticipants}
                  />
                </motion.div>
              )}
              {activeTab === "network" && (
                <motion.div
                  key="network"
                  custom={slideDir}
                  variants={tabVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={SPRING}
                  className="absolute inset-0"
                >
                  <NetworkTab
                    netStats={netStats}
                    onBack={() => handleTabChange("player")}
                  />
                </motion.div>
              )}
              {activeTab === "youtube" && (
                <motion.div
                  key="youtube"
                  custom={slideDir}
                  variants={tabVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={SPRING}
                  className="absolute inset-0"
                >
                  <YouTubeTab
                    roomId={roomId}
                    onBack={() => setActiveTab("player")}
                    onResultsCountChange={setYtResultsCount}
                    query={ytQuery}
                    setQuery={setYtQuery}
                    isSearchOnly={isYoutubeSearchOnly}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <div
            className="absolute inset-0 rounded-[inherit] pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.06) 0%, transparent 60%)",
            }}
          />
        </motion.div>
      </div>
    </>
  );
}
