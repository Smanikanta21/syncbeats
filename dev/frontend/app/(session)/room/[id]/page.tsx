"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Copy, Users, QrCode, Smartphone, Laptop, Speaker, Volume2, VolumeX, Wifi, WifiOff, CheckCircle2, Loader2, ListMusic, Trash2, Music2, Play, Plus, Lock, Unlock, ShieldAlert, BellRing, Crown, Search, Headphones, Bluetooth, Edit3, Radio, LogOut, Activity } from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRoom }   from "../../../../hooks/useRoom";
import { useAudio }  from "../../../../context/AudioContext";
import { useUpload } from "../../../../context/UploadContext";
import { PlaybackState, Participant, TrackQueueItem } from "../../../../lib/types";
import { useAuth }   from "../../../../context/AuthContext";
import { getAuthToken, getServerUrl } from "../../../../lib/api";
import { getSocket } from "../../../../lib/socket";
import { useSyncInfo } from "../../../../context/SyncContext";
import { useSpatialAudio } from "../../../../hooks/useSpatialAudio";
import { useWakeLock } from "../../../../hooks/useWakeLock";
import { OrbitUI } from "../../../../components/OrbitUI";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { SortableTrackItem } from "../../../../components/SortableTrackItem";

function DeviceIcon({ index, type }: { index: number, type?: string }) {
  if (type === 'bluetooth') return <Bluetooth className="w-3 h-3 text-foreground/60" />;
  if (type === 'headphones') return <Headphones className="w-3 h-3 text-foreground/60" />;
  
  const icons = [Smartphone, Laptop, Speaker];
  const Icon  = icons[index % icons.length];
  return <Icon className="w-3 h-3 text-foreground/60" />;
}

