"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import {
  Disc, Pause, Play, SkipForward, SkipBack, Upload, Music2,
  Loader2, CheckCircle2, AlertCircle, AlertTriangle, RotateCcw, Play as Youtube, Activity,
  ChevronLeft, Search, Plus, FastForward, Rewind, LogOut, Users,
  Wifi, Radio, Volume2, VolumeX, UserPlus, Send, User, LayoutGrid, MessageSquare, Compass
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useAudio } from "../context/AudioContext";
import { useVisualizer } from "../context/VisualizerContext";
import { useUpload } from "../context/UploadContext";
import { JoinRequest } from "../lib/types";
import { getSocket } from "../lib/socket";
import { roomsApi, usersApi } from "../lib/api";
import { formatTime } from "../hooks/useAudioPlayer";
import { ThemeToggle } from "./ThemeToggle";
import { useSyncInfo } from "../context/SyncContext";
import { useNetworkStats, qualityColor } from "../hooks/useNetworkStats";
import { SpotifyIslandTab } from "./room/SpotifyIslandTab";
import { SearchTab } from "./room/SearchTab";
import { useSettings } from "../hooks/useSettings";
import { cn } from "../lib/utils";

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

const SPRING = {
  type: "spring" as const,
  stiffness: 140,
  damping: 18,
  mass: 0.9,
};

const SHAPE_SPRING = {
  type: "spring" as const,
  stiffness: 240,
  damping: 28,
  mass: 0.8,
};

const COMPACT_WIDTH = 130;
const COMPACT_HEIGHT = 44;
const EXPANDED_HEIGHT = 410;

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

