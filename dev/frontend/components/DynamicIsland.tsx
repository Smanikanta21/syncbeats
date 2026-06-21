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
  Activity,
  ChevronLeft,
  Search,
  Plus,
  FastForward,
  Rewind,
  LogOut,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { SpatialAudioEngine } from "../audio/SpatialAudioEngine";
import { useAuth } from "../context/AuthContext";
import { useAudio } from "../context/AudioContext";
import { useUpload } from "../context/UploadContext";
import { JoinRequest } from "../lib/types";
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
const COMPACT_WIDTH = 130;
const COMPACT_HEIGHT = 44;
const EXPANDED_HEIGHT = 350;

type IslandTab = "player" | "network" | "youtube" | "requests" | "deviceInfo";

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
  isVisible = true,
}: {
  isPlaying: boolean;
  isSmall?: boolean;
  isVisible?: boolean;
}) => {
  const audio = useAudio();
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPlaying || !isVisible) {
      if (barsRef.current) {
        const children = barsRef.current.children;
        for (let i = 0; i < children.length; i++) {
          const el = children[i] as HTMLElement;
          el.style.height = "15%";
          el.style.opacity = "0.4";
        }
      }
      return;
    }

    let rafId: number;
    // 3 bars: [left=previous, middle=current, right=upcoming]
    const displayHeights = [15, 15, 15];
    // History ring buffer for trailing (previous) beat
    const beatHistory: number[] = [];
    const HISTORY_SIZE = 8; // ~8 frames of history for smooth trailing

    const tick = () => {
      const data = audio.getRawAudioData();

      // ── Extract frequency bands ──
      let bassBeat = 0;    // For the current (middle) bar — punchy bass/kicks
      let midBeat = 0;     // For the upcoming (right) bar — mid frequencies predict next hit
      let subBeat = 0;     // For additional dynamics

      if (data && data.length > 40) {
        // Bass/kick band (bins 1-5, ~86-430 Hz) — most reactive to beats
        let bassSum = 0;
        for (let i = 1; i <= 5; i++) bassSum += data[i];
        bassBeat = Math.max(0, (bassSum / 5) - 80);

        // Sub-bass (bins 0-2, ~0-172 Hz) — deep rumble
        let subSum = 0;
        for (let i = 0; i <= 2; i++) subSum += data[i];
        subBeat = Math.max(0, (subSum / 3) - 90);

        // Mid-range band (bins 6-14, ~516-1200 Hz) — vocals, snares, leads
        let midSum = 0;
        for (let i = 6; i <= 14; i++) midSum += data[i];
        midBeat = Math.max(0, (midSum / 9) - 70);
      }

      // ── Current beat (middle bar) — immediate, punchy ──
      // Combine bass + sub for maximum punch
      const currentIntensity = bassBeat * 0.7 + subBeat * 0.3;
      const currentTarget = currentIntensity > 0
        ? Math.min(15 + (currentIntensity / 140) * 85, 100)
        : 15;

      // Push current intensity to history for the trailing bar
      beatHistory.push(currentTarget);
      if (beatHistory.length > HISTORY_SIZE) beatHistory.shift();

      // ── Previous beat (left bar) — smooth trailing of the current beat ──
      // Average the older half of history for a smooth, delayed trail
      const trailSlice = beatHistory.slice(0, Math.max(1, Math.floor(beatHistory.length * 0.6)));
      const prevTarget = trailSlice.reduce((a, b) => a + b, 0) / trailSlice.length;

      // ── Upcoming beat (right bar) — uses mids, slightly ahead feel ──
      const upcomingIntensity = midBeat * 0.6 + bassBeat * 0.4;
      const upcomingTarget = upcomingIntensity > 0
        ? Math.min(15 + (upcomingIntensity / 160) * 85, 100)
        : 15;

      const targets = [prevTarget, currentTarget, upcomingTarget];

      // ── iOS-style interpolation: fast attack, slow decay ──
      for (let i = 0; i < 3; i++) {
        const target = targets[i];
        const current = displayHeights[i];

        if (target > current) {
          // Fast attack — snap up quickly (iOS bars jump on beat)
          const attackSpeed = i === 1 ? 0.65 : 0.45; // Middle bar is most responsive
          displayHeights[i] += (target - current) * attackSpeed;
        } else {
          // Slow decay — iOS bars float down smoothly
          const decaySpeed = i === 1 ? 0.12 : (i === 0 ? 0.08 : 0.10);
          displayHeights[i] += (target - current) * decaySpeed;
        }

        // Clamp
        displayHeights[i] = Math.max(15, Math.min(100, displayHeights[i]));

        if (barsRef.current) {
          const el = barsRef.current.children[i] as HTMLElement;
          if (el) {
            el.style.height = `${displayHeights[i]}%`;
            // Brightness scales with intensity for that iOS glow effect
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
  const wClass = isSmall ? "w-[3px]" : "w-[3px]";
  const gapClass = isSmall ? "gap-[2px]" : "gap-[3px]";

  return (
    <div ref={barsRef} className={`flex items-end ${gapClass} ${hClass}`}>
      <div
        className={`${wClass} bg-white rounded-full`}
        style={{ height: "15%", opacity: 0.4, willChange: "height, opacity" }}
      />
      <div
        className={`${wClass} bg-white rounded-full`}
        style={{ height: "15%", opacity: 0.4, willChange: "height, opacity" }}
      />
      <div
        className={`${wClass} bg-white rounded-full`}
        style={{ height: "15%", opacity: 0.4, willChange: "height, opacity" }}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// CompactProgressBar
// ─────────────────────────────────────────────────────────

const CompactProgressBar = ({
  isPlaying,
  isVisible = true,
}: {
  isPlaying: boolean;
  isVisible?: boolean;
}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const audio = useAudio();

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const pos = audio.getTruePosition();
      const dur = Math.max(1, audio.duration);
      const progress = Math.min(1, pos / dur);

      if (barRef.current) barRef.current.style.width = `${progress * 100}%`;

      if (isPlaying && isVisible) {
        rafId = requestAnimationFrame(tick);
      }
    };

    tick();

    if (isPlaying && isVisible) {
      rafId = requestAnimationFrame(tick);
    }
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, audio, isVisible]);

  return (
    <div className="w-[80%] mx-auto mt-0.5 h-0.75 bg-white/20 rounded-full overflow-hidden shrink-0">
      <div
        ref={barRef}
        className="h-full bg-white/80 rounded-full"
        style={{
          width: "0%",
          transition: isPlaying ? "none" : "width 200ms ease",
        }}
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
  pendingRequestsCount?: number;
  isHost?: boolean;
  isPrivate?: boolean;
  onRequestsClick?: () => void;
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
  pendingRequestsCount,
  isHost,
  isPrivate,
  onRequestsClick,
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

  const isRoomReady =
    isRoom && roomParticipants
      ? roomParticipants.every((p) => p.isReady)
      : true;
  const isFullyReady = isReady && isRoomReady;
  const loadingParticipants =
    isRoom && roomParticipants
      ? roomParticipants.filter((p) => !p.isReady)
      : [];

  if (!hasTrack) {
    return (
      <motion.div
        className="absolute inset-0 flex items-center pointer-events-none"
        animate={{ opacity: isExpanded ? 0 : 1 }}
        transition={{ duration: 0.15 }}
      >
        <div className="w-full h-full p-0.5 pointer-events-auto">
          <div className="w-full h-full bg-white/10 rounded-full flex items-center justify-between px-4 text-white/50 text-sm gap-2">
            <div className="flex items-center gap-2 pointer-events-none">
              <Search className="w-4 h-4" />
              <span>Search YouTube or upload...</span>
            </div>
            {isRoom &&
            isHost &&
            isPrivate &&
            pendingRequestsCount &&
            pendingRequestsCount > 0 ? (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestsClick?.();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors pointer-events-auto active:scale-95"
              >
                <Users className="w-3.5 h-3.5" />
                <span className="text-[10px] font-black">
                  {pendingRequestsCount}
                </span>
              </button>
            ) : null}
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
            <Disc
              className={`w-4 h-4 text-white/40 ${effectivePlaying && !thumbnailUrl ? "animate-[spin_4s_linear_infinite]" : ""}`}
            />
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
                  {cleanTrackTitle(trackTitle)
                    .split(/\s+/)
                    .slice(0, 6)
                    .join(" ")}
                </div>
                <CompactProgressBar
                  isPlaying={effectivePlaying}
                  isVisible={!isExpanded}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center pr-1 shrink-0 ml-auto pointer-events-auto">
          {seekIndicator ? (
            <div className="flex items-center gap-1 text-white/80 text-[11px] font-bold bg-white/10 px-2 py-1 rounded-full">
              {seekIndicator.amount > 0 ? (
                <FastForward className="w-3 h-3" />
              ) : (
                <Rewind className="w-3 h-3" />
              )}
              {seekIndicator.text}
            </div>
          ) : error ? (
            <div className="flex items-center gap-1 text-[#FF0000]/80 text-[10px] font-bold uppercase tracking-wider pr-1 group relative cursor-help">
              <AlertCircle className="w-3 h-3" /> Failed
              <div className="absolute bottom-full right-0 mb-2 w-48 bg-black/90 text-white text-[10px] p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-center border border-white/10 pointer-events-none normal-case tracking-normal">
                Tap the island to view error details.
              </div>
            </div>
          ) : !hasTrack ? (
            <div className="flex items-center gap-1 text-white/50 text-[10px] font-bold uppercase tracking-wider pr-1">
              Waiting for others
              {pendingRequestsCount && pendingRequestsCount > 0 ? (
                <div className="ml-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              ) : null}
            </div>
          ) : !isFullyReady ? (
            <div className="flex items-center gap-1 text-white/50 text-[10px] font-bold uppercase tracking-wider pr-1">
              <Loader2 className="w-3 h-3 animate-spin" />{" "}
              {loadingParticipants.length > 0
                ? "Syncing..."
                : `${downloadProgress}%`}
            </div>
          ) : effectivePlaying ? (
            <AudioBars
              isPlaying={effectivePlaying}
              isSmall
              isVisible={!isExpanded}
            />
          ) : (
            <div className="flex items-center gap-1 text-white/50 text-[10px] font-bold uppercase tracking-wider pr-1">
              <Pause className="w-3 h-3" /> Paused
            </div>
          )}
          {pendingRequestsCount && pendingRequestsCount > 0 ? (
            <div className="ml-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          ) : null}
        </div>
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────
// RealtimeProgressBar
// ─────────────────────────────────────────────────────────

const RealtimeProgressBar = ({
  duration,
  onSeek,
  isPlaying,
  isVisible = true,
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
      if (handleRef.current)
        handleRef.current.style.left = `calc(${progress * 100}% - 6px)`;
      if (leftTimeRef.current)
        leftTimeRef.current.textContent = formatTime(pos);
      if (rightTimeRef.current)
        rightTimeRef.current.textContent =
          "-" + formatTime(Math.max(0, dur - pos));

      if (isPlaying && isVisible) {
        rafId = requestAnimationFrame(tick);
      }
    };

    tick();

    if (isPlaying && isVisible) {
      rafId = requestAnimationFrame(tick);
    }
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, duration, audio, isVisible]);

  return (
    <div className="flex items-center gap-3 w-full mt-2">
      <span
        ref={leftTimeRef}
        className="text-[12px] font-medium text-white/50 font-mono w-9 text-right select-none pointer-events-none"
      >
        0:00
      </span>
      <div
        className="relative flex-1 h-8 flex items-center cursor-pointer group"
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const p = Math.max(
            0,
            Math.min(1, (e.clientX - rect.left) / rect.width),
          );
          onSeek(p * duration);
        }}
      >
        <div className="absolute w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            ref={barRef}
            className="h-full bg-white/80 rounded-full"
            style={{
              width: "0%",
              transition: isPlaying ? "none" : "width 200ms ease",
            }}
          />
        </div>
        <div
          ref={handleRef}
          className="absolute w-3 h-3 rounded-full bg-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: "-6px" }}
        />
      </div>
      <span
        ref={rightTimeRef}
        className="text-[12px] font-medium text-white/50 font-mono w-9 text-left select-none pointer-events-none"
      >
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
  pendingRequestsCount,
  isHost,
  isPrivate,
  isVisible = true,
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
  const isRoomReady =
    isRoom && roomParticipants
      ? roomParticipants.every((p: any) => p.isReady)
      : true;
  const loadingParticipants =
    isRoom && roomParticipants
      ? roomParticipants.filter((p: any) => !p.isReady)
      : [];

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
          <div className="font-bold text-white text-[18px] truncate leading-tight tracking-tight">
            {cleanTrackTitle(trackTitle)}
          </div>

          <div
            className={`text-[13px] sm:text-[15px] truncate mt-0.5 transition-colors ${
              error
                ? "text-[#FF0000]/80 cursor-pointer hover:text-[#FF0000]"
                : "text-white/50"
            }`}
            onClick={(e) => {
              if (error) {
                e.stopPropagation();
                setShowErrorDetails((prev) => !prev);
              }
            }}
          >
            {error ? (
              <span className="flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> Failed to pull • Tap for
                info
              </span>
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
                <div
                  className="bg-[#FF0000]/10 border border-[#FF0000]/20 rounded-lg p-2.5 text-[11px] sm:text-xs text-[#FF0000]/90 leading-relaxed whitespace-normal cursor-text pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="font-bold mb-1">Track Transfer Failed</p>
                  <p className="opacity-80 wrap-break-word">{error}</p>
                  <p className="mt-1.5 opacity-80">
                    If this persists, ask the host to re-select the track.
                  </p>
                </div>
              </motion.div>
            )}

            {hasTrack &&
              isRoom &&
              loadingParticipants.length > 0 &&
              !error &&
              !showErrorDetails && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  className="overflow-hidden"
                >
                  <div
                    className="flex items-center gap-2 flex-wrap max-h-12 overflow-y-auto custom-scrollbar pr-1 pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {loadingParticipants.map((p: any) => (
                      <div
                        key={p.socketId}
                        className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1"
                      >
                        <Loader2 className="w-3 h-3 text-white/50 animate-spin shrink-0" />
                        <span className="text-white/80 text-[10px] font-bold uppercase">
                          {p.displayName}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-4 shrink-0 pr-1 pt-1">
          {error ? (
            <AlertCircle className="w-5 h-5 text-[#FF0000]/80" />
          ) : !isReady || !isRoomReady ? (
            <Loader2 className="w-5 h-5 text-white/50 animate-spin" />
          ) : (
            <AudioBars
              isPlaying={effectivePlaying}
              isSmall={false}
              isVisible={isVisible}
            />
          )}

          {isRoom && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.location.href = "/hub";
              }}
              className="p-1.5 rounded-full transition-colors pointer-events-auto active:scale-95 bg-white/5 hover:bg-[#FF0000]/20 group"
            >
              <LogOut className="w-4 h-4 text-[#FF0000]/80 group-hover:text-[#FF0000] transition-colors" />
            </button>
          )}
        </div>
      </div>

      <RealtimeProgressBar
        duration={duration}
        onSeek={onSeek}
        isPlaying={effectivePlaying}
        isVisible={isVisible}
      />

      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTabChange("network");
            }}
            className="p-1 sm:p-2 rounded-full transition-colors pointer-events-auto active:scale-95 relative"
          >
            <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-white/50 hover:text-white hover:cursor-pointer hover:scale-105 transition-colors" />
          </button>

          {isRoom && isHost && isPrivate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTabChange("requests");
              }}
              className="p-1 sm:p-2 rounded-full transition-colors pointer-events-auto active:scale-95 relative"
            >
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-white/50 hover:text-white hover:cursor-pointer hover:scale-105 transition-colors" />
              {pendingRequestsCount && pendingRequestsCount > 0 ? (
                <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-background animate-pulse flex items-center justify-center">
                  <span className="text-[7px] text-white font-black leading-none">
                    {pendingRequestsCount}
                  </span>
                </div>
              ) : null}
            </button>
          )}
        </div>

        <div className="flex items-center justify-center gap-6 sm:gap-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPrev(e);
            }}
            className="p-1 sm:p-2 rounded-full transition-colors pointer-events-auto active:scale-95"
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
            className="p-1 sm:p-2 rounded-full transition-colors pointer-events-auto active:scale-95"
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
            className="p-1 sm:p-2 rounded-full transition-colors pointer-events-auto active:scale-95"
          >
            <SkipForward
              className="w-7 h-7 sm:w-8 sm:h-8 text-white"
              fill="currentColor"
            />
          </button>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTabChange("youtube");
            }}
            className="p-1 sm:p-2 rounded-full transition-colors pointer-events-auto active:scale-95"
          >
            <Youtube className="w-5 h-5 sm:w-6 sm:h-6 text-white/50 hover:text-white hover:cursor-pointer hover:scale-105 transition-colors" />
          </button>
        </div>
      </div>
    </div>
  );
};

