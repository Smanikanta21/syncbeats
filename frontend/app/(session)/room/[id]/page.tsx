"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Copy, Users, QrCode, Smartphone, Laptop, Speaker, Volume2, Wifi, WifiOff, CheckCircle2, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRoom }   from "../../../../hooks/useRoom";
import { useAudio }  from "../../../../context/AudioContext";
import { useUpload } from "../../../../context/UploadContext";
import { PlaybackState, Participant, TrackQueueItem } from "../../../../lib/types";
import { useAuth }   from "../../../../context/AuthContext";

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

  const audio  = useAudio();
  const upload = useUpload();
  const [copied, setCopied] = useState(false);
  const { snapshot, participants, isConnected, currentSocketId, clockOffset, allReady, setReady, setParticipantVolume, leave } = useRoom({
    roomId,
    displayName,
  });
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

  const handleCopy = () => {
    try{
      navigator.clipboard.writeText(roomId)
      setCopied(true)

    }catch(err){
      console.error("[Room] Copy failed:", err);
    }
  }

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

  return (
    <div className="flex flex-col items-center md:justify-center relative px-4 sm:px-6 lg:px-8 z-0 pb-32 min-h-[calc(100vh-100px)]">

      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl h-[500px] bg-foreground/5 blur-[150px] rounded-full pointer-events-none -z-10" />

      {/* ── Room code + QR ── */}
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

        <div className="flex flex-col md:flex-row items-center justify-center gap-12 mb-12">
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
            <p className="text-foreground/40 text-xs font-medium mt-2">Click to copy</p>
          </div>

          <div className="hidden md:block w-px h-32 bg-foreground/10" />

          {/* QR */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={handleGenerateQr}
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
                <img
                  src={qrSrc}
                  alt={`QR code for room ${roomId}`}
                  className="w-28 h-28 rounded-xl bg-background p-1"
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
            className="mb-8 px-6 py-4 rounded-2xl border border-dashed border-foreground/10 text-foreground/40 text-sm font-medium flex items-center gap-3"
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
        className="w-full max-w-3xl flex flex-col gap-6"
      >
        <h3 className="text-sm font-bold tracking-widest uppercase text-foreground/50 text-center md:text-left mb-2">
          Connected Devices ({participants.length})
        </h3>

        {participants.length === 0 && (
          <div className="text-center py-16 text-foreground/40 text-sm font-medium">
            Waiting for others to join…
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {participants.map((p: Participant, i: number) => (
            <div
              key={p.socketId}
              className="glass-panel p-5 rounded-[2rem] border border-foreground/5 bg-background/60 hover:bg-foreground/5 transition-colors group flex flex-col gap-4 shadow-[0_10px_20px_rgba(0,0,0,0.4)]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-zinc-800 to-zinc-700 flex items-center justify-center border border-foreground/10 relative">
                    <span className="font-black text-foreground/70 text-sm tracking-widest">
                      {p.displayName.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background border border-zinc-800 flex items-center justify-center">
                      <DeviceIcon index={i} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-foreground">{p.displayName}</h4>
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
                  <span className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-foreground/50" />
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
                    aria-label={`${p.displayName} volume`}
                    className="relative z-10 w-full appearance-none bg-transparent cursor-pointer volume-slider"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {snapshot?.queue?.length ? (
          <div className="mt-2 rounded-2xl border border-foreground/5 bg-background/40 p-4">
            <h4 className="text-xs font-bold tracking-widest uppercase text-foreground/50 mb-3">
              Room Queue ({snapshot.queue.length})
            </h4>
            <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
              {snapshot.queue.map((item: TrackQueueItem) => (
                <div key={item.id} className={`rounded-xl px-3 py-2 text-sm border ${item.isCurrent ? "border-green-500/40 bg-green-500/10 text-green-300" : "border-foreground/5 bg-foreground/5 text-foreground/70"}`}>
                  <div className="font-semibold truncate">{item.title}</div>
                  <div className="text-[11px] uppercase tracking-widest opacity-70">
                    #{item.queueIndex + 1} {item.isCurrent ? "• now playing" : "• queued"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Leave button */}
        <motion.button
          onClick={handleLeave}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="mt-6 mx-auto h-12 px-10 rounded-full border border-red-500/30 text-red-400 font-bold text-sm hover:bg-red-500/10 transition-all uppercase tracking-widest"
        >
          Leave Session
        </motion.button>

        {isConnected && (
          <p className="text-center text-xs text-foreground/40 font-mono">Clock offset: {clockOffset.toFixed(0)}ms</p>
        )}
      </motion.div>
    </div>
  );
}
