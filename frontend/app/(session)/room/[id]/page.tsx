"use client";

import { motion } from "framer-motion";
import { Copy, Users, QrCode, Smartphone, Laptop, Speaker, Volume2, VolumeX, Wifi, WifiOff, CheckCircle2, Loader2, ListMusic, Trash2, Music2 } from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRoom }   from "../../../../hooks/useRoom";
import { useAudio }  from "../../../../context/AudioContext";
import { useUpload } from "../../../../context/UploadContext";
import { PlaybackState, Participant, TrackQueueItem } from "../../../../lib/types";
import { useAuth }   from "../../../../context/AuthContext";
import { getAuthToken, getServerUrl } from "../../../../lib/api";
import { useSyncInfo } from "../../../../context/SyncContext";

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

function DeviceIcon({ index }: { index: number }) {
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
  const { snapshot, participants, isConnected, currentSocketId, clockOffset, allReady, setReady, setParticipantVolume, leave } = useRoom({
    roomId,
    displayName,
  });
  const { setClockOffset: pushClockOffset, setIsRoomPlaying, setParticipants: pushParticipants } = useSyncInfo();

  // Push clock offset to shared context so DynamicIsland can access it
  useEffect(() => {
    pushClockOffset(clockOffset);
  }, [clockOffset, pushClockOffset]);

  // Push server-side playing state so DynamicIsland shows correct button
  useEffect(() => {
    setIsRoomPlaying(snapshot?.isPlaying ?? false);
  }, [snapshot?.isPlaying, setIsRoomPlaying]);

  // Push participants so DynamicIsland can show per-device network stats
  useEffect(() => {
    pushParticipants(participants);
  }, [participants, pushParticipants]);

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
    if (audio.isReady && audio.hasTrack) {
      setReady(true);
    }
  }, [audio.isReady, audio.hasTrack, setReady]);

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
    audio.setTrack("", "", "");
    leave();
    router.push("/hub");
  };

  const handleRemoveTrack = async (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    try {
      const baseUrl = getServerUrl();
      const res = await fetch(`${baseUrl}/rooms/${roomId}/queue/${trackId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[Room] Failed to remove track:", body.error || res.statusText);
      }
    } catch (err) {
      console.error("[Room] Error removing track:", err);
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
    if (qrState === "ready" || qrState === "generating") return;
    setQrState("generating");
    qrTimerRef.current = window.setTimeout(() => {
      setQrState("ready");
    }, 1300);
  };

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
      <div className="text-center w-full flex flex-col items-center my-auto">
        {/* Badges */}
        <div className="flex items-center gap-3 mb-6">
          <span className="px-4 py-1.5 rounded-full bg-foreground/5 border border-foreground/10 text-foreground/70 text-sm font-semibold tracking-widest inline-flex items-center gap-2">
            <Users className="w-4 h-4 text-foreground/60" /> Sync Session Active
          </span>
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
              className="text-[5rem] select-none font-black text-foreground tracking-tighter leading-none flex items-center justify-center gap-4 group cursor-pointer drop-shadow-2xl select-all"
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
              <h4 className="text-xs font-bold text-foreground/50 uppercase tracking-widest px-2">{userName}</h4>
              <div className="flex flex-col gap-3">
                {userDevices.map((p, i) => (
                  <div
                    key={p.socketId}
                    className="glass-panel p-4 rounded-3xl border border-foreground/5 bg-background/60 hover:bg-foreground/5 transition-colors group flex flex-col gap-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 shrink-0 rounded-full bg-gradient-to-tr from-zinc-800 to-zinc-700 flex items-center justify-center border border-foreground/10 relative shadow-inner">
                          <span className="font-black text-foreground/70 text-sm tracking-widest">
                            {p.devName.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background border border-zinc-800 flex items-center justify-center shadow-sm">
                            <DeviceIcon index={i} />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-foreground truncate">{p.devName}</h4>
                            {snapshot?.hostId === p.socketId && (
                              <span className="shrink-0 px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-widest bg-foreground text-background">Host</span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-foreground/50 flex items-center gap-1.5 mt-0.5">
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
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-zinc-300 to-white shadow-[0_0_10px_rgba(255,255,255,0.3)]"
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
    </div>
  );

  const renderQueuePanel = () => (
    <div className={PANEL_CLASSES}>
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h2 className="text-sm font-bold tracking-widest uppercase text-foreground/50 flex items-center gap-2">
          <ListMusic className="w-4 h-4" /> Queue ({localQueue.length})
        </h2>
      </div>

      {localQueue.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-foreground/40 text-sm font-medium bg-background/20 rounded-3xl border border-foreground/5">
          <Music2 className="w-8 h-8 mb-3 opacity-20" />
          No songs in queue
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

  return (
    <main role="main" aria-label="SyncBeats Room" className="fixed inset-0 w-full h-[100dvh] overflow-hidden md:relative md:overflow-visible bg-background z-0 flex flex-col items-center">
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[600px] max-h-[600px] md:w-full md:max-w-2xl md:h-[500px] bg-foreground/5 blur-[120px] md:blur-[150px] rounded-full pointer-events-none -z-10" />

      {/* ── DESKTOP VIEW (Original unchanged layout) ── */}
      <div className="hidden md:flex flex-col items-center w-full max-w-4xl mx-auto md:pt-[120px] md:pb-12 px-4 sm:px-6 lg:px-8 relative z-0">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="text-center w-full max-w-4xl flex flex-col items-center"
        >
          {/* Badges */}
          <div className="flex items-center gap-3 mb-6">
            <span className="px-4 py-1.5 rounded-full bg-foreground/5 border border-foreground/10 text-foreground/70 text-sm font-semibold tracking-widest inline-flex items-center gap-2">
              <Users className="w-4 h-4 text-foreground/60" /> Sync Session Active
            </span>
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-widest inline-flex items-center gap-1.5 border ${isConnected ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isConnected ? "Connected" : "Connecting…"}
            </span>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-center gap-10 mb-10">
            {/* Room code */}
            <div className="text-center">
              <p className="text-foreground/50 font-bold uppercase tracking-widest text-sm mb-2">Room Code</p>
              <h1
                onClick={handleCopy}
                className="text-[5rem] select-none sm:text-[7rem] font-black text-foreground tracking-tighter leading-none flex items-center justify-center gap-4 group cursor-pointer drop-shadow-2xl select-all"
              >
                {roomId}
                <div className="w-12 h-12 rounded-full bg-foreground/10 hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {copied ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 text-foreground" />}
                </div>
              </h1>
              <p className="text-foreground/40 text-xs font-medium mt-2">{copied ? "Copied!" : "Click to copy"}</p>
            </div>

            <div className="hidden md:block w-px h-32 bg-foreground/10" />

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
                  <div className="w-30 h-30 flex flex-col items-center justify-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-foreground/20 border-t-white/80 animate-spin" />
                    <p className="text-[10px] tracking-[0.2em] uppercase text-foreground/60">Generating</p>
                  </div>
                )}

                {qrState === "ready" && (
                  <Image
                    src={qrSrc}
                    alt={`QR code for room ${roomId}`}
                    width={120}
                    height={120}
                    className="w-30 h-30 bg-background p-1"
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

          {/* Drag hint */}
          {!audio.hasTrack && !upload.isUploading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mb-6 px-6 py-4 rounded-2xl border border-dashed border-foreground/10 text-foreground/40 text-sm font-medium flex items-center gap-3"
            >
              <Volume2 className="w-4 h-4 shrink-0" />
              Drag an audio file here or hover the island above to add music
            </motion.div>
          )}
        </motion.div>

        {/* ── Connected Devices ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full max-w-3xl mx-auto flex flex-col gap-6 items-center"
        >
          <h2 className="text-sm font-bold tracking-widest uppercase text-foreground/50 text-center mb-2">
            Connected Devices ({participants.length})
          </h2>

          {participants.length === 0 && (
            <div className="text-center py-10 text-foreground/40 text-sm font-medium">
              Waiting for others to join…
            </div>
          )}

          <div className="w-full max-h-[40vh] overflow-y-auto custom-scrollbar pr-2 pb-2 flex flex-col gap-8">
            {Object.entries(groupedParticipants).map(([userName, userDevices]) => (
              <div key={userName} className="w-full flex flex-col gap-4">
                <h4 className="text-xs font-bold text-foreground/50 uppercase tracking-widest px-2 border-b border-foreground/5 pb-2">{userName}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  {userDevices.map((p, i) => (
                    <div
                      key={p.socketId}
                      className="glass-panel p-5 rounded-[2rem] border border-foreground/5 bg-background/60 hover:bg-foreground/5 transition-colors group flex flex-col gap-4 shadow-[0_10px_20px_rgba(0,0,0,0.4)]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-zinc-800 to-zinc-700 flex items-center justify-center border border-foreground/10 relative">
                            <span className="font-black text-foreground/70 text-sm tracking-widest">
                              {p.devName.slice(0, 2).toUpperCase()}
                            </span>
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background border border-zinc-800 flex items-center justify-center">
                              <DeviceIcon index={i} />
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-foreground">{p.devName}</h4>
                              {snapshot?.hostId === p.socketId && (
                                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-widest bg-foreground text-background">Host</span>
                              )}
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

                      <div className="flex flex-col gap-2 w-full glass-panel p-3 rounded-xl border border-foreground/5">
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
                              className="h-full rounded-full bg-gradient-to-r from-zinc-200 via-white to-zinc-400 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
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

          {/* ── Queue ── */}
          {localQueue.length ? (
            <div className="mt-4 w-full rounded-2xl border border-foreground/5 bg-background/60 p-5 flex flex-col gap-4">
              <h3 className="text-xs font-bold tracking-widest uppercase text-foreground/50 flex items-center gap-2">
                <ListMusic className="w-4 h-4" />
                Room Queue ({localQueue.length})
              </h3>
              <div className="max-h-[35vh] overflow-y-auto space-y-2 custom-scrollbar pr-2">
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
                          addedByName={addedByName}
                        />
                      );
                    })}
                  </SortableContext>
                </DndContext>
              </div>
            </div>
          ) : (<div className="mt-2 rounded-2xl border border-foreground/5 bg-background/40 max-h-[35vh] p-4">
            <h3 className="text-xs font-bold tracking-widest uppercase text-foreground/50 flex items-center gap-2">
              No songs in the queue
            </h3>
          </div>)}
        </motion.div>
      </div>

      {/* ── MOBILE VIEW (Swipeable Carousel) ── */}
      <div className="flex md:hidden flex-col w-full h-full relative pt-[120px] pb-[80px]">
        {/* Pagination Dots */}
        <div className="flex justify-center items-center gap-3 mb-4 shrink-0 px-4">
          <button aria-label="View room info" onClick={() => carouselRef.current?.scrollTo({ left: 0, behavior: 'smooth' })} className={`h-1.5 rounded-full transition-all duration-300 ${activeTab === 0 ? "w-10 bg-foreground shadow-[0_0_10px_rgba(255,255,255,0.5)]" : "w-3 bg-foreground/20"}`} />
          <button aria-label="View connected devices" onClick={() => carouselRef.current?.scrollTo({ left: window.innerWidth, behavior: 'smooth' })} className={`h-1.5 rounded-full transition-all duration-300 ${activeTab === 1 ? "w-10 bg-foreground shadow-[0_0_10px_rgba(255,255,255,0.5)]" : "w-3 bg-foreground/20"}`} />
          <button aria-label="View music queue" onClick={() => carouselRef.current?.scrollTo({ left: window.innerWidth * 2, behavior: 'smooth' })} className={`h-1.5 rounded-full transition-all duration-300 ${activeTab === 2 ? "w-10 bg-foreground shadow-[0_0_10px_rgba(255,255,255,0.5)]" : "w-3 bg-foreground/20"}`} />
        </div>

        {/* Carousel */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          ref={carouselRef}
          onScroll={handleScroll}
          className="flex-1 w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory flex [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] min-h-0"
        >
          <div className="w-full shrink-0 snap-center h-full px-5 min-h-0">
            {renderInfoPanel()}
          </div>
          <div className="w-full shrink-0 snap-center h-full px-5 min-h-0">
            {renderDevicesPanel()}
          </div>
          <div className="w-full shrink-0 snap-center h-full px-5 min-h-0">
            {renderQueuePanel()}
          </div>
        </motion.div>

        {/* Mobile Leave Button */}
        <div className="absolute bottom-6 left-0 w-full flex justify-center z-10 px-6 pointer-events-none">
          <button 
            onClick={handleLeave} 
            className="pointer-events-auto flex items-center justify-center w-full max-w-[200px] gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-sm tracking-widest uppercase px-6 py-3.5 rounded-full font-bold shadow-lg backdrop-blur-xl border border-red-500/20 transition-all active:scale-95"
          >
            Leave Room
          </button>
        </div>
      </div>
    </main>
  );
}