const NetworkTab = ({
  onBack,
  netStats,
  audio,
}: {
  onBack: () => void;
  netStats: any;
  audio: any;
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

        <div className="w-full h-24 bg-white/5 rounded-xl border border-white/10 p-2 flex items-end gap-0.5">
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

        {/* Audio Sync Slider */}
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-white/50 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              Sync Correction
            </span>
            <span className="text-white font-bold text-sm">
              {audio.manualLatency > 0 ? "+" : ""}
              {Math.round(audio.manualLatency * 1000)}ms
            </span>
          </div>
          <input
            type="range"
            min={-0.5}
            max={0.5}
            step={0.01}
            value={audio.manualLatency}
            onChange={(e) => audio.setManualLatency(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none outline-none bg-white/20 cursor-pointer"
            style={{
              background: `linear-gradient(to right, rgba(255,255,255,0.8) ${((audio.manualLatency + 0.5) / 1) * 100}%, rgba(255,255,255,0.2) ${((audio.manualLatency + 0.5) / 1) * 100}%)`,
            }}
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-[10px] text-white/40">
              Reported: {Math.round(audio.outputLatency * 1000)}ms.
            </p>
            <button
              onClick={() => audio.setManualLatency(0)}
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white transition-colors"
            >
              Auto Sync
            </button>
          </div>
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
  const [downloadError, setDownloadError] = useState<string | null>(null);

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
    setDownloadError(null);
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
    setDownloadError(null);
    try {
      const videoId =
        result.url.split("v=")[1]?.split("&")[0] ||
        result.url.split("youtu.be/")[1]?.split("?")[0];
      await upload.downloadYoutubeToP2P(roomId, videoId, result.title);
      setAddedSongs((prev) => new Set(prev).add(result.url));
    } catch (err: any) {
      console.error(err);
      if (
        err.message?.includes(
          "RapidAPI did not return a valid download link",
        ) ||
        err.message?.includes("FATAL: YouTube download returned")
      ) {
        setDownloadError(
          "This track is age-restricted or blocked by YouTube. Please try another search result.",
        );
      } else {
        setDownloadError(err.message || "Failed to load this track.");
      }
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

      {downloadError && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="bg-red-500/20 border border-red-500/30 text-red-200 text-xs px-3 py-2 rounded-xl mb-3 shrink-0"
        >
          {downloadError}
        </motion.div>
      )}

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
              <div className="flex-1 flex items-center justify-center min-h-37.5">
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
// RequestsTab
// ─────────────────────────────────────────────────────────

const RequestsTab = ({
  requests,
  onApprove,
  onDeny,
  onBack,
}: {
  requests: JoinRequest[];
  onApprove: (id: string, name: string) => void;
  onDeny: (id: string) => void;
  onBack: () => void;
}) => {
  return (
    <div className="flex flex-col h-full text-white pt-2 pb-4">
      <div className="flex items-center justify-between px-6 mb-4">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBack();
          }}
          className="p-2 hover:bg-white/10 rounded-full transition-colors -ml-2 pointer-events-auto"
        >
          <ChevronLeft className="w-5 h-5 text-white/50" />
        </button>
        <span className="text-sm font-bold uppercase tracking-widest text-white/50">
          Join Requests ({requests.length})
        </span>
        <div className="w-9" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 custom-scrollbar flex flex-col gap-2 pointer-events-auto">
        {requests.length === 0 ? (
          <div className="text-center text-white/40 text-xs mt-10">
            No pending requests
          </div>
        ) : (
          requests.map((req) => (
            <div
              key={req.socketId}
              className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10"
            >
              <span className="font-semibold text-sm truncate pr-2">
                {req.displayName}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeny(req.socketId);
                  }}
                  className="px-3 py-1.5 rounded-full bg-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/30 transition-colors"
                >
                  Deny
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprove(req.socketId, req.displayName);
                  }}
                  className="px-3 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-colors"
                >
                  Approve
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// DeviceInfoTab
// ─────────────────────────────────────────────────────────

const DeviceInfoTab = ({
  targetSocketId,
  roomParticipants,
  localStats,
  onBack,
}: {
  targetSocketId: string | null;
  roomParticipants: any[];
  localStats: any;
  onBack: () => void;
}) => {
  const [remoteStats, setRemoteStats] = useState<any[]>([]);

  useEffect(() => {
    if (!targetSocketId) return;
    const socket = getSocket();

    const handleStats = (data: any) => {
      if (data.socketId === targetSocketId) {
        setRemoteStats((prev) => {
          const newStats = [
            ...prev.slice(-120),
            { ts: Date.now(), latency: data.latency },
          ];
          return newStats;
        });
      }
    };

    socket.on("room:participantStats", handleStats);
    return () => {
      socket.off("room:participantStats", handleStats);
    };
  }, [targetSocketId]);

  const targetParticipant = roomParticipants.find(
    (p) => p.socketId === targetSocketId,
  );
  const targetName = targetParticipant?.displayName || "Unknown Device";

  // Build SVG paths for local and remote stats
  const width = 280;
  const height = 80;
  const maxLatency = 200; // Cap visual scale at 200ms

  const localHistory = localStats.history || [];

  // Find the absolute latest timestamp in both datasets to anchor the right edge
  const newestLocal =
    localHistory.length > 0 ? localHistory[localHistory.length - 1].ts : 0;
  const newestRemote =
    remoteStats.length > 0 ? remoteStats[remoteStats.length - 1].ts : 0;
  const latestTs =
    Math.max(newestLocal, newestRemote) > 0
      ? Math.max(newestLocal, newestRemote)
      : Date.now();

  // Calculate oldest timestamp available in either dataset to anchor graph to the left
  const oldestLocal = localHistory.length > 0 ? localHistory[0].ts : latestTs;
  const oldestRemote = remoteStats.length > 0 ? remoteStats[0].ts : latestTs;
  const oldestAvailable = Math.min(oldestLocal, oldestRemote);

  // Dynamic time window: stretch to fill exactly from oldest to newest, capped at 30 seconds
  const timeWindow = Math.min(
    30000,
    Math.max(1000, latestTs - oldestAvailable),
  );

  const buildPath = (data: any[], color: string) => {
    const visibleData = data.filter((d) => latestTs - d.ts <= timeWindow);
    if (visibleData.length < 2) return null;

    const points = visibleData.map((d) => {
      const timeDiff = latestTs - d.ts;
      // Map x from 0 (timeWindow ago) to width (latestTs)
      const x = width - (timeDiff / timeWindow) * width;
      const y = height - Math.min(height, (d.latency / maxLatency) * height);
      return `${x},${y}`;
    });
    return (
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    );
  };

  const currentLocalLatency = Math.round(localStats.latency || 0);
  const currentRemoteLatency =
    remoteStats.length > 0
      ? Math.round(remoteStats[remoteStats.length - 1].latency)
      : null;

  return (
    <div className="flex flex-col h-full text-white pt-2 pb-4 pointer-events-auto">
      <div className="flex items-center justify-between px-6 mb-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBack();
          }}
          className="p-2 hover:bg-white/10 rounded-full transition-colors -ml-2"
        >
          <ChevronLeft className="w-5 h-5 text-white/50" />
        </button>
        <span className="text-sm font-bold uppercase tracking-widest text-white/50 truncate max-w-50">
          {targetName}
        </span>
        <div className="w-9" />
      </div>

      <div className="flex-1 px-6 flex flex-col gap-4">
        {/* Real-time Graph */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col relative overflow-hidden">
          <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2 flex justify-between">
            <span className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              You:{" "}
              <span className="text-blue-400 font-extrabold">
                {currentLocalLatency}ms
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              Remote:{" "}
              <span className="text-emerald-400 font-extrabold">
                {currentRemoteLatency !== null
                  ? `${currentRemoteLatency}ms`
                  : "--"}
              </span>
            </span>
          </div>

          <svg
            width="100%"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="overflow-visible mt-2"
          >
            {/* Grid lines */}
            <line
              x1="0"
              y1={height}
              x2={width}
              y2={height}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1="0"
              y1={height / 2}
              x2={width}
              y2={height / 2}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />

            {buildPath(localStats.history || [], "#3b82f6")}
            {buildPath(remoteStats, "#10b981")}
          </svg>

          <div className="flex justify-between mt-3 text-[9px] uppercase tracking-widest text-white/30 font-bold">
            <span>-30s</span>
            <span>Now</span>
          </div>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-white/40 uppercase tracking-widest text-[9px] mb-1">
              Output Device
            </div>
            <div className="font-semibold truncate">
              {targetParticipant?.outputDeviceName || "System Default"}
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-white/40 uppercase tracking-widest text-[9px] mb-1">
              Status
            </div>
            <div className="font-semibold truncate">
              {targetParticipant?.isBlocked
                ? "Blocked"
                : targetParticipant?.isReady
                  ? "Ready & Syncing"
                  : "Buffering"}
            </div>
          </div>
        </div>
      </div>
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
    pendingRequests,
    hostId,
    joinStatus,
    isPrivate,
  } = useSyncInfo();

  const isRoom = pathname.includes("/room/");
  const isHost = hostId === user?.id;
  const [isExpanded, setIsExpanded] = useState(false);
  const localProgressRef = useRef(0);
  const lastTapRef = useRef<number>(0);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const scrubTimeRef = useRef<number | null>(null);
  useEffect(() => {
    scrubTimeRef.current = scrubTime;
  }, [scrubTime]);

  const roomId = isRoom
    ? (pathname.split("/room/")[1]?.split("/")[0] ?? "")
    : "";
  const [activeTab, setActiveTab] = useState<IslandTab>("player");
  const netStats = useNetworkStats(
    isRoom,
    activeTab === "deviceInfo",
    roomId || undefined,
  );
  const islandRef = useRef<HTMLDivElement>(null);

  const [deviceInfoTarget, setDeviceInfoTarget] = useState<string | null>(null);

  useEffect(() => {
    const handleShowDeviceInfo = (e: any) => {
      setDeviceInfoTarget(e.detail.socketId);
      setActiveTab("deviceInfo");
      setIsExpanded(true);
      if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
    };
    window.addEventListener("showDeviceInfo", handleShowDeviceInfo);
    return () =>
      window.removeEventListener("showDeviceInfo", handleShowDeviceInfo);
  }, []);
  const shrinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevReqCountRef = useRef(0);

  useEffect(() => {
    const currentCount = pendingRequests?.length || 0;
    const prevCount = prevReqCountRef.current;

    if (currentCount > prevCount) {
      // New request arrived
      setIsExpanded(true);
      setActiveTab("requests");

      if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
      shrinkTimerRef.current = setTimeout(() => {
        setIsExpanded(false);
      }, 10000);
    }

    prevReqCountRef.current = currentCount;
  }, [pendingRequests?.length]);
  const [slideDir, setSlideDir] = useState(1);
  const [ytResultsCount, setYtResultsCount] = useState(0);
  const [ytQuery, setYtQuery] = useState("");

  const [seekIndicator, setSeekIndicator] = useState<{
    amount: number;
    text: string;
  } | null>(null);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [forceShowDetails, setForceShowDetails] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isHoverLocked, setIsHoverLocked] = useState(false);

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
    if (isExpanded && windowWidth < 768 && activeTab !== "deviceInfo") {
      inactivityTimerRef.current = setTimeout(() => {
        setIsExpanded(false);
      }, 3000); // 3 seconds timeout
    }
  }, [isExpanded, windowWidth, activeTab]);

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
      if (activeTab === newTab) return;
      if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
      const order: Record<IslandTab, number> = {
        network: -1,
        player: 0,
        youtube: 1,
        requests: 2,
        deviceInfo: 3,
      };
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
    : (windowWidth >= 768 ? 200 : COMPACT_WIDTH) +
      (effectivePlaying || forceShowDetails ? 80 : 0);

  const isYoutubeSearchOnly =
    !hasTrack && ytQuery.trim() === "" && ytResultsCount === 0;

  // Dynamic height
  let currentExpandedHeight = EXPANDED_HEIGHT;
  if (activeTab === "youtube") {
    if (isYoutubeSearchOnly) {
      currentExpandedHeight = COMPACT_HEIGHT;
    } else if (ytResultsCount > 0) {
      currentExpandedHeight = Math.min(550, 120 + ytResultsCount * 75);
    } else if (ytQuery.trim() !== "") {
      currentExpandedHeight = 160;
    } else {
      currentExpandedHeight = 120;
    }
  } else if (activeTab === "requests") {
    const reqCount = pendingRequests?.length || 0;
    currentExpandedHeight = Math.max(150, Math.min(450, 80 + reqCount * 70));
  } else if (activeTab === "deviceInfo") {
    currentExpandedHeight = 240;
  }

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

  useEffect(() => {
    const handleExpandAdd = () => {
      setActiveTab("youtube");
      setIsExpanded(true);
    };
    document.addEventListener("island:expand-add", handleExpandAdd);
    return () => {
      document.removeEventListener("island:expand-add", handleExpandAdd);
    };
  }, []);

  // Do not render dynamic island in waiting room
  if (isRoom && (joinStatus === "pending" || joinStatus === "denied")) {
    return null;
  }

  if (!isRoom) {
    return (
      <div className="fixed top-4 sm:top-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <div className="pointer-events-auto glass-panel w-[92%] max-w-5xl rounded-4xl px-4 sm:px-6 md:px-8 py-3.5 flex items-center justify-between shadow-2xl select-none">
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
        </div>
      </div>
    );
  }

  const handlePointerDown = () => {
    resetInactivityTimer();
    // On desktop, hover handles expansion, so ignore long press
    if (windowWidth >= 768) return;

    if (isExpanded) return;
    setIsPressing(true);
    pressTimerRef.current = setTimeout(() => {
      if (!hasTrack) {
        setActiveTab("youtube");
        setIsHoverLocked(true);
      }
      setIsExpanded(true);
      setForceShowDetails(false);
      setIsPressing(false);
      pressTimerRef.current = null;

      // Haptic feedback for expanding
      if (typeof navigator !== "undefined" && navigator.vibrate) {
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

      const nowTime = Date.now();
      const DOUBLE_TAP_DELAY = 500;
      if (nowTime - lastTapRef.current < DOUBLE_TAP_DELAY) {
        // Double tap: toggle play/pause
        handleToggle();
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = nowTime;
        // Short tap (Mobile)
        if (!isExpanded && hasTrack) {
          setForceShowDetails(true);
          setTimeout(() => setForceShowDetails(false), 3000);
        } else if (!isExpanded && !hasTrack) {
          setActiveTab("youtube");
          setIsExpanded(true);
        }
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
        onClick={() => {
          setIsExpanded(false);
          setIsHoverLocked(false);
        }}
      />

      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-100 flex flex-col items-center pointer-events-none">
        <motion.div
          ref={islandRef}
          onPointerDown={(e) => {
            if (windowWidth >= 768) setIsHoverLocked(true);
            handlePointerDown();
            resetInactivityTimer();
          }}
          onPointerUp={(e) => {
            handlePointerUp();
            resetInactivityTimer();
          }}
          onMouseEnter={() => {
            if (windowWidth >= 768) {
              if (!hasTrack) return;
              setIsExpanded(true);
              setForceShowDetails(false);
            }
          }}
          onClick={(e) => {
            if (windowWidth >= 768) {
              if (hasTrack) {
                setIsHoverLocked(false);
                setIsExpanded(false);
                setForceShowDetails(true);
                setTimeout(() => setForceShowDetails(false), 3000);
              } else {
                setActiveTab("youtube");
                setIsExpanded(true);
                setIsHoverLocked(true);
              }
            }
          }}
          onPointerLeave={(e) => {
            handlePointerUp();
            resetInactivityTimer();
          }}
          onMouseLeave={(e) => {
            if (windowWidth >= 768 && !isHoverLocked) {
              setIsExpanded(false);
            }
            handlePointerUp();
          }}
          onPointerMove={resetInactivityTimer}
          onDoubleClick={(e) => {
            e.preventDefault();
            handleToggle();
          }}
          initial={false}
          transition={SPRING}
          animate={{
            width: isExpanded ? dynamicExpandedWidth : dynamicCompactWidth,
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
          className="pointer-events-auto shadow-[0_30px_60px_rgba(0,0,0,0.5)] border border-white/8 select-none"
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
            downloadProgress={0}
            showDetails={effectivePlaying || forceShowDetails}
            isRoom={isRoom}
            roomParticipants={roomParticipants}
            pendingRequestsCount={pendingRequests?.length || 0}
            isHost={isHost}
            isPrivate={isPrivate}
            onRequestsClick={() => {
              setActiveTab("requests");
              setIsExpanded(true);
            }}
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
                    downloadProgress={0}
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
                    isVisible={isExpanded}
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
                    onBack={() => handleTabChange("player")}
                    netStats={netStats}
                    audio={audio}
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
              {activeTab === "requests" && (
                <motion.div
                  key="requests"
                  custom={slideDir}
                  variants={tabVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={SPRING}
                  className="absolute inset-0"
                >
                  <RequestsTab
                    requests={pendingRequests || []}
                    onApprove={(id, name) => {
                      document.dispatchEvent(
                        new CustomEvent("room:action-approve", {
                          detail: { socketId: id, displayName: name },
                        }),
                      );
                      if (pendingRequests.length <= 1) setActiveTab("player");
                    }}
                    onDeny={(id) => {
                      document.dispatchEvent(
                        new CustomEvent("room:action-deny", {
                          detail: { socketId: id },
                        }),
                      );
                      if (pendingRequests.length <= 1) setActiveTab("player");
                    }}
                    onBack={() => setActiveTab("player")}
                  />
                </motion.div>
              )}
              {activeTab === "deviceInfo" && (
                <motion.div
                  key="deviceInfo"
                  custom={slideDir}
                  variants={tabVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={SPRING}
                  className="absolute inset-0"
                >
                  <DeviceInfoTab
                    targetSocketId={deviceInfoTarget}
                    roomParticipants={roomParticipants}
                    localStats={netStats}
                    onBack={() => {
                      setActiveTab("player");
                      setDeviceInfoTarget(null);
                    }}
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
