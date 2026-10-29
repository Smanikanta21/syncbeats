"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import {
  Disc, Pause, Play, SkipForward, SkipBack, Upload,
  Loader2, AlertCircle, AlertTriangle, Activity,
  ChevronLeft, Search, FastForward, Rewind, LogOut, Users,
  Radio, Volume2, VolumeX, UserPlus, Send, User, LayoutGrid, MessageSquare, Compass, X
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback, useMemo, useReducer } from "react";
import { useAuth } from "../../context/AuthContext";
import { useAudio } from "../../context/AudioContext";

import { useUpload } from "../../context/UploadContext";
import { JoinRequest, type TrackActivity } from "../../lib/types";
import { getSocket } from "../../lib/socket";
import { roomsApi, usersApi } from "../../lib/api";
import { ytId } from "../../lib/youtube";
import { formatTime } from "../../hooks/useAudioPlayer";
import { ThemeToggle } from "../ThemeToggle";
import { useSyncInfo } from "../../context/SyncContext";
import { useNetworkStats, qualityColor } from "../../hooks/useNetworkStats";
import { SearchTab } from "../room/SearchTab";
import { useSettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { trackCacheKey } from "../../lib/trackIdentity";
import { INITIAL_ISLAND, islandReducer, islandView, type IslandActivity, type IslandView } from './state';
import { useIslandDock, useIslandSize, useIslandViewport } from './useDock';

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

const SPRING = {
  type: "spring" as const,
  stiffness: 140,
  damping: 18,
  mass: 0.9,
};

const EASE_OUT = [0.32, 0.72, 0, 1] as [number, number, number, number];
const EASE_IN = [0.4, 0, 1, 1] as [number, number, number, number];

// Damping ratio 24/(2*sqrt(300*1)) = 0.69 -> ~5% overshoot over ~0.35s, which is
// what the real island does. At the old 320/26/0.8 the ratio was 0.81, so it
// overshot 1.2% -- invisible, and the shape read as a plain ease instead.
const SHAPE_SPRING = {
  type: "spring" as const,
  stiffness: 300,
  damping: 24,
  mass: 1,
};

// Apple morphs shape-first: the outgoing content blurs out fast, the black shape
// springs while briefly empty, then the incoming content blurs in as the shape
// settles. Fading both on one symmetric clock (what this was) reads as two
// stacked layers cross-dissolving, not as one shape changing form.
const contentMorph = (reduce: boolean) =>
  reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0, transition: { duration: 0.15 } },
        transition: { duration: 0.2, ease: "easeOut" as const },
      }
    : {
        initial: { opacity: 0, scale: 0.92, filter: "blur(6px)" },
        animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
        exit: {
          opacity: 0,
          scale: 0.92,
          filter: "blur(6px)",
          transition: { duration: 0.12, ease: EASE_IN },
        },
        // Delay ~1/3 of the spring so the shape leads and the content catches up.
        transition: { duration: 0.24, delay: 0.1, ease: EASE_OUT },
      };

const COMPACT_HEIGHT = 44;
// Extended grows while syncing: the sync bar adds a label row that clips at 44.
// 62 = title (14) + gap (6) + label row (13) + gap (6) + bar (4) + py-2 (16).
const EXTENDED_SYNC_HEIGHT = 62;

// Secondary island — the detached circle iOS shows beside the pill when a
// second activity is live. Ring geometry is derived so the size is one knob.
const SECONDARY_SIZE = 40;
const SECONDARY_GAP = 8;
const SECONDARY_R = 17;
const SECONDARY_C = 2 * Math.PI * SECONDARY_R;

// Island accent — one flat colour per theme. No gradients anywhere in the
// island: progress fills, loading beams and badges all use this single hex.
const GLOW_HEX: Record<string, string> = {
  violet: "#a855f7",
  cyan: "#06b6d4",
  emerald: "#10b981",
  amber: "#f59e0b",
  dark: "#a855f7",
  none: "#a855f7",
};
const STUCK_HEX = "#f59e0b";

function useIslandAccent() {
  const { settings } = useSettings();
  return GLOW_HEX[settings.islandCustomizer?.glowColor || "none"] ?? GLOW_HEX.none;
}

// Room island states
type IslandState = IslandView;
type IslandTab = "player" | "network" | "search" | "requests" | "deviceInfo" | "invite";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const globalYtTitleCache = new Map<string, string>();

function cleanTrackTitle(title: string | null | undefined): string {
  if (!title) return "Unknown Track";
  let fileName = title.split('/').pop() ?? '';
  fileName = fileName.split('?')[0];

  // Remove file extension
  fileName = fileName.replace(/\.[^.]+$/, '');

  // Strip trailing timestamps (e.g. _1785136544031 or " 1785136544031")
  fileName = fileName.replace(/[_\s]+\d{10,13}$/, '');

  // Strip leading numeric prefix followed by separator (e.g. 1785136544031_MySong -> MySong)
  fileName = fileName.replace(/^\d+[_-\s]*/, '');

  // Replace underscores with spaces
  fileName = fileName.replace(/_/g, ' ').trim();

  // If the result is a raw 11-char YouTube ID (e.g., "LPnDCTqW7zw")
  const extractedYtId = ytId(fileName);
  if (extractedYtId && !/^[a-zA-Z]{11}$/.test(extractedYtId)) {
    const id = extractedYtId;
    if (globalYtTitleCache.has(id)) {
      return globalYtTitleCache.get(id)!;
    }
    if (typeof window !== "undefined") {
      fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.title) {
            globalYtTitleCache.set(id, data.title);
          }
        })
        .catch(() => {});
    }
    return "YouTube Track";
  }

  return fileName || 'Unknown Track';
}

