"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "../../hooks/useSettings";
import { motion, AnimatePresence } from "framer-motion";
import { useBeatScheduler } from "../../hooks/useBeatScheduler";
import { cn } from "../../lib/utils";
import { extractTwoColorsFromImage, colorsToAmbientHues, getTrackThumbnailUrl } from "../../lib/colorExtractor";
import {
  LayoutGrid, Music2, Radio, Users, ChevronUp, ChevronDown, Activity, Check, UserPlus, Settings, Lightbulb, User, MessageSquare, X, Plus, Clock, Copy, QrCode
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
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/15 backdrop-blur-[1px] pointer-events-auto"
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
          className="absolute inset-0 z-0 cursor-pointer pointer-events-auto"
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
  const [mobileTab, setMobileTab] = useState<MobileTab>("queue");
  const [desktopRightTab, setDesktopRightTab] = useState<"queue" | "chat">("queue");
  const [jumpingTrackId, setJumpingTrackId] = useState<string | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
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
      className="fixed inset-0 flex flex-col overflow-hidden select-none w-full h-full relative z-10" 
      style={{ 
        paddingTop: "max(env(safe-area-inset-top), 4px)", 
        paddingBottom: "max(env(safe-area-inset-bottom), 4px)" 
      }}
    >
      <FullscreenPrompt />
      {/* ── Desktop Layout (md+) ───────────────────────────────────────────── */}
      <div className="hidden md:flex flex-1 min-h-0 p-4 pt-20 gap-3">
        {/* Left Column: Devices (Full Height) */}
        <GlassCard className="w-80 shrink-0 p-4 flex flex-col min-h-0" isPlaying={isPlaying}>
          <DevicesPane
            participants={participants}
            mySocketId={mySocketId}
            hostId={hostId}
            myUserId={myUserId}
            isHost={isHost}
            deviceSyncProgress={deviceSyncProgress}
            onVolumeChange={onSetParticipantVolume}
          />
        </GlassCard>

        {/* Center Column: Spatial (Top) + EQ/Visualizer (Bottom) */}
        <div className="flex-1 flex flex-col min-w-0 gap-3 min-h-0">
          {/* Top: Spatial Audio */}
          <GlassCard className="flex-1 min-h-0 p-4 flex flex-col" isPlaying={isPlaying}>
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
          <GlassCard className="h-[260px] shrink-0 p-4 flex flex-col min-h-0" isPlaying={isPlaying}>
                  <AudioEQ eqGains={audio.eqGains} setEqBand={audio.setEqBand} setAllEqBands={audio.setAllEqBands} onOpenVisuals={() => setShowVisualsPanel(true)} />
          </GlassCard>
        </div>

      {/* Right Sidebar: Room Details + Queue */}
      <GlassCard className="w-80 shrink-0 flex flex-col min-h-0 p-3 gap-3" isPlaying={isPlaying}>
            
            {/* Room Details */}
            <div className="shrink-0 flex flex-col gap-2 bg-foreground/[0.02] p-2 rounded-xl border border-foreground/[0.05]">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-bold tracking-widest text-foreground/50 uppercase">Room Info</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button 
                    onClick={() => setShowJoinModal(true)}
                    className="text-[9px] px-2 py-0.5 flex items-center gap-1 rounded-full font-bold uppercase transition-colors bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 cursor-pointer border border-emerald-500/20 whitespace-nowrap shrink-0"
                    title="Join another room via Code Ring"
                  >
                    <Plus className="w-3 h-3 shrink-0" />
                    <span className="whitespace-nowrap">Join Room</span>
                  </button>
                  {isHost && (
                    <button 
                      onClick={handleTogglePrivate}
                      className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase transition-colors cursor-pointer whitespace-nowrap shrink-0 ${isPrivate ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}
                      title={isPrivate ? "Click to make room public" : "Click to make room private"}
                    >
                      {isPrivate ? 'Private' : 'Public'}
                    </button>
                  )}
                  <button 
                    onClick={openProfilePage}
                    className="text-[9px] px-2.5 py-0.5 flex items-center gap-1 rounded-full font-bold uppercase transition-colors bg-foreground/10 text-foreground/80 hover:bg-foreground/20 cursor-pointer whitespace-nowrap shrink-0"
                    title="View Profile"
                  >
                    <User className="w-3 h-3 shrink-0" />
                    <span className="whitespace-nowrap">Profile</span>
                  </button>
                  <ThemeToggle size="sm" />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 bg-background/50 rounded-lg border border-foreground/10 px-2 py-1.5 flex justify-between items-center">
                  <span className="font-mono text-[10px] text-foreground/80 truncate select-text cursor-text">{roomId}</span>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={async () => {
                        if (copied) return;
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
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        } catch (err) {
                          console.error("Failed to copy link.", err);
                        }
                      }}
                      className={`transition-colors p-1 rounded hover:bg-foreground/5 cursor-pointer ${copied ? "text-green-500" : "text-foreground/40 hover:text-foreground/80"}`}
                      title="Copy Invite Link"
                    >
                      {copied ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      )}
                    </button>
                    <button
                      onClick={() => setShowQR(true)}
                      className="p-1 rounded hover:bg-foreground/5 text-foreground/40 hover:text-foreground/80 transition-colors cursor-pointer"
                      title="Show QR Code"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                    </button>
                  </div>
                </div>
              </div>
              {/* Session Duration Pill — High Contrast */}
              <div className="flex items-center justify-between bg-foreground/[0.08] dark:bg-white/10 backdrop-blur-md rounded-xl border border-foreground/15 dark:border-white/20 px-2.5 py-1.5 mt-1 shadow-sm">
                <span className="text-[10px] font-extrabold text-foreground/80 dark:text-white/90 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  Session Time
                </span>
                <div className="flex items-center gap-1.5 font-mono text-[12px] font-extrabold text-foreground dark:text-white bg-foreground/10 dark:bg-white/15 px-2 py-0.5 rounded-lg border border-foreground/10 dark:border-white/15">
                  <Clock className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                  <span>{formattedSessionTime}</span>
                </div>
              </div>
            </div>

            {/* Desktop Right Sidebar Segment Selector */}
            <div className="flex items-center bg-foreground/5 p-1 rounded-xl border border-foreground/10 shrink-0">
              <button
                onClick={() => setDesktopRightTab("queue")}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                  desktopRightTab === "queue"
                    ? "bg-foreground text-background shadow-md"
                    : "text-foreground/60 hover:text-foreground"
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Queue ({queue.length})
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
                  "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 relative overflow-visible",
                  desktopRightTab === "chat"
                    ? "bg-foreground text-background shadow-md"
                    : unreadChatCount > 0
                      ? "text-pink-500 hover:text-pink-400 bg-pink-500/10 border border-pink-500/30"
                      : "text-foreground/60 hover:text-foreground"
                )}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat</span>
                {unreadChatCount > 0 && desktopRightTab !== "chat" && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: [1, 1.25, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 1 }}
                    className="ml-1 px-1.5 py-0.2 text-[10px] font-black bg-pink-500 text-white rounded-full shadow-sm"
                  >
                    {unreadChatCount}
                  </motion.span>
                )}
              </motion.button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col">
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
                  className="h-full w-full border-none shadow-none bg-transparent"
                />
              )}
            </div>
          </GlassCard>
      </div>

      {/* ── Mobile Layout ─────────────────────────────────────────────────── */}
      <div className="flex md:hidden flex-col flex-1 min-h-0 pt-16 pb-2 px-1">
        {/* Mobile Header — Clean 2-row layout to prevent button collisions */}
        <div className="flex flex-col gap-1.5 px-3 pb-2 border-b border-foreground/10 mb-2 shrink-0">
          {/* Row 1: Room Code, Session Time & Main Actions */}
          <div className="flex items-center justify-between gap-1.5">
            {/* Room Code & Copy/QR */}
            <div className="flex items-center gap-1 bg-foreground/5 border border-foreground/10 px-2 py-1 rounded-xl min-w-0">
              <span className="font-mono text-xs font-bold text-foreground/80 truncate">{roomId}</span>
              <button 
                onClick={async () => {
                  if (copied) return;
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
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch (err) {
                    console.error("Failed to copy link.", err);
                  }
                }}
                className={`transition-colors p-1 rounded-md ${copied ? "text-green-500 bg-green-500/10" : "text-foreground/50 hover:text-foreground active:bg-foreground/10"}`}
                title="Copy Invite Link"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </button>
              <button
                onClick={() => setShowQR(true)}
                className="p-1 rounded-md text-foreground/50 hover:text-foreground active:bg-foreground/10 transition-colors"
                title="Show QR Code"
              >
                <QrCode className="w-3 h-3" />
              </button>
            </div>

            {/* Live Session Time Badge — High Contrast */}
            <div className="flex items-center gap-1.5 bg-foreground/10 dark:bg-white/15 border border-foreground/15 dark:border-white/20 px-2.5 py-1 rounded-xl shrink-0 backdrop-blur-md shadow-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <Clock className="w-3 h-3 text-emerald-500 dark:text-emerald-400 shrink-0" />
              <span className="font-mono text-[11px] font-extrabold text-foreground dark:text-white tracking-wide">{formattedSessionTime}</span>
            </div>

            {/* Quick Actions (Theme & Profile) */}
            <div className="flex items-center gap-1 shrink-0">
              <ThemeToggle size="sm" />
              <button 
                onClick={openProfilePage}
                className="p-1.5 rounded-full bg-foreground/10 text-foreground/80 hover:bg-foreground/20 transition-colors"
                title="Profile"
              >
                <User className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Row 2: Room Privacy & Invite Action */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            {isHost ? (
              <button 
                onClick={handleTogglePrivate}
                className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider transition-colors ${isPrivate ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}
                title={isPrivate ? "Click to make room public" : "Click to make room private"}
              >
                {isPrivate ? 'Private' : 'Public'}
              </button>
            ) : <div />}

            {isHost && (
              <button 
                onClick={() => document.dispatchEvent(new CustomEvent("island:expand-invite"))}
                className="text-[9px] px-2.5 py-0.5 flex items-center gap-1 rounded-full font-bold uppercase tracking-wider transition-colors bg-blue-500/20 text-blue-400 border border-blue-500/30 active:scale-95"
              >
                <UserPlus className="w-3 h-3" />
                Invite
              </button>
            )}
          </div>
        </div>
        <AnimatePresence mode="wait">
          {mobileTab === "spatial" && (
            <motion.div key="spatial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 min-h-0 px-2 flex flex-col">
              <GlassCard className="h-full p-3 flex flex-col min-h-0" isPlaying={isPlaying}>
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
              className="flex-1 min-h-0 px-2 flex flex-col items-center justify-center">
              <div className="w-full max-w-md my-auto flex flex-col min-h-0">
                <GlassCard className="w-full h-[210px] sm:h-[240px] p-3 sm:p-4 flex flex-col min-h-0 shrink-0" isPlaying={isPlaying}>
                      <AudioEQ eqGains={audio.eqGains} setEqBand={audio.setEqBand} setAllEqBands={audio.setAllEqBands} onOpenVisuals={() => setShowVisualsPanel(true)} />
                </GlassCard>
              </div>
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
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm cursor-pointer"
          onClick={() => setShowQR(false)}
        >
          <div className="bg-background border border-foreground/10 p-6 rounded-3xl shadow-2xl text-center" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold uppercase tracking-widest text-foreground/50 mb-4">Room QR Code</h3>
            <div className="bg-white p-4 rounded-xl mb-4">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`} alt="QR Code" width={200} height={200} />
            </div>
            <p className="text-xs text-foreground/40 font-mono mb-4">{roomId}</p>
            <button 
              className="px-6 py-2 bg-foreground/10 hover:bg-foreground/20 rounded-full text-xs font-bold transition-colors"
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
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none"
          >
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-background/90 dark:bg-black/90 backdrop-blur-xl border border-foreground/15 shadow-2xl text-xs font-semibold text-foreground">
              <span
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  activityNotification.type === "join" ? "bg-emerald-500 animate-pulse" : "bg-foreground/40"
                )}
              />
              <span className="truncate max-w-xs">{activityNotification.text}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Signature Circular Join Modal */}
      <JoinRoomModal isOpen={showJoinModal} onClose={() => setShowJoinModal(false)} />
    </div>
  );
}
