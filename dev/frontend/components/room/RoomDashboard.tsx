"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid, Music2, Radio, Users, ChevronUp, ChevronDown, Activity
} from "lucide-react";
import { DevicesPane } from "./DevicesPane";
import { SpatialPanel } from "./SpatialPanel";
import { RoomVisualizer } from "./RoomVisualizer";
import { AudioEQ } from "./AudioEQ";
import { RoomQueue } from "./RoomQueue";
import { EmojiReactions } from "./EmojiReactions";
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

  // Spatial
  spatialDevices: DeviceSpatialState[];
  onUpdateSpatialPosition: (deviceId: string, pos: { angle: number; radius: number; elevation: number }) => void;

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
  orbitData?: {fromId: string, toId: string, frac: number} | null;
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
}

type MobileTab = "spatial" | "playing" | "devices" | "queue";

// Glass card wrapper
function GlassCard({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-3xl border border-white/[0.07] backdrop-blur-2xl ${className}`}
      style={{
        background: "rgba(255,255,255,0.025)",
        boxShadow: "0 4px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function RoomDashboard({
  roomId, snapshot, participants, mySocketId, isHost, hostId, myUserId,
  isPlaying, deviceSyncProgress, isPrivate, spatialDevices,
  onUpdateSpatialPosition, audio, orbitSpeed, orbitData, onOrbitSpeedChange,
  onPlay, onPause, onNext, onPrev, onSeek, onTogglePrivate, onLeave,
  onSetParticipantVolume, onAddSong,
}: RoomDashboardProps) {
  const [mobileTab, setMobileTab] = useState<MobileTab>("playing");
  const [queueOpen, setQueueOpen] = useState(false);

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

  const mobileTabs: { id: MobileTab; icon: React.ComponentType<any>; label: string }[] = [
    { id: "spatial", icon: Radio, label: "Spatial" },
    { id: "playing", icon: Activity, label: "Visualizer" },
    { id: "devices", icon: Users, label: "Devices" },
    { id: "queue", icon: LayoutGrid, label: "Queue" },
  ];

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* ── Desktop Layout (md+) ───────────────────────────────────────────── */}
      <div className="hidden md:flex flex-col flex-1 min-h-0 p-4 pt-20 gap-3">
        {/* Top 3-column row */}
        <div className="flex-1 min-h-0 flex gap-3">

          {/* Left: Devices */}
          <GlassCard className="w-72 shrink-0 p-4 flex flex-col min-h-0">
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
          <GlassCard className="flex-1 min-w-0 p-4 flex flex-col min-h-0">
            <SpatialPanel
              myDeviceId={mySocketId ?? ""}
              spatialDevices={spatialDevices}
              participants={participants}
              isPlaying={isPlaying}
              onUpdatePosition={onUpdateSpatialPosition}
              orbitSpeed={orbitSpeed}
              orbitData={orbitData}
              onOrbitSpeedChange={onOrbitSpeedChange}
            />
          </GlassCard>

          {/* Right: EQ + Visualizer */}
          <GlassCard className="w-80 shrink-0 flex flex-col min-h-0 p-4 gap-4">
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
          <GlassCard className="flex-1 min-w-0 p-4 flex flex-col min-h-0" style={{ height: "320px" } as any}>
            <RoomQueue
              queue={queue}
              isHost={isHost}
              roomId={roomId}
              isPlaying={audio.isPlaying}
              onTrackSelect={handleTrackSelect}
              onAddSong={onAddSong}
              onRemoveTrack={id => roomsApi.removeFromQueue(roomId, id).catch(console.error)}
            />
          </GlassCard>
          <GlassCard className="w-80 shrink-0 p-4 flex flex-col" style={{ height: "320px" } as any}>
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
              <GlassCard className="h-full p-4">
                <SpatialPanel
                  myDeviceId={mySocketId ?? ""}
                  spatialDevices={spatialDevices}
                  participants={participants}
                  isPlaying={isPlaying}
                  onUpdatePosition={onUpdateSpatialPosition}
                  orbitSpeed={orbitSpeed}
                  orbitData={orbitData}
                  onOrbitSpeedChange={onOrbitSpeedChange}
                />
              </GlassCard>
            </motion.div>
          )}
          {mobileTab === "playing" && (
            <motion.div key="playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 min-h-0 px-3">
              <div className="h-full flex flex-col gap-3">
                <GlassCard className="flex-[3] p-5 flex flex-col min-h-0">
                  <AudioEQ eqGains={audio.eqGains} setEqBand={audio.setEqBand} />
                </GlassCard>
                <GlassCard className="flex-[2] p-4 flex flex-col min-h-0">
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
              <GlassCard className="h-full p-4">
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
              <GlassCard className="h-full p-4 flex flex-col min-h-0">
                <RoomQueue
                  queue={queue}
                  isHost={isHost}
                  roomId={roomId}
                  isPlaying={audio.isPlaying}
                  onTrackSelect={handleTrackSelect}
                  onAddSong={onAddSong}
                  onRemoveTrack={id => roomsApi.removeFromQueue(roomId, id).catch(console.error)}
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
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2"
        style={{
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          background: "rgba(9,9,11,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
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
              <Icon className={`w-5 h-5 transition-colors ${active ? "text-foreground" : "text-white/30"}`} />
              <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${
                active ? "text-foreground" : "text-white/20"
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
    </div>
  );
}
