"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Copy, Users, QrCode, Smartphone, Laptop, Speaker, Volume2, Wifi, WifiOff, CheckCircle2, Loader2, ListMusic, Trash2, Music2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useRoom }   from "../../../../hooks/useRoom";
import { useAudio }  from "../../../../context/AudioContext";
import { useUpload } from "../../../../context/UploadContext";
import { PlaybackState, Participant, TrackQueueItem } from "../../../../lib/types";
import { useAuth }   from "../../../../context/AuthContext";
import { getAuthToken } from "../../../../lib/api";
import { getSocket } from "../../../../lib/socket";
import { useSpatialAudio } from "../../../../hooks/useSpatialAudio";
import OrbitUI from "../../../../components/OrbitUI";
import type { SpatialPosition, DeviceSpatialState } from "../../../../audio/SpatialAudioEngine";

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
  const displayName = device?.name ?? user?.name ?? "Guest";
  const myDeviceId = device?.id ?? "unknown";

  const audio  = useAudio();
  const upload = useUpload();
  const [copied, setCopied] = useState(false);
  const { snapshot, participants, isConnected, currentSocketId, clockOffset, allReady, setReady, setParticipantVolume, leave } = useRoom({
    roomId,
    displayName,
  });
  const [qrState, setQrState] = useState<"mock" | "generating" | "ready">("mock");
  const qrTimerRef = useRef<number | null>(null);

  // ── Spatial Audio ─────────────────────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Keep the ref synced with the AudioContext's element
  useEffect(() => {
    audioRef.current = audio.audioEl;
  }, [audio.audioEl]);

  const socket = useMemo(() => {
    try { return getSocket(); } catch { return null; }
  }, []);

  const {
    updatePosition,
    spatialDevices,
    engineState,
    resumeAudio,
  } = useSpatialAudio({
    socket,
    audioRef,
    myDeviceId,
    roomId,
    enabled: true,
    initialDevices: snapshot?.spatial ?? [],
  });

  // Build display names map for OrbitUI labels
  const displayNames = useMemo(() => {
    const map: Record<string, string> = {};
    participants.forEach(p => {
      // Map socket IDs or device IDs to display names
      map[p.socketId] = p.displayName;
    });
    map[myDeviceId] = displayName;
    return map;
  }, [participants, myDeviceId, displayName]);

  // ── Orbit drag handler ───────────────────────────────────────────────────
  const handlePositionChange = useCallback((deviceId: string, position: SpatialPosition) => {
    updatePosition(deviceId, position);
  }, [updatePosition]);

  // Fallback spatial devices from participants if server doesn't send spatial events yet
  const effectiveDevices: DeviceSpatialState[] = useMemo(() => {
    if (spatialDevices.length > 0) return spatialDevices;
    // Generate default orbit positions from participants
    return participants.map((p, i) => ({
      deviceId: p.socketId,
      position: {
        angle: (i / Math.max(1, participants.length)) * Math.PI * 2 - Math.PI / 2,
        radius: 1,
        elevation: 0,
      },
    }));
  }, [spatialDevices, participants]);

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
  const dragCounter = useRef(0);

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
      const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? `http://${window.location.hostname}:4000`;
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

  const handleGenerateQr = () => {
    if (qrState === "ready" || qrState === "generating") return;
    setQrState("generating");
    qrTimerRef.current = window.setTimeout(() => {
      setQrState("ready");
    }, 1300);
  };

  // ── Orb size (responsive) ────────────────────────────────────────────────
  const [orbSize, setOrbSize] = useState(340);
  const [activeTab, setActiveTab] = useState<"spatial" | "info">("info");

  useEffect(() => {
    if (audio.hasTrack) setActiveTab("spatial");
    else setActiveTab("info");
  }, [audio.hasTrack]);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Use the smaller of width/height, capped
      const available = Math.min(w * 0.6, h * 0.5);
      setOrbSize(Math.max(240, Math.min(500, available)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div className="absolute inset-x-0 top-0 bottom-0 pt-[100px] lg:pt-[120px] pb-safe flex flex-col lg:flex-row lg:px-6 lg:pb-6 gap-6 overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl h-[500px] bg-foreground/5 blur-[150px] rounded-full pointer-events-none -z-10" />

      {/* LEFT COLUMN: DEVICES (Wide Desktop Only) */}
      <div className="hidden lg:flex w-[320px] xl:w-[360px] shrink-0 flex-col gap-4 min-h-0 z-10">
        <div className="glass-panel rounded-3xl p-6 flex-1 flex flex-col min-h-0 border border-foreground/10 bg-background/40 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-bold tracking-widest uppercase text-foreground/50 flex items-center gap-2">
              <Users className="w-4 h-4" /> Network ({participants.length})
            </h3>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest inline-flex items-center gap-1.5 border ${isConnected ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isConnected ? "Connected" : "Connecting"}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3 custom-scrollbar">
            {participants.length === 0 && (
              <div className="text-center py-10 text-foreground/40 text-sm font-medium">Waiting for others to join…</div>
            )}
            {participants.map((p: Participant, i: number) => (
              <div key={p.socketId} className="bg-foreground/5 p-4 rounded-2xl border border-foreground/5 hover:bg-foreground/10 transition-colors group flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-zinc-800 to-zinc-700 flex items-center justify-center border border-foreground/10 relative shrink-0">
                    <span className="font-black text-foreground/70 text-xs tracking-widest">{p.displayName.slice(0, 2).toUpperCase()}</span>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-background border border-zinc-800 flex items-center justify-center">
                      <DeviceIcon index={i} />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-foreground truncate">{p.displayName}</h4>
                      {snapshot?.hostId === p.socketId && <span className="px-1.5 py-[1px] rounded text-[9px] uppercase font-black tracking-widest bg-foreground text-background shrink-0">Host</span>}
                    </div>
                    <p className="text-[10px] font-medium text-foreground/50 flex items-center gap-1 mt-0.5">
                      {p.isReady ? <><CheckCircle2 className="w-2.5 h-2.5 text-green-400" /><span className="text-green-400">Buffered</span></> : audio.hasTrack ? <><Loader2 className="w-2.5 h-2.5 animate-spin" /> Buffering…</> : "Ready"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full glass-panel px-3 py-1.5 rounded-lg border border-foreground/5">
                  <Volume2 className="w-3.5 h-3.5 text-foreground/40" />
                  <input type="range" min="0" max="100" className="flex-1 volume-slider" value={p.volume ?? 100} onChange={(e) => handleVolumeChange(p.socketId, parseInt(e.target.value))} />
                  <span className="text-[10px] font-bold text-foreground/40 w-6 text-right">{p.volume ?? 100}%</span>
                </div>
              </div>
            ))}
          </div>
          
          <button
            onClick={handleLeave}
            className="mt-4 w-full h-10 rounded-xl border border-red-500/30 text-red-400 font-bold text-[10px] hover:bg-red-500/10 transition-all uppercase tracking-widest"
          >
            Leave Session
          </button>
        </div>
      </div>

      {/* CENTER COLUMN: ORB VISUALIZER */}
      <div className="flex-1 flex flex-col items-center justify-center relative min-h-0 px-4">
      <div className="flex-1 flex flex-col items-center justify-center relative min-h-0 px-4">
        <motion.div
           key="unified-state"
           initial={{ opacity: 0, scale: 0.95 }}
           animate={{ opacity: 1, scale: 1 }}
           className="flex flex-col items-center justify-center w-full h-full relative pt-16"
        >
          {/* TABS (Spatial vs Info) */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 flex items-center bg-foreground/5 p-1 rounded-full z-40 backdrop-blur-md border border-foreground/5 shadow-sm">
            {(["info", "spatial"] as const).map((tab) => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)} 
                className={`relative px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${activeTab === tab ? 'text-foreground' : 'text-foreground/50 hover:text-foreground'}`}
              >
                {activeTab === tab && (
                  <motion.div
                    layoutId="active-tab-indicator"
                    className="absolute inset-0 bg-background rounded-full shadow-sm"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{tab === 'info' ? 'Room Info' : '3D Spatial Audio'}</span>
              </button>
            ))}
          </div>

          {/* VIEW: INFO TAB */}
          <AnimatePresence mode="wait">
            {activeTab === "info" && (
               <motion.div 
                 key="info-tab"
                 initial={{ opacity: 0, scale: 0.95 }} 
                 animate={{ opacity: 1, scale: 1 }} 
                 exit={{ opacity: 0, scale: 0.9 }} 
                 className="absolute inset-0 flex flex-col items-center justify-center z-20"
               >
                 {/* QR Code */}
                 {qrState === "mock" && (
                   <button type="button" onClick={handleGenerateQr} className="w-24 h-24 rounded-3xl bg-background border border-foreground/10 flex items-center justify-center mb-6 cursor-pointer hover:bg-foreground/5 hover:scale-105 transition-all shadow-xl group">
                     <QrCode className="w-10 h-10 text-foreground/60 group-hover:text-foreground" strokeWidth={1.5} />
                   </button>
                 )}
                 {qrState === "generating" && (
                   <div className="w-24 h-24 rounded-3xl bg-background border border-foreground/10 flex items-center justify-center mb-6 shadow-xl">
                     <Loader2 className="w-8 h-8 text-foreground/60 animate-spin" />
                   </div>
                 )}
                 {qrState === "ready" && (
                   <img src={qrSrc} alt="Room QR" className="w-24 h-24 rounded-2xl bg-background p-1.5 mb-6 shadow-xl" />
                 )}

                 {/* Room Code */}
                 <h1 onClick={handleCopy} className="text-5xl sm:text-7xl font-black text-foreground cursor-pointer hover:scale-105 transition-transform flex items-center gap-4 drop-shadow-xl select-all z-30 bg-background/50 px-8 py-4 rounded-[2.5rem] backdrop-blur-md border border-foreground/5">
                   {roomId}
                   {copied ? <CheckCircle2 className="w-8 h-8 text-green-400" /> : <Copy className="w-8 h-8 text-foreground/40" />}
                 </h1>
                 <p className="text-xs text-foreground/50 font-bold uppercase tracking-widest mt-4">
                   {copied ? "Copied to clipboard!" : "Click to copy code"}
                 </p>
               </motion.div>
            )}
          </AnimatePresence>

          {/* VIEW: SPATIAL TAB (Orb + Canvas) */}
          <div className="relative flex-1 w-full flex flex-col items-center justify-center" style={{ visibility: activeTab === 'spatial' ? 'visible' : 'hidden', opacity: activeTab === 'spatial' ? 1 : 0, transition: 'opacity 0.3s' }}>
            {/* The Orb Container — transitions between 2D and 3D */}
            <motion.div
              className="relative flex items-center justify-center rounded-full"
              style={{ perspective: "1000px" }}
              animate={{
                rotateX: audio.isPlaying ? 50 : 0,
              }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Glossy 3D overlay block */}
              <div 
                className={`absolute inset-0 rounded-full z-10 pointer-events-none transition-opacity duration-1000 ${audio.isPlaying ? 'opacity-100' : 'opacity-0'}`} 
                style={{ background: 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.06) 0%, transparent 60%), linear-gradient(to bottom, rgba(255,255,255,0.03) 0%, transparent 40%, rgba(0,0,0,0.4) 100%)', boxShadow: 'inset 0 2px 20px rgba(255,255,255,0.05)' }} 
              />

              {/* Pulsing ring when playing */}
              {audio.isPlaying && (
                <motion.div
                  className="absolute rounded-full border-2 border-accent-primary/20 pointer-events-none"
                  style={{ width: orbSize + 40, height: orbSize + 40 }}
                  animate={{ scale: [1, 1.15], opacity: [0.5, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
                />
              )}

              {/* Outer glow ring */}
              <div
                className="absolute rounded-full border border-foreground/5 pointer-events-none"
                style={{ width: orbSize + 60, height: orbSize + 60 }}
              />

              {/* The OrbitUI canvas */}
              <motion.div
                style={{ transformStyle: "preserve-3d" }}
                animate={{
                  rotateZ: audio.isPlaying ? 360 : 0,
                }}
                transition={audio.isPlaying
                  ? { duration: 120, repeat: Infinity, ease: "linear" }
                  : { duration: 2, ease: "easeOut" }
                }
              >
                <OrbitUI
                  devices={effectiveDevices}
                  myDeviceId={myDeviceId}
                  onPositionChange={handlePositionChange}
                  size={orbSize}
                  displayNames={displayNames}
                />
              </motion.div>
            </motion.div>
          </div>

          {/* Below the Orb */}
          <div className="mt-8 flex flex-col items-center z-10 w-full max-w-md h-[100px]">
             {activeTab === 'spatial' && audio.hasTrack ? (
               <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center w-full">
                  <h2 className="text-xl sm:text-3xl font-black text-foreground text-center line-clamp-1 mb-3 drop-shadow-lg px-4">{audio.trackTitle}</h2>
                  <div className="flex flex-col items-center gap-1.5">
                    {allReady
                      ? <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> All synced</span>
                      : <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Buffering</span>
                    }
                    <p className="text-[9px] text-foreground/40 font-mono">Clock: {clockOffset.toFixed(0)}ms • Spatial: {engineState}</p>
                  </div>
               </motion.div>
             ) : activeTab === 'spatial' && !audio.hasTrack ? (
               <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4">
                  <div className="flex items-center gap-2 bg-foreground/5 border border-foreground/10 px-4 py-2 rounded-full backdrop-blur-md">
                     <Speaker className="w-4 h-4 text-foreground/60" />
                     <span className="text-xs font-bold text-foreground">3D Spatial Audio Room</span>
                  </div>
                  <div className="text-xs font-medium text-foreground/40 flex items-center gap-2 border border-dashed border-foreground/10 px-4 py-2 rounded-xl">
                     <Music2 className="w-4 h-4" /> Drop audio files anywhere to start
                  </div>
               </motion.div>
             ) : null}
          </div>
        </motion.div>
      </div>
      </div>

      {/* RIGHT COLUMN: QUEUE & OPTIONS (Wide Desktop Only) */}
      <div className="hidden lg:flex w-[320px] xl:w-[360px] shrink-0 flex-col gap-4 min-h-0 z-10">
        <div className="glass-panel rounded-3xl p-6 flex-1 flex flex-col min-h-0 border border-foreground/10 bg-background/40 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-bold tracking-widest uppercase text-foreground/50 flex items-center gap-2">
              <ListMusic className="w-4 h-4" /> Up Next
            </h3>
            <button className="text-xs font-bold tracking-widest uppercase text-foreground hover:opacity-80 transition-opacity">
               Add +
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {(!snapshot?.queue || snapshot.queue.length === 0) ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-foreground/30 px-4">
                 <ListMusic className="w-12 h-12 mb-3 opacity-20" />
                 <p className="text-sm font-medium">Queue is empty</p>
                 <p className="text-xs mt-1">Drop files here to play them next.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {snapshot.queue.map((track: TrackQueueItem, i: number) => (
                  <div key={i} className="p-3 rounded-2xl bg-foreground/5 border border-foreground/5 flex items-center gap-3 group hover:bg-foreground/10 transition-colors cursor-pointer">
                    <div className="w-10 h-10 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
                      <Music2 className="w-4 h-4 text-foreground/50" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{track.title || "Unknown Track"}</p>
                      <p className="text-[10px] font-semibold text-foreground/40 mt-0.5">Added by {track.addedBy || "Someone"}</p>
                    </div>
                    {!track.isCurrent && (
                      <button onClick={(e) => handleRemoveTrack(e, track.id)} className="w-8 h-8 rounded-full hover:bg-red-500/10 text-foreground/20 hover:text-red-500 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