export default function RoomPage() {
  const params  = useParams();
  const router  = useRouter();
  const roomId  = (params?.id as string) ?? "000000";
  const { user, device } = useAuth();
  const participantName = user?.name ?? "Guest";
  const deviceName = device?.name ?? "Device";
  const displayName = `${participantName}::${deviceName}`;

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const audio  = useAudio();
  const upload = useUpload();
  const [copied, setCopied] = useState(false);
  const { snapshot, participants, isConnected, joinStatus, pendingRequests, togglePrivate, approveJoin, denyJoin, notifyHost, currentSocketId, clockOffset, allReady, setReady, setParticipantVolume, leave, incomingTrack } = useRoom({
    roomId,
    displayName,
    userId: user?.id,
  });
  // Show Audio Unlock overlay if the browser hasn't been unlocked via a user gesture yet
  const isLocalPlayBlocked = isConnected && !audio.audioUnlocked;
  const isHost = snapshot?.hostId === user?.id;
  const { setClockOffset: pushClockOffset, setIsRoomPlaying, setParticipants: pushParticipants, setPendingPlay: pushPendingPlay, setIncomingTrack: pushIncomingTrack, setPendingRequests: pushPendingRequests, setHostId: pushHostId, setJoinStatus: pushJoinStatus } = useSyncInfo();

  // Keep the screen awake while connected to a room or while audio is playing
  useWakeLock(isConnected || audio.isPlaying || (snapshot?.isPlaying ?? false));

  // Spatial Audio Integration
  const {
    updatePosition,
    spatialDevices
  } = useSpatialAudio({
    socket: getSocket(),
    audioCtx: audio.audioCtx,
    gainNode: audio.gainNode,
    myDeviceId: currentSocketId || "",
    roomId,
    participants,
    initialDevices: snapshot?.spatial || [],
    isPlaying: audio.isPlaying || (snapshot?.isPlaying ?? false)
  });

  // Push clock offset to shared context so DynamicIsland can access it
  useEffect(() => {
    pushClockOffset(clockOffset);
  }, [clockOffset, pushClockOffset]);

  // Push incomingTrack to shared context
  useEffect(() => {
    pushIncomingTrack(incomingTrack);
  }, [incomingTrack, pushIncomingTrack]);

  // Push pendingRequests to shared context
  useEffect(() => {
    pushPendingRequests(pendingRequests);
  }, [pendingRequests, pushPendingRequests]);

  // Push hostId to shared context
  useEffect(() => {
    pushHostId(snapshot?.hostId || null);
  }, [snapshot?.hostId, pushHostId]);

  // Push joinStatus to shared context
  useEffect(() => {
    pushJoinStatus(joinStatus);
  }, [joinStatus, pushJoinStatus]);

  // Listen for actions from DynamicIsland
  useEffect(() => {
    const handleApprove = (e: CustomEvent) => approveJoin(e.detail.socketId, e.detail.displayName);
    const handleDeny = (e: CustomEvent) => denyJoin(e.detail.socketId);
    
    document.addEventListener('room:action-approve', handleApprove as EventListener);
    document.addEventListener('room:action-deny', handleDeny as EventListener);
    
    return () => {
      document.removeEventListener('room:action-approve', handleApprove as EventListener);
      document.removeEventListener('room:action-deny', handleDeny as EventListener);
    };
  }, [approveJoin, denyJoin]);

  // Push server-side playing state so DynamicIsland shows correct button
  useEffect(() => {
    setIsRoomPlaying(snapshot?.isPlaying ?? false);
  }, [snapshot?.isPlaying, setIsRoomPlaying]);

  // Push pendingPlay to shared context
  useEffect(() => {
    pushPendingPlay(snapshot?.pendingPlay ?? false);
  }, [snapshot?.pendingPlay, pushPendingPlay]);

  // Push participants so DynamicIsland can show per-device network stats
  useEffect(() => {
    pushParticipants(participants);
  }, [participants, pushParticipants]);

  // Broadcast local audio output device info to the room
  useEffect(() => {
    if (isConnected && audio.outputDeviceName) {
      getSocket()?.emit('room:updateDevice', {
        roomId,
        deviceName: audio.outputDeviceName,
        deviceType: audio.outputDeviceType
      });
    }
  }, [isConnected, audio.outputDeviceName, audio.outputDeviceType, roomId]);

  const groupedParticipants = participants.reduce((acc, p) => {
    const parts = p.displayName.split("::");
    const userName = parts.length > 1 ? parts[0] : (parts[0] || "Guest");
    const devName = parts.length > 1 ? parts[1] : (parts[0] || "Device");
    if (!acc[userName]) acc[userName] = [];
    acc[userName].push({ ...p, devName });
    return acc;
  }, {} as Record<string, (Participant & { devName: string })[]>);

  const [qrState, setQrState] = useState<"mock" | "generating" | "ready">("mock");
  const qrTimerRef = useRef<number | null>(null);

  const roomLink = typeof window !== "undefined"
    ? `${window.location.origin}/room/${roomId}`
    : `/room/${roomId}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(roomLink)}`;

  // ── Signal ready when audio buffers ───────────────────────────────────────
  useEffect(() => {
    if (audio.hasTrack) {
      if (audio.isReady && !audio.isBuffering) {
        setReady(true);
      } else {
        setReady(false);
      }
    }
  }, [audio.isReady, audio.isBuffering, audio.hasTrack, setReady]);

  // ── Global drag handlers → UploadContext ──────────────────────────────
  const dragCounter = useRef(0); // track enter/leave nesting

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.items && [...e.dataTransfer.items].some(i => i.kind === "file")) {
        dragCounter.current += 1;
        upload.setIsDragging(true);
      }
    };

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        upload.setIsDragging(false);
      }
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      upload.setIsDragging(false);

      const file = e.dataTransfer?.files?.[0];
      if (!file || !file.type.startsWith("audio/")) return;

      try {
        await upload.uploadFile(file, roomId);
      } catch (err) {
        console.error("[Room] Drop upload failed:", err);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [upload, roomId, audio]);

  useEffect(() => {
    return () => {
      if (qrTimerRef.current) {
        window.clearTimeout(qrTimerRef.current);
      }
    };
  }, []);

  const handleLeave = () => {
    audio.pause();
    audio.clearTrack();
    leave();
    router.push("/hub");
  };

  const handleRemoveTrack = async (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();

    // Optimistically remove the item from the local queue UI instantly
    setLocalQueue((prev) => prev.filter((item) => item.id !== trackId));

    try {
      const baseUrl = getServerUrl();
      const res = await fetch(`${baseUrl}/rooms/${roomId}/queue/${trackId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
      if (!res.ok) {
        // Revert optimistic update on failure
        if (snapshot?.queue) setLocalQueue(snapshot.queue);
        const body = await res.json().catch(() => ({}));
        console.error("[Room] Failed to remove track:", body.error || res.statusText);
      }
    } catch (err) {
      // Revert optimistic update on failure
      if (snapshot?.queue) setLocalQueue(snapshot.queue);
      console.error("[Room] Error removing track:", err);
    }
  };

  const handlePlayTrack = async (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    if (snapshot?.isPlaying || audio.hasTrack) {
      const confirmPlay = window.confirm("This will stop the currently playing song. Are you sure you want to play this track?");
      if (!confirmPlay) return;
    }
    try {
      getSocket().emit('playback:jumpTo', { roomId, trackId });
    } catch (err) {
      console.error("[Room] Error playing track:", err);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px drag distance on desktop before activating
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // Require 250ms hold on mobile, so scrolling still works
        tolerance: 5,
      },
    })
  );

  // We maintain a local queue state to provide immediate optimistic UI feedback to the SortableContext
  const [localQueue, setLocalQueue] = useState<TrackQueueItem[]>([]);
  
  // Sync the local queue whenever the canonical snapshot changes, unless we are currently dragging
  useEffect(() => {
    if (snapshot?.queue) {
      setLocalQueue(snapshot.queue);
    }
  }, [snapshot?.queue]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !snapshot?.queue) return;

    const oldIndex = localQueue.findIndex((i) => i.id === active.id);
    const newIndex = localQueue.findIndex((i) => i.id === over.id);

    // Optimistically update the UI instantly
    setLocalQueue((items) => arrayMove(items, oldIndex, newIndex));

    try {
      const baseUrl = getServerUrl();
      await fetch(`${baseUrl}/rooms/${roomId}/queue/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({ itemId: active.id, newIndex })
      });
    } catch (err) {
      console.error("[Room] Error reordering queue:", err);
      // Revert optimism if it failed
      setLocalQueue(snapshot.queue);
    }
  };

  const handleCopy = () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(roomId).then(() => setCopied(true)).catch(console.error);
      } else {
        // Fallback for non-HTTPS dev environments (like mobile hitting a local IP)
        const textarea = document.createElement("textarea");
        textarea.value = roomId;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
          document.execCommand("copy");
          setCopied(true);
        } catch (err) {
          console.error("Fallback copy failed", err);
        }
        document.body.removeChild(textarea);
      }
    } catch (err) {
      console.error("[Room] Copy failed:", err);
    }
  };

  const handleVolumeChange = (targetSocketId: string, value: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    setParticipantVolume(targetSocketId, clamped);
    if (targetSocketId === currentSocketId) {
      audio.setVolume(clamped);
    }
  };

  const [previousVolumes, setPreviousVolumes] = useState<Record<string, number>>({});

  const toggleMute = (targetSocketId: string) => {
    const p = participants.find(part => part.socketId === targetSocketId);
    if (!p) return;
    
    if (p.volume > 0) {
      setPreviousVolumes(prev => ({ ...prev, [targetSocketId]: p.volume }));
      handleVolumeChange(targetSocketId, 0);
    } else {
      const restoreVol = previousVolumes[targetSocketId] || 100;
      handleVolumeChange(targetSocketId, restoreVol);
    }
  };

  const handleGenerateQr = () => {
    if (qrState === "ready" || qrState === "generating") {
      setQrState("mock");
      if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
      return;
    }
    setQrState("generating");
    qrTimerRef.current = window.setTimeout(() => {
      setQrState("ready");
    }, 1300);
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [deviceMenu, setDeviceMenu] = useState<{ device: Participant & { devName: string }; x: number; y: number } | null>(null);

  useEffect(() => {
    const handleGlobalClick = () => {
      if (deviceMenu) setDeviceMenu(null);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, [deviceMenu]);

  const [activeTab, setActiveTab] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (!carouselRef.current) return;
    const { scrollLeft, clientWidth } = carouselRef.current;
    const tab = Math.round(scrollLeft / clientWidth);
    if (tab !== activeTab) setActiveTab(tab);
  };

  const PANEL_CLASSES = "w-full h-full flex flex-col bg-background/40 backdrop-blur-xl rounded-[2.5rem] border border-foreground/10 p-6 shadow-[0_10px_40px_rgba(0,0,0,0.3)]";

  const renderInfoPanel = () => (
    <div className="w-full h-full flex flex-col items-center justify-center pb-8 overflow-y-auto custom-scrollbar">
      <div className="md:hidden w-full flex flex-col pt-30 pb-20 px-4 space-y-6">
        {/* Badges */}
        <div className="flex justify-center items-center gap-3 mb-6">
          <div className="flex items-center gap-2">
            <span className="hidden px-4 py-1.5 rounded-full bg-foreground/5 border border-foreground/10 text-foreground/70 text-sm font-semibold tracking-widest md:inline-flex items-center gap-2">
              <Users className="w-4 h-4 text-foreground/60" /> Sync Session Active
            </span>
            {isHost && (
              <button 
                onClick={() => togglePrivate(!snapshot?.isPrivate)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase flex items-center gap-2 transition-colors border ${snapshot?.isPrivate ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'bg-foreground/5 text-foreground/50 border-transparent hover:bg-foreground/10'}`}
              >
                {snapshot?.isPrivate ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                {snapshot?.isPrivate ? 'Private' : 'Public'}
              </button>
            )}
          </div>
          <span className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-widest inline-flex items-center gap-1.5 border ${isConnected ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isConnected ? "Connected" : "Connecting…"}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center gap-10 mb-10 w-full">
          {/* Room code */}
          <div className="text-center">
            <p className="text-foreground/50 font-bold uppercase tracking-widest text-sm mb-2">Room Code</p>
            <h1
              onClick={handleCopy}
              className="text-[5rem] select-none font-black text-foreground tracking-tighter leading-none flex items-center justify-center gap-4 group cursor-pointer drop-shadow-2xl"
            >
              {roomId}
              <div className="w-10 h-10 rounded-full bg-foreground/10 hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {copied ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 text-foreground" />}
              </div>
            </h1>
            <p className="text-foreground/40 text-xs font-medium mt-2">{copied ? "Copied!" : "Click to copy"}</p>
          </div>

          {/* QR */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={handleGenerateQr}
              aria-label="Generate QR code to share room"
              className="p-4 bg-foreground/5 border border-foreground/10 rounded-3xl hover:scale-105 transition-transform cursor-pointer group"
            >
              {qrState === "mock" && (
                <div className="w-28 h-28 flex items-center justify-center">
                  <QrCode className="w-28 h-28 text-foreground group-hover:text-foreground transition-colors" strokeWidth={1} />
                </div>
              )}

              {qrState === "generating" && (
                <div className="w-28 h-28 flex flex-col items-center justify-center gap-3">
                  <div className="w-10 h-10 rounded-full border-2 border-foreground/20 border-t-white/80 animate-spin" />
                  <p className="text-[10px] tracking-[0.2em] uppercase text-foreground/60">Generating</p>
                </div>
              )}

              {qrState === "ready" && (
                <Image
                  src={qrSrc}
                  alt={`QR code for room ${roomId}`}
                  width={112}
                  height={112}
                  className="w-28 h-28 bg-background p-1 rounded-xl"
                  unoptimized
                />
              )}
            </button>
            <p className="text-foreground/50 font-bold uppercase tracking-widest text-xs mt-4">
              {qrState === "ready" ? "Scan to Join" : "Tap to Generate QR"}
            </p>
          </div>
        </div>

        {/* Playback / readiness status */}
        {snapshot && (
          <div className="mb-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest flex-wrap justify-center">
            <span className={`flex items-center gap-1.5 ${snapshot.state === PlaybackState.PLAYING ? "text-green-400" : "text-foreground/50"}`}>
              <span className={`w-2 h-2 rounded-full ${snapshot.state === PlaybackState.PLAYING ? "bg-green-400 animate-pulse" : "bg-foreground/20"}`} />
              {snapshot.state === PlaybackState.PLAYING ? "Playing" : snapshot.state}
            </span>
            {audio.hasTrack && (
              allReady
                ? <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> All devices ready</span>
                : <span className="text-amber-400 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for devices to buffer…</span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderDevicesPanel = () => (
    <div className={PANEL_CLASSES}>
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h2 className="text-sm font-bold tracking-widest uppercase text-foreground/50 flex items-center gap-2">
          <Smartphone className="w-4 h-4" /> Devices ({participants.length})
        </h2>
      </div>

      {participants.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-foreground/40 text-sm font-medium">
          Waiting for others to join…
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4 flex flex-col gap-6">
          {Object.entries(groupedParticipants).map(([userName, userDevices]) => (
            <div key={userName} className="flex flex-col gap-3">
              <h4 className="text-xs font-bold text-foreground/50 uppercase tracking-widest px-2 flex items-center gap-2">
                {userName}
                {userDevices.some(d => d.userId === snapshot?.hostId) && (
                  <span className="px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-widest bg-foreground text-background shrink-0">Host</span>
                )}
              </h4>
              <div className="flex flex-col gap-3">
                {userDevices.map((p, i) => (
                  <div
                    key={p.socketId}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setDeviceMenu({ device: p, x: event.clientX, y: event.clientY });
                    }}
                    className="glass-panel p-4 rounded-3xl border border-foreground/5 bg-background/60 hover:bg-foreground/5 transition-colors group flex flex-col gap-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 shrink-0 rounded-full bg-linear-to-tr from-zinc-800 to-zinc-700 flex items-center justify-center border border-foreground/10 relative shadow-inner">
                          <span className="font-black text-foreground/70 text-sm tracking-widest">
                            {p.devName.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background border border-zinc-800 flex items-center justify-center shadow-sm" title={p.outputDeviceName || "Default Device"}>
                            <DeviceIcon index={i} type={p.outputDeviceType} />
                          </div>
                        </div>
                        <div className="max-w-50 mx-auto">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${snapshot?.isPlaying ? 'bg-green-400 animate-pulse' : 'bg-green-400'}`} title={snapshot?.isPlaying ? 'Playing' : 'Online'} />
                            <h4 className="font-bold text-foreground truncate">{p.devName}</h4>
                            {snapshot?.hostId === p.socketId && (
                              <span className="shrink-0 px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-widest bg-foreground text-background">Host</span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-foreground/50 flex items-center gap-1.5 mt-0.5">
                            {p.isBlocked
                              ? <><VolumeX className="w-3 h-3 text-rose-500 animate-pulse" /><span className="text-rose-500 font-bold">Autoplay Blocked</span></>
                              : p.isReady
                              ? <><CheckCircle2 className="w-3 h-3 text-green-400" /><span className="text-green-400">Buffered</span></>
                              : audio.hasTrack
                              ? <><Loader2 className="w-3 h-3 animate-spin" /> Buffering…</>
                              : "Ready"
                            }
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 w-full bg-background/40 p-3 rounded-2xl border border-foreground/5">
                      <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.2em] font-bold text-foreground/50">
                        <span className="flex items-center gap-1.5 cursor-pointer hover:text-foreground/80 transition-colors" onClick={() => toggleMute(p.socketId)}>
                          {p.volume === 0 ? <VolumeX className="w-3 h-3 text-red-400" /> : <Volume2 className="w-3 h-3 text-foreground/50" />}
                          {currentSocketId === p.socketId ? "Your Vol" : "Vol"}
                        </span>
                        <span className="text-foreground/60">{p.volume}%</span>
                      </div>
                      <div className="relative h-6 flex items-center">
                        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/10 overflow-hidden">
                          <div className="h-full bg-linear-to-r from-foreground/40 to-foreground/80 rounded-full w-2/3 shadow-[0_0_10px_rgba(var(--foreground-rgb),0.3)]" style={{ width: `${p.volume}%` }} />
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={p.volume}
                          onChange={(e) => handleVolumeChange(p.socketId, Number(e.target.value))}
                          aria-label={`${p.devName} volume`}
                          className="relative z-10 w-full appearance-none bg-transparent cursor-pointer volume-slider"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {deviceMenu && (
        <>
          {/* Mobile Bottom Sheet Menu */}
          <div className="md:hidden fixed inset-0 z-[100] bg-background/45 backdrop-blur-sm flex items-end" onClick={() => setDeviceMenu(null)}>
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="w-full rounded-t-[2.5rem] border-t border-foreground/10 bg-background/95 p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] flex flex-col gap-4 shadow-[0_-20px_50px_rgba(0,0,0,0.3)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-1.5 rounded-full bg-foreground/20 mx-auto mb-2" />
              <h3 className="text-lg font-black text-foreground text-center mb-1">Device Settings</h3>
              <p className="text-xs text-foreground/40 font-mono text-center tracking-widest uppercase mb-2">Device: {deviceMenu.device.devName}</p>
              
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => {
                    alert("Rename only available from Hub or Profile!");
                    setDeviceMenu(null);
                  }}
                  className="w-full text-left px-4 py-3.5 rounded-2xl text-foreground hover:bg-foreground/5 text-base font-bold flex items-center gap-3 border border-foreground/5 bg-foreground/2 active:scale-[0.99] transition-all"
                >
                  <Edit3 className="w-5 h-5 text-foreground/70" />
                  Rename this device
                </button>
                <button
                  onClick={() => {
                    alert("Ping sent to device!");
                    setDeviceMenu(null);
                  }}
                  className="w-full text-left px-4 py-3.5 rounded-2xl text-foreground hover:bg-foreground/5 text-base font-bold flex items-center gap-3 border border-foreground/5 bg-foreground/2 active:scale-[0.99] transition-all"
                >
                  <Radio className="w-5 h-5 text-foreground/70" />
                  Ping this device
                </button>
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("showDeviceInfo", { detail: { socketId: deviceMenu.device.socketId } }));
                    setDeviceMenu(null);
                  }}
                  className="w-full text-left px-4 py-3.5 rounded-2xl text-foreground hover:bg-foreground/5 text-base font-bold flex items-center gap-3 border border-foreground/5 bg-foreground/2 active:scale-[0.99] transition-all"
                >
                  <Activity className="w-5 h-5 text-blue-400" />
                  View Device Info
                </button>
                <button
                  onClick={() => {
                    alert("Device logged out!");
                    setDeviceMenu(null);
                  }}
                  className="w-full text-left px-4 py-3.5 rounded-2xl text-foreground hover:bg-foreground/5 text-base font-bold flex items-center gap-3 border border-foreground/5 bg-foreground/2 active:scale-[0.99] transition-all"
                >
                  <LogOut className="w-5 h-5 text-red-400" />
                  Logout this device
                </button>
              </div>
              <button
                onClick={() => setDeviceMenu(null)}
                className="mt-2 w-full h-12 rounded-2xl border border-foreground/10 bg-foreground/5 hover:bg-foreground/10 text-foreground font-bold text-sm transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          </div>

          {/* Desktop Context Menu */}
          <div
            className="hidden md:block fixed z-[100] min-w-55 rounded-2xl border border-foreground/10 bg-background/95 p-2 shadow-2xl"
            style={{
              left: Math.min(deviceMenu.x, typeof window !== "undefined" ? window.innerWidth - 240 : deviceMenu.x),
              top: Math.min(deviceMenu.y, typeof window !== "undefined" ? window.innerHeight - 160 : deviceMenu.y),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => {
                alert("Rename only available from Hub or Profile!");
                setDeviceMenu(null);
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-foreground hover:bg-foreground/10 text-sm font-medium flex items-center gap-2"
            >
              <Edit3 className="w-4 h-4 text-foreground/70" />
              Rename this device
            </button>
            <button
              onClick={() => {
                alert("Ping sent to device!");
                setDeviceMenu(null);
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-foreground hover:bg-foreground/10 text-sm font-medium flex items-center gap-2"
            >
              <Radio className="w-4 h-4 text-foreground/70" />
              Ping this device
            </button>
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent("showDeviceInfo", { detail: { socketId: deviceMenu.device.socketId } }));
                setDeviceMenu(null);
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-foreground hover:bg-foreground/10 text-sm font-medium flex items-center gap-2"
            >
              <Activity className="w-4 h-4 text-blue-400" />
              View Device Info
            </button>
            <button
              onClick={() => {
                alert("Device logged out!");
                setDeviceMenu(null);
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-foreground hover:bg-foreground/10 text-sm font-medium flex items-center gap-2"
            >
              <LogOut className="w-4 h-4 text-red-400" />
              Logout this device
            </button>
          </div>
        </>
      )}
    </div>
  );

  const renderQueuePanel = () => (
    <div className={PANEL_CLASSES}>
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h2 className="text-sm font-bold tracking-widest uppercase text-foreground/50 flex items-center gap-2">
          <ListMusic className="w-4 h-4" /> Queue ({localQueue.length})
        </h2>
        <button
          onClick={() => document.dispatchEvent(new CustomEvent('island:expand-add'))}
          className="w-7 h-7 rounded-full bg-foreground/5 border border-foreground/10 hover:bg-foreground/15 hover:border-foreground/20 flex items-center justify-center transition-all active:scale-90"
          title="Add music to queue"
        >
          <Plus className="w-3.5 h-3.5 text-foreground/50" />
        </button>
      </div>

      {localQueue.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-foreground/40 text-sm font-medium bg-background/20 rounded-3xl border border-foreground/5 p-6">
          <Music2 className="w-10 h-10 mb-4 opacity-20" />
          <p className="mb-6">No songs in queue</p>
          <button 
            onClick={() => document.dispatchEvent(new CustomEvent('island:expand-add'))}
            className="w-full max-w-sm flex items-center gap-3 px-4 py-3 bg-foreground/5 border border-foreground/10 hover:border-foreground/20 hover:bg-foreground/10 rounded-2xl transition-all group shadow-sm"
          >
            <Search className="w-5 h-5 text-foreground/40 group-hover:text-foreground/60 transition-colors shrink-0" />
            <span className="text-foreground/40 group-hover:text-foreground/60 transition-colors font-medium truncate">Search YouTube for a song...</span>
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2 pb-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={localQueue.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              {localQueue.map((item: TrackQueueItem) => {
                const addedByName = item.addedBy === user?.id
                  ? "You"
                  : (item.addedByName ? item.addedByName.split(" ")[0] : item.addedBy);
                return (
                  <SortableTrackItem
                    key={item.id}
                    item={item}
                    onRemove={handleRemoveTrack}
                    onPlay={handlePlayTrack}
                    addedByName={addedByName}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );

  if (!isMounted) return null;

  if (joinStatus === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/5 to-background pointer-events-none" />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="z-10 flex flex-col items-center max-w-md w-full glass-panel p-10 rounded-[2.5rem] border border-foreground/10 text-center relative overflow-hidden shadow-2xl"
        >
          <div className="w-24 h-24 bg-amber-500/10 rounded-full flex items-center justify-center mb-6 border border-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
            <Lock className="w-10 h-10 text-amber-500" />
          </div>
          <h2 className="text-3xl font-black mb-3">Private Room</h2>
          
          <div className="flex items-center gap-3 bg-foreground/5 pl-4 pr-2 py-2 rounded-xl border border-foreground/10 mb-8">
            <span className="font-black tracking-[0.2em] text-xl text-foreground/90">{roomId}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(roomId);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="w-8 h-8 rounded-lg bg-foreground/10 hover:bg-foreground/20 flex items-center justify-center transition-colors active:scale-95"
              title="Copy room code"
            >
              {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-foreground/50" />}
            </button>
          </div>

          <p className="text-foreground/60 mb-8 leading-relaxed">
            The host has locked this room. A request to join has been sent, please wait for their approval.
          </p>
          <button 
            onClick={notifyHost}
            className="h-14 w-full rounded-full bg-foreground text-background font-bold tracking-widest uppercase flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl"
          >
            <BellRing className="w-5 h-5" /> Nudge Host
          </button>
        </motion.div>
      </div>
    );
  }

  if (joinStatus === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground px-6 relative overflow-hidden">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="z-10 flex flex-col items-center max-w-md w-full glass-panel p-10 rounded-[2.5rem] border border-red-500/20 text-center shadow-2xl"
        >
          <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
            <ShieldAlert className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-3xl font-black mb-3">Access Denied</h2>
          <p className="text-foreground/60 mb-8 leading-relaxed">
            The host did not approve your request to join this private room.
          </p>
          <button 
            onClick={() => router.push('/')}
            className="h-14 w-full rounded-full bg-foreground text-background font-bold tracking-widest uppercase flex items-center justify-center hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl"
          >
            Return Home
          </button>
        </motion.div>
      </div>
    );
  }

  if (!snapshot || joinStatus === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-transparent">
        <Loader2 className="w-10 h-10 text-foreground animate-spin mb-4" />
        <p className="text-foreground/50 tracking-widest uppercase font-bold text-sm">Connecting...</p>
      </div>
    );
  }

  return (
    <main role="main" aria-label="SyncBeats Room" className="fixed inset-0 w-full h-dvh overflow-hidden bg-transparent z-0 flex flex-col items-center select-none">
      


      {/* ── Buffering Overlay ── */}
      <AnimatePresence>
        {(() => {
          const currentTrackUrl = snapshot?.trackUrl;
          const activeTransfer = currentTrackUrl ? upload.activeTransfers[currentTrackUrl] : null;
          const isSyncing = !!activeTransfer;
          const isAnyDeviceBuffering = snapshot?.isPlaying && audio.hasTrack && participants.some(p => !p.isReady && !p.isBlocked);
          
          if (!((audio.isBuffering && audio.isPlaying) || isAnyDeviceBuffering || isSyncing) || audio.error) return null;

          let overlayText = "Buffering…";
          if (isSyncing) {
            overlayText = `Syncing track: ${activeTransfer.progress}%…`;
          } else if (isAnyDeviceBuffering) {
            overlayText = "Devices Buffering…";
          }

          return (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="fixed bottom-28 md:bottom-32 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
            >
              <div className="relative flex items-center gap-3 px-5 py-3 rounded-full bg-background/80 backdrop-blur-2xl border border-foreground/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                {/* Animated gradient ring */}
                <div className="absolute inset-0 rounded-full overflow-hidden">
                  <div className="absolute inset-0 rounded-full bg-linear-to-r from-foreground/5 via-foreground/10 to-foreground/5 animate-pulse" />
                </div>
                
                {/* Spinner / Error Icon */}
                <div className="relative shrink-0 flex items-center justify-center w-5 h-5">
                  <div className="absolute inset-0 bg-background/40 backdrop-blur-3xl rounded-full -z-10" />
                  <div className="absolute inset-0 bg-linear-to-tr from-foreground/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>
                
                {/* Text */}
                <span className="relative text-sm font-semibold tracking-wide whitespace-nowrap text-foreground/80">
                  {overlayText}
                </span>
                
                {/* Animated dots */}
                <div className="relative flex gap-0.5">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="w-1 h-1 rounded-full bg-foreground/60"
                      animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
        );
      })()}

      {/* ── Unlock Audio Overlay ── */}
      {snapshot?.isPlaying && !audio.audioUnlocked && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: isConnected ? 0 : 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-x-0 bottom-0 z-99999 p-4 pointer-events-none flex items-center justify-center bg-background/60 backdrop-blur-sm px-4 cursor-pointer"
          onClick={() => audio.unlockAudio()}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="px-8 py-6 rounded-3xl bg-foreground border border-foreground/10 shadow-2xl flex flex-col items-center gap-4 text-background"
          >
            <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center text-foreground animate-pulse shadow-lg">
              <Play className="w-8 h-8 ml-1" />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-black tracking-tight mb-1">Tap to Sync</h3>
              <p className="text-background/80 text-sm font-medium">Session is playing. Tap to listen.</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

      {/* Ambient glow */}
      {/* Ambient glow removed (now in layout) */}

      {/* ── DESKTOP VIEW ── */}


        {/* ── Connected Devices ── */}
      <div className="hidden md:flex flex-col w-full h-full pt-20 pb-6 px-6 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full flex gap-6 items-stretch justify-between flex-1 min-h-0 pb-6"
        >
          {/* Left Column: Room Info & Devices */}
          <div className="flex flex-col w-75 xl:w-85 shrink-0 h-full gap-4 relative z-100">
            
            {/* Room Info Card */}
            <div className="relative z-50 w-full rounded-3xl border border-foreground/10 bg-background/60 backdrop-blur-xl p-5 flex flex-col gap-4 shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
               <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md bg-foreground/5 text-foreground/70 text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-foreground/60" /> Live 
                    </span>
                    {isHost && (
                      <button 
                        onClick={() => togglePrivate(!snapshot?.isPrivate)}
                        className={`px-2.5 py-1 rounded-md text-[9px] font-black tracking-widest uppercase flex items-center gap-1.5 transition-colors border ${snapshot?.isPrivate ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'bg-foreground/5 text-foreground/50 border-transparent hover:bg-foreground/10'}`}
                      >
                        {snapshot?.isPrivate ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        {snapshot?.isPrivate ? 'Private' : 'Public'}
                      </button>
                    )}
                  </div>
                  <span className={`px-2.5 py-1 rounded-md text-[9px] uppercase font-black tracking-widest flex items-center gap-1.5 border ${isConnected ? "bg-green-500/10 border-green-500/20 text-green-500" : "bg-red-500/10 border-red-500/20 text-red-500"}`}>
                    {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {isConnected ? "Connected" : "Connecting"}
                  </span>
               </div>
               
               <div className="flex items-center justify-between">
                 <div className="flex flex-col items-start gap-1">
                   <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40">Room Code</span>
                   <button onClick={handleCopy} className="text-3xl font-black tracking-widest hover:scale-105 active:scale-95 transition-all group flex items-center gap-3">
                     {roomId}
                     {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 opacity-30 group-hover:opacity-100" />}
                   </button>
                 </div>
                 <div className="relative">
                   <button onClick={handleGenerateQr} className="w-10 h-10 rounded-xl bg-foreground/5 border border-foreground/10 flex items-center justify-center hover:bg-foreground/10 hover:scale-105 transition-all shadow-sm group">
                     <QrCode className="w-5 h-5 text-foreground/70 group-hover:text-foreground" />
                   </button>
                   <AnimatePresence>
                     {qrState !== "mock" && (
                       <motion.div 
                         initial={{ opacity: 0, scale: 0.9, y: 10 }}
                         animate={{ opacity: 1, scale: 1, y: 0 }}
                         exit={{ opacity: 0, scale: 0.9, y: 10 }}
                         className="absolute top-12 left-0 md:left-auto md:right-0 z-999 w-48 h-48 bg-background/95 backdrop-blur-3xl border border-foreground/10 rounded-2xl shadow-2xl flex flex-col items-center justify-center overflow-hidden"
                       >
                         {qrState === "generating" && (
                           <div className="flex flex-col items-center justify-center gap-3">
                             <Loader2 className="w-6 h-6 animate-spin text-foreground/50" />
                             <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">Generating</p>
                           </div>
                         )}
                         {qrState === "ready" && (
                           <div className="w-full h-full flex items-center justify-center p-3">
                              <Image src={qrSrc} alt="QR Code" width={150} height={150} className="w-full h-auto bg-white p-2 rounded-xl" unoptimized />
                           </div>
                         )}
                       </motion.div>
                     )}
                   </AnimatePresence>
                 </div>
               </div>
            </div>

            {/* Devices Panel */}
            <div className="w-full rounded-3xl border border-foreground/5 bg-background/60 p-4 flex flex-col gap-3 h-full overflow-hidden">
            <h2 className="text-sm font-bold tracking-widest uppercase text-foreground/50 text-center shrink-0">
              Connected Devices ({participants.length})
            </h2>

            {participants.length === 0 && (
              <div className="text-center py-10 text-foreground/40 text-sm font-medium border border-foreground/5 rounded-2xl bg-background/40">
                Waiting for others to join…
              </div>
            )}

            <div className="w-full flex-1 overflow-y-auto custom-scrollbar pr-2 relative">
            {Object.entries(groupedParticipants).map(([userName, userDevices]) => (
              <div key={userName} className="w-full flex flex-col gap-4">
                <h4 className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest px-2 border-b border-foreground/5 pb-1 select-all flex items-center gap-2">
                  {userName}
                  {userDevices.some(d => d.userId === snapshot?.hostId) && (
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-widest bg-foreground text-background shrink-0">Host</span>
                  )}
                </h4>
                <div className="grid grid-cols-1 gap-3 w-full">
                  {userDevices.map((p, i) => {
                    const displayDeviceName = p.devName.replace(new RegExp(`^${userName}['’]s\\s+`, 'i'), '');
                    
                    return (
                    <div
                      key={p.socketId}
                      className="glass-panel p-5 rounded-4xl border border-foreground/5 bg-background/60 hover:bg-foreground/5 transition-colors group flex flex-col gap-4 shadow-[0_10px_20px_rgba(0,0,0,0.4)]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-linear-to-tr from-zinc-800 to-zinc-700 flex items-center justify-center border border-foreground/10 relative">
                            <span className="font-black text-foreground/70 text-sm tracking-widest">
                              {userName.slice(0, 2).toUpperCase()}
                            </span>
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background border border-zinc-800 flex items-center justify-center">
                              <DeviceIcon index={i} />
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-foreground">{displayDeviceName}</h4>
                            </div>
                            <p className="text-xs font-medium text-foreground/50 flex items-center gap-1.5">
                              {p.isReady
                                ? <><CheckCircle2 className="w-3 h-3 text-green-400" /><span className="text-green-400">Buffered</span></>
                                : audio.hasTrack
                                ? <><Loader2 className="w-3 h-3 animate-spin" /> Buffering…</>
                                : "Ready"
                              }
                            </p>
                          </div>
                        </div>
                      </div>

                      <motion.div className="flex flex-col h-dvh w-full md:hidden">
                        <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.24em] font-bold text-foreground/50">
                          <span className="flex items-center gap-2 cursor-pointer hover:text-foreground/80 transition-colors" onClick={() => toggleMute(p.socketId)}>
                            {p.volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-foreground/50" />}
                            {currentSocketId === p.socketId ? "Your Volume" : "Participant Volume"}
                          </span>
                          <span className="text-foreground/60">{p.volume}%</span>
                        </div>
                        <div className="relative h-10 flex items-center">
                          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-linear-to-r from-zinc-200 via-white to-zinc-400 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                              style={{ width: `${p.volume}%` }}
                            />
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={p.volume}
                            onChange={(e) => handleVolumeChange(p.socketId, Number(e.target.value))}
                            aria-label={`${displayDeviceName} volume`}
                            className="relative z-10 w-full appearance-none bg-transparent cursor-pointer volume-slider"
                          />
                        </div>
                      </motion.div>
                    </div>
                  );})}
                </div>
              </div>
            ))}
          </div>
          </div>
          </div>

          {/* Middle Column: Spatial Audio */}
          <div className="flex flex-col flex-1 h-full min-w-0 relative z-10">
            <div className="w-full h-full flex flex-col items-center justify-center p-4">
              <OrbitUI
                myDeviceId={currentSocketId || ""}
                spatialDevices={spatialDevices}
                participants={participants}
                onUpdatePosition={updatePosition}
                isPlaying={audio.isPlaying || (snapshot?.isPlaying ?? false)}
              />
            </div>
          </div>

          {/* Right Column: Queue */}
          <div className="flex flex-col w-75 xl:w-85 shrink-0 h-full gap-2">
            <div className="w-full rounded-2xl border border-foreground/5 bg-background/60 p-4 flex flex-col gap-3 h-full">
              <div className="flex items-center justify-between shrink-0">
                <h3 className="text-xs font-bold tracking-widest uppercase text-foreground/50 flex items-center gap-2">
                  <ListMusic className="w-4 h-4" />
                  Room Queue ({localQueue.length})
                </h3>
                {audio.hasTrack && (
                  <button
                    onClick={() => document.dispatchEvent(new CustomEvent('island:expand-add'))}
                    className="w-7 h-7 rounded-full bg-foreground/5 border border-foreground/10 hover:bg-foreground/15 hover:border-foreground/20 flex items-center justify-center transition-all active:scale-90"
                    title="Add music to queue"
                  >
                    <Plus className="w-3.5 h-3.5 text-foreground/50" />
                  </button>
                )}
              </div>
              
              {localQueue.length ? (
                <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={localQueue.map((i) => i.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {localQueue.map((item: TrackQueueItem) => {
                        const addedByName = item.addedBy === user?.id
                          ? "You"
                          : (item.addedByName ? item.addedByName.split(" ")[0] : item.addedBy);
                        return (
                          <SortableTrackItem
                            key={item.id}
                            item={item}
                            onRemove={handleRemoveTrack}
                            onPlay={handlePlayTrack}
                            addedByName={addedByName}
                          />
                        );
                      })}
                    </SortableContext>
                  </DndContext>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-foreground/40 text-sm font-medium bg-background/20 rounded-xl border border-foreground/5 p-6">
                  <Music2 className="w-10 h-10 mb-4 opacity-20" />
                  <p className="mb-6">No songs in queue</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── MOBILE VIEW (Swipeable Carousel) ── */}
      <div className="flex md:hidden flex-col w-full h-full relative pt-30 pb-20">
        {/* Pagination Dots */}
        <div className="flex justify-center items-center gap-3 mb-4 shrink-0 px-4">
          <button aria-label="View room info" onClick={() => carouselRef.current?.scrollTo({ left: 0, behavior: 'smooth' })} className={`h-1.5 rounded-full transition-all duration-300 ${activeTab === 0 ? "w-10 bg-foreground shadow-[0_0_10px_rgba(255,255,255,0.5)]" : "w-3 bg-foreground/20"}`} />
          <button aria-label="View connected devices" onClick={() => carouselRef.current?.scrollTo({ left: window.innerWidth, behavior: 'smooth' })} className={`h-1.5 rounded-full transition-all duration-300 ${activeTab === 1 ? "w-10 bg-foreground shadow-[0_0_10px_rgba(255,255,255,0.5)]" : "w-3 bg-foreground/20"}`} />
          <button aria-label="View spatial audio" onClick={() => carouselRef.current?.scrollTo({ left: window.innerWidth * 2, behavior: 'smooth' })} className={`h-1.5 rounded-full transition-all duration-300 ${activeTab === 2 ? "w-10 bg-foreground shadow-[0_0_10px_rgba(255,255,255,0.5)]" : "w-3 bg-foreground/20"}`} />
          <button aria-label="View music queue" onClick={() => carouselRef.current?.scrollTo({ left: window.innerWidth * 3, behavior: 'smooth' })} className={`h-1.5 rounded-full transition-all duration-300 ${activeTab === 3 ? "w-10 bg-foreground shadow-[0_0_10px_rgba(255,255,255,0.5)]" : "w-3 bg-foreground/20"}`} />
        </div>

        {/* Carousel */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          ref={carouselRef}
          onScroll={handleScroll}
          className="w-full h-full rounded-4xl overflow-x-auto overflow-y-hidden shadow-2xl relative snap-x snap-mandatory flex [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] min-h-0"
        >
          <div className="w-full shrink-0 snap-center h-full px-5 min-h-0">
            {renderInfoPanel()}
          </div>
          <div className="w-full shrink-0 snap-center h-full px-5 min-h-0">
            {renderDevicesPanel()}
          </div>
          <div className="w-full shrink-0 snap-center h-full px-5 min-h-0 flex items-center justify-center">
            <div className="w-full rounded-2xl border border-foreground/5 bg-background/60 p-4 h-full flex flex-col items-center justify-center max-h-100">
              <OrbitUI
                myDeviceId={currentSocketId || ""}
                spatialDevices={spatialDevices}
                participants={participants}
                onUpdatePosition={updatePosition}
                isPlaying={audio.isPlaying || (snapshot?.isPlaying ?? false)}
              />
            </div>
          </div>
          <div className="w-full shrink-0 snap-center h-full px-5 min-h-0">
            {renderQueuePanel()}
          </div>
        </motion.div>

        {/* Mobile Leave Button */}
        <div className="absolute bottom-6 left-0 w-full flex justify-center z-10 px-6 pointer-events-none">
          <button 
            onClick={handleLeave} 
            className="pointer-events-auto flex items-center justify-center w-full max-w-50 gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-sm tracking-widest uppercase px-6 py-3.5 rounded-full font-bold shadow-lg backdrop-blur-xl border border-red-500/20 transition-all active:scale-95"
          >
            Leave Room
          </button>
        </div>
      </div>

      {/* ── Tap to Enable Mobile/iOS Audio Context Unlock Overlay ── */}
      {isLocalPlayBlocked && (
        <div className="fixed inset-0 bg-background/85 backdrop-blur-lg flex flex-col items-center justify-center z-[99999] px-6 text-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="max-w-md w-full bg-foreground/3 border border-foreground/10 p-8 rounded-3xl shadow-2xl backdrop-blur-2xl flex flex-col items-center gap-6"
          >
            <div className="w-16 h-16 rounded-full bg-foreground/5 border border-foreground/10 flex items-center justify-center text-2xl animate-pulse">
              🎵
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold tracking-widest uppercase text-foreground">Tap to Enable Audio</h2>
              <p className="text-xs text-foreground/40 font-medium max-w-[70%] mx-auto leading-relaxed">
                Browsers require a physical tap to allow audio playback. Tap below to enable sound.
              </p>
            </div>
            <button
              onClick={() => {
                audio.unlockAudio();
              }}
              className="w-full bg-foreground hover:bg-foreground/90 text-background font-bold tracking-widest uppercase text-xs py-4 px-6 rounded-full transition-transform active:scale-95 shadow-xl shadow-foreground/5 border border-foreground/10"
            >
              Enable Audio Now
            </button>
          </motion.div>
        </div>
      )}
    </main>
  );
}
