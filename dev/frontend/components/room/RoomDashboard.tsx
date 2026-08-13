"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "../../hooks/useSettings";
import { motion, AnimatePresence } from "framer-motion";
import { useBeatScheduler } from "../../hooks/useBeatScheduler";
import { cn } from "../../lib/utils";
import { extractTwoColorsFromImage, colorsToAmbientHues, getTrackThumbnailUrl } from "../../lib/colorExtractor";
import {
  LayoutGrid, Music2, Radio, Users, ChevronUp, ChevronDown, Activity, Check, UserPlus, LogIn, Settings, Lightbulb, User, MessageSquare, X, Plus, Clock, Copy, Link2, QrCode, Disc3, SkipBack, SkipForward, Play, Pause
} from "lucide-react";
import { DevicesPane } from "./DevicesPane";
import { SpatialPanel } from "./SpatialPanel";
import { AudioEQ } from "./AudioEQ";
import { RoomQueue } from "./RoomQueue";
import { RoomChat } from "./RoomChat";
import { EmojiReactions } from "./EmojiReactions";
import { FullscreenPrompt } from "./FullscreenPrompt";
import { MobileRadialNavigator } from "./MobileRadialNavigator";
import { SettingsPanel } from "../SettingsPanel";
import { ThemeToggle } from "../ThemeToggle";
import { JoinRoomModal } from "../JoinRoomModal";
import { HoverExpandPill } from "../HoverExpandPill";
import type { RoomSnapshot, Participant, DeviceSpatialState } from "../../lib/types";
import { roomsApi } from "../../lib/api";
import { getSocket } from "../../lib/socket";

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
  allow8DSolo: boolean;

  // Spatial
  spatialDevices: DeviceSpatialState[];
  onUpdateSpatialPosition: (deviceId: string, pos: { angle: number; radius: number; elevation: number }) => void;
  syncUIState?: (listenerCart: {x: number, y: number, z: number}, offsets: Map<string, {fanX: number, fanY: number}>) => void;

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

  // Orbit speed
  orbitSpeed?: number;
  onOrbitSpeedChange?: (speed: number) => void;

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
  spatialParticipants?: any[];
  spatialMode?: 'multiplayer' | '8d-solo';
  onSpatialModeChange?: (mode: 'multiplayer' | '8d-solo') => void;
}

type MobileTab = "spatial" | "playing" | "devices" | "queue" | "chat";

