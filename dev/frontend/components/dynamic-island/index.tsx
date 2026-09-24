"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import {
  Disc, Pause, Play, SkipForward, SkipBack, Upload,
  Loader2, AlertCircle, AlertTriangle, Activity,
  ChevronLeft, Search, FastForward, Rewind, LogOut, Users,
  Radio, Volume2, VolumeX, UserPlus, Send, User, LayoutGrid, MessageSquare, Compass
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import { useAudio } from "../../context/AudioContext";

import { useUpload } from "../../context/UploadContext";
import { JoinRequest } from "../../lib/types";
import { getSocket } from "../../lib/socket";
import { roomsApi, usersApi } from "../../lib/api";
import { formatTime } from "../../hooks/useAudioPlayer";
import { ThemeToggle } from "../ThemeToggle";
import { useSyncInfo } from "../../context/SyncContext";
import { useNetworkStats, qualityColor } from "../../hooks/useNetworkStats";
import { SearchTab } from "../room/SearchTab";
import { useSettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";

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

const COMPACT_WIDTH = 130;
const COMPACT_HEIGHT = 44;
// Extended grows while syncing: the sync bar adds a label row that clips at 44.
// 62 = title (14) + gap (6) + label row (13) + gap (6) + bar (4) + py-2 (16).
const EXTENDED_SYNC_HEIGHT = 62;

// Secondary island — the detached circle iOS shows beside the pill when a
// second activity is live. Ring geometry is derived so the size is one knob.
const SECONDARY_SIZE = 40;
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
type IslandState = "pill" | "extended" | "expanded";
type IslandTab = "player" | "network" | "search" | "requests" | "deviceInfo" | "invite";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const globalYtTitleCache = new Map<string, string>();

function cleanTrackTitle(title: string | null | undefined, trackUrl?: string | null): string {
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
  if (/^[a-zA-Z0-9_-]{11}$/.test(fileName) && !/^[a-zA-Z]{11}$/.test(fileName)) {
    const ytId = fileName;
    if (globalYtTitleCache.has(ytId)) {
      return globalYtTitleCache.get(ytId)!;
    }
    if (typeof window !== "undefined") {
      fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.title) {
            globalYtTitleCache.set(ytId, data.title);
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
  
  const ytMatch = trackUrl.match(/^(?:ws-p2p:yt:|youtube:)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    return `https://i.ytimg.com/vi/${ytMatch[1]}/${quality === 'hq' ? 'hqdefault' : 'mqdefault'}.jpg`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────
// AudioBars
// ─────────────────────────────────────────────────────────

import { AudioBars } from "./AudioBars";

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
    <div className={cn('flex', 'items-center', 'gap-1.5', 'w-full', 'mt-1', 'shrink-0')}>
      <span ref={curRef} className={cn('text-[9px]', 'font-bold', 'leading-none', 'tabular-nums', 'text-white/50', 'shrink-0')}>00:00</span>
      <div className={cn('flex-1', 'min-w-0', 'h-0.75', 'bg-white/15', 'rounded-full', 'overflow-hidden')}>
        <div ref={barRef} className={cn('h-full', 'bg-white/80', 'rounded-full')}
          style={{ width: "0%", transition: isPlaying ? "none" : "width 200ms ease" }} />
      </div>
      <span ref={durRef} className={cn('text-[9px]', 'font-bold', 'leading-none', 'tabular-nums', 'text-white/40', 'shrink-0')}>00:00</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// SyncProgressBar — for Extended state
// Shows combined buffering / seeding / syncing progress
// ─────────────────────────────────────────────────────────

const SyncProgressBar = ({
  downloadProgress,
  deviceSyncProgress,
  participants,
  incomingTrack,
  isReady,
  isStuck,
  onSkip,
}: {
  downloadProgress: number;
  deviceSyncProgress: Record<string, number>;
  participants: any[];
  incomingTrack: { title: string; progress: number } | null;
  isReady: boolean;
  isStuck?: boolean;
  onSkip?: () => void;
}) => {
  const upload = useUpload();
  const accent = useIslandAccent();

  // Compute overall sync progress only for active room participants
  const activeSocketIds = new Set((participants || []).map((p: any) => p.socketId));
  const progresses = Object.entries(deviceSyncProgress)
    .filter(([sid]) => activeSocketIds.has(sid))
    .map(([, p]) => p);
  const hasSync = progresses.length > 0;
  const avgSync = hasSync
    ? Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length)
    : 0;

  const progress = upload.isUploading
    ? (upload.uploadProgress || 10)
    : incomingTrack
    ? incomingTrack.progress
    : !isReady
    ? downloadProgress
    : hasSync
    ? avgSync
    : 100;

  const label = upload.isUploading
    ? "Uploading Song..."
    : incomingTrack
    ? (incomingTrack.title ? `Receiving "${incomingTrack.title.substring(0, 18)}..."` : "Receiving Track")
    : isStuck
    ? "Stuck • Tap to skip"
    : !isReady
    ? "Downloading Track"
    : hasSync && avgSync < 100
    ? "Syncing Devices"
    : "Synced";

  const canSkip = !!(isStuck && onSkip);

  return (
    <div
      className={cn('flex', 'flex-col', 'justify-center', 'gap-1.5', 'w-full', canSkip && 'cursor-pointer pointer-events-auto')}
      onPointerDown={canSkip ? e => e.stopPropagation() : undefined}
      onClick={canSkip ? e => { e.stopPropagation(); onSkip!(); } : undefined}
      title={canSkip ? "Track is stuck. Tap to skip." : undefined}
    >
      <div className={cn('flex', 'items-center', 'justify-between', 'gap-2')}>
        <span
          className={cn('text-[9px]', 'font-black', 'uppercase', 'tracking-widest', 'flex', 'items-center', 'gap-1', 'min-w-0')}
          style={{ color: isStuck ? STUCK_HEX : "rgba(255,255,255,0.45)" }}
        >
          {isStuck && <AlertTriangle className={cn('w-3', 'h-3', 'shrink-0', 'animate-bounce')} />}
          <span className="truncate">{label}</span>
        </span>
        <span
          className={cn('text-[10px]', 'font-black', 'tabular-nums', 'shrink-0')}
          style={{ color: isStuck ? STUCK_HEX : "rgba(255,255,255,0.6)" }}
        >
          {progress}%
        </span>
      </div>
      <div className={cn('w-full', 'h-1', 'rounded-full', 'bg-white/15', 'overflow-hidden')}>
        <div
          className={cn('h-full', 'rounded-full', 'transition-[width]', 'duration-300', 'ease-out', isStuck && 'animate-pulse')}
          style={{ width: `${progress}%`, backgroundColor: isStuck ? STUCK_HEX : accent }}
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
    <div className={cn('flex', 'items-center', 'gap-3', 'w-full', 'mt-2')}>
      <span ref={leftTimeRef} className={cn('text-[12px]', 'font-medium', 'text-white/50', 'font-mono', 'w-9', 'text-right', 'select-none', 'pointer-events-none')}>0:00</span>
      <div className={cn('relative', 'flex-1', 'h-8', 'flex', 'items-center', 'cursor-pointer', 'group')}
        onClick={e => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          onSeek(p * duration);
        }}>
        <div className={cn('absolute', 'w-full', 'h-1.5', 'rounded-full', 'bg-white/10', 'overflow-hidden')}>
          <div ref={barRef} className={cn('h-full', 'bg-white/80', 'rounded-full')} style={{ width: "0%", transition: isPlaying ? "none" : "width 200ms ease" }} />
        </div>
        <div ref={handleRef} className={cn('absolute', 'w-3', 'h-3', 'rounded-full', 'bg-white', 'shadow-lg', 'opacity-0', 'group-hover:opacity-100', 'transition-opacity')} style={{ left: "-6px" }} />
      </div>
      <span ref={rightTimeRef} className={cn('text-[12px]', 'font-medium', 'text-white/50', 'font-mono', 'w-9', 'text-left', 'select-none', 'pointer-events-none')}>-0:00</span>
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
  progress, displayTime, duration, hasTrack, onToggle, onNext, onPrev, onSeek,
  onTabChange, isRoom, roomParticipants, pendingRequestsCount, isHost, isPrivate,
  isVisible = true, audio, deviceSyncProgress,
}: any) => {
  const isYt = !!trackUrl?.startsWith("youtube:") || !!trackUrl?.startsWith("ws-p2p:yt:");
  const thumbnailUrl = getTrackThumbnail(trackUrl, 'hq');
  const trackInitials = cleanTrackTitle(trackTitle).substring(0, 2).toUpperCase();
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const accent = useIslandAccent();

  const isRoomReady = isRoom && roomParticipants ? roomParticipants.every((p: any) => p.isReady) : true;
  const loadingParticipants = isRoom && roomParticipants ? roomParticipants.filter((p: any) => !p.isReady) : [];

  return (
    <div className={cn('relative', 'w-full', 'flex', 'flex-col', 'justify-evenly', 'px-5', 'sm:px-8', 'py-8', 'sm:py-10', 'gap-6')}>
      {/* Track header */}
      <div className={cn('flex', 'items-start', 'gap-3', 'sm:gap-4', 'w-full')}>
        <div className={`flex items-center justify-center shrink-0 border overflow-hidden w-15 h-15 sm:w-17 sm:h-17 rounded-[14px] shadow-lg ${
          thumbnailUrl ? "border-white/20" : isYt ? "bg-[#FF0000]/10 border-[#FF0000]/20" : "bg-white/10 border-white/10"
        }`}>
          {thumbnailUrl
            ? <img src={thumbnailUrl} draggable={false} onContextMenu={e => e.preventDefault()} className={cn('w-full', 'h-full', 'object-cover', 'select-none', 'pointer-events-none', 'no-touch-select')} />
            : <span className={cn('text-xl', 'font-black', 'text-white/80', 'select-none')}>{trackInitials}</span>}
        </div>

        <div className={cn('flex', 'flex-col', 'justify-center', 'flex-1', 'min-w-0', 'pt-1')}>
          <div className={cn('font-bold', 'text-white', 'text-[18px]', 'truncate', 'leading-tight', 'tracking-tight')}>
            {cleanTrackTitle(trackTitle)}
          </div>
          <div
            className={`text-[13px] sm:text-[15px] truncate mt-0.5 transition-colors ${
              error ? "text-[#FF0000]/80 cursor-pointer hover:text-[#FF0000]" : "text-white/50"
            }`}
            onClick={e => { if (error) { e.stopPropagation(); setShowErrorDetails(p => !p); } }}
          >
            {error ? (
              <span className={cn('flex', 'items-center', 'gap-1')}><AlertCircle className={cn('w-3.5', 'h-3.5')} /> Failed • Tap for info</span>
            ) : isReady && !isRoomReady ? "Syncing to peers…"
              : isReady ? "Ready to play"
              : `Buffering… ${downloadProgress}%`}
          </div>

          <AnimatePresence>
            {error && showErrorDetails && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <div className={cn('bg-[#FF0000]/10', 'border', 'border-[#FF0000]/20', 'rounded-lg', 'p-2.5', 'text-[11px]', 'text-[#FF0000]/90', 'mt-2')}>
                  <p className={cn('font-bold', 'mb-1')}>Track Transfer Failed</p>
                  <p className="opacity-80">{error}</p>
                </div>
              </motion.div>
            )}
            {hasTrack && isRoom && loadingParticipants.length > 0 && !error && !showErrorDetails && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2">
                <div className={cn('flex', 'items-center', 'gap-2', 'flex-wrap', 'max-h-12', 'overflow-y-auto', 'custom-scrollbar', 'pr-1')} data-lenis-prevent="true">
                  {loadingParticipants.map((p: any) => {
                    const progress = deviceSyncProgress[p.socketId] || 0;
                    return (
                      <div key={p.socketId} className={cn('flex', 'items-center', 'gap-2', 'bg-white/10', 'rounded-full', 'pl-2.5', 'pr-3', 'py-1.5')}>
                        <Loader2 className={cn('w-3', 'h-3', 'text-white/50', 'animate-spin', 'shrink-0')} />
                        <span className={cn('text-[10px]', 'font-bold', 'text-white/70', 'uppercase', 'tracking-widest', 'whitespace-nowrap')}>{p.displayName}</span>
                        <div className={cn('w-12', 'h-1', 'bg-black/40', 'rounded-full', 'overflow-hidden', 'shrink-0')}>
                          <div className={cn('h-full', 'rounded-full', 'transition-[width]', 'duration-300', 'ease-out')} style={{ width: `${progress}%`, backgroundColor: accent }} />
                        </div>
                        <span className={cn('text-[9px]', 'font-black', 'text-white/40', 'tabular-nums')}>{progress}%</span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className={cn('flex', 'items-center', 'gap-4', 'shrink-0', 'pr-1', 'pt-1')}>
          {error ? <AlertCircle className={cn('w-5', 'h-5', 'text-[#FF0000]/80')} />
            : !isReady || !isRoomReady ? (
                <div className={cn('w-6', 'h-1', 'bg-white/10', 'rounded-full', 'overflow-hidden', 'flex', 'items-center', 'shrink-0')}>
                  <motion.div
                    className={cn('h-full', 'bg-white/40', 'rounded-full', 'w-1/3')}
                    initial={{ x: "-100%" }}
                    animate={{ x: "300%" }}
                    transition={{ repeat: Infinity, duration: 0.8, ease: "easeInOut", repeatType: "mirror" }}
                  />
                </div>
              )
            : <AudioBars isPlaying={effectivePlaying} isSmall={false} isVisible={isVisible} />}

          {isRoom && (
            <button type="button" onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("open-profile-modal")); }}
              className={cn('p-1.5', 'rounded-full', 'transition-colors', 'pointer-events-auto', 'active:scale-95', 'bg-white/5', 'hover:bg-white/20', 'group')}
              aria-label="Your profile" title="Your Profile">
              <User className={cn('w-4', 'h-4', 'text-white/80', 'group-hover:text-white', 'transition-colors')} />
            </button>
          )}
        </div>
      </div>

      <RealtimeProgressBar duration={duration} onSeek={onSeek} isPlaying={effectivePlaying} isVisible={isVisible} />

      {/* Controls */}
      <div className={cn('flex', 'items-center', 'justify-between', 'w-full', 'gap-2')}>
        <div className={cn('flex', 'items-center', 'gap-1', 'sm:gap-2')}>
          <button type="button" aria-label="Network health" onClick={e => { e.stopPropagation(); onTabChange("network"); }} className={cn('p-1', 'sm:p-2', 'rounded-full', 'transition-colors', 'pointer-events-auto', 'active:scale-95')}>
            <Activity className={cn('w-5', 'h-5', 'sm:w-6', 'sm:h-6', 'text-white/50', 'hover:text-white', 'hover:cursor-pointer', 'hover:scale-105', 'transition-colors')} />
          </button>
          {isRoom && isHost && isPrivate && (
            <button type="button" aria-label={`Join requests${pendingRequestsCount > 0 ? ` (${pendingRequestsCount} pending)` : ""}`} onClick={e => { e.stopPropagation(); onTabChange("requests"); }} className={cn('p-1', 'sm:p-2', 'rounded-full', 'transition-colors', 'pointer-events-auto', 'active:scale-95', 'relative')}>
              <Users className={cn('w-5', 'h-5', 'sm:w-6', 'sm:h-6', 'text-white/50', 'hover:text-white', 'hover:cursor-pointer', 'hover:scale-105', 'transition-colors')} />
              {pendingRequestsCount > 0 && (
                <div className={cn('absolute', 'top-0', 'right-0', 'w-3', 'h-3', 'bg-red-500', 'rounded-full', 'border-2', 'border-background', 'animate-pulse')} />
              )}
            </button>
          )}
        </div>

        <div className={cn('flex', 'items-center', 'justify-center', 'gap-6', 'sm:gap-10')}>
          <button type="button" aria-label="Previous track" onClick={e => { e.stopPropagation(); onPrev(e); }} className={cn('p-1', 'sm:p-2', 'rounded-full', 'transition-colors', 'pointer-events-auto', 'active:scale-95')}>
            <SkipBack className={cn('w-7', 'h-7', 'sm:w-8', 'sm:h-8', 'text-white')} fill="currentColor" />
          </button>
          <button type="button" aria-label={effectivePlaying ? "Pause" : "Play"} onClick={e => { e.stopPropagation(); onToggle(e); }} className={cn('p-1', 'sm:p-2', 'rounded-full', 'transition-colors', 'pointer-events-auto', 'active:scale-95')}>
            {effectivePlaying
              ? <Pause className={cn('w-9', 'h-9', 'sm:w-10', 'sm:h-10', 'text-white')} fill="currentColor" />
              : <Play className={cn('w-9', 'h-9', 'sm:w-10', 'sm:h-10', 'ml-1', 'text-white')} fill="currentColor" />}
          </button>
          <button type="button" aria-label="Next track" onClick={e => { e.stopPropagation(); onNext(e); }} className={cn('p-1', 'sm:p-2', 'rounded-full', 'transition-colors', 'pointer-events-auto', 'active:scale-95')}>
            <SkipForward className={cn('w-7', 'h-7', 'sm:w-8', 'sm:h-8', 'text-white')} fill="currentColor" />
          </button>
        </div>

        <div className={cn('flex', 'items-center', 'gap-1', 'sm:gap-2')}>
          <button type="button" aria-label="Search tracks" onClick={e => { e.stopPropagation(); onTabChange("search"); }} className={cn('p-1', 'sm:p-2', 'rounded-full', 'transition-colors', 'pointer-events-auto', 'active:scale-95')}>
            <Search className={cn('w-5', 'h-5', 'sm:w-6', 'sm:h-6', 'text-white/50', 'hover:text-white', 'hover:cursor-pointer', 'hover:scale-105', 'transition-colors')} />
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
    <div className={cn('relative', 'w-full', 'flex', 'flex-col', 'px-5', 'sm:px-6', 'pt-4', 'pb-5')}>
      {/* Header */}
      <div className={cn('flex', 'items-center', 'gap-3', 'mb-6', 'shrink-0')}>
        <button type="button" aria-label="Back to player" onClick={e => { e.stopPropagation(); onBack(); }} className={cn('p-2', '-ml-2', 'rounded-full', 'hover:bg-white/10', 'text-white/50', 'hover:text-white', 'transition-colors', 'pointer-events-auto')}>
          <ChevronLeft className={cn('w-6', 'h-6')} />
        </button>
        <h3 className={cn('text-white', 'font-bold', 'tracking-widest', 'uppercase')}>Network Health</h3>
      </div>
      <div className={cn('flex-1', 'flex', 'flex-col', 'gap-4')}>
        <div className={cn('flex', 'justify-between', 'items-end')}>
          <div className={cn('flex', 'flex-col')}>
            <span className={cn('text-white/50', 'text-xs', 'font-bold', 'uppercase', 'tracking-widest')}>Latency</span>
            <span className={cn('text-white', 'font-black', 'text-3xl')} style={{ color: qualityColor(netStats.quality) }}>
              {Math.round(netStats.latency || 0)}<span className={cn('text-lg', 'text-white/50', 'ml-1')}>ms</span>
            </span>
          </div>
          <div className={cn('flex', 'flex-col', 'items-end', 'gap-0.5')}>
            <span className={cn('text-white/50', 'text-xs', 'font-bold', 'uppercase', 'tracking-widest')}>Jitter</span>
            <span className={cn('text-white', 'font-bold', 'text-xl')}>{Math.round(netStats.jitter || 0)}ms</span>
          </div>
        </div>
        <div className={cn('w-full', 'h-24', 'bg-white/5', 'rounded-xl', 'border', 'border-white/10', 'p-2', 'flex', 'items-end', 'gap-0.5')}>
          {history.slice(-40).map((s: any, i: number) => {
            const hPct = Math.max(5, (s.latency / maxLat) * 100);
            return <div key={i} className={cn('flex-1', 'bg-white/40', 'rounded-sm', 'transition-all', 'duration-300')} style={{ height: `${hPct}%` }} />;
          })}
        </div>
        <div className={cn('flex', 'flex-col', 'gap-2')}>
          <div className={cn('flex', 'justify-between', 'items-center')}>
            <span className={cn('text-white/50', 'text-xs', 'font-bold', 'uppercase', 'tracking-widest')}>Sync Correction</span>
            <span className={cn('text-white', 'font-bold', 'text-sm', 'tabular-nums')}>{audio.manualLatency > 0 ? "+" : ""}{Math.round(audio.manualLatency * 1000)}ms</span>
          </div>
          <input type="range" min={-0.5} max={0.5} step={0.01} value={audio.manualLatency}
            aria-label="Manual sync correction in seconds"
            onChange={e => audio.setManualLatency(Number(e.target.value))}
            className={cn('w-full', 'h-2', 'rounded-full', 'appearance-none', 'outline-none', 'bg-white/20', 'cursor-pointer', 'pointer-events-auto')}
            style={{ background: `linear-gradient(to right, ${accent} 0 ${((audio.manualLatency + 0.5) / 1) * 100}%, rgba(255,255,255,0.2) ${((audio.manualLatency + 0.5) / 1) * 100}% 100%)` }} />
          <div className={cn('flex', 'items-center', 'justify-between', 'mt-1')}>
            <p className={cn('text-[10px]', 'text-white/40')}>Reported: {Math.round(audio.outputLatency * 1000)}ms.</p>
            <button type="button" onClick={() => audio.setManualLatency(0)} className={cn('px-2', 'py-1', 'rounded', 'bg-white/10', 'hover:bg-white/20', 'text-[10px]', 'font-bold', 'text-white', 'transition-colors', 'pointer-events-auto')}>Auto Sync</button>
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
    <div className={cn('flex', 'flex-col', 'h-auto', 'text-white', 'pt-3', 'pb-3', 'px-5')}>
      <div className={cn('flex', 'items-center', 'gap-2', 'mb-3', 'shrink-0')}>
        <button type="button" aria-label="Back to player" onClick={e => { e.stopPropagation(); onBack(); }} className={cn('p-1.5', 'hover:bg-white/10', 'rounded-full', 'transition-colors', '-ml-1', 'pointer-events-auto')}>
          <ChevronLeft className={cn('w-4', 'h-4', 'text-white/70')} />
        </button>
        <span className={cn('text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-white/60')}>Invite Friends</span>
      </div>
      <div className={cn('flex', 'flex-col')}>
        <div className={cn('relative', 'mb-3', 'shrink-0')}>
          <Search className={cn('absolute', 'left-3', 'top-1/2', '-translate-y-1/2', 'w-3.5', 'h-3.5', 'text-white/40')} />
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
            className={cn('w-full', 'bg-white/5', 'border', 'border-white/10', 'rounded-full', 'py-1.5', 'pl-9', 'pr-4', 'text-xs', 'text-white', 'placeholder-white/40', 'focus:outline-none', 'focus:border-white/30')}
          />
        </div>
        <div className={cn('max-h-65', 'overflow-y-auto', 'custom-scrollbar', 'flex', 'flex-col', 'gap-2', 'pointer-events-auto')}>
          {loading ? (
            <div className={cn('flex', 'justify-center', 'py-3')}><Loader2 className={cn('w-4', 'h-4', 'animate-spin', 'text-white/40')} /></div>
          ) : results.length > 0 ? (
            results.map((u: any) => (
              <div key={u.id} className={cn('flex', 'items-center', 'justify-between', 'p-2.5', 'bg-white/5', 'rounded-xl', 'border', 'border-white/5')}>
                <div className={cn('flex', 'flex-col', 'min-w-0')}>
                  <span className={cn('font-bold', 'text-xs', 'truncate')}>{u.name}</span>
                  <span className={cn('text-[11px]', 'text-white/40', 'truncate')}>{u.email}</span>
                </div>
                <button
                  onClick={() => handleInvite(u)}
                  disabled={inviting === u.id}
                  className={cn('px-3.5', 'py-1', 'bg-white/10', 'hover:bg-white/20', 'rounded-full', 'text-xs', 'font-bold', 'transition-colors', 'disabled:opacity-50')}
                >
                  {inviting === u.id ? <Loader2 className={cn('w-3', 'h-3', 'animate-spin')} /> : "Invite"}
                </button>
              </div>
            ))
          ) : query.includes("@") ? (
            <div className={cn('flex', 'items-center', 'justify-between', 'p-2.5', 'bg-white/5', 'rounded-xl', 'border', 'border-white/5')}>
              <div className={cn('flex', 'flex-col', 'min-w-0')}>
                <span className={cn('text-[10px]', 'text-white/40', 'mb-0.5')}>Invite via email</span>
                <span className={cn('font-bold', 'text-xs', 'truncate')}>{query}</span>
              </div>
              <button
                onClick={() => handleInvite(undefined, query)}
                disabled={inviting === query}
                className={cn('px-3.5', 'py-1', 'bg-white/10', 'hover:bg-white/20', 'rounded-full', 'text-xs', 'font-bold', 'transition-colors', 'disabled:opacity-50', 'flex', 'items-center', 'gap-1')}
              >
                {inviting === query ? <Loader2 className={cn('w-3', 'h-3', 'animate-spin')} /> : <><Send className={cn('w-3', 'h-3')}/> Send</>}
              </button>
            </div>
          ) : query.length > 0 ? (
            <div className={cn('text-center', 'text-white/40', 'text-xs', 'py-2')}>No users found. Type a full email to invite via email.</div>
          ) : (
            <div className={cn('text-center', 'text-white/40', 'text-xs', 'py-2')}>Search for friends to invite</div>
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
  <div className={cn('flex', 'flex-col', 'h-auto', 'text-white', 'pt-2', 'pb-4')}>
    <div className={cn('flex', 'items-center', 'justify-between', 'px-6', 'mb-4')}>
      <button type="button" aria-label="Close join requests" onClick={e => { e.stopPropagation(); onBack(); }} className={cn('p-2', 'hover:bg-white/10', 'rounded-full', 'transition-colors', '-ml-2', 'pointer-events-auto')}>
        <ChevronLeft className={cn('w-5', 'h-5', 'text-white/50')} />
      </button>
      <span className={cn('text-sm', 'font-bold', 'uppercase', 'tracking-widest', 'text-white/50')}>Join Requests ({requests.length})</span>
      <div className="w-9" />
    </div>
    <div className={cn('max-h-[320px]', 'min-h-0', 'overflow-y-auto', 'px-6', 'custom-scrollbar', 'flex', 'flex-col', 'gap-2', 'pointer-events-auto')} data-lenis-prevent="true">
      {requests.length === 0 ? (
        <div className={cn('text-center', 'text-white/40', 'text-xs', 'mt-10')}>No pending requests</div>
      ) : requests.map(req => (
        <div key={req.socketId} className={cn('flex', 'items-center', 'justify-between', 'p-3', 'rounded-2xl', 'bg-white/5', 'border', 'border-white/10')}>
          <span className={cn('font-semibold', 'text-sm', 'truncate', 'pr-2')}>{req.displayName}</span>
          <div className={cn('flex', 'items-center', 'gap-2', 'shrink-0')}>
            <button onClick={e => { e.stopPropagation(); onDeny(req.socketId); }} className={cn('px-3', 'py-1.5', 'rounded-full', 'bg-red-500/20', 'text-red-400', 'text-xs', 'font-bold', 'hover:bg-red-500/30', 'transition-colors')}>Deny</button>
            <button onClick={e => { e.stopPropagation(); onApprove(req.socketId, req.displayName); }} className={cn('px-3', 'py-1.5', 'rounded-full', 'bg-emerald-500', 'text-white', 'text-xs', 'font-bold', 'hover:bg-emerald-600', 'transition-colors')}>Approve</button>
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
  effectivePlaying, trackTitle, trackUrl, isRoom, isSyncing, hasTrack, seekIndicator, volIndicator, onTogglePlayback, showAlbumArt = true
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
      <div className={cn('absolute', 'inset-0', 'flex', 'items-center', 'justify-center', 'gap-2')}>
        <Loader2 className={cn('w-3.5', 'h-3.5', 'text-white/50', 'animate-spin')} />
      </div>
    );
  }

  if (!hasTrack) {
    return (
      <div className={cn('absolute', 'inset-0', 'flex', 'items-center', 'justify-center', 'gap-2', 'px-3', 'group')}>
        <Search className={cn('w-3.5', 'h-3.5', 'text-white/50', 'group-hover:text-white', 'transition-colors')} />
        <span className={cn('text-[11px]', 'font-bold', 'text-white/50', 'group-hover:text-white', 'transition-colors')}>Search</span>
      </div>
    );
  }

  return (
    <div className={cn('absolute', 'inset-0', 'flex', 'items-center', 'px-2.5', 'gap-2.5')}>
      {/* Tiny thumbnail or disc */}
      <div className={cn('w-7', 'h-7', 'rounded-[9px]', 'shrink-0', 'overflow-hidden', 'flex', 'items-center', 'justify-center', 'bg-white/10')}>
        {showAlbumArt && thumbUrl
          ? <img src={thumbUrl} draggable={false} onContextMenu={e => e.preventDefault()} className={cn('w-full', 'h-full', 'object-cover', 'select-none', 'pointer-events-none', 'no-touch-select')} />
          : <Disc className={`w-4 h-4 text-white/60 ${effectivePlaying ? "animate-[spin_4s_linear_infinite]" : ""}`} />}
      </div>
      {/* Dynamic Right Side: Seek | Vol | EQ | Play */}
      <div
        className={cn('flex', 'items-center', 'gap-1', 'flex-1', 'justify-center', 'cursor-pointer', 'hover:opacity-80', 'transition-opacity', 'pointer-events-auto')}
        onClick={(e) => { e.stopPropagation(); onTogglePlayback(); }}
        onPointerDown={(e) => e.stopPropagation()}
        role="button"
        aria-label={effectivePlaying ? "Pause" : "Play"}
      >
        {volIndicator ? (
          <>
            {volIndicator.amount > 0 ? <Volume2 className={cn('w-3.5', 'h-3.5', 'text-white')} /> : <VolumeX className={cn('w-3.5', 'h-3.5', 'text-white')} />}
            <span className={cn('text-[10px]', 'font-black', 'text-white', 'tabular-nums')}>{volIndicator.text}</span>
          </>
        ) : seekIndicator ? (
          <>
            {seekIndicator.amount > 0 ? <FastForward className={cn('w-3.5', 'h-3.5', 'text-white')} /> : <Rewind className={cn('w-3.5', 'h-3.5', 'text-white')} />}
            <span className={cn('text-[10px]', 'font-black', 'text-white', 'tabular-nums')}>{seekIndicator.text}</span>
          </>
        ) : effectivePlaying ? (
          <AudioBars isPlaying={effectivePlaying} isSmall isVisible />
        ) : (
          <Play className={cn('w-4', 'h-4', 'text-white/80', 'fill-white/80')} />
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
    <div className={cn('absolute', 'inset-0', 'flex', 'items-center', 'justify-between', 'px-3', 'gap-2.5', 'bg-black', 'rounded-full', 'select-none', 'border-none')}>
      <div className={cn('flex', 'items-center', 'gap-2.5', 'min-w-0', 'flex-1', 'px-1')}>
        <div className={cn('w-7', 'h-7', 'rounded-full', 'bg-white/10', 'flex', 'items-center', 'justify-center', 'shrink-0')}>
          <IconComponent className={`w-4 h-4 text-white ${!snappedItem ? "animate-spin-slow" : ""}`} />
        </div>
        <div className={cn('flex', 'flex-col', 'justify-center', 'min-w-0')}>
          <span className={cn('text-[11px]', 'font-bold', 'uppercase', 'tracking-wider', 'text-white', 'truncate', 'leading-tight')}>
            {snappedItem ? snappedItem.label : "Hold & Drag"}
          </span>
          <span className={cn('text-[9px]', 'font-semibold', 'text-white/50', 'truncate', 'leading-tight')}>
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
  effectivePlaying, trackTitle, trackUrl, isReady,
  downloadProgress, deviceSyncProgress, participants, incomingTrack,
  pendingRequestsCount, isHost, isPrivate, onRequestsClick, seekIndicator, volIndicator, onTogglePlayback,
  prefetchProgress, prefetchTitle, isPrefetching, isStuck, onNextTrack,
}: {
  effectivePlaying: boolean;
  trackTitle: string;
  trackUrl: string | null;
  isReady: boolean;
  downloadProgress: number;
  deviceSyncProgress: Record<string, number>;
  participants: any[];
  incomingTrack: { title: string; progress: number } | null;
  pendingRequestsCount: number;
  isHost: boolean;
  isPrivate: boolean;
  onRequestsClick: () => void;
  seekIndicator: { amount: number; text: string } | null;
  volIndicator: { amount: number; text: string } | null;
  onTogglePlayback: () => void;
  prefetchProgress: number;
  prefetchTitle: string | null;
  isPrefetching: boolean;
  isStuck?: boolean;
  onNextTrack?: () => void;
}) => {
  const audio = useAudio();
  const upload = useUpload();
  const accent = useIslandAccent();
  const thumbUrl = getTrackThumbnail(trackUrl, 'mq');
  const title = cleanTrackTitle(trackTitle);

  // If there's an active audio error (decoding failed / blocked track), display error alert in Dynamic Island
  if (audio.error) {
    return (
      <div
        className={cn('absolute', 'inset-0', 'flex', 'items-center', 'justify-between', 'px-3', 'gap-2', 'bg-red-950/90', 'border', 'border-red-500/50', 'rounded-full', 'text-red-200', 'cursor-pointer', 'pointer-events-auto', 'shadow-[0_0_25px_rgba(239,68,68,0.5)]')}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onNextTrack?.(); }}
        title="Playback Error. Tap to skip track."
      >
        <div className={cn('flex', 'items-center', 'gap-2', 'min-w-0', 'flex-1')}>
          <AlertCircle className={cn('w-4', 'h-4', 'text-red-400', 'shrink-0', 'animate-bounce')} />
          <span className={cn('text-[10px]', 'font-bold', 'text-red-200', 'truncate')}>
            {audio.error}
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNextTrack?.(); }}
          className={cn('px-2.5', 'py-1', 'rounded-full', 'bg-red-500/30', 'hover:bg-red-500/50', 'text-[10px]', 'font-black', 'text-red-100', 'flex', 'items-center', 'gap-1', 'shrink-0', 'transition-all', 'border', 'border-red-400/30')}
        >
          Skip <SkipForward className={cn('w-3', 'h-3')} />
        </button>
      </div>
    );
  }

  const hasTrack = !!trackUrl || !!trackTitle;
  const activeSocketIds = new Set((participants || []).map((p: any) => p.socketId));
  const progresses = Object.entries(deviceSyncProgress)
    .filter(([sid]) => activeSocketIds.has(sid))
    .map(([, p]) => p);
  const isSyncing = (hasTrack && !isReady) || incomingTrack != null || upload.isUploading || (hasTrack && progresses.length > 0 && progresses.some(p => p < 100));

  return (
    <>
      <div className={cn('absolute', 'inset-0', 'flex', 'items-stretch', 'px-3', 'gap-2.5')}>
      {/* LEFT half: track info + playback progress */}
      <div className={cn('flex', 'items-center', 'gap-2.5', 'flex-1', 'min-w-0', 'py-2')}>
        {/* Thumbnail */}
        <div className={cn('w-7', 'h-7', 'rounded-[9px]', 'shrink-0', 'overflow-hidden', 'bg-white/10', 'flex', 'items-center', 'justify-center')}>
          {thumbUrl
            ? <img src={thumbUrl} draggable={false} onContextMenu={e => e.preventDefault()} className={cn('w-full', 'h-full', 'object-cover', 'select-none', 'pointer-events-none', 'no-touch-select')} />
            : isSyncing
            ? <Loader2 className={`w-4 h-4 text-white/50 animate-spin`} />
            : <Disc className={`w-3.5 h-3.5 text-white/60 ${effectivePlaying ? "animate-[spin_4s_linear_infinite]" : ""}`} />}
        </div>

        {/* Title + progress line */}
        <div className={cn('flex', 'flex-col', 'justify-center', 'flex-1', 'min-w-0', 'pr-0.5')}>
          <div className={cn('text-white', 'text-[11px]', 'font-semibold', 'truncate', 'leading-tight')}>
            {title ? title.split(/\s+/).slice(0, 5).join(" ") : (isSyncing ? "Syncing..." : "No track")}
          </div>
          {isSyncing ? (
            <div className={cn('mt-1.5', 'w-full')}>
              <SyncProgressBar
                downloadProgress={downloadProgress}
                deviceSyncProgress={deviceSyncProgress}
                participants={participants}
                incomingTrack={incomingTrack}
                isReady={isReady}
                isStuck={isStuck}
                onSkip={onNextTrack}
              />
            </div>
          ) : (
            <CompactProgressBar isPlaying={effectivePlaying} isVisible />
          )}
        </div>

        {/* Dynamic Right Side: Seek | EQ | Pause */}
        <div
          className={cn('flex', 'items-center', 'justify-center', 'gap-1', 'shrink-0', 'min-w-8', 'rounded-full', 'cursor-pointer', 'hover:opacity-80', 'transition-opacity', 'pointer-events-auto')}
          onClick={(e) => { e.stopPropagation(); onTogglePlayback(); }}
          onPointerDown={(e) => e.stopPropagation()}
          role="button"
          aria-label={effectivePlaying ? "Pause" : "Play"}
        >
          {volIndicator ? (
            <div className={cn('flex', 'items-center', 'gap-1', 'text-white', 'bg-white/10', 'px-2', 'py-0.5', 'rounded-full')}>
              {volIndicator.amount > 0 ? <Volume2 className={cn('w-3.5', 'h-3.5')} /> : <VolumeX className={cn('w-3.5', 'h-3.5')} />}
              <span className={cn('text-[10px]', 'font-black')}>{volIndicator.text}</span>
            </div>
          ) : seekIndicator ? (
            <div className={cn('flex', 'items-center', 'gap-1', 'text-white', 'bg-white/10', 'px-2', 'py-0.5', 'rounded-full')}>
              {seekIndicator.amount > 0 ? <FastForward className={cn('w-3.5', 'h-3.5')} /> : <Rewind className={cn('w-3.5', 'h-3.5')} />}
              <span className={cn('text-[10px]', 'font-black')}>{seekIndicator.text}</span>
            </div>
          ) : effectivePlaying ? (
            <AudioBars isPlaying={effectivePlaying} isSmall isVisible />
          ) : (
            <Play className={cn('w-4', 'h-4', 'text-white/80', 'fill-white/80', 'shrink-0')} />
          )}
        </div>
      </div>

      {/* RIGHT half: join requests (if any) */}
      {isHost && isPrivate && pendingRequestsCount > 0 && (
        <>
          {/* Divider */}
          <div className={cn('w-px', 'bg-white/10', 'self-stretch', 'my-2.5', 'shrink-0')} />
          <div className={cn('flex', 'items-center', 'py-2', 'shrink-0')}>
            <button
              type="button"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onRequestsClick(); }}
              aria-label={`${pendingRequestsCount} pending join requests`}
              className={cn('flex', 'items-center', 'gap-1.5', 'px-2.5', 'py-1', 'rounded-full', 'bg-red-500/20', 'text-red-400', 'hover:bg-red-500/30', 'transition-colors', 'text-[10px]', 'font-black', 'pointer-events-auto', 'whitespace-nowrap')}
            >
              <Users className={cn('w-3', 'h-3')} />
              {pendingRequestsCount} pending
            </button>
          </div>
        </>
      )}
      </div>
      {/* Prefetch progress bar — thin strip at very bottom */}
      {isPrefetching && prefetchTitle && (
        <div className={cn('absolute', 'bottom-0', 'left-0', 'right-0', 'h-[2px]', 'rounded-b-full', 'overflow-hidden', 'bg-white/10', 'pointer-events-none')}>
          <div
            className={cn('h-full', 'transition-[width]', 'duration-300', 'ease-out')}
            style={{ width: `${prefetchProgress}%`, backgroundColor: accent }}
          />
        </div>
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────
// DynamicIsland — main export
// ─────────────────────────────────────────────────────────

export function DynamicIsland() {
  const pathname = usePathname();
  const { user, token } = useAuth();
  const audio = useAudio();
  const upload = useUpload();
  const {
    isRoomPlaying, participants: roomParticipants, pendingPlay,
    incomingTrack, pendingRequests, hostId, joinStatus, isPrivate, deviceSyncProgress,
    play, pause, seek, nextTrack, prevTrack, prefetch,
  } = useSyncInfo();
  const isRoom = pathname.includes("/room/");
  const isHost = hostId === user?.id;
  const hasTrack = audio.hasTrack;
  const effectivePlaying = isRoom ? isRoomPlaying : audio.isPlaying;
  const activeSocketIds = useMemo(
    () => new Set((roomParticipants || []).map((p: any) => p.socketId)),
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
    emerald: "border border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.45)]",
    amber: "border border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.45)]",
    dark: "border border-white/8 shadow-[0_30px_60px_rgba(0,0,0,0.6)]",
    none: "border border-white/10 shadow-none",
  };
  const currentGlowClass = isSearchLoading 
    ? "border border-white/10 shadow-none"
    : (glowClassMap[islandCustomizer.glowColor || "none"] || glowClassMap.none);

  // ── Island state machine
  // In room: pill / extended / expanded
  const [islandState, setIslandState] = useState<IslandState>("pill");
  const [isExpanded, setIsExpanded] = useState(false); // non-room
  const islandRef = useRef<HTMLDivElement>(null);
  const [wiggle, setWiggle] = useState(false);
  const [isSwallowing, setIsSwallowing] = useState(false);
  const shrinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevReqCountRef = useRef(0);

  const uploadRef = useRef(upload);
  useEffect(() => {
    uploadRef.current = upload;
  }, [upload]);

  useEffect(() => {
    let dragCounter = 0;

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
        setTimeout(async () => {
          setIsSwallowing(false);
          const currentRoomId = window.location.pathname.split("/room/")[1]?.split("/")[0];
          if (currentRoomId) {
            setIslandState("pill");
            setActiveTab("player");
            for (const file of audioFiles) {
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
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);


  const [activeTab, setActiveTab] = useState<IslandTab>("player");
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteResultsCount, setInviteResultsCount] = useState(0);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [initialSearchMode, setInitialSearchMode] = useState<"youtube" | "spotify" | null>(null);
  const [activeSearchMode, setActiveSearchMode] = useState<"youtube" | "spotify" | null | undefined>(undefined);
  const [slideDir, setSlideDir] = useState(1);
  const [ytResultsCount, setYtResultsCount] = useState(0);
  const [seekIndicator, setSeekIndicator] = useState<{ amount: number; text: string } | null>(null);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [volIndicator, setVolIndicator] = useState<{ amount: number; text: string } | null>(null);
  const volTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [forceShowDetails, setForceShowDetails] = useState(false);
  const [isViewingPlaylist, setIsViewingPlaylist] = useState(false);
  const [isImportingPlaylist, setIsImportingPlaylist] = useState(false);
  const [hasSearchContent, setHasSearchContent] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isPressing, setIsPressing] = useState(false);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef = useRef(false);
  const [windowWidth, setWindowWidth] = useState(0);
  const [windowHeight, setWindowHeight] = useState(0);
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

  useEffect(() => {
    setWindowWidth(window.innerWidth);
    setWindowHeight(window.innerHeight);
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const scrubTimeRef = useRef<number | null>(null);
  useEffect(() => { scrubTimeRef.current = scrubTime; }, [scrubTime]);

  const roomId = isRoom ? (pathname.split("/room/")[1]?.split("/")[0] ?? "") : "";
  const netStats = useNetworkStats(isRoom, activeTab === "deviceInfo", roomId || undefined);
  const [deviceInfoTarget, setDeviceInfoTarget] = useState<string | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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



  // ── Auto-trigger extended when syncing/buffering, stay extended until done
  useEffect(() => {
    if (!isRoom) return;
    const isSyncing = incomingTrack != null || (hasTrack && (!audio.isReady || isAnyOtherDeviceBuffering));
    if (isSyncing) {
      if (islandState === "expanded") return; // Allow user to interact with the expanded island during sync
      // Force extended and cancel any pending shrink — stay here until done
      if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
      shrinkTimerRef.current = null;
      if (islandState !== "extended") setIslandState("extended");
    } else if (islandState === "extended" && !isHoveringRef.current) {
      // Syncing just finished — brief pause then snap back to appropriate state
      if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
      shrinkTimerRef.current = setTimeout(() => setIslandState((effectivePlaying && hasTrack) ? "extended" : "pill"), 1200);
    }
  }, [audio.isReady, incomingTrack, isAnyOtherDeviceBuffering, isRoom, islandState, effectivePlaying, hasTrack]);

  // ── Playing state changes
  useEffect(() => {
    if (!isRoom || isHoveringRef.current || islandState === "expanded") return;
    const isSyncing = incomingTrack != null || (hasTrack && (!audio.isReady || isAnyOtherDeviceBuffering));
    if (isSyncing) return; // let the syncing effect handle it

    if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
    if (effectivePlaying && hasTrack) {
      if (islandState === "pill") setIslandState("extended");
    } else {
      if (islandState === "extended") setIslandState("pill");
    }
  }, [effectivePlaying, hasTrack, isRoom, islandState, incomingTrack, audio.isReady, isAnyOtherDeviceBuffering]);

  // ── Default to search tab if manually expanded with no track and player tab active
  useEffect(() => {
    if (isRoom && !hasTrack && islandState === "expanded" && activeTab === "player") {
      setInitialSearchMode("youtube");
      setActiveTab("search");
    }
  }, [isRoom, hasTrack, islandState, activeTab]);

  // ── Collapse island to pill if current track is cleared (e.g. queue cleared)
  // Only collapse if the user is not actively viewing an expanded modal tab (like invite or search)
  useEffect(() => {
    if (isRoom && !hasTrack && islandState !== "expanded") {
      setIslandState("pill");
    }
  }, [hasTrack, isRoom, islandState]);

  // ── Auto-trigger extended for join requests
  useEffect(() => {
    if (!isRoom) return;
    const currentCount = pendingRequests?.length || 0;
    const prevCount = prevReqCountRef.current;
    if (currentCount > prevCount) {
      setIslandState("extended");
      if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
      shrinkTimerRef.current = setTimeout(() => setIslandState("pill"), 10000);
    }
    prevReqCountRef.current = currentCount;
  }, [pendingRequests?.length, isRoom]);

  const showVolIndicator = useCallback((deltaOrAbs: number, isAbsolute = false) => {
    setVolIndicator({ amount: deltaOrAbs, text: isAbsolute ? `${deltaOrAbs}%` : `${deltaOrAbs > 0 ? "+" : ""}${deltaOrAbs}%` });
    if (volTimeoutRef.current) clearTimeout(volTimeoutRef.current);
    volTimeoutRef.current = setTimeout(() => setVolIndicator(null), 800);
  }, []);

  useEffect(() => {
    const handleShowDeviceInfo = (e: any) => {
      setDeviceInfoTarget(e.detail.socketId);
      setActiveTab("deviceInfo");
      if (isRoom) setIslandState("expanded");
      else setIsExpanded(true);
      if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
    };
    window.addEventListener("showDeviceInfo", handleShowDeviceInfo);
    return () => window.removeEventListener("showDeviceInfo", handleShowDeviceInfo);
  }, [isRoom]);

  useEffect(() => {
    const handleExpandAdd = () => {
      setInitialSearchMode("youtube");
      setActiveSearchMode("youtube");
      setSlideDir(0);
      setActiveTab("search");
      if (isRoom) setIslandState("expanded");
      else setIsExpanded(true);
      if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
    };
    const handleExpandSpotify = () => {
      setInitialSearchMode("spotify");
      setActiveSearchMode("spotify");
      setSlideDir(0);
      setActiveTab("search");
      if (isRoom) setIslandState("expanded");
      else setIsExpanded(true);
      if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
    };
    const handleExpandInvite = () => {
      setSlideDir(0);
      setActiveTab("invite");
      if (isRoom) setIslandState("expanded");
      else setIsExpanded(true);
      if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
    };
    const handleExpandSync = () => {
      setSlideDir(0);
      setActiveTab("network");
      if (isRoom) setIslandState("expanded");
      else setIsExpanded(true);
      if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
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
        const t = setTimeout(() => { setActiveTab("player"); setYtResultsCount(0); }, 500);
        return () => clearTimeout(t);
      }
    } else {
      if (!isExpanded) {
        const t = setTimeout(() => { setActiveTab("player"); setYtResultsCount(0); }, 500);
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
        if (isRoom) setIslandState("pill");
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
  }, [islandState, isExpanded, isRoom, hasTrack]);

  // ── Inactivity timer (mobile)
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    const expanded = isRoom ? islandState === "expanded" : isExpanded;
    // Do not auto-close expanded interactive tabs (invite, search, deviceInfo, requests, settings)
    if (expanded && windowWidth < 768 && activeTab !== "deviceInfo" && activeTab !== "invite" && activeTab !== "search" && activeTab !== "requests") {
      inactivityTimerRef.current = setTimeout(() => {
        if (isRoom) setIslandState("pill");
        else setIsExpanded(false);
      }, 3000);
    }
  }, [islandState, isExpanded, windowWidth, activeTab, isRoom]);

  useEffect(() => {
    resetInactivityTimer();
    return () => { if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current); };
  }, [islandState, isExpanded, windowWidth, resetInactivityTimer]);

  const showSeekIndicator = useCallback((amount: number) => {
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    setSeekIndicator({ amount, text: amount > 0 ? `+${amount}s` : `${Math.abs(amount)}s` });
    seekTimeoutRef.current = setTimeout(() => setSeekIndicator(null), 1500);
  }, []);

  const handleTabChange = useCallback((newTab: IslandTab) => {
    if (activeTab === newTab) return;
    if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
    const order: Record<IslandTab, number> = { network: -1, player: 0, search: 1, invite: 2, requests: 3, deviceInfo: 4 };
    setSlideDir(order[newTab] > order[activeTab] ? 1 : -1);
    setActiveTab(newTab);
  }, [activeTab]);

  // ── Dimensions
  const displayName = user?.name ?? "Guest";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const isProfile = pathname.includes("/profile");

  const displayTime = scrubTime !== null ? scrubTime : audio.currentTime || 0;
  const displayProgress = scrubTime !== null ? scrubTime / Math.max(audio.duration, 1) : localProgressRef.current;

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
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA" || (document.activeElement as HTMLElement)?.isContentEditable) return;
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
          if (state.isRoom && state.roomId) {
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
          if (state.isRoom && state.roomId) {
            getSocket().emit("room:setParticipantVolume", { roomId: state.roomId, targetSocketId: getSocket().id, volume: newVol });
          }
        }
      } else if (e.code === "KeyM") {
        e.preventDefault();
        if (audio.toggleMute) {
          const newVol = audio.toggleMute();
          showVolIndicator(newVol, true);
          if (state.isRoom && state.roomId) {
            getSocket().emit("room:setParticipantVolume", { roomId: state.roomId, targetSocketId: getSocket().id, volume: newVol });
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [audio, play, pause, seek]);

  // Compute syncing flag first — used both for dimensions and handlers
  const isSyncingNow = isRoom && (
    incomingTrack != null ||
    upload.isUploading ||
    (hasTrack && (!audio.isReady || isAnyOtherDeviceBuffering))
  );

  // Auto-extend island to show downloading progress bar whenever a song is downloading/buffering
  useEffect(() => {
    if (isSyncingNow && islandState === "pill") {
      setIslandState("extended");
    }
  }, [isSyncingNow, islandState]);

  // ── Render guard
  if (isModalOpen) return null;
  if (isRoom && (joinStatus === "pending" || joinStatus === "denied")) return null;

  // ── Non-room layout (nav bar)
  if (!isRoom) {
    // Legacy compact/expanded for non-room
    const currentExpandedHeight: number | "auto" = "auto";
    const dynamicExpandedWidth = windowWidth > 0 ? Math.min(840, windowWidth - 32) : 640;
    const dynamicCompactWidth = !hasTrack ? dynamicExpandedWidth
      : (windowWidth >= 768 ? 200 : COMPACT_WIDTH) + (effectivePlaying || forceShowDetails ? 80 : 0);

    return (
      <div 
        className={cn('fixed', 'left-0', 'right-0', 'z-50', 'flex', 'justify-center', 'pointer-events-none')}
        style={{
          top: "max(1.5rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))",
        }}
      >
        <div className={cn('pointer-events-auto', 'glass-panel', 'w-[92%]', 'max-w-5xl', 'rounded-4xl', 'px-4', 'sm:px-6', 'md:px-8', 'py-3.5', 'flex', 'items-center', 'justify-between', 'shadow-2xl', 'select-none')}>
          <Link href="/room/default" className={cn('flex', 'items-center', 'gap-2', 'sm:gap-3', 'group')}>
            <div className={cn('w-9', 'h-9', 'sm:w-10', 'sm:h-10', 'rounded-xl', 'bg-foreground/5', 'border', 'border-foreground/10', 'flex', 'items-center', 'justify-center', 'group-hover:bg-foreground/10', 'group-hover:scale-105', 'transition-all', 'outline-none')}>
              <Disc className={cn('w-4', 'h-4', 'sm:w-5', 'sm:h-5', 'text-foreground/70', 'animate-[spin_5s_linear_infinite]')} />
            </div>
            <span className={cn('text-base', 'sm:text-lg', 'font-black', 'tracking-widest', 'text-foreground', 'transition-opacity', 'hover:opacity-80')}>
              SYNC<span className="text-foreground/50">BEATS</span>
            </span>
          </Link>
          <div className={cn('flex', 'items-center', 'gap-3', 'sm:gap-5')}>
            <ThemeToggle />
            <div className={cn('w-px', 'h-6', 'bg-foreground/10', 'hidden', 'sm:block')} />
            {isProfile ? (
              <Link href="/room/default" className={cn('h-9', 'px-5', 'flex', 'items-center', 'justify-center', 'rounded-xl', 'bg-foreground/10', 'text-foreground', 'text-xs', 'sm:text-sm', 'font-bold', 'tracking-widest', 'uppercase', 'hover:bg-foreground', 'hover:text-background', 'active:scale-95', 'transition-all')}>Done</Link>
            ) : (
              <div onClick={() => window.dispatchEvent(new CustomEvent("open-profile-modal"))} className={cn('flex', 'items-center', 'gap-3', 'cursor-pointer', 'group', 'outline-none')}>
                <div className={cn('text-right', 'hidden', 'sm:block')}>
                  <div className={cn('text-sm', 'font-bold', 'text-foreground')}>{displayName}</div>
                  <div className={cn('text-xs', 'font-semibold', 'text-foreground/40')}>{user?.email ?? ""}</div>
                </div>
                <div className={cn('w-9', 'h-9', 'sm:w-10', 'sm:h-10', 'rounded-xl', 'flex', 'items-center', 'justify-center', 'border-2', 'border-transparent', 'glass-panel', 'group-active:scale-95', 'transition-all', 'shadow-md')}>
                  <span className={cn('text-xs', 'sm:text-sm', 'font-black', 'text-foreground')}>{initials}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Room island layout
  // Three states: pill / extended / expanded
  const isExpanded_room = islandState === "expanded";
  const isExtended_room = islandState === "extended";

  // Pill dimensions
  const pillWidth = hasTrack ? 120 : 86;
  const pillHeight = COMPACT_HEIGHT;
  // Extended dimensions (iOS live-activity style)
  const hasPending = isRoom && hostId === user?.id && isPrivate && pendingRequests.length > 0;
  const extendedWidth = Math.min(hasPending ? 460 : 360, (windowWidth > 0 ? windowWidth : 600) - 32);
  // While syncing the extended pill carries a second row (sync label + bar), so
  // it needs the extra height or the bar clips against the bottom edge.
  const extendedHeight = isSyncingNow ? EXTENDED_SYNC_HEIGHT : COMPACT_HEIGHT;
  const expandedWidth = windowWidth > 0 ? Math.min(840, windowWidth - 32) : 640;

  // ── Auto-sized height: drive island size from actual rendered content ─────
  // The ResizeObserver watches the content wrapper and feeds its scrollHeight
  // back here. We add a small buffer (8px) so the content never clips.
  const ISLAND_VERT_PAD = 8;
  const maxIslandHeight = windowHeight > 0 ? windowHeight - 32 : 900;
  const expandedHeight = Math.min(maxIslandHeight, measuredContentHeight + ISLAND_VERT_PAD);

  // Current animated dimensions
  // When radial navigator active: expand to 265px
  const dropZoneSize = windowWidth > 0 ? Math.min(240, windowWidth - 64) : 240;
  const currentWidth = wiggle || isSwallowing
    ? dropZoneSize
    : radialSnapInfo?.isOpen
    ? Math.min(265, (windowWidth > 0 ? windowWidth : 320) - 32)
    : isExpanded_room
    ? expandedWidth
    : isExtended_room
    ? extendedWidth
    : pillWidth;
  const currentHeight = wiggle || isSwallowing
    ? dropZoneSize
    : isExpanded_room
    ? expandedHeight
    : isExtended_room
    ? extendedHeight
    : pillHeight;
  // Stay a true pill in every collapsed state — radius tracks the live height.
  const currentRadius = wiggle || isSwallowing ? 48 : (isExpanded_room ? 36 : currentHeight / 2);

  // Secondary island = background tasks only. Uploads are deliberately excluded:
  // upload.isUploading already drives isSyncingNow, which auto-extends the main
  // island and shows "Uploading Song..." there. Prefetch is the only task that
  // runs behind an unaffected island, so it's the only one that earns a circle.
  const showSecondary = isRoom && prefetch.isPrefetching && !isExpanded_room && !wiggle && !isSwallowing;
  const secondaryLabel = prefetch.nextTrackTitle
    ? `Downloading next track: ${prefetch.nextTrackTitle} — ${prefetch.nextTrackProgress}%`
    : `Downloading next track — ${prefetch.nextTrackProgress}%`;

  const handlePointerDown_room = () => {
    resetInactivityTimer();
    if (windowWidth >= 768) return;
    if (islandState === "expanded") return;
    setIsPressing(true);
    pressTimerRef.current = setTimeout(() => {
      if (!hasTrack) {
        setInitialSearchMode("youtube");
        setSlideDir(0);
        setActiveTab("search");
      }
      setIslandState("expanded");
      setForceShowDetails(false);
      setIsPressing(false);
      pressTimerRef.current = null;
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(50);
    }, 300);
  };

  const handlePointerUp_room = () => {
    resetInactivityTimer();
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
      setIsPressing(false);
      const nowTime = Date.now();
      // Restrict double-tap toggle to pill & extended states only (never when expanded)
      if (islandState !== "expanded" && nowTime - lastTapRef.current < 500) {
        handleToggle();
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = nowTime;
        if (islandState === "pill") {
          if (!hasTrack) {
            setInitialSearchMode("youtube");
            setSlideDir(0);
            setActiveTab("search");
            setIslandState("expanded");
          } else {
            setIslandState("extended");
            if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
            const delaySec = islandCustomizer.autoShrinkDelaySec ?? 6;
            if (delaySec > 0) {
              shrinkTimerRef.current = setTimeout(() => setIslandState("pill"), delaySec * 1000);
            }
          }
        } else if (islandState === "extended") {
          setIslandState("pill");
        }
      }
    }
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className={cn('fixed', 'inset-0', 'z-40', 'pointer-events-none')}
        animate={{ opacity: isExpanded_room ? 1 : 0, backgroundColor: isExpanded_room ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0)" }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
        style={{ pointerEvents: isExpanded_room ? "auto" : "none", backdropFilter: isExpanded_room ? "blur(3px)" : "blur(0px)", WebkitBackdropFilter: isExpanded_room ? "blur(3px)" : "blur(0px)" }}
        onClick={() => setIslandState("pill")}
      />

      <div 
        className={cn('fixed', 'left-1/2', '-translate-x-1/2', 'z-100', 'flex', 'flex-col', 'items-center', 'pointer-events-none')}
        style={{
          top: "max(1.75rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))",
        }}
      >
        {/* relative: anchors the secondary circle to the island's right edge */}
        <div className={cn('relative', 'flex', 'items-center')}>
        <motion.div
          ref={islandRef}
          onContextMenu={e => e.preventDefault()}
          onPointerDown={e => { handlePointerDown_room(); resetInactivityTimer(); }}
          onPointerUp={e => { handlePointerUp_room(); resetInactivityTimer(); }}
          onMouseEnter={() => {
            if (windowWidth >= 768) {
              isHoveringRef.current = true;
              if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
              if (islandState === "pill" && hasTrack) {
                setIslandState("extended");
              }
            }
          }}
          onMouseLeave={() => {
            if (windowWidth >= 768) {
              isHoveringRef.current = false;
              if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
              // Do NOT auto-shrink when the island is expanded into a modal tab (invite, search, deviceInfo, etc.)
              // Only auto-shrink hover-preview "extended" pills.
              if (islandState === "extended") {
                shrinkTimerRef.current = setTimeout(() => {
                  setIslandState((effectivePlaying && hasTrack) ? "extended" : "pill");
                }, 1200);
              }
            }
            handlePointerUp_room();
          }}
          onClick={e => {
            if (windowWidth >= 768) {
              if (islandState === "pill" || islandState === "extended") {
                if (!hasTrack) {
                  setInitialSearchMode("youtube");
                  setSlideDir(0);
                  setActiveTab("search");
                }
                setIslandState("expanded");
              } else if (islandState === "expanded") {
                if (activeTab === "player" || activeTab === "network" || activeTab === "deviceInfo") {
                  setIslandState((effectivePlaying && hasTrack) ? "extended" : "pill");
                }
              }
            }
          }}
          onPointerLeave={() => { handlePointerUp_room(); resetInactivityTimer(); }}
          onPointerMove={resetInactivityTimer}
          onDoubleClick={e => {
            e.preventDefault();
            if (islandState === "pill" || islandState === "extended") {
              handleToggle();
            }
          }}
          initial={false}
          transition={{
            width: reduceMotion ? { duration: 0.2, ease: "easeOut" } : SHAPE_SPRING,
            height: reduceMotion ? { duration: 0.2, ease: "easeOut" } : SHAPE_SPRING,
            borderRadius: reduceMotion ? { duration: 0.2, ease: "easeOut" } : SHAPE_SPRING,
            scale: isSwallowing ? { duration: 0.5, ease: "easeInOut" } : { type: "spring", stiffness: 400, damping: 30, mass: 0.6 },
            x: wiggle && !isSwallowing ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : { type: "spring", stiffness: 400, damping: 30 }
          }}
          animate={{
            width: currentWidth,
            height: currentHeight,
            borderRadius: currentRadius,
            scale: isSwallowing ? [1, 1.08, 0.85] : (isPressing && islandState === "pill" ? 0.94 : 1),
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
            maxHeight: isExpanded_room && windowWidth > 0 && windowWidth < 768 ? windowHeight - 32 : undefined,
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
            userSelect: "none",
          }}
          className={cn("pointer-events-auto select-none no-touch-select", currentGlowClass)}
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
                className={cn('absolute', '-inset-[1px]', 'pointer-events-none', 'z-[45]', 'rounded-[inherit]', 'overflow-hidden', 'p-[2px]')}
                style={{
                  WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                }}
              >
                <motion.div
                  animate={reduceMotion ? { rotate: 0 } : { rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
                  className={cn('w-[300%]', 'h-[300%]', '-top-[100%]', '-left-[100%]', 'absolute')}
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
                className={cn('absolute', 'inset-0', 'z-30', 'bg-black', 'rounded-full')}
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
                className={cn('absolute', 'inset-0')}
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
                className={cn('absolute', 'inset-0')}
              >
                <RoomExtendedPill
                  effectivePlaying={effectivePlaying}
                  trackTitle={audio.trackTitle}
                  trackUrl={audio.trackUrl}
                  isReady={audio.isReady}
                  downloadProgress={audio.downloadProgress}
                  deviceSyncProgress={deviceSyncProgress}
                  participants={roomParticipants}
                  incomingTrack={incomingTrack}
                  pendingRequestsCount={pendingRequests?.length || 0}
                  isHost={isHost}
                  isPrivate={isPrivate}
                  onRequestsClick={() => { setActiveTab("requests"); setIslandState("expanded"); }}
                  seekIndicator={seekIndicator}
                  volIndicator={volIndicator}
                  onTogglePlayback={handleToggle}
                  prefetchProgress={prefetch.nextTrackProgress}
                  prefetchTitle={prefetch.nextTrackTitle}
                  isPrefetching={prefetch.isPrefetching}
                  isStuck={isBufferingStuck}
                  onNextTrack={nextTrack}
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
                className={cn('w-full', 'relative', 'pointer-events-auto')}
              >
                {/* Measurement wrapper: renders at natural height so ResizeObserver can read it */}
                <div ref={contentMeasureRef}>
                <AnimatePresence custom={slideDir} initial={false} mode="popLayout">
                  {activeTab === "player" && (
                    <motion.div key="player" custom={slideDir} variants={tabVariants} initial="enter" animate="center" exit="exit" transition={SPRING} className={cn('w-full', 'relative')}>

                      <PlayerTab
                        effectivePlaying={effectivePlaying}
                        trackTitle={incomingTrack ? incomingTrack.title : audio.trackTitle}
                        trackUrl={audio.trackUrl}
                        isReady={audio.isReady}
                        error={audio.error}
                        downloadProgress={incomingTrack ? incomingTrack.progress : audio.downloadProgress}
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
                    <motion.div key="network" custom={slideDir} variants={tabVariants} initial="enter" animate="center" exit="exit" transition={SPRING} className={cn('w-full', 'relative')}>
                      <NetworkTab onBack={() => handleTabChange("player")} netStats={netStats} audio={audio} />
                    </motion.div>
                  )}
                  {activeTab === "search" && (
                    <motion.div key="search" custom={slideDir} variants={tabVariants} initial="enter" animate="center" exit="exit" transition={SPRING} className={cn('w-full', 'relative')}>
                      <SearchTab 
                        roomId={roomId!} 
                        initialMode={initialSearchMode}
                        onBack={() => setActiveTab("player")} 
                        onResultsCountChange={setYtResultsCount} 
                        onModeChange={setActiveSearchMode}
                        onLoadingStateChange={setIsSearchLoading}
                        isSearchOnly={false} 
                        onPlaylistViewChange={setIsViewingPlaylist}
                        onImportingStateChange={setIsImportingPlaylist}
                        onHasContentChange={setHasSearchContent}
                        onErrorStateChange={setSearchError}
                        isPlaying={audio.isPlaying}
                        hasTrack={hasTrack}
                        onSuccess={() => { 
                          setWiggle(true); 
                          setTimeout(() => setWiggle(false), 400); 
                          if (isRoom) setIslandState("extended");
                        }}
                      />
                    </motion.div>
                  )}
                  {(activeTab === "deviceInfo" || activeTab === "invite") && (
                    <motion.div key="invite-tab" custom={slideDir} variants={tabVariants} initial="enter" animate="center" exit="exit" transition={SPRING} className={cn('w-full', 'relative')}>
                      <InviteTab 
                        onBack={() => setActiveTab("player")} 
                        roomId={roomId || ''} 
                        onStateChange={(q, count, l) => {
                          setInviteQuery(q);
                          setInviteResultsCount(count);
                          setInviteLoading(l);
                        }}
                      />
                    </motion.div>
                  )}
                  {activeTab === "requests" && (
                    <motion.div key="requests" custom={slideDir} variants={tabVariants} initial="enter" animate="center" exit="exit" transition={SPRING} className={cn('w-full', 'relative', 'h-auto')}>
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
                className={cn('absolute', 'inset-0', 'z-50', 'flex', 'flex-col', 'items-center', 'justify-center')}
              >
                <motion.div 
                  animate={{ y: isSwallowing ? 20 : 0, scale: isSwallowing ? 0 : 1 }}
                  transition={{ duration: 0.3, ease: "backIn" }}
                  className={cn('w-16', 'h-16', 'rounded-full', 'bg-white/20', 'flex', 'items-center', 'justify-center', 'mb-4', 'shadow-2xl')}
                >
                  <Upload className={cn('w-8', 'h-8', 'text-white')} />
                </motion.div>
                <motion.span 
                  animate={{ opacity: isSwallowing ? 0 : 1 }}
                  transition={{ duration: 0.2 }}
                  className={cn('text-lg', 'font-bold', 'text-white', 'tracking-wide', 'drop-shadow-md')}
                >
                  Drop MP3
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>

        {/* Gloss overlay removed — the island stays flat black, no gradients. */}
        </motion.div>

        {/* ── Secondary island: detached circle for background tasks ──
            Absolutely placed off the island's right edge so the main island
            never shifts when this appears, the way iOS pairs the two. */}
        <div className={cn('absolute', 'left-full', 'top-0', 'h-full', 'flex', 'items-center', 'pl-2', 'pointer-events-none')}>
          <AnimatePresence>
            {showSecondary && (
              <motion.div
                key="secondary-island"
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.3, opacity: 0 }}
                transition={reduceMotion ? { duration: 0.2, ease: "easeOut" } : SHAPE_SPRING}
                role="status"
                aria-live="polite"
                aria-label={secondaryLabel}
                title={secondaryLabel}
                className={cn('relative', 'flex', 'items-center', 'justify-center', 'rounded-full', 'shrink-0')}
                style={{ width: SECONDARY_SIZE, height: SECONDARY_SIZE, backgroundColor: "#000000" }}
              >
                <svg viewBox={`0 0 ${SECONDARY_SIZE} ${SECONDARY_SIZE}`} className={cn('absolute', 'inset-0', 'w-full', 'h-full')} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={SECONDARY_SIZE / 2} cy={SECONDARY_SIZE / 2} r={SECONDARY_R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
                  <circle
                    cx={SECONDARY_SIZE / 2} cy={SECONDARY_SIZE / 2} r={SECONDARY_R} fill="none"
                    stroke={activeGlowColorHex} strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={SECONDARY_C}
                    strokeDashoffset={SECONDARY_C * (1 - prefetch.nextTrackProgress / 100)}
                    style={{ transition: "stroke-dashoffset 0.3s ease-out" }}
                  />
                </svg>
                <span className={cn('text-[10px]', 'font-black', 'tabular-nums', 'text-white/90')}>
                  {prefetch.nextTrackProgress}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </div>
      </div>
    </>
  );
}
