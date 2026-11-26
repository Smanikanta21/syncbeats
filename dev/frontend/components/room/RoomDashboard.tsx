"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { useBeatScheduler } from "../../hooks/useBeatScheduler";
import { cn } from "../../lib/utils";
import { getTrackThumbnailUrl } from "../../lib/colorExtractor";
import {
  Check, Clock, Copy, Disc3, SkipBack, SkipForward, Play, Pause, Menu
} from "lucide-react";
import { DevicesPane } from "./DevicesPane";
import { RoomConnectionPanel } from "./RoomConnectionPanel";
import { RoomSideRail } from "./RoomSideRail";
import { AudioEQ } from "./AudioEQ";
import { AmbientModeControl } from "./AmbientModeControl";
import { RoomQueue } from "./RoomQueue";
import { RoomChat } from "./RoomChat";
import { RoomReactions } from "./RoomReactions";
import { FullscreenPrompt } from "./FullscreenPrompt";
import { SpatialAudioModule } from "./SpatialAudioModule";

import { useSettings } from "../../hooks/useSettings";
import { SettingsPanel } from "../settings";

import { MobileDrawerMenu } from "./MobileDrawerMenu";
import type { RoomSnapshot, Participant } from "../../lib/types";
import { roomsApi } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { QRCode } from 'react-qrcode-logo';
import { QRScannerModal } from './QRScannerModal';

interface RoomDashboardProps {
  roomId: string;
  snapshot: RoomSnapshot | null;
  participants: Participant[];
  mySocketId: string | null;
  isHost: boolean;
  hostId: string | null;
  myUserId?: string;
  isPlaying: boolean;
  deviceSyncProgress: Record<string, number>;
  isPrivate: boolean;

  // Playback
  audio: {
    isPlaying: boolean;
    isReady: boolean;
    hasTrack: boolean;
    trackTitle: string | null;
    trackArtist?: string | null;
    coverUrl?: string | null;
    trackUrl?: string | null;
    error?: string | null;
    downloadProgress?: number;
    duration?: number;
    currentTime?: number;
    volume?: number;
    isMuted?: boolean;
    audioUnlocked?: boolean;
    [key: string]: any;
  };

  // Actions
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (secs: number) => void;
  onTogglePrivate?: () => void;
  onLeave?: () => void;
  onSetParticipantVolume?: (socketId: string, vol: number) => void;
  onAddSong?: () => void;

  // Pluggable Spatial Audio (componentized)
  spatialSlot?: React.ReactNode;
  showSpatialAudio?: boolean;
}

type MobileTab = "spatial" | "playing" | "devices" | "queue" | "chat" | "connection";