const AudioBars = ({
  isPlaying,
  isSmall,
  isVisible = true,
}: {
  isPlaying: boolean;
  isSmall?: boolean;
  isVisible?: boolean;
}) => {
  const audio = useAudio();
  const { dataRef } = useVisualizer();
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPlaying || !isVisible) {
      if (barsRef.current) {
        const children = barsRef.current.children;
        for (let i = 0; i < children.length; i++) {
          const el = children[i] as HTMLElement;
          el.style.height = "15%";
          el.style.opacity = "0.5";
        }
      }
      return;
    }

    let rafId: number;
    const displayHeights = [15, 15, 15, 15];
    const beatHistory: number[] = [];
    const HISTORY_SIZE = 6;

    const tick = () => {
      const data = dataRef.current.rawAudioData;
      let bass = 0, sub = 0, mids = 0, highs = 0;

      if (data && data.length > 40) {
        let bassSum = 0;
        for (let i = 1; i <= 5; i++) bassSum += data[i];
        bass = bassSum / 5;
        let subSum = 0;
        for (let i = 0; i <= 2; i++) subSum += data[i];
        sub = subSum / 3;
        let midSum = 0;
        for (let i = 6; i <= 14; i++) midSum += data[i];
        mids = midSum / 9;
        let highSum = 0;
        for (let i = 15; i <= 30; i++) highSum += data[i];
        highs = highSum / 16;
      }

      const expScale = (val: number) => Math.pow(val / 255, 2.5) * 100;
      const innerIntensity = expScale(bass * 0.7 + sub * 0.3);
      const outerIntensity = expScale(mids * 0.6 + highs * 0.4);
      const innerTarget = Math.max(15, Math.min(15 + innerIntensity, 100));

      beatHistory.push(innerTarget);
      if (beatHistory.length > HISTORY_SIZE) beatHistory.shift();

      const outerTarget = Math.max(15, Math.min(15 + outerIntensity, 88));
      const trailSlice = beatHistory.slice(0, Math.max(1, Math.floor(beatHistory.length * 0.5)));
      const trailedOuter = trailSlice.reduce((a, b) => a + b, 0) / trailSlice.length * 0.7;

      const targets = [
        Math.max(outerTarget, trailedOuter * 0.6),
        innerTarget,
        innerTarget * 0.92,
        Math.max(outerTarget * 0.9, trailedOuter * 0.5),
      ];

      for (let i = 0; i < 4; i++) {
        const target = targets[i];
        const current = displayHeights[i];
        if (target > current) {
          const attackSpeed = (i === 1 || i === 2) ? 0.55 : 0.40;
          displayHeights[i] += (target - current) * attackSpeed;
        } else {
          const decaySpeed = (i === 1 || i === 2) ? 0.10 : 0.07;
          displayHeights[i] += (target - current) * decaySpeed;
        }
        displayHeights[i] = Math.max(15, Math.min(100, displayHeights[i]));
        if (barsRef.current) {
          const el = barsRef.current.children[i] as HTMLElement;
          if (el) {
            el.style.height = `${displayHeights[i]}%`;
            const brightness = 0.5 + (displayHeights[i] - 15) / 170;
            el.style.opacity = `${Math.min(1, brightness)}`;
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, isVisible]);

  const hClass = isSmall ? "h-3.5" : "h-5";
  const barW = isSmall ? "w-[2.5px]" : "w-[3px]";
  const gapClass = isSmall ? "gap-[1.5px]" : "gap-[2px]";

  return (
    <div ref={barsRef} className={`flex items-center ${gapClass} ${hClass}`}>
      <div className={`${barW} bg-white rounded-full`} style={{ height: "15%", opacity: 0.5, willChange: "height, opacity", transition: "none" }} />
      <div className={`${barW} bg-white rounded-full`} style={{ height: "15%", opacity: 0.5, willChange: "height, opacity", transition: "none" }} />
      <div className={`${barW} bg-white rounded-full`} style={{ height: "15%", opacity: 0.5, willChange: "height, opacity", transition: "none" }} />
      <div className={`${barW} bg-white rounded-full`} style={{ height: "15%", opacity: 0.5, willChange: "height, opacity", transition: "none" }} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// CompactProgressBar
// ─────────────────────────────────────────────────────────

const CompactProgressBar = ({ isPlaying, isVisible = true }: { isPlaying: boolean; isVisible?: boolean }) => {
  const barRef = useRef<HTMLDivElement>(null);
  const audio = useAudio();

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const pos = audio.getTruePosition();
      const dur = Math.max(1, audio.duration);
      const progress = Math.min(1, pos / dur);
      if (barRef.current) barRef.current.style.width = `${progress * 100}%`;
      if (isPlaying && isVisible) rafId = requestAnimationFrame(tick);
    };
    tick();
    if (isPlaying && isVisible) rafId = requestAnimationFrame(tick);
    return () => { if (rafId) cancelAnimationFrame(rafId); };
  }, [isPlaying, audio, isVisible]);

  return (
    <div className={cn('w-[80%]', 'mx-auto', 'mt-0.5', 'h-0.75', 'bg-white/20', 'rounded-full', 'overflow-hidden', 'shrink-0')}>
      <div ref={barRef} className={cn('h-full', 'bg-white/80', 'rounded-full')}
        style={{ width: "0%", transition: isPlaying ? "none" : "width 200ms ease" }} />
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
}: {
  downloadProgress: number;
  deviceSyncProgress: Record<string, number>;
  participants: any[];
  incomingTrack: { title: string; progress: number } | null;
  isReady: boolean;
  isStuck?: boolean;
}) => {
  const upload = useUpload();
  const barRef = useRef<HTMLDivElement>(null);

  // Compute overall sync progress
  const progresses = Object.values(deviceSyncProgress);
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
    ? "Downloading Song"
    : incomingTrack
    ? (incomingTrack.title ? `Receiving "${incomingTrack.title.substring(0, 18)}..."` : "Receiving Track")
    : isStuck
    ? "Stuck (0%) • Tap to skip"
    : !isReady
    ? "Downloading Track"
    : hasSync && avgSync < 100
    ? "Syncing Devices"
    : "Synced";

  const color = isStuck
    ? "from-amber-600 to-red-500 animate-pulse"
    : "from-violet-500 via-emerald-500 to-emerald-400";

  return (
    <div className={cn('flex', 'flex-col', 'justify-center', 'gap-1', 'w-full')}>
      <div className={cn('flex', 'items-center', 'justify-between')}>
        <span className={`text-[9px] font-black uppercase tracking-widest ${isStuck ? "text-amber-400 flex items-center gap-1" : "text-white/40"}`}>
          {isStuck && <AlertTriangle className={cn('w-3', 'h-3', 'text-amber-400', 'shrink-0', 'animate-bounce')} />}
          {label}
        </span>
        <span className={`text-[10px] font-black ${isStuck ? "text-amber-400 font-bold" : "text-white/60"}`}>{progress}%</span>
      </div>
      <div className={cn('w-full', 'h-1.5', 'rounded-full', 'bg-white/10', 'overflow-hidden')}>
        <div
          ref={barRef}
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500`}
          style={{ width: `${progress}%` }}
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

  const isRoomReady = isRoom && roomParticipants ? roomParticipants.every((p: any) => p.isReady) : true;
  const loadingParticipants = isRoom && roomParticipants ? roomParticipants.filter((p: any) => !p.isReady) : [];

  return (
    <div className={cn('relative', 'w-full', 'flex', 'flex-col', 'justify-evenly', 'px-5', 'sm:px-8', 'py-8', 'sm:py-10', 'gap-6')}>
      {/* Track header */}
      <div className={cn('flex', 'items-start', 'gap-3', 'sm:gap-4', 'w-full')}>
        <div className={`flex items-center justify-center shrink-0 border overflow-hidden w-15 h-15 sm:w-17 sm:h-17 rounded-[14px] shadow-lg ${
          thumbnailUrl ? "border-white/20" : isYt ? "bg-[#FF0000]/10 border-[#FF0000]/20" : "bg-linear-to-br from-white/10 to-white/5 border-white/10"
        }`}>
          {thumbnailUrl
            ? <img src={thumbnailUrl} className={cn('w-full', 'h-full', 'object-cover')} />
            : <span className={cn('text-xl', 'font-black', 'text-white/80')}>{trackInitials}</span>}
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
                        <div className={cn('w-12', 'h-1.5', 'bg-black/40', 'rounded-full', 'overflow-hidden', 'shrink-0')}>
                          <div className={cn('h-full', 'bg-white/80', 'rounded-full', 'transition-all', 'duration-300')} style={{ width: `${progress}%` }} />
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
            : !isReady || !isRoomReady ? <Loader2 className={cn('w-5', 'h-5', 'text-white/50', 'animate-spin')} />
            : <AudioBars isPlaying={effectivePlaying} isSmall={false} isVisible={isVisible} />}

          {isRoom && (
            <button onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("open-profile-modal")); }}
              className={cn('p-1.5', 'rounded-full', 'transition-colors', 'pointer-events-auto', 'active:scale-95', 'bg-white/5', 'hover:bg-white/20', 'group')}
              title="Your Profile">
              <User className={cn('w-4', 'h-4', 'text-white/80', 'group-hover:text-white', 'transition-colors')} />
            </button>
          )}
        </div>
      </div>

      <RealtimeProgressBar duration={duration} onSeek={onSeek} isPlaying={effectivePlaying} isVisible={isVisible} />

      {/* Controls */}
      <div className={cn('flex', 'items-center', 'justify-between', 'w-full')}>
        <div className={cn('flex', 'items-center', 'gap-2')}>
          <button onClick={e => { e.stopPropagation(); onTabChange("network"); }} className={cn('p-1', 'sm:p-2', 'rounded-full', 'transition-colors', 'pointer-events-auto', 'active:scale-95')}>
            <Activity className={cn('w-5', 'h-5', 'sm:w-6', 'sm:h-6', 'text-white/50', 'hover:text-white', 'hover:cursor-pointer', 'hover:scale-105', 'transition-colors')} />
          </button>
          {isRoom && isHost && isPrivate && (
            <button onClick={e => { e.stopPropagation(); onTabChange("requests"); }} className={cn('p-1', 'sm:p-2', 'rounded-full', 'transition-colors', 'pointer-events-auto', 'active:scale-95', 'relative')}>
              <Users className={cn('w-5', 'h-5', 'sm:w-6', 'sm:h-6', 'text-white/50', 'hover:text-white', 'hover:cursor-pointer', 'hover:scale-105', 'transition-colors')} />
              {pendingRequestsCount > 0 && (
                <div className={cn('absolute', 'top-0', 'right-0', 'w-3', 'h-3', 'bg-red-500', 'rounded-full', 'border-2', 'border-background', 'animate-pulse')} />
              )}
            </button>
          )}
        </div>

        <div className={cn('flex', 'items-center', 'justify-center', 'gap-6', 'sm:gap-10')}>
          <button onClick={e => { e.stopPropagation(); onPrev(e); }} className={cn('p-1', 'sm:p-2', 'rounded-full', 'transition-colors', 'pointer-events-auto', 'active:scale-95')}>
            <SkipBack className={cn('w-7', 'h-7', 'sm:w-8', 'sm:h-8', 'text-white')} fill="currentColor" />
          </button>
          <button onClick={e => { e.stopPropagation(); onToggle(e); }} className={cn('p-1', 'sm:p-2', 'rounded-full', 'transition-colors', 'pointer-events-auto', 'active:scale-95')}>
            {effectivePlaying
              ? <Pause className={cn('w-9', 'h-9', 'sm:w-10', 'sm:h-10', 'text-white')} fill="currentColor" />
              : <Play className={cn('w-9', 'h-9', 'sm:w-10', 'sm:h-10', 'ml-1', 'text-white')} fill="currentColor" />}
          </button>
          <button onClick={e => { e.stopPropagation(); onNext(e); }} className={cn('p-1', 'sm:p-2', 'rounded-full', 'transition-colors', 'pointer-events-auto', 'active:scale-95')}>
            <SkipForward className={cn('w-7', 'h-7', 'sm:w-8', 'sm:h-8', 'text-white')} fill="currentColor" />
          </button>
        </div>

        <div className={cn('flex', 'items-center', 'gap-1', 'sm:gap-2')}>
          <button onClick={e => { e.stopPropagation(); onTabChange("search"); }} className={cn('p-1', 'sm:p-2', 'rounded-full', 'transition-colors', 'pointer-events-auto', 'active:scale-95')}>
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

  return (
    <div className={cn('relative', 'w-full', 'flex', 'flex-col', 'p-4', 'sm:p-6', 'pb-2')}>
      {/* Header */}     <div className={cn('flex', 'items-center', 'gap-3', 'mb-6', 'shrink-0')}>
        <button onClick={e => { e.stopPropagation(); onBack(); }} className={cn('p-2', '-ml-2', 'rounded-full', 'hover:bg-white/10', 'text-white/50', 'hover:text-white', 'transition-colors')}>
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
        <div className={cn('mt-4', 'flex', 'flex-col', 'gap-2')}>
          <div className={cn('flex', 'justify-between', 'items-center')}>
            <span className={cn('text-white/50', 'text-xs', 'font-bold', 'uppercase', 'tracking-widest')}>Sync Correction</span>
            <span className={cn('text-white', 'font-bold', 'text-sm')}>{audio.manualLatency > 0 ? "+" : ""}{Math.round(audio.manualLatency * 1000)}ms</span>
          </div>
          <input type="range" min={-0.5} max={0.5} step={0.01} value={audio.manualLatency}
            onChange={e => audio.setManualLatency(Number(e.target.value))}
            className={cn('w-full', 'h-2', 'rounded-full', 'appearance-none', 'outline-none', 'bg-white/20', 'cursor-pointer')}
            style={{ background: `linear-gradient(to right, rgba(255,255,255,0.8) ${((audio.manualLatency + 0.5) / 1) * 100}%, rgba(255,255,255,0.2) ${((audio.manualLatency + 0.5) / 1) * 100}%)` }} />
          <div className={cn('flex', 'items-center', 'justify-between', 'mt-1')}>
            <p className={cn('text-[10px]', 'text-white/40')}>Reported: {Math.round(audio.outputLatency * 1000)}ms.</p>
            <button onClick={() => audio.setManualLatency(0)} className={cn('px-2', 'py-1', 'rounded', 'bg-white/10', 'hover:bg-white/20', 'text-[10px]', 'font-bold', 'text-white', 'transition-colors')}>Auto Sync</button>
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
    <div className={cn('flex', 'flex-col', 'h-full', 'text-white', 'pt-3', 'pb-3', 'px-5')}>
      <div className={cn('flex', 'items-center', 'gap-2', 'mb-3', 'shrink-0')}>
        <button onClick={e => { e.stopPropagation(); onBack(); }} className={cn('p-1.5', 'hover:bg-white/10', 'rounded-full', 'transition-colors', '-ml-1', 'pointer-events-auto')}>
          <ChevronLeft className={cn('w-4', 'h-4', 'text-white/70')} />
        </button>
        <span className={cn('text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-white/60')}>Invite Friends</span>
      </div>
      <div className={cn('flex-1', 'flex', 'flex-col', 'min-h-0', 'overflow-hidden')}>
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
        <div className={cn('flex-1', 'overflow-y-auto', 'custom-scrollbar', 'flex', 'flex-col', 'gap-2', 'pointer-events-auto')}>
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
  <div className={cn('flex', 'flex-col', 'h-full', 'text-white', 'pt-2', 'pb-4')}>
    <div className={cn('flex', 'items-center', 'justify-between', 'px-6', 'mb-4')}>
      <button onClick={e => { e.stopPropagation(); onBack(); }} className={cn('p-2', 'hover:bg-white/10', 'rounded-full', 'transition-colors', '-ml-2', 'pointer-events-auto')}>
        <ChevronLeft className={cn('w-5', 'h-5', 'text-white/50')} />
      </button>
      <span className={cn('text-sm', 'font-bold', 'uppercase', 'tracking-widest', 'text-white/50')}>Join Requests ({requests.length})</span>
      <div className="w-9" />
    </div>
    <div className={cn('flex-1', 'min-h-0', 'overflow-y-auto', 'px-6', 'custom-scrollbar', 'flex', 'flex-col', 'gap-2', 'pointer-events-auto')} data-lenis-prevent="true">
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
    <div className={cn('absolute', 'inset-0', 'flex', 'items-center', 'px-2', 'gap-2')}>
      {/* Tiny thumbnail or disc */}
      <div className={cn('w-7', 'h-7', 'rounded-lg', 'shrink-0', 'overflow-hidden', 'flex', 'items-center', 'justify-center', 'bg-white/10')}>
        {showAlbumArt && thumbUrl
          ? <img src={thumbUrl} className={cn('w-full', 'h-full', 'object-cover')} />
          : <Disc className={`w-4 h-4 text-white/60 ${effectivePlaying ? "animate-[spin_4s_linear_infinite]" : ""}`} />}
      </div>
      {/* Dynamic Right Side: Seek | EQ | Pause */}
      <div 
        className={cn('flex', 'items-center', 'gap-1', 'flex-1', 'justify-center', 'pr-1', 'cursor-pointer', 'hover:opacity-80', 'transition-opacity', 'pointer-events-auto')}
        onClick={(e) => { e.stopPropagation(); onTogglePlayback(); }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {volIndicator ? (
          <>
            {volIndicator.amount > 0 ? <Volume2 className={cn('w-3.5', 'h-3.5', 'text-white')} /> : <VolumeX className={cn('w-3.5', 'h-3.5', 'text-white')} />}
            <span className={cn('text-[10px]', 'font-black', 'text-white')}>{volIndicator.text}</span>
          </>
        ) : seekIndicator ? (
          <>
            {seekIndicator.amount > 0 ? <FastForward className={cn('w-3.5', 'h-3.5', 'text-white')} /> : <Rewind className={cn('w-3.5', 'h-3.5', 'text-white')} />}
            <span className={cn('text-[10px]', 'font-black', 'text-white')}>{seekIndicator.text}</span>
          </>
        ) : isSyncing ? (
          <div className={cn('flex', 'items-center', 'gap-1.5', 'bg-amber-500/20', 'px-2', 'py-0.5', 'rounded-full', 'border', 'border-amber-500/30')}>
            <Loader2 className={cn('w-3', 'h-3', 'text-amber-400', 'animate-spin', 'shrink-0')} />
            <span className={cn('text-[9px]', 'font-black', 'text-amber-400', 'uppercase', 'tracking-widest')}>Buffering</span>
          </div>
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
  const thumbUrl = getTrackThumbnail(trackUrl, 'mq');
  const title = cleanTrackTitle(trackTitle);

  // If there's an active audio error (decoding failed / blocked track), display error alert in Dynamic Island
  if (audio.error) {
    return (
      <div 
        className={cn('absolute', 'inset-0', 'flex', 'items-center', 'justify-between', 'px-3.5', 'gap-2', 'bg-red-950/90', 'border', 'border-red-500/50', 'rounded-full', 'text-red-200', 'cursor-pointer', 'pointer-events-auto', 'shadow-[0_0_25px_rgba(239,68,68,0.5)]')}
        onClick={() => onNextTrack?.()}
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
  const progresses = Object.values(deviceSyncProgress);
  const isSyncing = (hasTrack && !isReady) || incomingTrack != null || upload.isUploading || (hasTrack && progresses.some(p => p < 100));

  if (isSyncing) {
    // ── Syncing / buffering: full-width progress bar, no track info, no player
    return (
      <div className={cn('absolute', 'inset-0', 'flex', 'items-center', 'px-4', 'gap-3')}>
        {/* Spinner icon */}
        <Loader2 className={`w-4 h-4 shrink-0 ${isStuck ? "text-amber-400" : "text-white/50 animate-spin"}`} />
        {/* Full-width progress */}
        <div className={cn('flex-1', 'min-w-0')}>
          <SyncProgressBar
            downloadProgress={downloadProgress}
            deviceSyncProgress={deviceSyncProgress}
            participants={participants}
            incomingTrack={incomingTrack}
            isReady={isReady}
            isStuck={isStuck}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={cn('absolute', 'inset-0', 'flex', 'items-stretch', 'px-2', 'gap-2')}>
      {/* LEFT half: track info + playback progress */}
      <div className={cn('flex', 'items-center', 'gap-2', 'flex-1', 'min-w-0', 'py-1.5')}>
        {/* Thumbnail */}
        <div className={cn('w-7', 'h-7', 'rounded-lg', 'shrink-0', 'overflow-hidden', 'bg-white/10', 'flex', 'items-center', 'justify-center')}>
          {thumbUrl
            ? <img src={thumbUrl} className={cn('w-full', 'h-full', 'object-cover')} />
            : <Disc className={`w-3.5 h-3.5 text-white/60 ${effectivePlaying ? "animate-[spin_4s_linear_infinite]" : ""}`} />}
        </div>

        {/* Title + progress line */}
        <div className={cn('flex', 'flex-col', 'justify-center', 'flex-1', 'min-w-0')}>
          <div className={cn('text-white', 'text-[11px]', 'font-semibold', 'truncate', 'leading-tight')}>
            {title.split(/\s+/).slice(0, 5).join(" ")}
          </div>
          <CompactProgressBar isPlaying={effectivePlaying} isVisible />
        </div>

        {/* Dynamic Right Side: Seek | EQ | Pause */}
        <div 
          className={cn('flex', 'items-center', 'gap-1', 'shrink-0', 'px-2', 'rounded-full', 'py-0.5', 'mr-1', 'cursor-pointer', 'hover:opacity-80', 'transition-opacity', 'pointer-events-auto')}
          onClick={(e) => { e.stopPropagation(); onTogglePlayback(); }}
          onPointerDown={(e) => e.stopPropagation()}
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
            <Play className={cn('w-4', 'h-4', 'text-white/80', 'fill-white/80', 'shrink-0', 'mx-1')} />
          )}
        </div>
      </div>

      {/* RIGHT half: join requests (if any) */}
      {isHost && isPrivate && pendingRequestsCount > 0 && (
        <>
          {/* Divider */}
          <div className={cn('w-px', 'bg-white/10', 'self-stretch', 'my-1.5', 'shrink-0')} />
          <div className={cn('flex', 'items-center', 'py-1.5', 'px-1', 'shrink-0')}>
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onRequestsClick(); }}
              className={cn('flex', 'items-center', 'gap-1.5', 'px-2', 'py-1', 'rounded-full', 'bg-red-500/20', 'text-red-400', 'hover:bg-red-500/30', 'transition-colors', 'text-[10px]', 'font-black', 'pointer-events-auto', 'whitespace-nowrap')}
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
        <div className={cn('absolute', 'bottom-0', 'left-0', 'right-0', 'h-[2px]', 'rounded-b-full', 'overflow-hidden', 'bg-white/5', 'pointer-events-none')}>
          <div
            className={cn('h-full', 'bg-gradient-to-r', 'from-violet-500', 'to-blue-500', 'transition-all', 'duration-500')}
            style={{ width: `${prefetchProgress}%` }}
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
    clockOffset, isRoomPlaying, participants: roomParticipants, pendingPlay,
    incomingTrack, pendingRequests, hostId, joinStatus, isPrivate, deviceSyncProgress,
    play, pause, seek, nextTrack, prevTrack, prefetch,
  } = useSyncInfo();
  const isRoom = pathname.includes("/room/");
  const isHost = hostId === user?.id;
  const hasTrack = audio.hasTrack;
  const effectivePlaying = isRoom ? isRoomPlaying : audio.isPlaying;
  const [isHoverLocked, setIsHoverLocked] = useState(false);
  const { settings } = useSettings();
  const islandCustomizer = settings.islandCustomizer || { glowColor: "violet", autoShrinkDelaySec: 6, showAlbumArt: true };

  const [isSearchLoading, setIsSearchLoading] = useState(false);

  const activeGlowKey = islandCustomizer.glowColor || "none";
  const glowHexMap: Record<string, string> = {
    violet: "#a855f7",
    cyan: "#06b6d4",
    emerald: "#10b981",
    amber: "#f59e0b",
    dark: "#a855f7",
    none: "#a855f7",
  };
  const activeGlowColorHex = glowHexMap[activeGlowKey] || "#a855f7";

  const glowClassMap = {
    violet: "border border-purple-500/40 shadow-[0_0_30px_rgba(168,85,247,0.45)]",
    cyan: "border border-cyan-500/40 shadow-[0_0_30px_rgba(6,182,212,0.45)]",
    emerald: "border border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.45)]",
    amber: "border border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.45)]",
    dark: "border border-white/[0.08] shadow-[0_30px_60px_rgba(0,0,0,0.6)]",
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
  const shrinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevReqCountRef = useRef(0);

  const [activeTab, setActiveTab] = useState<IslandTab>("player");
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteResultsCount, setInviteResultsCount] = useState(0);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [initialSearchMode, setInitialSearchMode] = useState<"youtube" | "spotify" | null>(null);
  const [activeSearchMode, setActiveSearchMode] = useState<"youtube" | "spotify" | null | undefined>(undefined);
  const [slideDir, setSlideDir] = useState(1);
  const [ytResultsCount, setYtResultsCount] = useState(0);
  const [seekIndicator, setSeekIndicator] = useState<{ amount: number; text: string } | null>(null);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [volIndicator, setVolIndicator] = useState<{ amount: number; text: string } | null>(null);
  const volTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [forceShowDetails, setForceShowDetails] = useState(false);
  const [isViewingPlaylist, setIsViewingPlaylist] = useState(false);
  const [isImportingPlaylist, setIsImportingPlaylist] = useState(false);
  const [hasSearchContent, setHasSearchContent] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isPressing, setIsPressing] = useState(false);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false);
  const [windowWidth, setWindowWidth] = useState(0);
  const [windowHeight, setWindowHeight] = useState(0);
  const localProgressRef = useRef(0);

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
  const lastTapRef = useRef<number>(0);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const scrubTimeRef = useRef<number | null>(null);
  const [isSpotifyPrivateError, setIsSpotifyPrivateError] = useState(false);
  useEffect(() => { scrubTimeRef.current = scrubTime; }, [scrubTime]);

  const roomId = isRoom ? (pathname.split("/room/")[1]?.split("/")[0] ?? "") : "";
  const netStats = useNetworkStats(isRoom, activeTab === "deviceInfo", roomId || undefined);
  const [deviceInfoTarget, setDeviceInfoTarget] = useState<string | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

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
    const isSyncing = incomingTrack != null || (hasTrack && (!audio.isReady || Object.values(deviceSyncProgress).some(p => p < 100)));
    if (isSyncing) {
      // Force extended and cancel any pending shrink — stay here until done
      if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
      shrinkTimerRef.current = null;
      if (islandState !== "extended") setIslandState("extended");
    } else if (islandState === "extended" && !isHoveringRef.current) {
      // Syncing just finished — brief pause then snap back to appropriate state
      if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
      shrinkTimerRef.current = setTimeout(() => setIslandState((effectivePlaying && hasTrack) ? "extended" : "pill"), 1200);
    }
  }, [audio.isReady, incomingTrack, deviceSyncProgress, isRoom, islandState, effectivePlaying, hasTrack]);

  // ── Playing state changes
  useEffect(() => {
    if (!isRoom || isHoveringRef.current || islandState === "expanded") return;
    const isSyncing = incomingTrack != null || (hasTrack && (!audio.isReady || Object.values(deviceSyncProgress).some(p => p < 100)));
    if (isSyncing) return; // let the syncing effect handle it

    if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
    if (effectivePlaying && hasTrack) {
      if (islandState === "pill") setIslandState("extended");
    } else {
      if (islandState === "extended") setIslandState("pill");
    }
  }, [effectivePlaying, hasTrack, isRoom, islandState, incomingTrack, audio.isReady, deviceSyncProgress]);

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

    document.addEventListener("island:expand-add", handleExpandAdd);
    document.addEventListener("island:expand-spotify", handleExpandSpotify);
    document.addEventListener("island:expand-invite", handleExpandInvite);
    return () => {
      document.removeEventListener("island:expand-add", handleExpandAdd);
      document.removeEventListener("island:expand-spotify", handleExpandSpotify);
      document.removeEventListener("island:expand-invite", handleExpandInvite);
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
    (hasTrack && (!audio.isReady || Object.values(deviceSyncProgress).some(p => p < 100)))
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
    let currentExpandedHeight: number | "auto" = "auto";
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
          <Link href="/hub" className={cn('flex', 'items-center', 'gap-2', 'sm:gap-3', 'group')}>
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
              <Link href="/hub" className={cn('h-9', 'px-5', 'flex', 'items-center', 'justify-center', 'rounded-xl', 'bg-foreground/10', 'text-foreground', 'text-xs', 'sm:text-sm', 'font-bold', 'tracking-widest', 'uppercase', 'hover:bg-foreground', 'hover:text-background', 'active:scale-95', 'transition-all')}>Done</Link>
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
  const expandedWidth = windowWidth > 0 ? Math.min(840, windowWidth - 32) : 640;

  let searchHeight = 100;
  if (isViewingPlaylist) {
    searchHeight = 560;
  } else if (isImportingPlaylist || upload.activeImport?.isImporting) {
    searchHeight = 300;
  } else if (searchError) {
    const isPrivateVideo = searchError.includes("Private playlists cannot be imported");
    const textLines = Math.ceil(searchError.length / 45);
    const extraHeight = isPrivateVideo ? 260 : Math.max(0, textLines - 1) * 22;
    searchHeight = Math.min(540, 150 + extraHeight);
  } else if (hasSearchContent) {
    searchHeight = 100;
  } else if (ytResultsCount > 0) {
    searchHeight = 480;
  } else {
    searchHeight = 100;
  }

  let inviteHeight = 145;
  if (inviteResultsCount > 0) {
    inviteHeight = Math.min(420, 150 + inviteResultsCount * 60);
  } else if (inviteLoading) {
    inviteHeight = 180;
  } else if (inviteQuery.includes("@")) {
    inviteHeight = 200;
  } else if (inviteQuery.trim().length > 0) {
    inviteHeight = 170;
  } else {
    inviteHeight = 145;
  }

  let requestsHeight = 140;
  if (pendingRequests && pendingRequests.length > 0) {
    requestsHeight = Math.min(400, 110 + pendingRequests.length * 60);
  }

  const expandedHeightMap: Record<IslandTab, number> = {
    player: 300,
    network: 410,
    search: searchHeight,
    requests: requestsHeight,
    deviceInfo: 420,
    invite: inviteHeight,
  };
  const expandedHeight = expandedHeightMap[activeTab] || 380;

  // Current animated dimensions
  // When radial navigator active: expand to 265px
  // When syncing: use a compact width (spinner + progress bar only, no track info)
  const syncingExtendedWidth = Math.min(340, (windowWidth > 0 ? windowWidth : 380) - 32);
  const currentWidth = radialSnapInfo?.isOpen
    ? Math.min(265, (windowWidth > 0 ? windowWidth : 320) - 32)
    : isExpanded_room
    ? expandedWidth
    : isExtended_room
    ? (isSyncingNow ? syncingExtendedWidth : extendedWidth)
    : pillWidth;
  const currentHeight = isExpanded_room ? expandedHeight : pillHeight;
  const currentRadius = isExpanded_room ? 36 : pillHeight / 2;

  const handlePointerDown_room = () => {
    resetInactivityTimer();
    if (windowWidth >= 768) return;
    if (islandState === "expanded") return;
    // Block long-press-to-expand while syncing
    if (isSyncingNow) return;
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
      // Block all expansion while syncing
      if (isSyncingNow) return;
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
        transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
        style={{ pointerEvents: isExpanded_room ? "auto" : "none", backdropFilter: isExpanded_room ? "blur(3px)" : "blur(0px)", WebkitBackdropFilter: isExpanded_room ? "blur(3px)" : "blur(0px)" }}
        onClick={() => setIslandState("pill")}
      />

      <div 
        className={cn('fixed', 'left-1/2', '-translate-x-1/2', 'z-[100]', 'flex', 'flex-col', 'items-center', 'pointer-events-none')}
        style={{
          top: "max(1.75rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))",
        }}
      >
        <motion.div
          ref={islandRef}
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
              if (isSyncingNow) return;
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
            width: SHAPE_SPRING,
            height: SHAPE_SPRING,
            borderRadius: SHAPE_SPRING,
            scale: { type: "spring", stiffness: 400, damping: 30, mass: 0.6 },
          }}
          animate={
            wiggle ? {
              x: [0, -4, 4, -4, 4, 0],
              transition: { duration: 0.4 }
            } : {
              width: currentWidth,
              height: currentHeight,
              borderRadius: currentRadius,
              scale: isPressing && islandState === "pill" ? 0.94 : 1,
            }
          }
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
          }}
          className={cn("pointer-events-auto select-none", currentGlowClass)}
        >
          {/* Rotating Border Light Beam with Trailing Glow */}
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
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
                  className={cn('w-[300%]', 'h-[300%]', '-top-[100%]', '-left-[100%]', 'absolute')}
                  style={{
                    background: `conic-gradient(from 0deg at 50% 50%, 
                      transparent 0deg, 
                      transparent 220deg, 
                      ${activeGlowColorHex}22 260deg, 
                      ${activeGlowColorHex}99 320deg, 
                      ${activeGlowColorHex} 355deg, 
                      transparent 360deg
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
            {islandState === "pill" && (
              <motion.div
                key="pill-content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, delay: 0.05 }}
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
            {isExpanded_room && (
              <motion.div
                key="expanded-tab-container"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ opacity: { duration: 0.2 }, scale: { ...SPRING, stiffness: 200 } }}
                className={cn('w-full', 'relative', 'flex-1', 'min-h-0', 'flex', 'flex-col', 'pointer-events-auto')}
              >
                <AnimatePresence custom={slideDir} initial={false} mode="popLayout">
                  {activeTab === "player" && (
                    <motion.div key="player" custom={slideDir} variants={tabVariants} initial="enter" animate="center" exit="exit" transition={SPRING} className={cn('w-full', 'relative', 'flex-1', 'min-h-0', 'flex', 'flex-col')}>
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
                    <motion.div key="network" custom={slideDir} variants={tabVariants} initial="enter" animate="center" exit="exit" transition={SPRING} className={cn('w-full', 'relative', 'flex-1', 'min-h-0', 'flex', 'flex-col')}>
                      <NetworkTab onBack={() => handleTabChange("player")} netStats={netStats} audio={audio} />
                    </motion.div>
                  )}
                  {activeTab === "search" && (
                    <motion.div key="search" custom={slideDir} variants={tabVariants} initial="enter" animate="center" exit="exit" transition={SPRING} className={cn('w-full', 'relative', 'flex-1', 'min-h-0', 'flex', 'flex-col')}>
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
                        onSuccess={() => { setWiggle(true); setTimeout(() => setWiggle(false), 400); }}
                      />
                    </motion.div>
                  )}
                  {(activeTab === "deviceInfo" || activeTab === "invite") && (
                    <motion.div key="invite-tab" custom={slideDir} variants={tabVariants} initial="enter" animate="center" exit="exit" transition={SPRING} className={cn('w-full', 'relative', 'flex-1', 'min-h-0', 'flex', 'flex-col')}>
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
              </motion.div>
            )}
          </AnimatePresence>

          {/* Gloss overlay */}
          <div className={cn('absolute', 'inset-0', 'rounded-[inherit]', 'pointer-events-none')}
            style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.06) 0%, transparent 60%)" }} />
        </motion.div>

        {/* ── Prefetch notification pill (below island, fades in/out) ── */}
        <AnimatePresence>
          {isRoom && prefetch.isPrefetching && prefetch.nextTrackTitle && !isExpanded_room && (
            <motion.div
              key="prefetch-pill"
              initial={{ opacity: 0, y: -6, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className={cn('mt-2', 'pointer-events-none')}
            >
              <div className={cn('flex', 'items-center', 'gap-2', 'bg-black/80', 'backdrop-blur-md', 'border', 'border-white/10', 'rounded-full', 'px-3', 'py-1.5', 'shadow-xl')}>
                {/* Spinning download icon */}
                <div className={cn('relative', 'w-3.5', 'h-3.5', 'shrink-0')}>
                  <svg viewBox="0 0 14 14" className={cn('w-full', 'h-full')} style={{ transform: "rotate(-90deg)" }}>
                    <circle cx="7" cy="7" r="5.5" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
                    <circle
                      cx="7" cy="7" r="5.5" fill="none"
                      stroke="rgba(139,92,246,0.9)" strokeWidth="1.5"
                      strokeDasharray={`${2 * Math.PI * 5.5}`}
                      strokeDashoffset={`${2 * Math.PI * 5.5 * (1 - prefetch.nextTrackProgress / 100)}`}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dashoffset 0.4s ease" }}
                    />
                  </svg>
                </div>
                <span className={cn('text-[10px]', 'font-semibold', 'text-white/60', 'truncate', 'max-w-[140px]')}>
                  Loading <span className="text-white/90">{prefetch.nextTrackTitle.split(/\s+/).slice(0, 4).join(" ")}</span>
                </span>
                <span className={cn('text-[9px]', 'font-black', 'text-violet-400', 'shrink-0')}>{prefetch.nextTrackProgress}%</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