// Glass card wrapper
function GlassCard({ children, className = "", style, isPlaying }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; isPlaying?: boolean }) {
  return (
    <div
      className={`rounded-3xl border border-foreground/[0.07] backdrop-blur-2xl transition-opacity duration-700 bg-foreground/5 ${className}`}
      style={{
        boxShadow: "0 4px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(128,128,128,0.06)",
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

  return (
    <AnimatePresence>
      <div
        ref={backdropRef}
        className={cn('fixed', 'inset-0', 'z-[9999]', 'flex', 'items-center', 'justify-center', 'p-4', 'bg-black/15', 'backdrop-blur-[1px]', 'pointer-events-auto')}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: isVisualsInteracting ? 0.98 : 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 15 }}
          transition={{ type: "spring", damping: 24, stiffness: 220 }}
          className={cn(
            "w-full max-w-2xl md:max-w-3xl h-[85vh] md:h-[82vh] max-h-[780px] p-6 flex flex-col shadow-[0_32px_64px_rgba(0,0,0,0.5)] rounded-[32px] relative z-10 pointer-events-auto overflow-hidden transition-all duration-300 border",
            isVisualsInteracting
              ? "bg-background/5 dark:bg-black/10 backdrop-blur-[2px] border-foreground/5 dark:border-white/5 opacity-25 scale-95"
              : "bg-background/90 dark:bg-black/85 backdrop-blur-2xl border-foreground/[0.08] dark:border-white/10"
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
          className={cn('absolute', 'inset-0', 'z-0', 'cursor-pointer', 'pointer-events-auto')}
          onClick={onClose}
        />
      </div>
    </AnimatePresence>
  );
}

export function RoomDashboard({
  roomId, snapshot, participants, spatialParticipants, spatialMode, onSpatialModeChange, mySocketId, isHost, hostId, myUserId,
  isPlaying, deviceSyncProgress, isPrivate, allow8DSolo, spatialDevices,
  onUpdateSpatialPosition, syncUIState, audio, orbitSpeed, onOrbitSpeedChange,
  onPlay, onPause, onNext, onPrev, onSeek, onTogglePrivate, onLeave,
  onSetParticipantVolume, onAddSong,
}: RoomDashboardProps) {
  const router = useRouter();
  const { settings, updateSettings } = useSettings();
  const [showVisualsPanel, setShowVisualsPanel] = useState(false);
  const openProfilePage = useCallback(() => router.push('/profile'), [router]);
  const [isVisualsInteracting, setIsVisualsInteracting] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("playing");
  const [desktopRightTab, setDesktopRightTab] = useState<"queue" | "chat">("queue");
  const [jumpingTrackId, setJumpingTrackId] = useState<string | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
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
  const isRoomReady = (participants ?? []).every(p => p.isReady);

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
  const [showJoinModal, setShowJoinModal] = useState(false);

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

  const lastExtractedTrackRef = useRef<string | null>(null);

  // Dynamically extract colors from album artwork when active track changes
  // NOTE: Use only STABLE primitives in deps — avoid object refs (audio, currentQueueItem)
  // which change on every render and cause constant re-fires (glitch).
  const audioCoverUrl = audio.coverUrl;
  const audioTrackTitle = audio.trackTitle;
  const currentTrackId = currentQueueItem?.id ?? null;
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
    getSocket().emit("room:toggleShuffle", { roomId, shuffle: true });
  }, [roomId]);

  const toggleRepeat = useCallback(() => {
    const current = snapshot?.repeatMode ?? "off";
    const next = current === "off" ? "all" : current === "all" ? "track" : "off";
    getSocket().emit("room:toggleRepeat", { roomId, repeatMode: next });
  }, [roomId, snapshot?.repeatMode]);

  return (
    <div 
      className={cn('fixed', 'inset-0', 'flex', 'flex-col', 'overflow-hidden', 'select-none', 'w-full', 'h-full', 'relative', 'z-10')} 
      style={{ 
        paddingTop: "max(env(safe-area-inset-top), 4px)", 
        paddingBottom: "max(env(safe-area-inset-bottom), 4px)" 
      }}
    >
      <FullscreenPrompt />
      {/* ── Desktop Layout (md+) ───────────────────────────────────────────── */}
      <div className={cn('hidden', 'md:flex', 'flex-1', 'min-h-0', 'p-4', 'pt-20', 'gap-3')}>
        {/* Left Column: Devices (Full Height) */}
        <GlassCard className={cn('w-80', 'shrink-0', 'p-4', 'flex', 'flex-col', 'min-h-0')} isPlaying={isPlaying}>
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

        {/* Center Column: Spatial (Top) + EQ/Visualizer (Bottom) */}
        <div className={cn('flex-1', 'flex', 'flex-col', 'min-w-0', 'gap-3', 'min-h-0')}>
          {/* Top: Spatial Audio */}
          <GlassCard className={cn('flex-1', 'min-h-0', 'p-4', 'flex', 'flex-col')} isPlaying={isPlaying}>
            <SpatialPanel
              myDeviceId={mySocketId ?? ""}
              spatialDevices={spatialDevices}
              participants={spatialParticipants ?? participants}
              myUserId={myUserId ?? mySocketId ?? ""}
              isPlaying={isPlaying}
              onUpdatePosition={onUpdateSpatialPosition}
              syncUIState={syncUIState}
              roomId={roomId}
              orbitSpeed={orbitSpeed}
              onOrbitSpeedChange={onOrbitSpeedChange}
              spatialMode={spatialMode}
              onSpatialModeChange={onSpatialModeChange}
              allow8DSolo={allow8DSolo}
            />
          </GlassCard>

          {/* Bottom: EQ (visualizer is integrated inside EQ component) */}
          <GlassCard className={cn('h-[260px]', 'shrink-0', 'p-4', 'flex', 'flex-col', 'min-h-0')} isPlaying={isPlaying}>
                  <AudioEQ eqGains={audio.eqGains} setEqBand={audio.setEqBand} setAllEqBands={audio.setAllEqBands} onOpenVisuals={() => setShowVisualsPanel(true)} />
          </GlassCard>
        </div>

      {/* Right Sidebar: Room Details + Queue */}
      <GlassCard className={cn('w-80', 'shrink-0', 'flex', 'flex-col', 'min-h-0', 'p-3', 'gap-3')} isPlaying={isPlaying}>
            
            {/* Room Details Header — Ultra Clean 2-Row Card */}
            <div className={cn('shrink-0', 'flex', 'flex-col', 'gap-2.5', 'bg-foreground/[0.03]', 'p-2.5', 'rounded-2xl', 'border', 'border-foreground/[0.08]')}>
              {/* Row 1: Room Code + Copy/QR on left, Privacy Status on right */}
              <div className={cn('flex', 'items-center', 'justify-between', 'gap-2')}>
                <div className="flex items-center gap-1 bg-foreground/5 border border-foreground/10 p-1 rounded-xl">
                  <span className="font-mono text-xs font-bold text-foreground/90 px-1 select-text cursor-text">
                    {roomId}
                  </span>
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
                        console.error("Failed to copy room code.", err);
                      }
                    }}
                    className={`p-1 rounded-lg transition-colors cursor-pointer ${copied ? "text-emerald-400 bg-emerald-500/10" : "text-foreground/50 hover:text-foreground active:bg-foreground/10"}`}
                    title="Copy 6-Digit Room Code"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  {/* Copy Link URL */}
                  <button 
                    onClick={async () => {
                      if (copiedLink) return;
                      const link = typeof window !== 'undefined' ? window.location.href : roomId;
                      try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                          await navigator.clipboard.writeText(link);
                        } else {
                          const textArea = document.createElement("textarea");
                          textArea.value = link;
                          document.body.appendChild(textArea);
                          textArea.select();
                          document.execCommand("copy");
                          document.body.removeChild(textArea);
                        }
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      } catch (err) {
                        console.error("Failed to copy link.", err);
                      }
                    }}
                    className={`p-1 rounded-lg transition-colors cursor-pointer ${copiedLink ? "text-blue-400 bg-blue-500/10" : "text-foreground/50 hover:text-foreground active:bg-foreground/10"}`}
                    title="Copy Room Link URL"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-blue-400" /> : <Link2 className="w-3.5 h-3.5" />}
                  </button>
                  {/* QR Code */}
                  <button
                    onClick={() => setShowQR(true)}
                    className="p-1 rounded-lg text-foreground/50 hover:text-foreground active:bg-foreground/10 transition-colors cursor-pointer"
                    title="Show QR Code"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Privacy Badge */}
                {isHost ? (
                  <button 
                    onClick={handleTogglePrivate}
                    className={`text-[9px] font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer hover:opacity-80 px-2 py-1 rounded-xl shrink-0 ${isPrivate ? 'text-red-400 bg-red-500/10 border border-red-500/20' : 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'}`}
                    title={isPrivate ? "Click to make room public" : "Click to make room private"}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isPrivate ? 'bg-red-400' : 'bg-emerald-400 animate-pulse'}`} />
                    <span>{isPrivate ? 'PRIVATE' : 'PUBLIC'}</span>
                  </button>
                ) : (
                  <div className={cn('flex', 'items-center', 'gap-1', 'text-[9px]', 'font-mono', 'font-bold', 'text-emerald-400', 'bg-emerald-500/10', 'px-2', 'py-1', 'rounded-xl', 'border', 'border-emerald-500/20')}>
                    <span className={cn('w-1.5', 'h-1.5', 'rounded-full', 'bg-emerald-400', 'animate-pulse')} />
                    <span>PUBLIC</span>
                  </div>
                )}
              </div>

              {/* Row 2: Live Session Time on left, Ghost Actions on right */}
              <div className={cn('flex', 'items-center', 'justify-between', 'gap-2', 'pt-1', 'border-t', 'border-foreground/5')}>
                <div className={cn('flex', 'items-center', 'gap-1.5', 'text-xs', 'font-mono', 'font-extrabold', 'text-foreground/80')}>
                  <Clock className={cn('w-3.5', 'h-3.5', 'text-emerald-400', 'shrink-0')} />
                  <span>{formattedSessionTime}</span>
                </div>

                <div className={cn('flex', 'items-center', 'gap-1', 'shrink-0')}>
                  {/* <HoverExpandPill
                    icon={UserPlus}
                    label="Invite"
                    onClick={() => document.dispatchEvent(new CustomEvent("island:expand-invite"))}
                    active
                    activeColor="bg-blue-500/10 text-blue-400 border-blue-500/25"
                    title="Invite Friends"
                  /> */}
                  <HoverExpandPill
                    icon={LogIn}
                    label="Join Room"
                    onClick={() => setShowJoinModal(true)}
                    title="Join Room via Code"
                  />
                  <HoverExpandPill
                    icon={User}
                    label="Profile"
                    onClick={openProfilePage}
                    title="View Profile"
                  />
                  <ThemeToggle size="sm" />
                </div>
              </div>
            </div>

            {/* Desktop Right Sidebar Segment Selector */}
            <div className={cn('flex', 'items-center', 'bg-foreground/5', 'p-1', 'rounded-xl', 'border', 'border-foreground/10', 'shrink-0', 'relative')}>
              <button
                onClick={() => setDesktopRightTab("queue")}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 relative z-10 cursor-pointer",
                  desktopRightTab === "queue"
                    ? "text-background"
                    : "text-foreground/60 hover:text-foreground"
                )}
              >
                {desktopRightTab === "queue" && (
                  <motion.div
                    layoutId="desktopRightTabPill"
                    transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.8 }}
                    className={cn('absolute', 'inset-0', 'bg-foreground', 'rounded-lg', 'shadow-md', '-z-10')}
                  />
                )}
                <LayoutGrid className={cn('w-3.5', 'h-3.5', 'relative', 'z-10')} />
                <span className={cn('relative', 'z-10')}>Queue ({queue.length})</span>
              </button>
              <motion.button
                onClick={() => {
                  setDesktopRightTab("chat");
                  setUnreadChatCount(0);
                }}
                animate={unreadChatCount > 0 && desktopRightTab !== "chat" ? {
                  rotate: [0, -10, 10, -8, 8, -4, 4, 0],
                  scale: [1, 1.1, 0.96, 1.06, 1],
                  transition: { duration: 0.75, repeat: Infinity, repeatDelay: 2 }
                } : { rotate: 0, scale: 1 }}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 relative overflow-visible cursor-pointer z-10",
                  desktopRightTab === "chat"
                    ? "text-background"
                    : unreadChatCount > 0
                      ? "text-pink-500 hover:text-pink-400 bg-pink-500/10 border border-pink-500/30"
                      : "text-foreground/60 hover:text-foreground"
                )}
              >
                {desktopRightTab === "chat" && (
                  <motion.div
                    layoutId="desktopRightTabPill"
                    transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.8 }}
                    className={cn('absolute', 'inset-0', 'bg-foreground', 'rounded-lg', 'shadow-md', '-z-10')}
                  />
                )}
                <MessageSquare className={cn('w-3.5', 'h-3.5', 'relative', 'z-10')} />
                <span className={cn('relative', 'z-10')}>Chat</span>
                {unreadChatCount > 0 && desktopRightTab !== "chat" && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: [1, 1.25, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 1 }}
                    className={cn('ml-1', 'px-1.5', 'py-0.2', 'text-[10px]', 'font-black', 'bg-pink-500', 'text-white', 'rounded-full', 'shadow-sm', 'relative', 'z-10')}
                  >
                    {unreadChatCount}
                  </motion.span>
                )}
              </motion.button>
            </div>

            <div className={cn('flex-1', 'min-h-0', 'flex', 'flex-col')}>
              {desktopRightTab === "queue" ? (
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
                  className={cn('h-full', 'w-full', 'border-none', 'shadow-none', 'bg-transparent')}
                />
              )}
            </div>
          </GlassCard>
      </div>

      {/* ── Mobile Layout ─────────────────────────────────────────────────── */}
      <div className={cn('flex', 'md:hidden', 'flex-col', 'flex-1', 'min-h-0', 'pt-16', 'pb-2', 'px-1')}>
        {/* Mobile Header — Single Sleek Unified Bar */}
        <div className={cn('flex', 'items-center', 'justify-between', 'gap-2', 'px-3', 'pb-2', 'border-b', 'border-foreground/10', 'mb-2', 'shrink-0', 'z-30')}>
          {/* Left: Room Code & Telemetry Privacy */}
          <div className={cn('flex', 'items-center', 'gap-2', 'min-w-0')}>
            <div className="flex items-center gap-1 bg-foreground/5 border border-foreground/10 px-2 py-1 rounded-xl shrink-0">
              <span className="font-mono text-xs font-bold text-foreground/80">{roomId}</span>
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
                className={`transition-colors p-1 rounded-md ${copied ? "text-emerald-400 bg-emerald-500/10" : "text-foreground/50 hover:text-foreground active:bg-foreground/10"}`}
                title="Copy 6-Digit Room Code"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
              {/* Copy Link URL */}
              <button 
                onClick={async () => {
                  if (copiedLink) return;
                  const link = typeof window !== 'undefined' ? window.location.href : roomId;
                  try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      await navigator.clipboard.writeText(link);
                    } else {
                      const textArea = document.createElement("textarea");
                      textArea.value = link;
                      document.body.appendChild(textArea);
                      textArea.select();
                      document.execCommand("copy");
                      document.body.removeChild(textArea);
                    }
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  } catch (err) {
                    console.error("Failed to copy link.", err);
                  }
                }}
                className={`transition-colors p-1 rounded-md ${copiedLink ? "text-blue-400 bg-blue-500/10" : "text-foreground/50 hover:text-foreground active:bg-foreground/10"}`}
                title="Copy Room Link URL"
              >
                {copiedLink ? <Check className="w-3 h-3 text-blue-400" /> : <Link2 className="w-3 h-3" />}
              </button>
              {/* QR Code */}
              <button
                onClick={() => setShowQR(true)}
                className="p-1 rounded-md text-foreground/50 hover:text-foreground active:bg-foreground/10 transition-colors"
                title="Show QR Code"
              >
                <QrCode className="w-3 h-3" />
              </button>
            </div>

            {isHost && (
              <button 
                onClick={handleTogglePrivate}
                className={`text-[10px] font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer hover:opacity-80 shrink-0 ${isPrivate ? 'text-red-400' : 'text-emerald-400'}`}
                title={isPrivate ? "Click to make room public" : "Click to make room private"}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isPrivate ? 'bg-red-400' : 'bg-emerald-400 animate-pulse'}`} />
                <span className={cn('hidden', 'xs:inline')}>{isPrivate ? 'PRIVATE' : 'PUBLIC'}</span>
              </button>
            )}
          </div>

          {/* Right: Timer & Hover-Expand Ghost Actions (Invite, Join, Theme, Profile) */}
          <div className={cn('flex', 'items-center', 'gap-1.5', 'shrink-0')}>
            <div className={cn('flex', 'items-center', 'gap-1', 'font-mono', 'text-[10px]', 'sm:text-xs', 'font-bold', 'text-foreground/70', 'bg-foreground/5', 'px-2', 'py-1', 'rounded-lg', 'border', 'border-foreground/10')}>
              <Clock className={cn('w-3', 'h-3', 'text-emerald-400', 'shrink-0')} />
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

            <HoverExpandPill
              icon={LogIn}
              label="Join"
              onClick={() => setShowJoinModal(true)}
              title="Join Room"
            />

            <ThemeToggle size="sm" />
            
            <HoverExpandPill
              icon={User}
              label="Profile"
              onClick={openProfilePage}
              title="Profile"
            />
          </div>
        </div>
        <AnimatePresence mode="wait">
          {mobileTab === "spatial" && (
            <motion.div key="spatial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={cn('flex-1', 'min-h-0', 'px-2', 'flex', 'flex-col')}>
              <GlassCard className={cn('h-full', 'p-3', 'flex', 'flex-col', 'min-h-0')} isPlaying={isPlaying}>
                <SpatialPanel
                  myDeviceId={mySocketId ?? ""}
                  spatialDevices={spatialDevices}
                  participants={participants}
                  myUserId={myUserId ?? mySocketId ?? ""}
                  isPlaying={isPlaying}
                  onUpdatePosition={onUpdateSpatialPosition}
                  syncUIState={syncUIState}
                  roomId={roomId}
                  orbitSpeed={orbitSpeed}
                  onOrbitSpeedChange={onOrbitSpeedChange}
                  spatialMode={spatialMode}
                  onSpatialModeChange={onSpatialModeChange}
                  allow8DSolo={allow8DSolo}
                />
              </GlassCard>
            </motion.div>
          )}
          {mobileTab === "playing" && (
            <motion.div key="playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={cn('flex-1', 'min-h-0', 'px-2', 'flex', 'flex-col', 'justify-between', 'py-1', 'gap-2')}>
              
              {/* Top Hero Stage: Spinning Vinyl Record Player & Track Info */}
              <GlassCard className={cn('w-full', 'flex-1', 'min-h-0', 'p-3', 'sm:p-4', 'flex', 'flex-col', 'items-center', 'justify-between', 'relative', 'overflow-hidden', 'group')} isPlaying={isPlaying}>
                {/* Subtle Ambient Glow Aura */}
                <div className={cn('absolute', 'inset-0', 'bg-gradient-to-b', 'from-purple-500/10', 'via-transparent', 'to-emerald-500/10', 'pointer-events-none')} />

                {/* Spinning Vinyl Disc */}
                <div className={cn('relative', 'flex', 'items-center', 'justify-center', 'my-auto')}>
                  {isPlaying && (
                    <>
                      <div className={cn('absolute', 'w-40', 'h-40', 'sm:w-48', 'sm:h-48', 'rounded-full', 'border', 'border-emerald-500/20', 'animate-ping', 'pointer-events-none')} />
                      <div className={cn('absolute', 'w-48', 'h-48', 'sm:w-56', 'sm:h-56', 'rounded-full', 'border', 'border-purple-500/15', 'animate-[pulse_3s_ease-in-out_infinite]', 'pointer-events-none')} />
                    </>
                  )}

                  <div className={cn(
                    "w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-zinc-950 border-4 border-zinc-800/80 shadow-[0_15px_40px_rgba(0,0,0,0.6)] flex items-center justify-center relative overflow-hidden transition-all duration-700",
                    isPlaying ? "animate-[spin_20s_linear_infinite]" : "scale-95 opacity-80"
                  )}>
                    <div className={cn('absolute', 'inset-2', 'rounded-full', 'border', 'border-zinc-800/60', 'pointer-events-none')} />
                    <div className={cn('absolute', 'inset-5', 'rounded-full', 'border', 'border-zinc-800/40', 'pointer-events-none')} />
                    <div className={cn('absolute', 'inset-8', 'rounded-full', 'border', 'border-zinc-800/30', 'pointer-events-none')} />

                    <div className={cn('w-14', 'h-14', 'sm:w-18', 'sm:h-18', 'rounded-full', 'overflow-hidden', 'border-2', 'border-zinc-900', 'shadow-inner', 'relative', 'z-10')}>
                      {currentThumbnail ? (
                        <img src={currentThumbnail} alt="Album Art" className={cn('w-full', 'h-full', 'object-cover')} />
                      ) : (
                        <div className={cn('w-full', 'h-full', 'bg-gradient-to-tr', 'from-purple-600', 'to-indigo-600', 'flex', 'items-center', 'justify-center')}>
                          <Disc3 className={cn('w-7', 'h-7', 'text-white', 'animate-spin')} />
                        </div>
                      )}
                    </div>
                    
                    <div className={cn('w-2.5', 'h-2.5', 'rounded-full', 'bg-zinc-900', 'border', 'border-zinc-700', 'absolute', 'z-20', 'pointer-events-none')} />
                  </div>
                </div>

                {/* Track Title & Artist */}
                <div className={cn('w-full', 'text-center', 'space-y-0.5', 'z-10', 'mt-1')}>
                  <h3 className={cn('text-xs', 'sm:text-sm', 'font-black', 'tracking-tight', 'text-foreground', 'truncate', 'px-2')}>
                    {currentQueueItem?.title || audioTrackTitle || "SyncBeats Session"}
                  </h3>
                  <p className={cn('text-[10px]', 'sm:text-xs', 'font-semibold', 'text-foreground/50', 'truncate')}>
                    {currentQueueItem?.artist || "Live Stream"}
                  </p>
                </div>

                {/* Interactive Seek Bar & Duration */}
                <div className={cn('w-full', 'space-y-1', 'px-3', 'sm:px-6', 'z-10', 'pt-1')}>
                  {(() => {
                    const dur = audio.duration && audio.duration > 0 ? audio.duration : 1;
                    const cur = audio.currentTime || 0;
                    const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
                    return (
                      <div className={cn('relative', 'flex', 'items-center', 'group/seek', 'cursor-pointer')}>
                        <input
                          type="range"
                          min={0}
                          max={dur}
                          step={0.1}
                          value={cur}
                          onChange={(e) => onSeek?.(parseFloat(e.target.value))}
                          style={{
                            background: `linear-gradient(to right, #34d399 0%, #34d399 ${pct}%, rgba(255, 255, 255, 0.15) ${pct}%, rgba(255, 255, 255, 0.15) 100%)`
                          }}
                          className={cn('w-full', 'h-1.5', 'rounded-full', 'appearance-none', 'outline-none', 'cursor-pointer', '[&::-webkit-slider-thumb]:appearance-none', '[&::-webkit-slider-thumb]:w-3.5', '[&::-webkit-slider-thumb]:h-3.5', '[&::-webkit-slider-thumb]:rounded-full', '[&::-webkit-slider-thumb]:bg-emerald-400', '[&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(52,211,153,0.9)]')}
                        />
                      </div>
                    );
                  })()}
                  <div className={cn('flex', 'items-center', 'justify-between', 'text-[9px]', 'font-mono', 'font-bold', 'text-foreground/60', 'px-0.5')}>
                    <span>
                      {(() => {
                        const cur = audio.currentTime || 0;
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
                <div className={cn('w-full', 'flex', 'items-center', 'justify-center', 'gap-5', 'z-10', 'pt-1')}>
                  <button onClick={onPrev} className={cn('p-2', 'rounded-full', 'bg-foreground/5', 'hover:bg-foreground/15', 'text-foreground/80', 'active:scale-95', 'transition-all')}>
                    <SkipBack className={cn('w-3.5', 'h-3.5')} />
                  </button>
                  <button onClick={isPlaying ? onPause : onPlay} className={cn('p-3', 'rounded-full', 'bg-foreground', 'text-background', 'shadow-lg', 'hover:scale-105', 'active:scale-95', 'transition-all')}>
                    {isPlaying ? <Pause className={cn('w-4', 'h-4', 'fill-background')} /> : <Play className={cn('w-4', 'h-4', 'fill-background', 'ml-0.5')} />}
                  </button>
                  <button onClick={onNext} className={cn('p-2', 'rounded-full', 'bg-foreground/5', 'hover:bg-foreground/15', 'text-foreground/80', 'active:scale-95', 'transition-all')}>
                    <SkipForward className={cn('w-3.5', 'h-3.5')} />
                  </button>
                </div>
              </GlassCard>

              {/* Bottom Section: Equalizer & Frequency Visualizer */}
              <GlassCard className={cn('w-full', 'h-[180px]', 'sm:h-[210px]', 'p-3', 'sm:p-4', 'flex', 'flex-col', 'min-h-0', 'shrink-0')} isPlaying={isPlaying}>
                <AudioEQ eqGains={audio.eqGains} setEqBand={audio.setEqBand} setAllEqBands={audio.setAllEqBands} onOpenVisuals={() => setShowVisualsPanel(true)} />
              </GlassCard>
            </motion.div>
          )}
          {mobileTab === "devices" && (
            <motion.div key="devices" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={cn('flex-1', 'min-h-0', 'px-2', 'flex', 'flex-col')}>
              <GlassCard className={cn('h-full', 'p-3', 'flex', 'flex-col', 'min-h-0')} isPlaying={isPlaying}>
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
              className={cn('flex-1', 'min-h-0', 'px-2', 'flex', 'flex-col')}>
              <GlassCard className={cn('flex-1', 'min-h-0', 'p-3', 'flex', 'flex-col')} isPlaying={isPlaying}>
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
          {mobileTab === "chat" && (
            <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={cn('flex-1', 'min-h-0', 'px-2', 'flex', 'flex-col')}>
              <RoomChat
                roomId={roomId}
                mySocketId={mySocketId}
                myUserId={myUserId}
                participants={participants}
                className={cn('h-full', 'w-full')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Magnetic Semi-Circle Mobile Navigator ────────────────────── */}
      <MobileRadialNavigator
        activeTab={mobileTab}
        onSelectTab={setMobileTab}
        onOpenJoinModal={() => setShowJoinModal(true)}
        onLeaveRoom={onLeave || (() => { if (typeof window !== "undefined") window.location.href = "/"; })}
      />

      {showQR && (
        <div 
          className={cn('fixed', 'inset-0', 'z-[9999]', 'flex', 'items-center', 'justify-center', 'bg-black/50', 'backdrop-blur-sm', 'cursor-pointer')}
          onClick={() => setShowQR(false)}
        >
          <div className={cn('bg-background', 'border', 'border-foreground/10', 'p-6', 'rounded-3xl', 'shadow-2xl', 'text-center')} onClick={e => e.stopPropagation()}>
            <h3 className={cn('text-sm', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50', 'mb-4')}>Room QR Code</h3>
            <div className={cn('bg-white', 'p-4', 'rounded-xl', 'mb-4')}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`} alt="QR Code" width={200} height={200} />
            </div>
            <p className={cn('text-xs', 'text-foreground/40', 'font-mono', 'mb-4')}>{roomId}</p>
            <button 
              className={cn('px-6', 'py-2', 'bg-foreground/10', 'hover:bg-foreground/20', 'rounded-full', 'text-xs', 'font-bold', 'transition-colors')}
              onClick={() => setShowQR(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showVisualsPanel && (
        <VisualsModal
          onClose={() => setShowVisualsPanel(false)}
          isVisualsInteracting={isVisualsInteracting}
          setIsVisualsInteracting={setIsVisualsInteracting}
        />
      )}

      {/* Sleek, Minimal Room Activity Notification Pill (No Emojis, No Toasts) */}
      <AnimatePresence>
        {activityNotification && (
          <motion.div
            key={activityNotification.id}
            initial={{ opacity: 0, y: -24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className={cn('fixed', 'top-20', 'left-1/2', '-translate-x-1/2', 'z-[9999]', 'pointer-events-none')}
          >
            <div className={cn('flex', 'items-center', 'gap-2.5', 'px-4', 'py-2', 'rounded-full', 'bg-background/90', 'dark:bg-black/90', 'backdrop-blur-xl', 'border', 'border-foreground/15', 'shadow-2xl', 'text-xs', 'font-semibold', 'text-foreground')}>
              <span
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  activityNotification.type === "join" ? "bg-emerald-500 animate-pulse" : "bg-foreground/40"
                )}
              />
              <span className={cn('truncate', 'max-w-xs')}>{activityNotification.text}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Signature Circular Join Modal */}
      <JoinRoomModal isOpen={showJoinModal} onClose={() => setShowJoinModal(false)} />
    </div>
  );
}
