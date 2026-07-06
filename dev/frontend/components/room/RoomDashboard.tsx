"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid, Music2, Radio, Users, ChevronUp, ChevronDown, Activity, Check
} from "lucide-react";
import { DevicesPane } from "./DevicesPane";
import { SpatialPanel } from "./SpatialPanel";
import { RoomVisualizer } from "./RoomVisualizer";
import { AudioEQ } from "./AudioEQ";
import { RoomQueue } from "./RoomQueue";
import { EmojiReactions } from "./EmojiReactions";
import { FullscreenPrompt } from "./FullscreenPrompt";
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
    trackTitle: string;
    trackUrl: string | null;
    error: string | null;
    downloadProgress: number;
    duration: number;
    volume: number;
    getRawAudioData: () => Uint8Array | null;
    eqGains: number[];
    setEqBand: (index: number, gain: number) => void;
    setVolume: (v: number | ((prev: number) => number)) => void;
    getVolume?: () => number;
    toggleMute?: () => number;
    unlockAudio: () => void;
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
  onLeave: () => void;
  onSetParticipantVolume?: (socketId: string, vol: number) => void;
  onAddSong?: () => void;
  spatialParticipants?: any[];
  spatialMode?: 'multiplayer' | '8d-solo';
  onSpatialModeChange?: (mode: 'multiplayer' | '8d-solo') => void;
}

type MobileTab = "spatial" | "playing" | "devices" | "queue";

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

export function RoomDashboard({
  roomId, snapshot, participants, spatialParticipants, spatialMode, onSpatialModeChange, mySocketId, isHost, hostId, myUserId,
  isPlaying, deviceSyncProgress, isPrivate, allow8DSolo, spatialDevices,
  onUpdateSpatialPosition, syncUIState, audio, orbitSpeed, onOrbitSpeedChange,
  onPlay, onPause, onNext, onPrev, onSeek, onTogglePrivate, onLeave,
  onSetParticipantVolume, onAddSong,
}: RoomDashboardProps) {
  const [mobileTab, setMobileTab] = useState<MobileTab>("playing");
  const [queueOpen, setQueueOpen] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);

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
  ];

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <FullscreenPrompt />
      {/* ── Desktop Layout (md+) ───────────────────────────────────────────── */}
      <div className="hidden md:flex flex-col flex-1 min-h-0 p-4 pt-20 gap-3">
        {/* Top 3-column row */}
        <div className="flex-1 min-h-0 flex gap-3">

          {/* Left: Devices */}
          <GlassCard className="w-72 shrink-0 p-4 flex flex-col min-h-0" isPlaying={isPlaying}>
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

          {/* Center: Spatial Audio */}
          <GlassCard className="flex-1 min-w-0 p-4 flex flex-col min-h-0" isPlaying={isPlaying}>
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

          {/* Right: Room Details + EQ + Visualizer */}
          <GlassCard className="w-80 shrink-0 flex flex-col min-h-0 p-3 gap-3" isPlaying={isPlaying}>
            
            {/* Room Details */}
            <div className="shrink-0 flex flex-col gap-2 bg-foreground/[0.02] p-2 rounded-xl border border-foreground/[0.05]">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-bold tracking-widest text-foreground/50 uppercase">Room Info</span>
                {isHost && onTogglePrivate && (
                  <button 
                    onClick={onTogglePrivate}
                    className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase transition-colors ${isPrivate ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}
                  >
                    {isPrivate ? 'Private' : 'Public'}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 bg-background/50 rounded-lg border border-foreground/10 px-2 py-1.5 flex justify-between items-center">
                  <span className="font-mono text-[10px] text-foreground/80 truncate">{roomId}</span>
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
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
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

            <div className="flex-[3] min-h-0 flex flex-col">
              <AudioEQ eqGains={audio.eqGains} setEqBand={audio.setEqBand} />
            </div>
            <div className="h-[1px] w-full bg-foreground/[0.05] shrink-0" />
            <div className="flex-[1] min-h-0 flex flex-col">
              <RoomVisualizer
                isPlaying={isPlaying}
                hasTrack={audio.hasTrack}
              />
            </div>
          </GlassCard>
        </div>

        {/* Bottom: Queue + Reactions */}
        <div className="flex gap-3 shrink-0">
          <GlassCard className="flex-1 min-w-0 p-4 flex flex-col min-h-0" style={{ height: "320px" } as any} isPlaying={isPlaying}>
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
          <GlassCard className="w-80 shrink-0 p-4 flex flex-col" style={{ height: "320px" } as any} isPlaying={isPlaying}>
            <div className="mb-2 shrink-0 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest font-black text-white/25">Chat & React</span>
            </div>
            <EmojiReactions roomId={roomId} />
          </GlassCard>
        </div>
      </div>

      {/* ── Mobile Layout ─────────────────────────────────────────────────── */}
      <div className="flex md:hidden flex-col flex-1 min-h-0 pb-20 pt-20">
        <AnimatePresence mode="wait">
          {mobileTab === "spatial" && (
            <motion.div key="spatial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 min-h-0 px-3">
              <GlassCard className="h-full p-4 flex flex-col min-h-0" isPlaying={isPlaying}>
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
              className="flex-1 min-h-0 px-3">
              <div className="h-full flex flex-col gap-3">
                <GlassCard className="flex-[3] p-5 flex flex-col min-h-0" isPlaying={isPlaying}>
                  <AudioEQ eqGains={audio.eqGains} setEqBand={audio.setEqBand} />
                </GlassCard>
                <GlassCard className="flex-[2] p-4 flex flex-col min-h-0" isPlaying={isPlaying}>
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
              className="flex-1 min-h-0 px-3">
              <GlassCard className="h-full p-4 flex flex-col min-h-0" isPlaying={isPlaying}>
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
              className="flex-1 min-h-0 px-3 flex flex-col gap-3">
              <GlassCard className="h-full p-4 flex flex-col min-h-0" isPlaying={isPlaying}>
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
              <GlassCard className="p-3 shrink-0">
                <EmojiReactions roomId={roomId} />
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Mobile Tab Bar ─────────────────────────────────────────────────── */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 bg-background/85 backdrop-blur-[20px] border-t border-foreground/10"
        style={{
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {mobileTabs.map(tab => {
          const Icon = tab.icon;
          const active = mobileTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className="flex flex-col items-center gap-1 pt-3 px-4 transition-all"
            >
              <Icon className={`w-5 h-5 transition-colors ${active ? "text-foreground" : "text-foreground/30"}`} />
              <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${
                active ? "text-foreground" : "text-foreground/20"
              }`}>
                {tab.label}
              </span>
              {active && (
                <motion.div
                  layoutId="mobileTabIndicator"
                  className="absolute bottom-0 w-8 h-0.5 rounded-full bg-foreground text-background"
                />
              )}
            </button>
          );
        })}
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
    </div>
  );
}