// Glass card wrapper
function GlassCard({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; isPlaying?: boolean }) {
  return (
    <div
      // Translucent, not opaque: the fluid field behind is the room's colour.
      // Depth comes from the shared glass tokens so light and dark themes both
      // get the right shadow instead of one hard-coded rgba(0,0,0,.15).
      className={`rounded-3xl border border-foreground/10 backdrop-blur-2xl bg-foreground/5 ${className}`}
      style={{
        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.12), var(--glass-shadow)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// VisualsModal: separate component so useEffect + useRef can attach non-passive
// capture-phase wheel/touch listeners that block Lenis from ever seeing them.
function VisualsModal({
  isVisualsInteracting,
  setIsVisualsInteracting,
  onClose,
}: {
  isVisualsInteracting: boolean;
  setIsVisualsInteracting: (v: boolean) => void;
  onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = backdropRef.current;
    if (!el) return;

    // Prevent scrolling behind modal on mobile/touch devices
    const block = (e: TouchEvent | WheelEvent) => {
      e.stopPropagation();
    };

    el.addEventListener("wheel", block, { capture: true, passive: false });
    el.addEventListener("touchmove", block, { capture: true, passive: false });

    return () => {
      el.removeEventListener("wheel", block, { capture: true });
      el.removeEventListener("touchmove", block, { capture: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      ref={backdropRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'fixed inset-0 z-9999 flex items-center justify-center p-0 sm:p-4 pointer-events-auto transition-colors duration-300',
        // While dragging light nodes the panel fades out — clear the scrim too so
        // the user can actually see the room lighting they're adjusting.
        isVisualsInteracting ? 'bg-black/10' : 'bg-black/50 backdrop-blur-sm'
      )}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 15 }}
        animate={{ opacity: isVisualsInteracting ? 0.25 : 1, scale: isVisualsInteracting ? 0.96 : 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 15 }}
        transition={{ type: "spring", damping: 24, stiffness: 220 }}
        className={cn(
          "w-full max-w-2xl md:max-w-3xl h-dvh sm:h-[85vh] md:h-[82vh] max-h-none sm:max-h-195 px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-[calc(env(safe-area-inset-bottom,0px)+14px)] sm:p-6 flex flex-col shadow-[0_32px_64px_rgba(0,0,0,0.5)] rounded-none sm:rounded-4xl relative z-10 pointer-events-auto overflow-hidden transition-colors duration-300 border-0 sm:border",
          isVisualsInteracting
            ? "bg-background/5 dark:bg-black/10 backdrop-blur-[2px] border-foreground/5 dark:border-white/5"
            : "bg-background dark:bg-black border-foreground/8 dark:border-white/10"
        )}
      >
        <SettingsPanel
          onClose={onClose}
          onlyVisuals={true}
          onInteractionStateChange={setIsVisualsInteracting}
        />
      </motion.div>
      {/* Click outside to close */}
      <div
        className="absolute inset-0 z-0 cursor-pointer pointer-events-auto"
        onClick={onClose}
      />
    </motion.div>
  );
}

export function RoomDashboard({
  roomId, snapshot, participants, mySocketId, isHost, hostId, myUserId,
  isPlaying, deviceSyncProgress, isPrivate,
  spatialSlot, showSpatialAudio = false,
  audio,
  onPlay, onPause, onNext, onPrev, onSeek, onTogglePrivate,
  onSetParticipantVolume, onAddSong,
}: RoomDashboardProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const { settings } = useSettings();
  const isSidebarRight = settings.sidebarPosition === "right";
  const [showVisualsPanel, setShowVisualsPanel] = useState(false);
  const openProfilePage = useCallback(() => router.push('/profile'), [router]);
  const [isVisualsInteracting, setIsVisualsInteracting] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("playing");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [desktopRightTab, setDesktopRightTab] = useState<"devices" | "queue" | "chat" | "connection">("devices");
  const [jumpingTrackId, setJumpingTrackId] = useState<string | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [copied, setCopied] = useState(false);

  const [seekValue, setSeekValue] = useState<number | null>(null);

  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSeekValue(parseFloat(e.target.value));
  }, []);

  const handleSeekCommit = useCallback((e: React.SyntheticEvent<HTMLInputElement>) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    onSeek?.(val);
    // Give the server time to sync back the new time before releasing the local thumb
    setTimeout(() => setSeekValue(null), 800);
  }, [onSeek]);

  // Effect to close sub-menus when clicking outside
  const [copiedLink, setCopiedLink] = useState(false);
  const [activityNotification, setActivityNotification] = useState<{ id: number; text: string; type: "join" | "leave" } | null>(null);

  // Listen for room join/leave activity to display clean floating activity pill (no toasts, no emojis)
  useEffect(() => {
    const handleActivity = (e: CustomEvent<{ type: "join" | "leave"; displayName: string }>) => {
      const { type, displayName } = e.detail || {};
      if (!displayName) return;

      const nameParts = displayName.split("::");
      const userName = nameParts[0]?.trim() || "Someone";
      const deviceName = nameParts.length > 1 ? nameParts[1]?.trim() : undefined;

      const actionText = type === "join" ? "joined the room" : "left the room";
      const text = deviceName ? `${userName} (${deviceName}) ${actionText}` : `${userName} ${actionText}`;

      const id = Date.now();
      setActivityNotification({ id, text, type });

      setTimeout(() => {
        setActivityNotification((curr) => (curr?.id === id ? null : curr));
      }, 3500);
    };

    window.addEventListener("syncbeats:room-activity" as any, handleActivity as any);
    return () => window.removeEventListener("syncbeats:room-activity" as any, handleActivity as any);
  }, []);

  // Clear unread chat count when chat tab becomes active
  useEffect(() => {
    if (desktopRightTab === "chat" || mobileTab === "chat") {
      setUnreadChatCount(0);
    }
  }, [desktopRightTab, mobileTab]);

  // Listen for incoming chat messages to increment unread counter & wobble
  useEffect(() => {
    const socket = getSocket();
    const handleIncomingChat = (msg: { socketId?: string; userId?: string }) => {
      const isFromMe = (mySocketId && msg.socketId === mySocketId) || (myUserId && msg.userId === myUserId);
      if (!isFromMe) {
        setUnreadChatCount((prev) => prev + 1);
      }
    };

    socket.on("room:chat", handleIncomingChat);
    return () => {
      socket.off("room:chat", handleIncomingChat);
    };
  }, [mySocketId, myUserId]);

  const queue = snapshot?.queue ?? [];
  const currentQueueItem = queue.find(q => q.isCurrent) ?? null;

  useBeatScheduler(currentQueueItem?.trackUrl);
  // Live Session Uptime State (updates every second when room is active)
  const initialSessionSec = (() => {
    if (snapshot?.accumulatedSessionTime !== undefined && snapshot.accumulatedSessionTime > 0) {
      return snapshot.accumulatedSessionTime;
    }
    if (snapshot?.sessionDurationMs !== undefined && snapshot.sessionDurationMs > 0) {
      return Math.floor(snapshot.sessionDurationMs / 1000);
    }
    if (snapshot?.createdAt) {
      const createdMs = typeof snapshot.createdAt === 'number' ? snapshot.createdAt : new Date(snapshot.createdAt).getTime();
      if (!isNaN(createdMs) && createdMs > 0) {
        return Math.max(0, Math.floor((Date.now() - createdMs) / 1000));
      }
    }
    return 0;
  })();

  const [liveSessionSec, setLiveSessionSec] = useState(initialSessionSec);

  const accumTime = snapshot?.accumulatedSessionTime;
  const sessDurationMs = snapshot?.sessionDurationMs;
  const createdAt = snapshot?.createdAt;

  useEffect(() => {
    if (accumTime !== undefined && accumTime > 0) {
      setLiveSessionSec(accumTime);
    } else if (sessDurationMs !== undefined && sessDurationMs > 0) {
      setLiveSessionSec(Math.floor(sessDurationMs / 1000));
    } else if (createdAt) {
      const createdMs = typeof createdAt === 'number' ? createdAt : new Date(createdAt).getTime();
      if (!isNaN(createdMs) && createdMs > 0) {
        setLiveSessionSec(Math.max(0, Math.floor((Date.now() - createdMs) / 1000)));
      }
    }
  }, [accumTime, sessDurationMs, createdAt]);

  useEffect(() => {
    if (!snapshot || (participants ?? []).length === 0) return;
    const interval = setInterval(() => {
      setLiveSessionSec(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [snapshot, participants?.length]);

  const formattedSessionTime = (() => {
    const hrs = Math.floor(liveSessionSec / 3600);
    const mins = Math.floor((liveSessionSec % 3600) / 60);
    const secs = liveSessionSec % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    return `${pad(mins)}:${pad(secs)}`;
  })();

  // Dynamically extract colors from album artwork when active track changes
  // NOTE: Use only STABLE primitives in deps — avoid object refs (audio, currentQueueItem)
  // which change on every render and cause constant re-fires (glitch).
  const audioCoverUrl = audio.coverUrl;
  const audioTrackTitle = audio.trackTitle;

  const currentThumbnail = currentQueueItem
    ? getTrackThumbnailUrl(currentQueueItem)
    : getTrackThumbnailUrl({ coverUrl: audioCoverUrl || undefined });

  // Clear jump loading state when the queue actually updates from server
  const prevQueueRef = useRef(queue);
  useEffect(() => {
    const prevCurrentId = prevQueueRef.current.find(q => q.isCurrent)?.id;
    const newCurrentId = queue.find(q => q.isCurrent)?.id;
    if (jumpingTrackId && (newCurrentId === jumpingTrackId || newCurrentId !== prevCurrentId)) {
      setJumpingTrackId(null);
    }
    prevQueueRef.current = queue;
  }, [queue, jumpingTrackId]);

  const handleTrackSelect = useCallback((item: typeof queue[0]) => {
    if (!isHost) return;
    setJumpingTrackId(item.id);
    getSocket().emit("playback:jumpTo", { roomId, trackId: item.id });
    // Safety timeout — clear loading state if server never responds
    setTimeout(() => setJumpingTrackId(null), 8000);
  }, [isHost, roomId]);

  const handleTogglePrivate = useCallback(() => {
    if (onTogglePrivate) {
      onTogglePrivate();
    } else {
      getSocket().emit("room:togglePrivate", { roomId, isPrivate: !isPrivate });
    }
  }, [roomId, isPrivate, onTogglePrivate]);

  const toggleShuffle = useCallback(() => {
    getSocket().emit("room:toggleShuffle", { roomId, shuffle: !snapshot?.shuffle });
  }, [roomId, snapshot?.shuffle]);

  const toggleRepeat = useCallback(() => {
    const current = snapshot?.repeatMode ?? "off";
    const next = current === "off" ? "all" : current === "all" ? "track" : "off";
    getSocket().emit("room:toggleRepeat", { roomId, repeatMode: next });
  }, [roomId, snapshot?.repeatMode]);

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden select-none w-full h-full relative z-10"
      style={{
        paddingTop: "max(calc(env(safe-area-inset-top, 0px) + 14px), 18px)",
        paddingBottom: "max(calc(env(safe-area-inset-bottom, 0px) + 12px), 16px)"
      }}
    >
      <FullscreenPrompt />
      {/* ── Desktop & Tablet Layout (md+) ────────────────────────────────── */}
      <div className="hidden md:flex flex-1 min-h-0 p-5 pt-18 gap-4">
        {/* Primary workspace: Stage & Controls */}
        <div className={cn("flex-1 flex flex-col min-w-0 gap-3 min-h-0", isSidebarRight ? "order-1" : "order-2")}>
          {/* Optional pluggable Spatial Audio slot */}
          {spatialSlot ? (
            <div className="shrink-0">{spatialSlot}</div>
          ) : showSpatialAudio ? (
            <div className="shrink-0">
              <SpatialAudioModule compact />
            </div>
          ) : null}

          {/* Equalizer, Ambient Visualizer & Synced Lyrics Stage */}
          <div className="shrink-0 rounded-2xl border border-foreground/10 bg-background/60 px-3 py-2 backdrop-blur-xl">
            <AmbientModeControl compact />
          </div>
          <GlassCard className="flex-1 min-h-0 p-4 flex flex-col" isPlaying={isPlaying}>
            <AudioEQ eqGains={audio.eqGains} setEqBand={audio.setEqBand} setAllEqBands={audio.setAllEqBands} onOpenVisuals={() => setShowVisualsPanel(true)} trackTitle={audio.trackTitle} trackArtist={audio.trackArtist} currentTime={audio.currentTime} duration={audio.duration} />
          </GlassCard>

          {/* Desktop Playback Controls */}
          <GlassCard className="shrink-0 px-5 py-3 hidden md:flex items-center justify-between gap-6" isPlaying={isPlaying}>
            <div className="flex items-center gap-4">
              <button onClick={onPrev} className="p-2.5 rounded-full bg-foreground/5 hover:bg-foreground/15 text-foreground/80 transition-all">
                <SkipBack className="w-4 h-4" />
              </button>
              <button onClick={isPlaying ? onPause : onPlay} className="p-3.5 rounded-full bg-foreground text-background shadow-lg hover:scale-105 transition-all">
                {isPlaying ? <Pause className="w-5 h-5 fill-background" /> : <Play className="w-5 h-5 fill-background ml-0.5" />}
              </button>
              <button onClick={onNext} className="p-2.5 rounded-full bg-foreground/5 hover:bg-foreground/15 text-foreground/80 transition-all">
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 flex items-center gap-4">
              <span className="tabular text-xs text-foreground/60 w-10 text-right">
                {(() => {
                  const cur = seekValue !== null ? seekValue : (audio.currentTime || 0);
                  const m = Math.floor(cur / 60);
                  const s = Math.floor(cur % 60);
                  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                })()}
              </span>
              <div className="flex-1 relative flex items-center">
                <input
                  type="range"
                  min={0}
                  max={audio.duration || 1}
                  step={0.1}
                  value={seekValue !== null ? seekValue : (audio.currentTime || 0)}
                  onChange={handleSeekChange}
                  onMouseUp={handleSeekCommit}
                  onTouchEnd={handleSeekCommit}
                  style={{
                    ['--pct' as string]: `${((seekValue !== null ? seekValue : (audio.currentTime || 0)) / (audio.duration || 1)) * 100}%`
                  }}
                  className="sb-range w-full h-1.5 rounded-full outline-none cursor-pointer"
                />
              </div>
              <span className="tabular text-xs text-foreground/60 w-10">
                {(() => {
                  const dur = audio.duration || 0;
                  const m = Math.floor(dur / 60);
                  const s = Math.floor(dur % 60);
                  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                })()}
              </span>
            </div>

            <div className="w-48 text-right truncate">
              <div className="text-sm font-bold truncate">{currentQueueItem?.title || audioTrackTitle || "SyncBeats Session"}</div>
              <div className="text-xs text-foreground/50 truncate">{currentQueueItem?.artist || "Live Stream"}</div>
            </div>
          </GlassCard>
        </div>

        {/* Desktop Sidebar: Room Details + Queue */}
        <RoomSideRail side={isSidebarRight ? "right" : "left"} tab={desktopRightTab} onTabChange={setDesktopRightTab} participants={participants} queueCount={queue.length} unreadCount={unreadChatCount}>
        <GlassCard className="w-full h-full flex flex-col min-h-0 p-3 gap-3 !border-0 !bg-transparent !shadow-none" isPlaying={isPlaying}>

          <div className="px-2 py-2 border-b border-foreground/10 shrink-0">
            <h2 className="text-sm font-semibold">{desktopRightTab === "devices" ? "Devices" : desktopRightTab === "queue" ? "Queue" : desktopRightTab === "connection" ? "Connection" : "Chat"}</h2>
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
              {desktopRightTab === "connection" ? (
              <RoomConnectionPanel roomId={roomId} isPrivate={isPrivate} isHost={isHost} onTogglePrivate={handleTogglePrivate} onShowQR={() => setShowQR(true)} onScanQR={() => setShowScanner(true)} />
            ) : desktopRightTab === "devices" ? (
              <DevicesPane
                participants={participants}
                mySocketId={mySocketId}
                hostId={hostId}
                myUserId={myUserId}
                isHost={isHost}
                isPlaying={isPlaying}
                deviceSyncProgress={deviceSyncProgress}
                onVolumeChange={onSetParticipantVolume}
              />
            ) : desktopRightTab === "queue" ? (
              <RoomQueue
                queue={queue}
                isHost={isHost}
                roomId={roomId}
                isPlaying={audio.isPlaying}
                onTrackSelect={handleTrackSelect}
                onAddSong={onAddSong}
                onRemoveTrack={id => roomsApi.removeFromQueue(roomId, id).catch(console.error)}
                shuffle={snapshot?.shuffle ?? false}
                repeatMode={snapshot?.repeatMode ?? "off"}
                onToggleShuffle={toggleShuffle}
                onToggleRepeat={toggleRepeat}
                jumpingTrackId={jumpingTrackId}
              />
            ) : (
              <RoomChat
                roomId={roomId}
                mySocketId={mySocketId}
                myUserId={myUserId}
                participants={participants}
                className="h-full w-full border-none shadow-none bg-transparent"
              />
            )}
          </div>
        </GlassCard>
        </RoomSideRail>
      </div>

      {/* Global Emoji Reactions Layer */}
      <RoomReactions />

      {/* ── Mobile Layout ─────────────────────────────────────────────────── */}
      <div className="flex md:hidden flex-col flex-1 min-h-0 pt-16 pb-2 px-2">
        {/* Mobile Header — Single Sleek Unified Bar */}
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-foreground/10 bg-background/60 px-2.5 py-2 mb-2 shrink-0 z-30 backdrop-blur-2xl">
          {/* Left: Hamburger & Room Code */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setIsMobileNavOpen(true)}
              aria-label="Open room menu"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/5 text-foreground/75 transition-colors hover:bg-foreground/10"
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex min-h-10 items-center gap-1 rounded-xl border border-foreground/10 bg-foreground/5 px-2">
              <span className="tabular px-1 text-xs font-semibold text-foreground/80">{roomId}</span>
              {/* Copy Code */}
              <button
                onClick={async () => {
                  if (copied) return;
                  try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      await navigator.clipboard.writeText(roomId);
                    } else {
                      const textArea = document.createElement("textarea");
                      textArea.value = roomId;
                      document.body.appendChild(textArea);
                      textArea.select();
                      document.execCommand("copy");
                      document.body.removeChild(textArea);
                    }
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch (err) {
                    console.error("Failed to copy code.", err);
                  }
                }}
                aria-label="Copy room code"
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${copied ? "text-ok-700 dark:text-ok-400 bg-ok-500/10" : "text-foreground/50 hover:text-foreground active:bg-foreground/10"}`}
                title="Copy 6-Digit Room Code"
              >
                {copied ? <Check className="w-3 h-3 text-ok-700 dark:text-ok-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>

            {isHost && (
              <button
                onClick={handleTogglePrivate}
                className={`text-[10px] font-semibold transition-all flex items-center gap-1 cursor-pointer hover:opacity-80 shrink-0 ${isPrivate ? 'text-bad-700 dark:text-bad-400' : 'text-ok-700 dark:text-ok-400'}`}
                title={isPrivate ? "Click to make room public" : "Click to make room private"}
              >
                <span className="hidden xs:inline">{isPrivate ? 'PRIVATE' : 'PUBLIC'}</span>
              </button>
            )}
          </div>

          {/* Keep the mobile header focused on the room code and session time. */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center gap-1 tabular text-[10px] sm:text-xs font-bold text-foreground/70 bg-foreground/5 px-2 py-1 rounded-lg border border-foreground/10">
              <Clock className="w-3 h-3 text-ok-700 dark:text-ok-400 shrink-0" />
              <span>{formattedSessionTime}</span>
            </div>

            {/* <HoverExpandPill
              icon={UserPlus}
              label="Invite"
              onClick={() => document.dispatchEvent(new CustomEvent("island:expand-invite"))}
              active
              activeColor="bg-blue-500/10 text-blue-400 border-blue-500/20"
              title="Invite Friends"
            /> */}

          </div>
        </div>
        <div className="mb-2 shrink-0 rounded-2xl border border-foreground/10 bg-background/60 px-3 py-2 backdrop-blur-xl">
          <AmbientModeControl compact />
        </div>
        <AnimatePresence mode="wait">
          {mobileTab === "spatial" && (
            <motion.div key="spatial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 min-h-0 px-2 flex flex-col">
              {spatialSlot || <SpatialAudioModule />}
            </motion.div>
          )}
          {mobileTab === "playing" && (
            <motion.div key="playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 min-h-0 px-2 grid grid-rows-[auto_minmax(0,1fr)] gap-2 py-1 landscape:grid-cols-2 landscape:grid-rows-1">


              {/* Compact player first; lyrics use the remaining reading space. */}
              <GlassCard className="w-full min-h-0 p-3 flex flex-col justify-center gap-1 relative overflow-x-hidden overflow-y-auto group" isPlaying={isPlaying}>
                {/* Subtle Ambient Glow Aura */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: `linear-gradient(to bottom, var(--accent-glow), transparent 45%, var(--accent-glow))`, opacity: 0.35 }}
                />

                <div className="flex w-full items-center gap-3 min-w-0 relative z-10">
                  <div className="w-11 h-11 shrink-0 rounded-full overflow-hidden border border-foreground/15 bg-foreground/5">
                    {currentThumbnail ? <img src={currentThumbnail} alt="" className="w-full h-full object-cover" /> :
                      <Disc3 className="w-full h-full p-2 text-foreground/60" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {currentQueueItem?.title || audioTrackTitle || "SyncBeats Session"}
                    </h3>
                    <p className="text-xs text-foreground/50 truncate">{currentQueueItem?.artist || "Live Stream"}</p>
                  </div>
                </div>

                {/* Interactive Seek Bar & Duration */}
                <div className="w-full space-y-1 px-3 sm:px-6 z-10 pt-1">
                  {(() => {
                    const dur = audio.duration && audio.duration > 0 ? audio.duration : 1;
                    const cur = seekValue !== null ? seekValue : (audio.currentTime || 0);
                    const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
                    return (
                      <div className="relative flex items-center group/seek cursor-pointer">
                        <input
                          type="range"
                          aria-label="Playback position"
                          min={0}
                          max={dur}
                          step={0.1}
                          value={cur}
                          onChange={handleSeekChange}
                          onMouseUp={handleSeekCommit}
                          onTouchEnd={handleSeekCommit}
                          style={{
                            ['--pct' as string]: `${pct}%`
                          }}
                          className="sb-range w-full h-1.5 rounded-full outline-none cursor-pointer"
                        />
                      </div>
                    );
                  })()}
                  <div className="flex items-center justify-between tabular text-[9px] font-bold text-foreground/60 px-0.5">
                    <span>
                      {(() => {
                        const cur = seekValue !== null ? seekValue : (audio.currentTime || 0);
                        const m = Math.floor(cur / 60);
                        const s = Math.floor(cur % 60);
                        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                      })()}
                    </span>
                    <span>
                      {(() => {
                        const dur = audio.duration || 0;
                        const m = Math.floor(dur / 60);
                        const s = Math.floor(dur % 60);
                        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                      })()}
                    </span>
                  </div>
                </div>

                {/* Playback Actions */}
                <div className="w-full flex items-center justify-center gap-5 z-10 pt-1 pb-1">
                  <button aria-label="Previous track" onClick={onPrev} className="min-w-11 min-h-11 flex items-center justify-center p-2 rounded-full bg-foreground/5 hover:bg-foreground/15 text-foreground/80 active:scale-95 transition-all">
                    <SkipBack className="w-3.5 h-3.5" />
                  </button>
                  <button aria-label={isPlaying ? "Pause" : "Play"} onClick={isPlaying ? onPause : onPlay} className="min-w-11 min-h-11 flex items-center justify-center p-3 rounded-full bg-foreground text-background shadow-lg hover:scale-105 active:scale-95 transition-all">
                    {isPlaying ? <Pause className="w-4 h-4 fill-background" /> : <Play className="w-4 h-4 fill-background ml-0.5" />}
                  </button>
                  <button aria-label="Next track" onClick={onNext} className="min-w-11 min-h-11 flex items-center justify-center p-2 rounded-full bg-foreground/5 hover:bg-foreground/15 text-foreground/80 active:scale-95 transition-all">
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                </div>
              </GlassCard>
              {/* Lyrics/EQ owns its scroll area and keeps the toolbar in view. */}
              <GlassCard className="w-full flex-1 min-h-0 p-3 sm:p-4 flex flex-col" isPlaying={isPlaying}>
                <AudioEQ eqGains={audio.eqGains} setEqBand={audio.setEqBand} setAllEqBands={audio.setAllEqBands} onOpenVisuals={() => setShowVisualsPanel(true)} trackTitle={audio.trackTitle} trackArtist={audio.trackArtist} currentTime={audio.currentTime} duration={audio.duration} />
              </GlassCard>
            </motion.div>
          )}
          {mobileTab === "devices" && (
            <motion.div key="devices" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 min-h-0 px-2 flex flex-col">
              <GlassCard className="h-full p-3 flex flex-col min-h-0" isPlaying={isPlaying}>
                <DevicesPane
                  participants={participants}
                  mySocketId={mySocketId}
                  hostId={hostId}
                  myUserId={myUserId}
                  isHost={isHost}
                  isPlaying={isPlaying}
                  deviceSyncProgress={deviceSyncProgress}
                  onVolumeChange={onSetParticipantVolume}
                />
              </GlassCard>
            </motion.div>
          )}
          {mobileTab === "queue" && (
            <motion.div key="queue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 min-h-0 px-2 flex flex-col">
              <GlassCard className="flex-1 min-h-0 p-3 flex flex-col" isPlaying={isPlaying}>
                <RoomQueue
                  queue={queue}
                  isHost={isHost}
                  roomId={roomId}
                  isPlaying={audio.isPlaying}
                  onTrackSelect={handleTrackSelect}
                  onAddSong={onAddSong}
                  onRemoveTrack={id => roomsApi.removeFromQueue(roomId, id).catch(console.error)}
                  shuffle={snapshot?.shuffle ?? false}
                  repeatMode={snapshot?.repeatMode ?? "off"}
                  onToggleShuffle={toggleShuffle}
                  onToggleRepeat={toggleRepeat}
                  jumpingTrackId={jumpingTrackId}
                />
              </GlassCard>
            </motion.div>
          )}
          {mobileTab === "connection" && <RoomConnectionPanel roomId={roomId} isPrivate={isPrivate} isHost={isHost} onTogglePrivate={handleTogglePrivate} onShowQR={() => setShowQR(true)} onScanQR={() => setShowScanner(true)} />}

          {mobileTab === "chat" && (
            <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 min-h-0 px-2 flex flex-col">
              <RoomChat
                roomId={roomId}
                mySocketId={mySocketId}
                myUserId={myUserId}
                participants={participants}
                className="h-full w-full"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Drawer Mobile Navigation Menu */}
        <MobileDrawerMenu
          isOpen={isMobileNavOpen}
          onClose={() => setIsMobileNavOpen(false)}
          activeTab={mobileTab}
          onChangeTab={setMobileTab}
          onShowQR={() => setShowQR(true)}
          onScanQR={() => setShowScanner(true)}
          onCopyLink={async () => {
            if (copiedLink) return;
            try {
              await navigator.clipboard.writeText(window.location.href);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            } catch (err) {
              console.error("Failed to copy room link.", err);
            }
          }}
          onProfile={openProfilePage}
          onLogout={logout}
          onGoToHub={() => router.push("/hub")}
          showSpatialTab={showSpatialAudio || !!spatialSlot}
        />
      </div>

      {showQR && (
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm cursor-pointer"
          onClick={() => setShowQR(false)}
        >
          <div className="glass-panel border border-foreground/10 p-8 rounded-4xl shadow-[0_0_50px_rgba(0,0,0,0.5)] text-center relative overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="absolute inset-0 bg-linear-to-br from-foreground/5 to-transparent pointer-events-none" />

            <h3 className="micro-label mb-6 relative z-10">Room QR code</h3>

            <div className="flex justify-center items-center mb-6 relative z-10 p-4 rounded-2xl bg-foreground/5 shadow-inner">
              <QRCode
                value={`${typeof window !== 'undefined' ? window.location.origin : 'https://syncbeats.in'}/room/${roomId}`}
                size={220}
                bgColor="#ffffff"
                fgColor="#000000"
                qrStyle="dots"
                eyeRadius={12}
                logoImage="/favicon.svg"
                logoWidth={50}
                logoHeight={50}
                logoPadding={5}
                logoPaddingStyle="circle"
              />
            </div>

            <p className="tabular text-sm text-foreground font-bold tracking-[0.3em] mb-6 relative z-10">{roomId}</p>
            <button
              className="px-6 py-2 bg-foreground/10 hover:bg-foreground/20 rounded-full text-xs font-bold transition-colors"
              onClick={() => setShowQR(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showScanner && (
        <QRScannerModal onClose={() => setShowScanner(false)} />
      )}

      <AnimatePresence>
        {showVisualsPanel && (
          <VisualsModal
            onClose={() => setShowVisualsPanel(false)}
            isVisualsInteracting={isVisualsInteracting}
            setIsVisualsInteracting={setIsVisualsInteracting}
          />
        )}
      </AnimatePresence>

      {/* Sleek, Minimal Room Activity Notification Pill (No Emojis, No Toasts) */}
      <AnimatePresence>
        {activityNotification && (
          <motion.div
            key={activityNotification.id}
            initial={{ opacity: 0, y: -24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-9999 pointer-events-none"
          >
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-background/90 dark:bg-black/90 backdrop-blur-xl border border-foreground/15 shadow-2xl text-xs font-semibold text-foreground">
              <span
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  activityNotification.type === "join" ? "bg-ok-500 animate-pulse" : "bg-foreground/40"
                )}
              />
              <span className="truncate max-w-xs">{activityNotification.text}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
