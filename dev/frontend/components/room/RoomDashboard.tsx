"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSettings } from "../../hooks/useSettings";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../../lib/utils";
import Link from "next/link";
import {
  LayoutGrid, Music2, Radio, Users, ChevronUp, ChevronDown, Activity, Check, UserPlus, Settings, Lightbulb, User, MessageSquare, X
} from "lucide-react";
import { DevicesPane } from "./DevicesPane";
import { SpatialPanel } from "./SpatialPanel";
import { RoomVisualizer } from "./RoomVisualizer";
import { AudioEQ } from "./AudioEQ";
import { RoomQueue } from "./RoomQueue";
import { RoomChat } from "./RoomChat";
import { EmojiReactions } from "./EmojiReactions";
import { FullscreenPrompt } from "./FullscreenPrompt";
import { SettingsPanel } from "../SettingsPanel";
import { ProfileModal } from "../ProfileModal";
import { ThemeToggle } from "../ThemeToggle";
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
            "w-full max-w-lg h-[80vh] p-6 flex flex-col shadow-[0_32px_64px_rgba(0,0,0,0.5)] rounded-[32px] relative z-10 pointer-events-auto overflow-hidden transition-all duration-300 border",
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
  const { settings, updateSettings } = useSettings();
  const [showVisualsPanel, setShowVisualsPanel] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  useEffect(() => {
    const handleOpenProfile = () => setShowProfileModal(true);
    window.addEventListener("open-profile-modal", handleOpenProfile);
    return () => window.removeEventListener("open-profile-modal", handleOpenProfile);
  }, []);
  const [isVisualsInteracting, setIsVisualsInteracting] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("playing");
  const [desktopRightTab, setDesktopRightTab] = useState<"queue" | "chat">("queue");
  const [queueOpen, setQueueOpen] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);

  // One-handed radial menu states
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [activeHoverId, setActiveHoverId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const holdTimeout = useRef<any>(null);

  const startHold = (e: React.TouchEvent | React.MouseEvent) => {
    if (holdTimeout.current) clearTimeout(holdTimeout.current);
    holdTimeout.current = setTimeout(() => {
      setIsHolding(true);
      setMenuOpen(true);
    }, 200);
  };

  const endHold = () => {
    if (holdTimeout.current) clearTimeout(holdTimeout.current);
    if (isHolding) {
      if (activeHoverId) {
        setMobileTab(activeHoverId as MobileTab);
      }
      setIsHolding(false);
      setMenuOpen(false);
      setActiveHoverId(null);
    } else {
      setMenuOpen(prev => !prev);
    }
  };

  // Mobile Touch Move Gesture
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!triggerRef.current) return;
    const touch = e.touches[0];
    const rect = triggerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const dx = touch.clientX - centerX;
    const dy = touch.clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 35) {
      if (e.cancelable) e.preventDefault();
      setIsHolding(true);
      setMenuOpen(true);
      let angle = Math.atan2(dy, dx) * (180 / Math.PI);
      if (angle < 0) angle += 360;

      // Radial positions relative to bottom-right trigger (180 deg to 270 deg)
      if (angle >= 265 || angle < 10) {
        setActiveHoverId("chat");
      } else if (angle >= 242.5 && angle < 265) {
        setActiveHoverId("queue");
      } else if (angle >= 220 && angle < 242.5) {
        setActiveHoverId("devices");
      } else if (angle >= 195 && angle < 220) {
        setActiveHoverId("playing");
      } else if (angle >= 135 && angle < 195) {
        setActiveHoverId("spatial");
      } else {
        setActiveHoverId(null);
      }
    } else {
      setActiveHoverId(null);
    }
  };

  // Desktop Mouse Drag Gesture Simulation
  useEffect(() => {
    if (!isHolding) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 35) {
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;

        if (angle >= 265 || angle < 10) {
          setActiveHoverId("chat");
        } else if (angle >= 242.5 && angle < 265) {
          setActiveHoverId("queue");
        } else if (angle >= 220 && angle < 242.5) {
          setActiveHoverId("devices");
        } else if (angle >= 195 && angle < 220) {
          setActiveHoverId("playing");
        } else if (angle >= 135 && angle < 195) {
          setActiveHoverId("spatial");
        } else {
          setActiveHoverId(null);
        }
      } else {
        setActiveHoverId(null);
      }
    };

    const handleMouseUp = () => {
      endHold();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isHolding, activeHoverId]);

  const positions = {
    spatial: { x: -105, y: 0 },
    playing: { x: -88, y: -45 },
    devices: { x: -55, y: -80 },
    queue: { x: -12, y: -98 },
    chat: { x: 30, y: -102 },
  };

  const queue = snapshot?.queue ?? [];
  const currentQueueItem = queue.find(q => q.isCurrent) ?? null;
  const isRoomReady = participants.every(p => p.isReady);


  const handleTrackSelect = useCallback((item: typeof queue[0]) => {
    if (!isHost) return;
    getSocket().emit("playback:jumpTo", { roomId, trackId: item.id });
  }, [isHost, roomId]);

  const handleTogglePrivate = useCallback(() => {
    if (!snapshot) return;
    getSocket().emit("room:setPrivate", { roomId, isPrivate: !isPrivate });
    onTogglePrivate?.();
  }, [snapshot, roomId, isPrivate, onTogglePrivate]);

  const toggleShuffle = useCallback(() => {
    // Always reshuffle instead of toggling off
    getSocket().emit("room:toggleShuffle", { roomId, shuffle: true });
  }, [roomId]);

  const toggleRepeat = useCallback(() => {
    const current = snapshot?.repeatMode ?? "off";
    const next = current === "off" ? "all" : current === "all" ? "track" : "off";
    getSocket().emit("room:toggleRepeat", { roomId, repeatMode: next });
  }, [roomId, snapshot?.repeatMode]);

  const mobileTabs: { id: MobileTab; icon: React.ComponentType<any>; label: string }[] = [
    { id: "spatial", icon: Radio, label: "Spatial" },
    { id: "playing", icon: Activity, label: "Visualizer" },
    { id: "devices", icon: Users, label: "Devices" },
    { id: "queue", icon: LayoutGrid, label: "Queue" },
    { id: "chat", icon: MessageSquare, label: "Chat" },
  ];

  return (
    <div 
      className="fixed inset-0 flex flex-col overflow-hidden select-none h-[100dvh]" 
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

          {/* Bottom: EQ + Visualizer */}
          <GlassCard className="h-[280px] shrink-0 p-4 flex flex-col min-h-0" isPlaying={isPlaying}>
            <div className="flex-[3] min-h-0 flex flex-col">
              <AudioEQ eqGains={audio.eqGains} setEqBand={audio.setEqBand} onOpenVisuals={() => setShowVisualsPanel(true)} />
            </div>
            <div className="h-[1px] w-full bg-foreground/[0.05] shrink-0 my-2" />
            <div className="flex-[1] min-h-0 flex flex-col">
              <RoomVisualizer
                isPlaying={isPlaying}
                hasTrack={audio.hasTrack}
              />
            </div>
          </GlassCard>
        </div>

      {/* Right Sidebar: Room Details + Queue */}
      <GlassCard className="w-80 shrink-0 flex flex-col min-h-0 p-3 gap-3" isPlaying={isPlaying}>
            
            {/* Room Details */}
            <div className="shrink-0 flex flex-col gap-2 bg-foreground/[0.02] p-2 rounded-xl border border-foreground/[0.05]">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-bold tracking-widest text-foreground/50 uppercase">Room Info</span>
                <div className="flex items-center gap-1.5">
                  {isHost && (
                    <button 
                      onClick={() => document.dispatchEvent(new CustomEvent("island:expand-invite"))}
                      className="text-[9px] px-2 py-0.5 flex items-center gap-1 rounded-full font-bold uppercase transition-colors bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                      title="Invite Friends"
                    >
                      <UserPlus className="w-3 h-3" />
                      Invite
                    </button>
                  )}
                  {isHost && onTogglePrivate && (
                    <button 
                      onClick={onTogglePrivate}
                      className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase transition-colors ${isPrivate ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}
                    >
                      {isPrivate ? 'Private' : 'Public'}
                    </button>
                  )}
                  <button 
                    onClick={() => setShowProfileModal(true)}
                    className="text-[9px] px-2.5 py-0.5 flex items-center gap-1 rounded-full font-bold uppercase transition-colors bg-foreground/10 text-foreground/80 hover:bg-foreground/20"
                    title="View Profile"
                  >
                    <User className="w-3 h-3" />
                    Profile
                  </button>
                  <ThemeToggle size="sm" />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 bg-background/50 rounded-lg border border-foreground/10 px-2 py-1.5 flex justify-between items-center">
                  <span className="font-mono text-[10px] text-foreground/80 truncate select-text cursor-text">{roomId}</span>
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
                    className={`${copied ? "text-green-500" : "text-foreground/40 hover:text-foreground"} transition-colors p-1 rounded-md hover:bg-foreground/5`}
                    title="Copy Invite Link"
                  >
                    {copied ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    )}
                  </button>
                </div>
                <button
                  className="p-1.5 bg-background/50 rounded-lg border border-foreground/10 text-foreground/60 hover:text-foreground transition-colors hover:bg-foreground/5"
                  onClick={() => setShowQR(true)}
                  title="Show QR Code"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                </button>
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
              <button
                onClick={() => setDesktopRightTab("chat")}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                  desktopRightTab === "chat"
                    ? "bg-foreground text-background shadow-md"
                    : "text-foreground/60 hover:text-foreground"
                )}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Chat
              </button>
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
      <div className="flex md:hidden flex-col flex-1 min-h-0 pt-14 pb-2 px-1">
        {/* Mobile Header */}
        <div className="flex items-center justify-between px-3 pb-2.5 border-b border-foreground/5 mb-2 shrink-0">
          <div className="flex flex-col">
            <span className="text-[8px] font-bold tracking-widest text-foreground/40 uppercase">Room Code</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-mono text-xs font-bold text-foreground/70">{roomId}</span>
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
                className={`transition-colors p-1.5 rounded-md bg-foreground/[0.03] border border-foreground/10 ${copied ? "text-green-500" : "text-foreground/50 active:text-foreground"}`}
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
                className="p-1.5 rounded-md bg-foreground/[0.03] border border-foreground/10 text-foreground/50 active:text-foreground transition-colors"
                title="Show QR Code"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isHost && (
              <button 
                onClick={() => document.dispatchEvent(new CustomEvent("island:expand-invite"))}
                className="text-[9px] px-2.5 py-1 flex items-center gap-1 rounded-full font-bold uppercase transition-colors bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
              >
                <UserPlus className="w-3 h-3" />
                Invite
              </button>
            )}
            <button 
              onClick={() => setShowProfileModal(true)}
              className="text-[9px] px-3 py-1 flex items-center gap-1 rounded-full font-bold uppercase transition-colors bg-foreground/10 text-foreground/80 hover:bg-foreground/20"
            >
              <User className="w-3 h-3" />
              Profile
            </button>
          </div>
        </div>
        <AnimatePresence mode="wait">
          {mobileTab === "spatial" && (
            <motion.div key="spatial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 min-h-0 px-2">
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
              className="flex-1 min-h-0 px-2">
              <div className="h-full flex flex-col gap-2 min-h-0">
                <GlassCard className="flex-[3] p-4 flex flex-col min-h-0" isPlaying={isPlaying}>
                  <AudioEQ eqGains={audio.eqGains} setEqBand={audio.setEqBand} onOpenVisuals={() => setShowVisualsPanel(true)} />
                </GlassCard>
                <GlassCard className="flex-[2] p-3 flex flex-col min-h-0" isPlaying={isPlaying}>
                  <RoomVisualizer
                    isPlaying={audio.isPlaying}
                    hasTrack={!!currentQueueItem}
                  />
                </GlassCard>
              </div>
            </motion.div>
          )}
          {mobileTab === "devices" && (
            <motion.div key="devices" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 min-h-0 px-2">
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
              className="flex-1 min-h-0 px-2 flex flex-col gap-2">
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
                />
              </GlassCard>
              <GlassCard className="p-2 shrink-0">
                <EmojiReactions roomId={roomId} />
              </GlassCard>
            </motion.div>
          )}
          {mobileTab === "chat" && (
            <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 min-h-0 px-2">
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

      {/* ── Mobile One-Handed Radial Menu ───────────────────────────────────── */}
      <div 
        className="md:hidden fixed z-[9999] w-14 h-14 select-none pointer-events-none"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          right: "16px"
        }}
      >
        <div className="absolute inset-0 pointer-events-auto flex items-center justify-center">
          <AnimatePresence>
            {menuOpen && mobileTabs.map((tab) => {
              const pos = positions[tab.id];
              const isHovered = activeHoverId === tab.id;
              const isActive = mobileTab === tab.id;
              const Icon = tab.icon;

              return (
                <motion.button
                  key={tab.id}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
                  animate={{ 
                    x: pos.x, 
                    y: pos.y, 
                    opacity: 1, 
                    scale: isHovered ? 1.25 : isActive ? 1.05 : 1,
                    backgroundColor: isHovered 
                      ? "rgba(255, 255, 255, 0.95)" 
                      : isActive 
                        ? "rgba(255, 255, 255, 0.85)" 
                        : "rgba(15, 23, 42, 0.75)"
                  }}
                  exit={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
                  transition={{ type: "spring", stiffness: 450, damping: 25 }}
                  className={cn(
                    "absolute w-11 h-11 rounded-full flex items-center justify-center shadow-lg border border-white/10 backdrop-blur-md transition-colors",
                    isHovered || isActive ? "text-slate-900" : "text-white"
                  )}
                  onClick={() => {
                    setMobileTab(tab.id);
                    setMenuOpen(false);
                  }}
                >
                  <Icon className="w-5 h-5" />
                  {isHovered && (
                    <motion.span 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: -24 }}
                      className="absolute text-[8px] font-black uppercase tracking-widest bg-black text-white px-2 py-0.5 rounded-full whitespace-nowrap shadow-md pointer-events-none"
                    >
                      {tab.label}
                    </motion.span>
                  )}
                </motion.button>
              );
            })}
          </AnimatePresence>

          <button
            ref={triggerRef}
            onTouchStart={startHold}
            onTouchEnd={endHold}
            onTouchMove={handleTouchMove}
            onMouseDown={startHold}
            onMouseUp={endHold}
            className={cn(
              "absolute rounded-full flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-white/10 cursor-pointer select-none",
              isHolding ? "scale-90 w-12 h-12" : "w-14 h-14"
            )}
            style={{
              background: "linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))",
              transition: "transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), width 0.15s, height 0.15s"
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {menuOpen ? (
                <motion.div
                  key="close-x"
                  initial={{ rotate: -90, scale: 0.7, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 1 }}
                  exit={{ rotate: 90, scale: 0.7, opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  <X className="w-6 h-6 text-white" />
                </motion.div>
              ) : (
                <motion.div
                  key="tab-icon"
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.7, opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  {mobileTab === "spatial" && <Radio className="w-6 h-6 text-white" />}
                  {mobileTab === "playing" && <Activity className="w-6 h-6 text-white" />}
                  {mobileTab === "devices" && <Users className="w-6 h-6 text-white" />}
                  {mobileTab === "queue" && <LayoutGrid className="w-6 h-6 text-white" />}
                  {mobileTab === "chat" && <MessageSquare className="w-6 h-6 text-white" />}
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

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
          isVisualsInteracting={isVisualsInteracting}
          setIsVisualsInteracting={setIsVisualsInteracting}
          onClose={() => setShowVisualsPanel(false)}
        />
      )}

      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </div>
  );
}