function getTrackThumbnail(trackUrl: string | undefined | null, quality: 'hq' | 'mq' = 'mq'): string | null {
  if (!trackUrl) return null;
  const customThumbMatch = trackUrl.match(/[?&]thumb=([^&]+)/);
  if (customThumbMatch) return decodeURIComponent(customThumbMatch[1]);

  const id = ytId(trackUrl);
  if (id) {
    return `https://i.ytimg.com/vi/${id}/${quality === 'hq' ? 'hqdefault' : 'mqdefault'}.jpg`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────
// AudioBars
// ─────────────────────────────────────────────────────────

import { AudioBars } from "./AudioBars";
import { SyncBeatsLogo } from "../brand/SyncBeatsLogo";

// ─────────────────────────────────────────────────────────
// CompactProgressBar
// ─────────────────────────────────────────────────────────

const CompactProgressBar = ({ isPlaying, isVisible = true }: { isPlaying: boolean; isVisible?: boolean }) => {
  const barRef = useRef<HTMLDivElement>(null);
  const curRef = useRef<HTMLSpanElement>(null);
  const durRef = useRef<HTMLSpanElement>(null);
  const audio = useAudio();

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const pos = audio.getTruePosition();
      const dur = Math.max(1, audio.duration);
      const progress = Math.min(1, pos / dur);
      if (barRef.current) barRef.current.style.width = `${progress * 100}%`;
      // textContent, not state — this runs every frame.
      if (curRef.current) curRef.current.textContent = formatTime(pos);
      if (durRef.current) durRef.current.textContent = formatTime(audio.duration);
      if (isPlaying && isVisible) rafId = requestAnimationFrame(tick);
    };
    tick();
    if (isPlaying && isVisible) rafId = requestAnimationFrame(tick);
    return () => { if (rafId) cancelAnimationFrame(rafId); };
  }, [isPlaying, audio, isVisible]);

  // Times flank the bar rather than sitting under it: the extended pill has
  // ~15px left under the title, and leading-none keeps the 9px text at 9px
  // (arbitrary text-[9px] otherwise inherits leading-normal and clips).
  return (
    <div className="flex items-center gap-1.5 w-full mt-1 shrink-0">
      <span ref={curRef} className="text-[9px] font-bold leading-none tabular-nums text-white/50 shrink-0">00:00</span>
      <div className="flex-1 min-w-0 h-0.75 bg-white/15 rounded-full overflow-hidden">
        <div ref={barRef} className="h-full bg-white/80 rounded-full"
          style={{ width: "0%", transition: isPlaying ? "none" : "width 200ms ease" }} />
      </div>
      <span ref={durRef} className="text-[9px] font-bold leading-none tabular-nums text-white/40 shrink-0">00:00</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// SyncProgressBar — for Extended state
// Shows combined buffering / seeding / syncing progress
// ─────────────────────────────────────────────────────────

const SyncProgressBar = ({
  activity,
  isStuck,
  onSkip,
}: {
  activity: IslandActivity;
  isStuck?: boolean;
  onSkip?: () => void;
}) => {
  const accent = useIslandAccent();
  const progress = activity.progress;
  const label = isStuck ? 'Taking longer · tap to skip' : activity.label;

  const canSkip = !!(isStuck && onSkip);

  return (
    <div
      className={cn('flex', 'flex-col', 'justify-center', 'gap-1.5', 'w-full', canSkip && 'cursor-pointer pointer-events-auto')}
      onPointerDown={canSkip ? e => e.stopPropagation() : undefined}
      onClick={canSkip ? e => { e.stopPropagation(); onSkip!(); } : undefined}
      title={canSkip ? "Track is stuck. Tap to skip." : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[9px] font-semibold flex items-center gap-1 min-w-0"
          style={{ color: isStuck ? STUCK_HEX : "rgba(255,255,255,0.45)" }}
        >
          {isStuck && <AlertTriangle className="w-3 h-3 shrink-0 animate-bounce" />}
          <span className="truncate">{label}</span>
        </span>
        <span
          className="text-[10px] font-black tabular-nums shrink-0"
          style={{ color: isStuck ? STUCK_HEX : "rgba(255,255,255,0.6)" }}
        >
          {progress == null ? '…' : `${progress}%`}
        </span>
      </div>
      <div className="w-full h-1 rounded-full bg-white/15 overflow-hidden" role="progressbar" aria-label={activity.label} aria-valuenow={progress ?? undefined} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={cn('h-full', 'rounded-full', 'transition-[width]', 'duration-300', 'ease-out', isStuck && 'animate-pulse')}
          style={{ width: progress == null ? '35%' : `${progress}%`, backgroundColor: isStuck ? STUCK_HEX : accent }}
        />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// RealtimeProgressBar
// ─────────────────────────────────────────────────────────

const RealtimeProgressBar = ({
  duration, onSeek, isPlaying, isVisible = true,
}: {
  duration: number;
  onSeek: (pos: number) => void;
  isPlaying: boolean;
  isVisible?: boolean;
}) => {
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
      if (isPlaying && isVisible) rafId = requestAnimationFrame(tick);
    };
    tick();
    if (isPlaying && isVisible) rafId = requestAnimationFrame(tick);
    return () => { if (rafId) cancelAnimationFrame(rafId); };
  }, [isPlaying, duration, audio, isVisible]);

  return (
    <div className="flex items-center gap-3 w-full mt-2">
      <span ref={leftTimeRef} className="text-[12px] font-medium text-white/50 font-mono w-9 text-right select-none pointer-events-none">0:00</span>
      <div className="relative flex-1 h-8 flex items-center cursor-pointer group"
        onClick={e => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          onSeek(p * duration);
        }}>
        <div className="absolute w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div ref={barRef} className="h-full bg-white/80 rounded-full" style={{ width: "0%", transition: isPlaying ? "none" : "width 200ms ease" }} />
        </div>
        <div ref={handleRef} className="absolute w-3 h-3 rounded-full bg-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: "-6px" }} />
      </div>
      <span ref={rightTimeRef} className="text-[12px] font-medium text-white/50 font-mono w-9 text-left select-none pointer-events-none">-0:00</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// tabVariants
// ─────────────────────────────────────────────────────────

const tabVariants = {
  enter: (direction: number) => ({ x: direction === 0 ? 0 : direction > 0 ? "100%" : "-100%", opacity: 0, filter: "blur(4px)" }),
  center: { x: 0, opacity: 1, filter: "blur(0px)" },
  exit: (direction: number) => ({ x: direction === 0 ? 0 : direction < 0 ? "100%" : "-100%", opacity: 0, filter: "blur(4px)" }),
};

// ─────────────────────────────────────────────────────────
// PlayerTab (expanded state)
// ─────────────────────────────────────────────────────────

const PlayerTab = ({
  effectivePlaying, trackTitle, trackUrl, isReady, error, downloadProgress,
  duration, hasTrack, onToggle, onNext, onPrev, onSeek,
  onTabChange, isRoom, roomParticipants, pendingRequestsCount, isHost, isPrivate,
  isVisible = true, deviceSyncProgress,
}: any) => {
  const isYt = !!trackUrl?.startsWith("youtube:") || !!trackUrl?.startsWith("ws-p2p:yt:");
  const thumbnailUrl = getTrackThumbnail(trackUrl, 'hq');
  const trackInitials = cleanTrackTitle(trackTitle).substring(0, 2).toUpperCase();
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const accent = useIslandAccent();

  const isRoomReady = isRoom && roomParticipants ? roomParticipants.every((p: any) => p.isReady) : true;
  const loadingParticipants = isRoom && roomParticipants ? roomParticipants.filter((p: any) => !p.isReady) : [];

  return (
    <div className="relative w-full flex flex-col justify-evenly px-5 sm:px-8 py-8 sm:py-10 gap-6">
      {/* Track header */}
      <div className="flex items-start gap-3 sm:gap-4 w-full">
        <div className={`flex items-center justify-center shrink-0 border overflow-hidden w-15 h-15 sm:w-17 sm:h-17 rounded-[14px] shadow-lg ${
          thumbnailUrl ? "border-white/20" : isYt ? "bg-[#FF0000]/10 border-[#FF0000]/20" : "bg-white/10 border-white/10"
        }`}>
          {thumbnailUrl
            ? <img src={thumbnailUrl} draggable={false} onContextMenu={e => e.preventDefault()} className="w-full h-full object-cover select-none pointer-events-none no-touch-select" />
            : <span className="text-xl font-black text-white/80 select-none">{trackInitials}</span>}
        </div>

        <div className="flex flex-col justify-center flex-1 min-w-0 pt-1">
          <div className="font-bold text-white text-[18px] truncate leading-tight tracking-tight">
            {cleanTrackTitle(trackTitle)}
          </div>
          <div
            className={`text-[13px] sm:text-[15px] truncate mt-0.5 transition-colors ${
              error ? "text-[#FF0000]/80 cursor-pointer hover:text-[#FF0000]" : "text-white/50"
            }`}
            onClick={e => { if (error) { e.stopPropagation(); setShowErrorDetails(p => !p); } }}
          >
            {error ? (
              <span className="flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Failed • Tap for info</span>
            ) : isReady && !isRoomReady ? "Syncing to peers…"
              : isReady ? "Ready to play"
              : `Buffering… ${downloadProgress}%`}
          </div>

          <AnimatePresence>
            {error && showErrorDetails && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <div className="bg-[#FF0000]/10 border border-[#FF0000]/20 rounded-lg p-2.5 text-[11px] text-[#FF0000]/90 mt-2">
                  <p className="font-bold mb-1">Track Transfer Failed</p>
                  <p className="opacity-80">{error}</p>
                </div>
              </motion.div>
            )}
            {hasTrack && isRoom && loadingParticipants.length > 0 && !error && !showErrorDetails && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2">
                <div className="flex items-center gap-2 flex-wrap max-h-12 overflow-y-auto custom-scrollbar pr-1" data-lenis-prevent="true">
                  {loadingParticipants.map((p: any) => {
                    const progress = deviceSyncProgress[p.socketId] || 0;
                    return (
                      <div key={p.socketId} className="flex items-center gap-2 bg-white/10 rounded-full pl-2.5 pr-3 py-1.5">
                        <Loader2 className="w-3 h-3 text-white/50 animate-spin shrink-0" />
                        <span className="text-[10px] font-bold text-white/70 whitespace-nowrap">{p.displayName}</span>
                        <div className="w-12 h-1 bg-black/40 rounded-full overflow-hidden shrink-0">
                          <div className="h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${progress}%`, backgroundColor: accent }} />
                        </div>
                        <span className="text-[9px] font-black text-white/40 tabular-nums">{progress}%</span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-4 shrink-0 pr-1 pt-1">
          {error ? <AlertCircle className="w-5 h-5 text-[#FF0000]/80" />
            : !isReady || !isRoomReady ? (
                <div className="w-6 h-1 bg-white/10 rounded-full overflow-hidden flex items-center shrink-0">
                  <motion.div
                    className="h-full bg-white/40 rounded-full w-1/3"
                    initial={{ x: "-100%" }}
                    animate={{ x: "300%" }}
                    transition={{ repeat: Infinity, duration: 0.8, ease: "easeInOut", repeatType: "mirror" }}
                  />
                </div>
              )
            : <AudioBars isPlaying={effectivePlaying} isSmall={false} isVisible={isVisible} />}

          {isRoom && (
            <button type="button" onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("open-profile-modal")); }}
              className="p-1.5 rounded-full transition-colors pointer-events-auto active:scale-95 bg-white/5 hover:bg-white/20 group"
              aria-label="Your profile" title="Your Profile">
              <User className="w-4 h-4 text-white/80 group-hover:text-white transition-colors" />
            </button>
          )}
        </div>
      </div>

      <RealtimeProgressBar duration={duration} onSeek={onSeek} isPlaying={effectivePlaying} isVisible={isVisible} />

      {/* Controls */}
      <div className="flex items-center justify-between w-full gap-2">
        <div className="flex items-center gap-1 sm:gap-2">
          <button type="button" aria-label="Network health" onClick={e => { e.stopPropagation(); onTabChange("network"); }} className="p-1 sm:p-2 rounded-full transition-colors pointer-events-auto active:scale-95">
            <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-white/50 hover:text-white hover:cursor-pointer hover:scale-105 transition-colors" />
          </button>
          {isRoom && isHost && isPrivate && (
            <button type="button" aria-label={`Join requests${pendingRequestsCount > 0 ? ` (${pendingRequestsCount} pending)` : ""}`} onClick={e => { e.stopPropagation(); onTabChange("requests"); }} className="p-1 sm:p-2 rounded-full transition-colors pointer-events-auto active:scale-95 relative">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-white/50 hover:text-white hover:cursor-pointer hover:scale-105 transition-colors" />
              {pendingRequestsCount > 0 && (
                <div className="absolute top-0 right-0 w-3 h-3 bg-bad-500 rounded-full border-2 border-background animate-pulse" />
              )}
            </button>
          )}
        </div>

        <div className="flex items-center justify-center gap-6 sm:gap-10">
          <button type="button" aria-label="Previous track" onClick={e => { e.stopPropagation(); onPrev(e); }} className="p-1 sm:p-2 rounded-full transition-colors pointer-events-auto active:scale-95">
            <SkipBack className="w-7 h-7 sm:w-8 sm:h-8 text-white" fill="currentColor" />
          </button>
          <button type="button" aria-label={effectivePlaying ? "Pause" : "Play"} onClick={e => { e.stopPropagation(); onToggle(e); }} className="p-1 sm:p-2 rounded-full transition-colors pointer-events-auto active:scale-95">
            {effectivePlaying
              ? <Pause className="w-9 h-9 sm:w-10 sm:h-10 text-white" fill="currentColor" />
              : <Play className="w-9 h-9 sm:w-10 sm:h-10 ml-1 text-white" fill="currentColor" />}
          </button>
          <button type="button" aria-label="Next track" onClick={e => { e.stopPropagation(); onNext(e); }} className="p-1 sm:p-2 rounded-full transition-colors pointer-events-auto active:scale-95">
            <SkipForward className="w-7 h-7 sm:w-8 sm:h-8 text-white" fill="currentColor" />
          </button>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <button type="button" aria-label="Search tracks" onClick={e => { e.stopPropagation(); onTabChange("search"); }} className="p-1 sm:p-2 rounded-full transition-colors pointer-events-auto active:scale-95">
            <Search className="w-5 h-5 sm:w-6 sm:h-6 text-white/50 hover:text-white hover:cursor-pointer hover:scale-105 transition-colors" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// NetworkTab
// ─────────────────────────────────────────────────────────

const NetworkTab = ({ onBack, netStats, audio }: { onBack: () => void; netStats: any; audio: any }) => {
  const history = netStats.history || [];
  const maxLat = Math.max(...history.map((h: any) => h.latency), 100);
  const accent = useIslandAccent();

  return (
    <div className="relative w-full flex flex-col px-5 sm:px-6 pt-4 pb-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <button type="button" aria-label="Back to player" onClick={e => { e.stopPropagation(); onBack(); }} className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors pointer-events-auto">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h3 className="text-white font-bold ">Network Health</h3>
      </div>
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex justify-between items-end">
          <div className="flex flex-col">
            <span className="text-white/50 text-xs font-bold ">Latency</span>
            <span className="text-white font-black text-3xl" style={{ color: qualityColor(netStats.quality) }}>
              {Math.round(netStats.latency || 0)}<span className="text-lg text-white/50 ml-1">ms</span>
            </span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-white/50 text-xs font-bold ">Jitter</span>
            <span className="text-white font-bold text-xl">{Math.round(netStats.jitter || 0)}ms</span>
          </div>
        </div>
        <div className="w-full h-24 bg-white/5 rounded-xl border border-white/10 p-2 flex items-end gap-0.5">
          {history.slice(-40).map((s: any, i: number) => {
            const hPct = Math.max(5, (s.latency / maxLat) * 100);
            return <div key={i} className="flex-1 bg-white/40 rounded-sm transition-all duration-300" style={{ height: `${hPct}%` }} />;
          })}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-white/50 text-xs font-bold ">Sync Correction</span>
            <span className="text-white font-bold text-sm tabular-nums">{audio.manualLatency > 0 ? "+" : ""}{Math.round(audio.manualLatency * 1000)}ms</span>
          </div>
          <input type="range" min={-0.5} max={0.5} step={0.01} value={audio.manualLatency}
            aria-label="Manual sync correction in seconds"
            onChange={e => audio.setManualLatency(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none outline-none bg-white/20 cursor-pointer pointer-events-auto"
            style={{ background: `linear-gradient(to right, ${accent} 0 ${((audio.manualLatency + 0.5) / 1) * 100}%, rgba(255,255,255,0.2) ${((audio.manualLatency + 0.5) / 1) * 100}% 100%)` }} />
          <div className="flex items-center justify-between mt-1">
            <p className="text-[10px] text-white/40">Reported: {Math.round(audio.outputLatency * 1000)}ms.</p>
            <button type="button" onClick={() => audio.setManualLatency(0)} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white transition-colors pointer-events-auto">Auto Sync</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// InviteTab
// ─────────────────────────────────────────────────────────

const InviteTab = ({ onBack, roomId, onStateChange }: { onBack: () => void; roomId: string; onStateChange?: (query: string, resultsCount: number, loading: boolean) => void }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);

  useEffect(() => {
    onStateChange?.(query, results.length, loading);
  }, [query, results.length, loading, onStateChange]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      usersApi.search(query).then(res => {
        setResults(res.users || []);
        setLoading(false);
      }).catch(() => setLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const handleInvite = async (user?: any, rawEmail?: string) => {
    const id = user?.id || rawEmail;
    setInviting(id);
    try {
      await roomsApi.invite(roomId, user?.id, rawEmail);
      // Clear the query to indicate success and stay on the tab
      setQuery("");
    } catch (err) {
      console.error(err);
    } finally {
      setInviting(null);
    }
  };

  return (
    <div className="flex flex-col h-auto text-white pt-3 pb-3 px-5">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <button type="button" aria-label="Back to player" onClick={e => { e.stopPropagation(); onBack(); }} className="p-1.5 hover:bg-white/10 rounded-full transition-colors -ml-1 pointer-events-auto">
          <ChevronLeft className="w-4 h-4 text-white/70" />
        </button>
        <span className="text-xs font-bold text-white/60">Invite Friends</span>
      </div>
      <div className="flex flex-col">
        <div className="relative mb-3 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
          <input
            name="syncbeats-island-search-input"
            type="search"
            inputMode="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (query.includes("@")) {
                  handleInvite(undefined, query);
                }
              }
            }}
            placeholder="Search name or email..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck="false"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            aria-autocomplete="none"
            className="w-full bg-white/5 border border-white/10 rounded-full py-1.5 pl-9 pr-4 text-xs text-white placeholder-white/40 focus:outline-none focus:border-white/30"
          />
        </div>
        <div className="max-h-65 overflow-y-auto custom-scrollbar flex flex-col gap-2 pointer-events-auto">
          {loading ? (
            <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-white/40" /></div>
          ) : results.length > 0 ? (
            results.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl border border-white/5">
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-xs truncate">{u.name}</span>
                  <span className="text-[11px] text-white/40 truncate">{u.email}</span>
                </div>
                <button
                  onClick={() => handleInvite(u)}
                  disabled={inviting === u.id}
                  className="px-3.5 py-1 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {inviting === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Invite"}
                </button>
              </div>
            ))
          ) : query.includes("@") ? (
            <div className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl border border-white/5">
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] text-white/40 mb-0.5">Invite via email</span>
                <span className="font-bold text-xs truncate">{query}</span>
              </div>
              <button
                onClick={() => handleInvite(undefined, query)}
                disabled={inviting === query}
                className="px-3.5 py-1 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {inviting === query ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3"/> Send</>}
              </button>
            </div>
          ) : query.length > 0 ? (
            <div className="text-center text-white/40 text-xs py-2">No users found. Type a full email to invite via email.</div>
          ) : (
            <div className="text-center text-white/40 text-xs py-2">Search for friends to invite</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// RequestsTab
// ─────────────────────────────────────────────────────────

const RequestsTab = ({ requests, onApprove, onDeny, onBack }: {
  requests: JoinRequest[];
  onApprove: (id: string, name: string) => void;
  onDeny: (id: string) => void;
  onBack: () => void;
}) => (
  <div className="flex flex-col h-auto text-white pt-2 pb-4">
    <div className="flex items-center justify-between px-6 mb-4">
      <button type="button" aria-label="Close join requests" onClick={e => { e.stopPropagation(); onBack(); }} className="p-2 hover:bg-white/10 rounded-full transition-colors -ml-2 pointer-events-auto">
        <ChevronLeft className="w-5 h-5 text-white/50" />
      </button>
      <span className="text-sm font-bold text-white/50">Join Requests ({requests.length})</span>
      <div className="w-9" />
    </div>
    <div className="max-h-[320px] min-h-0 overflow-y-auto px-6 custom-scrollbar flex flex-col gap-2 pointer-events-auto" data-lenis-prevent="true">
      {requests.length === 0 ? (
        <div className="text-center text-white/40 text-xs mt-10">No pending requests</div>
      ) : requests.map(req => (
        <div key={req.socketId} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10">
          <span className="font-semibold text-sm truncate pr-2">{req.displayName}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={e => { e.stopPropagation(); onDeny(req.socketId); }} className="px-3 py-1.5 rounded-full bg-bad-500/20 text-bad-400 text-xs font-bold hover:bg-bad-500/30 transition-colors">Deny</button>
            <button onClick={e => { e.stopPropagation(); onApprove(req.socketId, req.displayName); }} className="px-3 py-1.5 rounded-full bg-ok-500 text-white text-xs font-bold hover:bg-ok-600 transition-colors">Approve</button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────
// Room Pill — the minimal 44px "pill" state
// ─────────────────────────────────────────────────────────

const RoomPill = ({
  effectivePlaying, trackUrl, isSyncing, hasTrack, seekIndicator, volIndicator, onTogglePlayback, showAlbumArt = true
}: {
  effectivePlaying: boolean;
  trackTitle: string;
  trackUrl: string | null;
  isRoom: boolean;
  isSyncing: boolean;
  hasTrack: boolean;
  seekIndicator: { amount: number; text: string } | null;
  volIndicator: { amount: number; text: string } | null;
  onTogglePlayback: () => void;
  showAlbumArt?: boolean;
}) => {
  const thumbUrl = getTrackThumbnail(trackUrl, 'mq');

  if (isSyncing) {
    // While buffering just show a subtle spinner — pill is in transit to extended anyway
    return (
      <div className="absolute inset-0 flex items-center justify-center gap-2">
        <Loader2 className="w-3.5 h-3.5 text-white/50 animate-spin" />
      </div>
    );
  }

  if (!hasTrack) {
    return (
      <div className="absolute inset-0 flex items-center justify-center gap-2 px-3 group">
        <Search className="w-3.5 h-3.5 text-white/50 group-hover:text-white transition-colors" />
        <span className="text-[11px] font-bold text-white/50 group-hover:text-white transition-colors">Search</span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center px-2.5 gap-2.5">
      {/* Tiny thumbnail or disc */}
      <div className="w-7 h-7 rounded-[9px] shrink-0 overflow-hidden flex items-center justify-center bg-white/10">
        {showAlbumArt && thumbUrl
          ? <img src={thumbUrl} draggable={false} onContextMenu={e => e.preventDefault()} className="w-full h-full object-cover select-none pointer-events-none no-touch-select" />
          : <Disc className={`w-4 h-4 text-white/60 ${effectivePlaying ? "animate-[spin_4s_linear_infinite]" : ""}`} />}
      </div>
      {/* Dynamic Right Side: Seek | Vol | EQ | Play */}
      <div
        className="flex items-center gap-1 flex-1 justify-center cursor-pointer hover:opacity-80 transition-opacity pointer-events-auto"
        onClick={(e) => { e.stopPropagation(); onTogglePlayback(); }}
        onPointerDown={(e) => e.stopPropagation()}
        role="button"
        aria-label={effectivePlaying ? "Pause" : "Play"}
      >
        {volIndicator ? (
          <>
            {volIndicator.amount > 0 ? <Volume2 className="w-3.5 h-3.5 text-white" /> : <VolumeX className="w-3.5 h-3.5 text-white" />}
            <span className="text-[10px] font-black text-white tabular-nums">{volIndicator.text}</span>
          </>
        ) : seekIndicator ? (
          <>
            {seekIndicator.amount > 0 ? <FastForward className="w-3.5 h-3.5 text-white" /> : <Rewind className="w-3.5 h-3.5 text-white" />}
            <span className="text-[10px] font-black text-white tabular-nums">{seekIndicator.text}</span>
          </>
        ) : effectivePlaying ? (
          <AudioBars isPlaying={effectivePlaying} isSmall isVisible />
        ) : (
          <Play className="w-4 h-4 text-white/80 fill-white/80" />
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// RadialNavigatorPillContent — Temporary gesture overlay inside Dynamic Island
// ─────────────────────────────────────────────────────────

const RadialNavigatorPillContent = ({
  snappedItem,
}: {
  snappedItem: { id: string; label: string; sublabel: string; iconName: string } | null;
}) => {
  let IconComponent = Compass;
  if (snappedItem) {
    if (snappedItem.iconName === "Radio") IconComponent = Radio;
    else if (snappedItem.iconName === "Activity") IconComponent = Activity;
    else if (snappedItem.iconName === "Users") IconComponent = Users;
    else if (snappedItem.iconName === "LayoutGrid") IconComponent = LayoutGrid;
    else if (snappedItem.iconName === "MessageSquare") IconComponent = MessageSquare;
    else if (snappedItem.iconName === "UserPlus") IconComponent = UserPlus;
    else if (snappedItem.iconName === "LogOut") IconComponent = LogOut;
  }

  return (
    <div className="absolute inset-0 flex items-center justify-between px-3 gap-2.5 bg-black rounded-full select-none border-none">
      <div className="flex items-center gap-2.5 min-w-0 flex-1 px-1">
        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
          <IconComponent className={`w-4 h-4 text-white ${!snappedItem ? "animate-spin-slow" : ""}`} />
        </div>
        <div className="flex flex-col justify-center min-w-0">
          <span className="text-[11px] font-bold text-white truncate leading-tight">
            {snappedItem ? snappedItem.label : "Hold & Drag"}
          </span>
          <span className="text-[9px] font-semibold text-white/50 truncate leading-tight">
            {snappedItem ? "Release thumb to open" : "Move toward an icon to snap"}
          </span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Room Extended Pill — iOS live-activity style
// Left side: track + progress. Right side: sync bar
// ─────────────────────────────────────────────────────────

const RoomExtendedPill = ({
  effectivePlaying, trackTitle, trackUrl, activity, notice,
  pendingRequestsCount, isHost, isPrivate, onRequestsClick, seekIndicator, volIndicator, onTogglePlayback,
  isStuck, onNextTrack, onRetry,
}: {
  effectivePlaying: boolean;
  trackTitle: string;
  trackUrl: string | null;
  activity: IslandActivity | null;
  notice: IslandActivity | null;
  pendingRequestsCount: number;
  isHost: boolean;
  isPrivate: boolean;
  onRequestsClick: () => void;
  seekIndicator: { amount: number; text: string } | null;
  volIndicator: { amount: number; text: string } | null;
  onTogglePlayback: () => void;
  isStuck?: boolean;
  onNextTrack?: () => void;
  onRetry: () => void;
}) => {
  const audio = useAudio();
  const thumbUrl = getTrackThumbnail(trackUrl, 'mq');
  const title = trackTitle ? cleanTrackTitle(trackTitle) : 'SyncBeats';

  // If there's an active audio error (decoding failed / blocked track), display error alert in Dynamic Island
  if (audio.error) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-between px-3 gap-2 bg-bad-950/90 border border-bad-500/50 rounded-full text-bad-200 cursor-pointer pointer-events-auto shadow-[0_0_25px_color-mix(in_srgb,var(--color-bad-500)_50%,transparent)]"
        onPointerDown={e => e.stopPropagation()}
        title="Playback error"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <AlertCircle className="w-4 h-4 text-bad-400 shrink-0 animate-bounce" />
          <span className="text-[10px] font-bold text-bad-200 truncate">
            {audio.error}
          </span>
        </div>
        <button type="button" onClick={e => { e.stopPropagation(); onRetry(); }} className="min-w-11 min-h-11 text-[10px] font-bold focus-visible:outline-2 focus-visible:outline-white">
          Retry
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNextTrack?.(); }}
          className="min-h-11 min-w-11 px-2 rounded-full bg-bad-500/30 hover:bg-bad-500/50 text-[10px] font-black text-bad-100 flex items-center gap-1 shrink-0 transition-all border border-bad-400/30 focus-visible:outline-2 focus-visible:outline-white"
        >
          Skip <SkipForward className="w-3 h-3" />
        </button>
      </div>
    );
  }

  const isSyncing = activity?.status === 'active';

  return (
    <>
      <div className="absolute inset-0 flex items-stretch px-3 gap-2.5">
      {/* LEFT half: track info + playback progress */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0 py-2">
        {/* Thumbnail */}
        <div className="w-7 h-7 rounded-[9px] shrink-0 overflow-hidden bg-white/10 flex items-center justify-center">
          {thumbUrl
            ? <img src={thumbUrl} draggable={false} onContextMenu={e => e.preventDefault()} className="w-full h-full object-cover select-none pointer-events-none no-touch-select" />
            : isSyncing
            ? <Loader2 className={`w-4 h-4 text-white/50 animate-spin`} />
            : <Disc className={`w-3.5 h-3.5 text-white/60 ${effectivePlaying ? "animate-[spin_4s_linear_infinite]" : ""}`} />}
        </div>

        {/* Title + progress line */}
        <div className="flex flex-col justify-center flex-1 min-w-0 pr-0.5">
          <div className="text-white text-[11px] font-semibold truncate leading-tight">
            {title ? title.split(/\s+/).slice(0, 5).join(" ") : (isSyncing ? "Syncing..." : "No track")}
          </div>
          {isSyncing && activity ? (
            <div className="mt-1.5 w-full">
              <SyncProgressBar
                activity={activity}
                isStuck={isStuck}
                onSkip={onNextTrack}
              />
            </div>
          ) : notice ? (
            <span className="mt-1 truncate text-[10px] text-white/70" role="status">{notice.label}</span>
          ) : (
            <CompactProgressBar isPlaying={effectivePlaying} isVisible />
          )}
        </div>

        {/* Dynamic Right Side: Seek | EQ | Pause */}
        <button
          type="button"
          className="flex items-center justify-center gap-1 shrink-0 min-w-11 min-h-11 rounded-full cursor-pointer hover:opacity-80 transition-opacity pointer-events-auto focus-visible:outline-2 focus-visible:outline-white"
          onClick={(e) => { e.stopPropagation(); onTogglePlayback(); }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={effectivePlaying ? "Pause" : "Play"}
        >
          {volIndicator ? (
            <div className="flex items-center gap-1 text-white bg-white/10 px-2 py-0.5 rounded-full">
              {volIndicator.amount > 0 ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span className="text-[10px] font-black">{volIndicator.text}</span>
            </div>
          ) : seekIndicator ? (
            <div className="flex items-center gap-1 text-white bg-white/10 px-2 py-0.5 rounded-full">
              {seekIndicator.amount > 0 ? <FastForward className="w-3.5 h-3.5" /> : <Rewind className="w-3.5 h-3.5" />}
              <span className="text-[10px] font-black">{seekIndicator.text}</span>
            </div>
          ) : effectivePlaying ? (
            <AudioBars isPlaying={effectivePlaying} isSmall isVisible />
          ) : (
            <Play className="w-4 h-4 text-white/80 fill-white/80 shrink-0" />
          )}
        </button>
      </div>

      {/* RIGHT half: join requests (if any) */}
      {isHost && isPrivate && pendingRequestsCount > 0 && (
        <>
          {/* Divider */}
          <div className="w-px bg-white/10 self-stretch my-2.5 shrink-0" />
          <div className="flex items-center py-2 shrink-0">
            <button
              type="button"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onRequestsClick(); }}
              aria-label={`${pendingRequestsCount} pending join requests`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bad-500/20 text-bad-400 hover:bg-bad-500/30 transition-colors text-[10px] font-black pointer-events-auto whitespace-nowrap"
            >
              <Users className="w-3 h-3" />
              {pendingRequestsCount} pending
            </button>
          </div>
        </>
      )}
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────
// DynamicIsland — main export
// ─────────────────────────────────────────────────────────

export function DynamicIsland() {
  const pathname = usePathname();
  const { user } = useAuth();
  const audio = useAudio();
  const upload = useUpload();
  const {
    isRoomPlaying, participants: roomParticipants, pendingPlay,
    incomingTrack, pendingRequests, hostId, joinStatus, isPrivate, deviceSyncProgress,
    play, pause, seek, nextTrack, prevTrack, prefetch,
  } = useSyncInfo();
  const isRoom = pathname.includes("/room/");
  const roomId = isRoom ? (pathname.split("/room/")[1]?.split("/")[0] ?? "") : "";
  const { layoutWidth: windowWidth, bounds: viewportBounds } = useIslandViewport();
  const isMobile = windowWidth > 0 && windowWidth < 768;
  const isHost = hostId === user?.id;
  const hasTrack = audio.hasTrack;
  const effectivePlaying = isRoom ? isRoomPlaying : audio.isPlaying;
  const activeSocketIds = useMemo(
    () => new Set(roomParticipants.filter(p => !p.isReady && !p.isBlocked).map(p => p.socketId)),
    [roomParticipants]
  );
  const isAnyOtherDeviceBuffering = useMemo(() => {
    return Object.entries(deviceSyncProgress).some(
      ([sid, p]) => activeSocketIds.has(sid) && p < 100
    );
  }, [deviceSyncProgress, activeSocketIds]);
  const reduceMotion = useReducedMotion();
  const { settings } = useSettings();
  const islandCustomizer = settings.islandCustomizer || { glowColor: "violet", autoShrinkDelaySec: 6, showAlbumArt: true };

  const [isSearchLoading, setIsSearchLoading] = useState(false);

  const activeGlowColorHex = useIslandAccent();

  const glowClassMap = {
    violet: "border border-purple-500/40 shadow-[0_0_30px_rgba(168,85,247,0.45)]",
    cyan: "border border-cyan-500/40 shadow-[0_0_30px_rgba(6,182,212,0.45)]",
    emerald: "border border-[#10b981]/40 shadow-[0_0_30px_rgba(16,185,129,0.45)]",
    amber: "border border-[#f59e0b]/40 shadow-[0_0_30px_rgba(245,158,11,0.45)]",
    dark: "border border-white/8 shadow-[0_30px_60px_rgba(0,0,0,0.6)]",
    none: "border border-white/10 shadow-none",
  };
  const currentGlowClass = isSearchLoading 
    ? "border border-white/10 shadow-none"
    : (glowClassMap[islandCustomizer.glowColor || "none"] || glowClassMap.none);

  // ── Island state machine
  // In room: pill / extended / expanded
  const [island, dispatchIsland] = useReducer(islandReducer, INITIAL_ISLAND);
  const islandState = islandView(island);
  const setIslandState = useCallback((view: IslandState) => {
    dispatchIsland({ type: view === 'expanded' ? 'open' : view === 'extended' ? 'preview' : 'close' });
  }, []);
  const [isExpanded, setIsExpanded] = useState(false); // non-room
  const islandRef = useRef<HTMLDivElement>(null);
  const [wiggle, setWiggle] = useState(false);
  const [isSwallowing, setIsSwallowing] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submissionRef = useRef(0);
  const restoreTriggerFocus = useCallback(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && islandRef.current?.contains(focused)) focused.blur();
    requestAnimationFrame(() => islandRef.current?.focus({ preventScroll: true }));
  }, []);
  const closeIsland = useCallback(() => {
    dispatchIsland({ type: 'close' });
    restoreTriggerFocus();
  }, [restoreTriggerFocus]);

  const uploadRef = useRef(upload);
  useEffect(() => {
    uploadRef.current = upload;
  }, [upload]);

  useEffect(() => {
    let dragCounter = 0;
    let cancelled = false;
    let dropTimer: ReturnType<typeof setTimeout> | undefined;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;

      const types = e.dataTransfer?.types;
      let hasFiles = true; // Default to true to be safe
      if (types) {
        hasFiles = Array.from(types).some(t => 
          t.toLowerCase() === "files" || 
          t.toLowerCase().includes("file")
        );
      }
      if (hasFiles) {
        setWiggle(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setWiggle(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setWiggle(false);

      const files = Array.from(e.dataTransfer?.files || []);
      const audioFiles = files.filter(f => f.type.startsWith('audio/') || f.name.toLowerCase().endsWith('.mp3'));

      if (audioFiles.length > 0) {
        setIsSwallowing(true);
        const currentRoomId = roomId;
        if (dropTimer) clearTimeout(dropTimer);
        dropTimer = setTimeout(async () => {
          if (cancelled) return;
          setIsSwallowing(false);
          if (currentRoomId) {
            setIslandState("pill");
            setActiveTab("player");
            for (const file of audioFiles) {
              if (cancelled) break;
              try {
                await uploadRef.current.uploadFile(file, currentRoomId);
              } catch (err) {
                console.error("Failed to upload file", err);
              }
            }
          }
        }, 300);
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      cancelled = true;
      if (dropTimer) clearTimeout(dropTimer);
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [roomId, setIslandState]);

  const [activeTab, setActiveTab] = useState<IslandTab>("player");

  const [initialSearchMode, setInitialSearchMode] = useState<"youtube" | "spotify" | null>(null);

  const [slideDir, setSlideDir] = useState(1);

  const [seekIndicator, setSeekIndicator] = useState<{ amount: number; text: string } | null>(null);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [volIndicator, setVolIndicator] = useState<{ amount: number; text: string } | null>(null);
  const volTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPressing, setIsPressing] = useState(false);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localProgressRef = useRef(0);
  // ── Auto-sizing: measures actual rendered content height ──────────────────
  const contentMeasureRef = useRef<HTMLDivElement>(null);
  const [measuredContentHeight, setMeasuredContentHeight] = useState(300);

  const [radialSnapInfo, setRadialSnapInfo] = useState<{
    isOpen: boolean;
    snappedItem: { id: string; label: string; sublabel: string; iconName: string } | null;
  } | null>(null);

  useEffect(() => {
    const handleRadialSnap = (e: any) => {
      if (e.detail?.isOpen) {
        setRadialSnapInfo(e.detail);
      } else {
        setRadialSnapInfo(null);
      }
    };
    window.addEventListener("radial-navigator:snap", handleRadialSnap as EventListener);
    return () => window.removeEventListener("radial-navigator:snap", handleRadialSnap as EventListener);
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const handleModalToggle = (e: any) => {
      setIsModalOpen(!!e.detail?.isOpen);
    };
    window.addEventListener("modal:toggle", handleModalToggle as EventListener);
    return () => window.removeEventListener("modal:toggle", handleModalToggle as EventListener);
  }, []);

  // ── ResizeObserver: auto-size island to content ──────────────────────────
  useEffect(() => {
    const el = contentMeasureRef.current;
    if (!el) return;
    // Initial measurement
    setMeasuredContentHeight(el.scrollHeight);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use borderBoxSize if available for accuracy, fallback to scrollHeight
        const h = entry.borderBoxSize?.[0]?.blockSize ?? (entry.target as HTMLElement).scrollHeight;
        setMeasuredContentHeight(Math.ceil(h));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [islandState]); // re-attach whenever island opens/closes

  const lastTapRef = useRef<number>(0);

  const netStats = useNetworkStats(isRoom, activeTab === "deviceInfo", roomId || undefined);


  const [isBufferingStuck, setIsBufferingStuck] = useState(false);

  useEffect(() => {
    if (hasTrack && !audio.isReady && audio.downloadProgress === 0 && !audio.error) {
      const timer = setTimeout(() => {
        setIsBufferingStuck(true);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setIsBufferingStuck(false);
    }
  }, [hasTrack, audio.isReady, audio.downloadProgress, audio.error]);

  const activity = useMemo<IslandActivity | null>(() => {
    if (!isRoom) return null;
    const fromTransfer = (transfer: TrackActivity, prefix: string): IslandActivity => ({
      id: transfer.roomId + ':' + transfer.id,
      status: transfer.status,
      progress: transfer.indeterminate ? null : transfer.progress,
      label: transfer.status === 'failed' ? transfer.error || 'Could not prepare this track'
        : transfer.status === 'cancelled' ? 'Transfer cancelled'
        : transfer.status === 'complete' ? 'Added to queue' : prefix + transfer.title,
    });
    if (hasTrack && audio.error) return { id: 'audio:' + trackCacheKey(audio.trackUrl || ''), label: audio.error, status: 'failed', progress: null };
    if (hasTrack && !audio.isReady) return {
      id: 'audio:' + trackCacheKey(audio.trackUrl || ''), status: 'active',
      label: audio.downloadProgress >= 100 ? 'Preparing audio' : 'Downloading track',
      progress: audio.downloadIndeterminate || audio.downloadProgress >= 100 ? null : audio.downloadProgress,
    };
    if (upload.activity?.roomId === roomId && upload.activity.status === 'active') return fromTransfer(upload.activity, 'Adding: ');
    if (incomingTrack?.roomId === roomId && incomingTrack.status === 'active') return fromTransfer(incomingTrack, 'Preparing: ');
    if (incomingTrack?.roomId === roomId && incomingTrack.status === 'failed') return fromTransfer(incomingTrack, '');
    if (pendingPlay && (isAnyOtherDeviceBuffering || activeSocketIds.size > 0)) {
      const progresses = [...activeSocketIds].map(id => deviceSyncProgress[id]).filter(Number.isFinite);
      return { id: 'peers:' + trackCacheKey(audio.trackUrl || ''), status: 'active', label: 'Waiting for devices',
        progress: progresses.length ? Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length) : null };
    }
    if (upload.activity?.roomId === roomId) return fromTransfer(upload.activity, '');
    if (incomingTrack?.roomId === roomId) return fromTransfer(incomingTrack, '');
    return null;
  }, [isRoom, roomId, hasTrack, audio.error, audio.trackUrl, audio.isReady, audio.downloadProgress, audio.downloadIndeterminate,
      upload.activity, incomingTrack, pendingPlay, isAnyOtherDeviceBuffering, activeSocketIds, deviceSyncProgress]);

  useEffect(() => { dispatchIsland({ type: 'reset' }); }, [pathname]);
  useEffect(() => {
    dispatchIsland({ type: 'context', playing: effectivePlaying && hasTrack,
      requests: isHost && isPrivate && pendingRequests.length > 0, activity });
  }, [effectivePlaying, hasTrack, isHost, isPrivate, pendingRequests.length, activity, pathname]);

  // A single completion timer owns dismissal. Progress updates do not restart it.
  const noticeId = island.notice?.id;
  const activityIsActive = island.activity?.status === 'active';
  useEffect(() => {
    if (!noticeId || island.expanded || activityIsActive) return;
    const timer = setTimeout(() => dispatchIsland({ type: 'dismiss', id: noticeId }), 1200);
    return () => clearTimeout(timer);
  }, [noticeId, island.expanded, activityIsActive, pathname]);

  useEffect(() => () => {
    for (const ref of [previewTimerRef, clickTimerRef, pressTimerRef, seekTimeoutRef, volTimeoutRef]) {
      if (ref.current) clearTimeout(ref.current);
    }
  }, [pathname]);

  // ── Default to search tab if manually expanded with no track and player tab active
  useEffect(() => {
    if (isRoom && !hasTrack && islandState === "expanded" && activeTab === "player") {
      setInitialSearchMode("youtube");
      setActiveTab("search");
    }
  }, [isRoom, hasTrack, islandState, activeTab]);

  const showVolIndicator = useCallback((deltaOrAbs: number, isAbsolute = false) => {
    setVolIndicator({ amount: deltaOrAbs, text: isAbsolute ? `${deltaOrAbs}%` : `${deltaOrAbs > 0 ? "+" : ""}${deltaOrAbs}%` });
    if (volTimeoutRef.current) clearTimeout(volTimeoutRef.current);
    volTimeoutRef.current = setTimeout(() => setVolIndicator(null), 800);
  }, []);

  useEffect(() => {
    const handleShowDeviceInfo = () => {
      setActiveTab("deviceInfo");
      if (isRoom) setIslandState("expanded");
      else setIsExpanded(true);
    };
    window.addEventListener("showDeviceInfo", handleShowDeviceInfo);
    return () => window.removeEventListener("showDeviceInfo", handleShowDeviceInfo);
  }, [isRoom]);

  useEffect(() => {
    const handleExpandAdd = () => {
      setInitialSearchMode("youtube");
      setSlideDir(0);
      setActiveTab("search");
      if (isRoom) setIslandState("expanded");
      else setIsExpanded(true);
    };
    const handleExpandSpotify = () => {
      setInitialSearchMode("spotify");
      setSlideDir(0);
      setActiveTab("search");
      if (isRoom) setIslandState("expanded");
      else setIsExpanded(true);
    };
    const handleExpandInvite = () => {
      setSlideDir(0);
      setActiveTab("invite");
      if (isRoom) setIslandState("expanded");
      else setIsExpanded(true);
    };
    const handleExpandSync = () => {
      setSlideDir(0);
      setActiveTab("network");
      if (isRoom) setIslandState("expanded");
      else setIsExpanded(true);
    };

    document.addEventListener("island:expand-add", handleExpandAdd);
    document.addEventListener("island:expand-spotify", handleExpandSpotify);
    document.addEventListener("island:expand-invite", handleExpandInvite);
    document.addEventListener("island:expand-sync", handleExpandSync);
    return () => {
      document.removeEventListener("island:expand-add", handleExpandAdd);
      document.removeEventListener("island:expand-spotify", handleExpandSpotify);
      document.removeEventListener("island:expand-invite", handleExpandInvite);
      document.removeEventListener("island:expand-sync", handleExpandSync);
    };
  }, [isRoom]);

  // ── Reset tab when closing
  useEffect(() => {
    if (isRoom) {
      if (islandState === "pill") {
        const t = setTimeout(() => { setActiveTab("player"); }, 500);
        return () => clearTimeout(t);
      }
    } else {
      if (!isExpanded) {
        const t = setTimeout(() => { setActiveTab("player"); }, 500);
        return () => clearTimeout(t);
      }
    }
  }, [islandState, isExpanded, isRoom]);

  // ── Click outside to close
  useEffect(() => {
    const expanded = isRoom ? islandState === "expanded" : isExpanded;
    if (!expanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!document.contains(e.target as Node)) return;
      if (islandRef.current && !islandRef.current.contains(e.target as Node)) {
        if (isRoom) closeIsland();
        else setIsExpanded(false);
      }
    };
    let active = true;
    const id = requestAnimationFrame(() => {
      if (active) document.addEventListener("mousedown", handleClickOutside);
    });
    return () => {
      active = false;
      cancelAnimationFrame(id);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [islandState, isExpanded, isRoom, closeIsland]);

  const showSeekIndicator = useCallback((amount: number) => {
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    setSeekIndicator({ amount, text: amount > 0 ? `+${amount}s` : `${Math.abs(amount)}s` });
    seekTimeoutRef.current = setTimeout(() => setSeekIndicator(null), 1500);
  }, []);

  const handleTabChange = useCallback((newTab: IslandTab) => {
    if (activeTab === newTab) return;
    const order: Record<IslandTab, number> = { network: -1, player: 0, search: 1, invite: 2, requests: 3, deviceInfo: 4 };
    setSlideDir(order[newTab] > order[activeTab] ? 1 : -1);
    setActiveTab(newTab);
  }, [activeTab]);

  // ── Dimensions
  const displayName = user?.name ?? "Guest";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const isProfile = pathname.includes("/profile");

  const displayTime = audio.currentTime || 0;
  const displayProgress = localProgressRef.current;

  const _isPlayingRef = useRef(false);
  const _getTruePosRef = useRef(audio.getTruePosition);
  const _durationRef = useRef(0);
  _isPlayingRef.current = audio.isPlaying;
  _getTruePosRef.current = audio.getTruePosition;
  _durationRef.current = audio.duration;

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      if (_isPlayingRef.current) {
        const pos = _getTruePosRef.current();
        const dur = _durationRef.current;
        if (dur > 0) localProgressRef.current = Math.min(1, pos / dur);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleToggle = useCallback((e?: React.MouseEvent | KeyboardEvent) => {
    e?.stopPropagation();
    audio.unlockAudio();
    if (isRoom && roomId) {
      if (effectivePlaying || pendingPlay) pause();
      else play();
    } else {
      audio.toggle();
    }
  }, [audio, isRoom, roomId, effectivePlaying, pendingPlay, play, pause]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    audio.unlockAudio();
    if (isRoom && roomId) nextTrack();
  }, [audio, isRoom, roomId, nextTrack]);

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    audio.unlockAudio();
    if (isRoom && roomId) prevTrack();
  }, [audio, isRoom, roomId, prevTrack]);

  const handleSeek = useCallback((posSecs: number) => {
    if (isRoom && roomId) seek(posSecs * 1000);
    else audio.seek(posSecs);
  }, [audio, isRoom, roomId, seek]);

  // ── Keyboard shortcuts
  const _keyboardStateRef = useRef({ isRoom, roomId, effectivePlaying, pendingPlay });
  useEffect(() => { _keyboardStateRef.current = { isRoom, roomId, effectivePlaying, pendingPlay }; }, [isRoom, roomId, effectivePlaying, pendingPlay]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.target instanceof Element && e.target.closest('input, textarea, select, button, [role="tab"], [role="button"]')) || (document.activeElement as HTMLElement)?.isContentEditable) return;
      const state = _keyboardStateRef.current;
      if (e.code === "Space") {
        e.preventDefault();
        audio.unlockAudio();
        if (state.isRoom && state.roomId) {
          if (state.effectivePlaying || state.pendingPlay) pause();
          else play();
        } else audio.toggle();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        const newTime = Math.max(0, audio.getTruePosition() - 5);
        showSeekIndicator(-5);
        if (state.isRoom && state.roomId) seek(newTime * 1000);
        else audio.seek(newTime);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        const newTime = Math.min(audio.duration || 0, audio.getTruePosition() + 5);
        showSeekIndicator(5);
        if (state.isRoom && state.roomId) seek(newTime * 1000);
        else audio.seek(newTime);
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        const cur = audio.getVolume ? audio.getVolume() : audio.volume;
        const newVol = Math.min(100, cur + 10);
        if (newVol !== cur) {
          audio.setVolume(newVol);
          showVolIndicator(newVol - cur);
          if (state.isRoom && state.roomId && getSocket().connected) {
            getSocket().emit("room:setParticipantVolume", { roomId: state.roomId, targetSocketId: getSocket().id, volume: newVol });
          }
        }
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        const cur = audio.getVolume ? audio.getVolume() : audio.volume;
        const newVol = Math.max(0, cur - 10);
        if (newVol !== cur) {
          audio.setVolume(newVol);
          showVolIndicator(newVol - cur);
          if (state.isRoom && state.roomId && getSocket().connected) {
            getSocket().emit("room:setParticipantVolume", { roomId: state.roomId, targetSocketId: getSocket().id, volume: newVol });
          }
        }
      } else if (e.code === "KeyM") {
        e.preventDefault();
        if (audio.toggleMute) {
          const newVol = audio.toggleMute();
          showVolIndicator(newVol, true);
          if (state.isRoom && state.roomId && getSocket().connected) {
            getSocket().emit("room:setParticipantVolume", { roomId: state.roomId, targetSocketId: getSocket().id, volume: newVol });
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [audio, play, pause, seek]);

  const isSyncingNow = isRoom && activity?.status === 'active';

  const isExpanded_room = islandState === 'expanded';
  const isExtended_room = islandState === 'extended';
  const showSecondary = isRoom && prefetch.isPrefetching && !isExpanded_room && !wiggle && !isSwallowing && !radialSnapInfo?.isOpen;
  const [secondaryExiting, setSecondaryExiting] = useState(false);
  useEffect(() => { if (showSecondary) setSecondaryExiting(true); }, [showSecondary]);
  useEffect(() => { if (isModalOpen || !isRoom) setSecondaryExiting(false); }, [isModalOpen, isRoom]);
  const secondaryReserve = showSecondary || secondaryExiting ? SECONDARY_SIZE + SECONDARY_GAP : 0;
  const secondaryProgressLabel = prefetch.isIndeterminate ? 'preparing' : `${prefetch.nextTrackProgress}%`;
  const secondaryLabel = prefetch.nextTrackTitle
    ? `Next track: ${prefetch.nextTrackTitle} — ${secondaryProgressLabel}` : `Next track — ${secondaryProgressLabel}`;
  const availableWidth = Math.max(1, viewportBounds.width - secondaryReserve);
  const pillWidth = Math.min(hasTrack ? 120 : 86, availableWidth);
  const hasPending = isHost && isPrivate && pendingRequests.length > 0;
  const extendedWidth = Math.min(hasPending ? 460 : 360, availableWidth);
  const extendedHeight = isSyncingNow ? EXTENDED_SYNC_HEIGHT : COMPACT_HEIGHT;
  const expandedWidth = Math.min(840, availableWidth);
  const maxIslandHeight = Math.max(1, viewportBounds.height - (isMobile ? 0 : Math.max(0, 28 - viewportBounds.y)));
  const expandedHeight = Math.min(maxIslandHeight, measuredContentHeight + 8);
  const dropZoneSize = Math.min(240, availableWidth, maxIslandHeight);
  const currentWidth = wiggle || isSwallowing ? dropZoneSize
    : radialSnapInfo?.isOpen ? Math.min(265, availableWidth)
    : isExpanded_room ? expandedWidth : isExtended_room ? extendedWidth : pillWidth;
  const currentHeight = Math.min(maxIslandHeight, wiggle || isSwallowing ? dropZoneSize
    : isExpanded_room ? expandedHeight : isExtended_room ? extendedHeight : COMPACT_HEIGHT);
  const currentRadius = wiggle || isSwallowing ? 48 : isExpanded_room ? 36 : currentHeight / 2;
  const renderedSize = useIslandSize(islandRef, isRoom && !isModalOpen && joinStatus !== 'pending' && joinStatus !== 'denied');
  const docking = useIslandDock(false,
    isExpanded_room, {
      width: Math.min(renderedSize?.width ?? currentWidth, availableWidth) + secondaryReserve,
      height: Math.min(renderedSize?.height ?? currentHeight, maxIslandHeight),
    }, viewportBounds);

  useEffect(() => {
    if (!isExpanded_room || !isRoom) return;
    const frame = requestAnimationFrame(() => {
      if (!islandRef.current?.contains(document.activeElement)) islandRef.current?.focus({ preventScroll: true });
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeIsland(); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(islandRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
      ) || []).filter(element => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === islandRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === islandRef.current)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', onKey); };
  }, [isExpanded_room, isRoom, closeIsland]);

  // ── Render guard
  if (isModalOpen) return null;
  if (isRoom && joinStatus === "denied") return null;

  // ── Non-room layout (nav bar)
  if (!isRoom) {
    // Legacy compact/expanded for non-room

    return (
      <div 
        className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none"
        style={{
          top: "max(calc(1.5rem + 2px), calc(env(safe-area-inset-top, 0px) + 0.5rem + 2px))",
        }}
      >
        <div className="pointer-events-auto glass-panel w-[92%] max-w-5xl rounded-4xl px-4 sm:px-6 md:px-8 py-3.5 flex items-center justify-between shadow-2xl select-none">
          <Link href="/room/default" className="flex items-center gap-2 sm:gap-3 group">
            <SyncBeatsLogo markClassName="h-9 w-9 sm:h-10 sm:w-10 group-hover:scale-105 transition-transform" wordmarkClassName="text-base sm:text-lg" />
          </Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <ThemeToggle />
            <div className="w-px h-6 bg-foreground/10 hidden sm:block" />
            {isProfile ? (
              <Link href="/room/default" className="h-9 px-5 flex items-center justify-center rounded-xl bg-foreground/10 text-foreground text-xs sm:text-sm font-bold hover:bg-foreground hover:text-background active:scale-95 transition-all">Done</Link>
            ) : (
              <div onClick={() => window.dispatchEvent(new CustomEvent("open-profile-modal"))} className="flex items-center gap-3 cursor-pointer group outline-none">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-bold text-foreground">{displayName}</div>
                  <div className="text-xs font-semibold text-foreground/40">{user?.email ?? ""}</div>
                </div>
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center border-2 border-transparent glass-panel group-active:scale-95 transition-all shadow-md">
                  <span className="text-xs sm:text-sm font-black text-foreground">{initials}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const cancelPress = () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
    setIsPressing(false);
  };
  const openIsland = () => {
    if (!hasTrack) { setInitialSearchMode('youtube'); setSlideDir(0); setActiveTab('search'); }
    dispatchIsland({ type: 'open' });
  };
  const handlePointerDown_room = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('button, a, input, select, textarea, [role="slider"]')) return;
    setIsPressing(true);
    pressTimerRef.current = setTimeout(() => {
      cancelPress();
      openIsland();
      if (!reduceMotion) navigator.vibrate?.(30);
    }, 300);
  };
  const handlePointerUp_room = () => {
    if (!pressTimerRef.current) return;
    cancelPress();
    const now = Date.now();
    if (now - lastTapRef.current < 500) {
      handleToggle();
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (!hasTrack) openIsland();
    else if (islandState === 'pill') {
      dispatchIsland({ type: 'preview' });
      const delay = islandCustomizer.autoShrinkDelaySec ?? 6;
      if (delay > 0) previewTimerRef.current = setTimeout(() => dispatchIsland({ type: 'end-preview' }), delay * 1000);
    } else dispatchIsland({ type: 'compact' });
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-40 pointer-events-none"
        animate={{ opacity: isExpanded_room ? 1 : 0, backgroundColor: isExpanded_room ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0)" }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
        style={{ pointerEvents: isExpanded_room ? "auto" : "none", backdropFilter: isExpanded_room ? "blur(3px)" : "blur(0px)", WebkitBackdropFilter: isExpanded_room ? "blur(3px)" : "blur(0px)" }}
        onClick={closeIsland}
      />

      <div 
        className="fixed z-100 flex flex-col items-center pointer-events-none left-1/2 -translate-x-1/2"
        style={{
          top: "max(calc(1.75rem + 2px), calc(env(safe-area-inset-top, 0px) + 0.5rem + 2px))",
        }}
      >
        {/* relative: anchors the secondary circle to the island's right edge.
            x slides the pair left by half the circle's footprint so the two
            stay centred as a group instead of the circle hanging off-screen. */}
        <motion.div
          className="relative flex items-center"
          animate={{ x: -secondaryReserve / 2 }}
          transition={reduceMotion ? { duration: 0.2, ease: "easeOut" } : SHAPE_SPRING}
        >
        <motion.div
          ref={islandRef}
          onContextMenu={e => e.preventDefault()}
          role={isExpanded_room ? 'dialog' : 'button'}
          aria-label={isExpanded_room ? 'Room controls' : 'Open music controls'}
          aria-expanded={isExpanded_room}
          aria-modal={isExpanded_room || undefined}
          tabIndex={isExpanded_room ? -1 : 0}
          onPointerDown={handlePointerDown_room}
          onPointerUp={handlePointerUp_room}
          onClickCapture={event => {
            if (docking.suppressClick()) { event.preventDefault(); event.stopPropagation(); }
          }}
          onMouseEnter={() => {
            if (!isMobile && hasTrack) {
              if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
              dispatchIsland({ type: 'preview' });
            }
          }}
          onMouseLeave={() => {
            if (!isMobile) {
              if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
              previewTimerRef.current = setTimeout(() => dispatchIsland({ type: 'end-preview' }), 1200);
            }
          }}
          onKeyDown={event => {
            if (event.target === event.currentTarget && !isExpanded_room && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault(); event.stopPropagation(); openIsland();
            }
          }}
          onClick={event => {
            if (isExpanded_room) return;
            if (event.detail === 0) { openIsland(); return; }
            if (!isMobile) {
              if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
              clickTimerRef.current = setTimeout(openIsland, 300);
            }
          }}
          onDoubleClick={event => {
            if (isMobile || isExpanded_room || docking.suppressClick()) return;
            event.preventDefault();
            if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
            handleToggle();
          }}
          initial={false}
          transition={{
            width: reduceMotion ? { duration: 0.2, ease: "easeOut" } : SHAPE_SPRING,
            height: reduceMotion ? { duration: 0.2, ease: "easeOut" } : SHAPE_SPRING,
            borderRadius: reduceMotion ? { duration: 0.2, ease: "easeOut" } : SHAPE_SPRING,
            scale: reduceMotion ? { duration: 0 } : isSwallowing ? { duration: 0.5, ease: "easeInOut" } : { type: "spring", stiffness: 400, damping: 30, mass: 0.6 },
            x: wiggle && !isSwallowing ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : { type: "spring", stiffness: 400, damping: 30 }
          }}
          animate={{
            width: currentWidth,
            height: currentHeight,
            borderRadius: currentRadius,
            scale: reduceMotion ? 1 : isSwallowing ? [1, 1.08, 0.85] : (isPressing && islandState === "pill" ? 0.94 : 1),
            x: wiggle && !isSwallowing && !reduceMotion ? [0, -5, 5, -5, 5, -5, 5, 0] : 0
          }}
          style={{
            backgroundColor: "#000000",
            cursor: isExpanded_room ? "default" : "pointer",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            willChange: "width, height, border-radius",
            transform: "translateZ(0)",
            maxHeight: maxIslandHeight,
            maxWidth: viewportBounds.width - secondaryReserve,
            touchAction: isMobile && !isExpanded_room ? 'none' : 'auto',
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
            userSelect: "none",
          }}
          className={cn("pointer-events-auto select-none no-touch-select focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white", currentGlowClass)}
        >
          {/* Rotating Border Light Beam — one flat accent arc, no colour fade */}
          <AnimatePresence>
            {isSearchLoading && (
              <motion.div
                key="rotating-border-trail"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="absolute -inset-[1px] pointer-events-none z-[45] rounded-[inherit] overflow-hidden p-[2px]"
                style={{
                  WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                }}
              >
                <motion.div
                  animate={reduceMotion ? { rotate: 0 } : { rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
                  className="w-[300%] h-[300%] -top-[100%] -left-[100%] absolute"
                  style={{
                    background: `conic-gradient(from 0deg at 50% 50%,
                      transparent 0deg,
                      transparent 250deg,
                      ${activeGlowColorHex} 250deg,
                      ${activeGlowColorHex} 360deg
                    )`,
                    filter: `drop-shadow(0 0 6px ${activeGlowColorHex}) drop-shadow(0 0 14px ${activeGlowColorHex})`,
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Temporary Radial Navigator Gesture Overlay */}
          <AnimatePresence>
            {radialSnapInfo?.isOpen && (
              <motion.div
                key="radial-content"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 z-30 bg-black rounded-full"
              >
                <RadialNavigatorPillContent snappedItem={radialSnapInfo.snappedItem} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pill content */}
          <AnimatePresence>
            {islandState === "pill" && !wiggle && (
              <motion.div
                key="pill-content"
                {...contentMorph(!!reduceMotion)}
                className="absolute inset-0"
              >
                <RoomPill
                  effectivePlaying={effectivePlaying}
                  trackTitle={audio.trackTitle}
                  trackUrl={audio.trackUrl}
                  isRoom={isRoom}
                  isSyncing={isSyncingNow}
                  hasTrack={hasTrack}
                  seekIndicator={seekIndicator}
                  volIndicator={volIndicator}
                  onTogglePlayback={handleToggle}
                  showAlbumArt={islandCustomizer.showAlbumArt}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Extended content */}
          <AnimatePresence>
            {islandState === "extended" && (
              <motion.div
                key="extended-content"
                {...contentMorph(!!reduceMotion)}
                className="absolute inset-0"
              >
                <RoomExtendedPill
                  effectivePlaying={effectivePlaying}
                  trackTitle={audio.trackTitle}
                  trackUrl={audio.trackUrl}
                  activity={activity}
                  notice={island.notice}
                  pendingRequestsCount={pendingRequests?.length || 0}
                  isHost={isHost}
                  isPrivate={isPrivate}
                  onRequestsClick={() => { setActiveTab("requests"); setIslandState("expanded"); }}
                  seekIndicator={seekIndicator}
                  volIndicator={volIndicator}
                  onTogglePlayback={handleToggle}
                  isStuck={isBufferingStuck}
                  onNextTrack={nextTrack}
                  onRetry={() => { audio.unlockAudio(); audio.retryTrack(); play(); }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Expanded content */}
          <AnimatePresence>
            {isExpanded_room && !wiggle && (
              <motion.div
                key="expanded-tab-container"
                {...contentMorph(!!reduceMotion)}
                className="w-full h-full relative pointer-events-auto overflow-y-auto overscroll-contain"
                style={{ maxHeight: currentHeight, touchAction: 'pan-y' }}
              >
                {/* Measurement wrapper: renders at natural height so ResizeObserver can read it */}
                <div ref={contentMeasureRef}>
                  <div className="flex items-center justify-end px-3 pt-2 text-white" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
                    <button
                      type="button"
                      aria-label="Close music controls"
                      onClick={closeIsland}
                      className="min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 focus-visible:outline-2 focus-visible:outline-white transition-colors cursor-pointer"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                <AnimatePresence custom={slideDir} initial={false} mode="popLayout">
                  {activeTab === "player" && (
                    <motion.div key="player" custom={slideDir} variants={tabVariants} initial="enter" animate="center" exit="exit" transition={SPRING} className="w-full relative">

                      <PlayerTab
                        effectivePlaying={effectivePlaying}
                        trackTitle={audio.trackTitle}
                        trackUrl={audio.trackUrl}
                        isReady={audio.isReady}
                        error={audio.error}
                        downloadProgress={audio.downloadProgress}
                        audio={audio}
                        deviceSyncProgress={deviceSyncProgress}
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
                        pendingRequestsCount={pendingRequests?.length || 0}
                        isHost={isHost}
                        isPrivate={isPrivate}
                        isVisible={isExpanded_room}
                      />
                    </motion.div>
                  )}
                  {activeTab === "network" && (
                    <motion.div key="network" custom={slideDir} variants={tabVariants} initial="enter" animate="center" exit="exit" transition={SPRING} className="w-full relative">
                      <NetworkTab onBack={() => handleTabChange("player")} netStats={netStats} audio={audio} />
                    </motion.div>
                  )}
                  {activeTab === "search" && (
                    <motion.div key="search" custom={slideDir} variants={tabVariants} initial="enter" animate="center" exit="exit" transition={SPRING} className="w-full relative">
                      <SearchTab 
                        roomId={roomId!} 
                        initialMode={initialSearchMode}
                        onBack={() => setActiveTab("player")} 
                        onLoadingStateChange={setIsSearchLoading}
                        isSearchOnly={false} 
                        isPlaying={audio.isPlaying}
                        hasTrack={hasTrack}
                        onSuccess={() => {
                          setIsSearchLoading(false);
                          setActiveTab('player');
                          dispatchIsland({ type: 'submitted', id: `enqueue:${roomId}:${++submissionRef.current}` });
                          restoreTriggerFocus();
                        }}
                      />
                    </motion.div>
                  )}
                  {(activeTab === "deviceInfo" || activeTab === "invite") && (
                    <motion.div key="invite-tab" custom={slideDir} variants={tabVariants} initial="enter" animate="center" exit="exit" transition={SPRING} className="w-full relative">
                      <InviteTab 
                        onBack={() => setActiveTab("player")} 
                        roomId={roomId || ''}
                      />
                    </motion.div>
                  )}
                  {activeTab === "requests" && (
                    <motion.div key="requests" custom={slideDir} variants={tabVariants} initial="enter" animate="center" exit="exit" transition={SPRING} className="w-full relative h-auto">
                      <RequestsTab
                        requests={pendingRequests || []}
                        onApprove={(id: any, name: any) => {
                          document.dispatchEvent(new CustomEvent("room:action-approve", { detail: { socketId: id, displayName: name } }));
                          if ((pendingRequests?.length || 0) <= 1) setIslandState("pill");
                        }}
                        onDeny={(id: any) => {
                          document.dispatchEvent(new CustomEvent("room:action-deny", { detail: { socketId: id } }));
                          if ((pendingRequests?.length || 0) <= 1) setIslandState("pill");
                        }}
                        onBack={() => setIslandState("pill")}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                </div>{/* /contentMeasureRef */}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Drop Overlay */}
          <AnimatePresence>
            {(wiggle || isSwallowing) && (
              <motion.div
                key="drop-overlay"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: isSwallowing ? 0.5 : 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="absolute inset-0 z-50 flex flex-col items-center justify-center"
              >
                <motion.div 
                  animate={{ y: isSwallowing ? 20 : 0, scale: isSwallowing ? 0 : 1 }}
                  transition={{ duration: 0.3, ease: "backIn" }}
                  className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-4 shadow-2xl"
                >
                  <Upload className="w-8 h-8 text-white" />
                </motion.div>
                <motion.span 
                  animate={{ opacity: isSwallowing ? 0 : 1 }}
                  transition={{ duration: 0.2 }}
                  className="text-lg font-bold text-white tracking-wide drop-shadow-md"
                >
                  Drop MP3
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>

        {/* Gloss overlay removed — the island stays flat black, no gradients. */}
        </motion.div>

        {/* ── Secondary island: detached circle for background tasks ──
            Absolutely placed off the island's right edge, so as the island
            animates between pill and extended the circle tracks its edge. */}
        <div
          className="absolute left-full top-0 h-full flex items-center pointer-events-none"
          style={{ paddingLeft: SECONDARY_GAP }}
        >
          <AnimatePresence onExitComplete={() => { if (!showSecondary) setSecondaryExiting(false); }}>
            {showSecondary && (
              <motion.div
                key="secondary-island"
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                // Springs in, eases out fast — same asymmetry as the content
                // morph. A spring on exit asymptotes and reads as a lag.
                exit={{ scale: 0.3, opacity: 0, transition: { duration: 0.15, ease: EASE_IN } }}
                transition={reduceMotion ? { duration: 0.2, ease: "easeOut" } : SHAPE_SPRING}
                // Not role="status": that implies aria-live, and the content is
                // a percentage that ticks 1→100, so it would announce ~100
                // times per track. A labelled graphic is reachable without the
                // spam; it's a passive background indicator, nothing to act on.
                role="img"
                aria-label={secondaryLabel}
                title={secondaryLabel}
                className="relative flex items-center justify-center rounded-full shrink-0"
                style={{
                  width: SECONDARY_SIZE,
                  height: SECONDARY_SIZE,
                  backgroundColor: "#000000",
                  // Grow out of the island's edge rather than from thin air.
                  transformOrigin: "left center",
                }}
              >
                <svg viewBox={`0 0 ${SECONDARY_SIZE} ${SECONDARY_SIZE}`} className="absolute inset-0 w-full h-full" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={SECONDARY_SIZE / 2} cy={SECONDARY_SIZE / 2} r={SECONDARY_R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
                  <circle
                    cx={SECONDARY_SIZE / 2} cy={SECONDARY_SIZE / 2} r={SECONDARY_R} fill="none"
                    stroke={activeGlowColorHex} strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={SECONDARY_C}
                    strokeDashoffset={SECONDARY_C * (prefetch.isIndeterminate ? 0.7 : 1 - prefetch.nextTrackProgress / 100)}
                    style={{ transition: "stroke-dashoffset 0.3s ease-out" }}
                  />
                </svg>
                <span className="text-[10px] font-black tabular-nums text-white/90">
                  {prefetch.isIndeterminate ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" /> : prefetch.nextTrackProgress}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </motion.div>
      </div>
    </>
  );
}
