"use client";

import { motion } from "framer-motion";
import { Copy, Users, QrCode, Smartphone, Laptop, Speaker, Volume2, Wifi, WifiOff, CheckCircle2, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useRoom }   from "../../../../hooks/useRoom";
import { useAudio }  from "../../../../context/AudioContext";
import { useUpload } from "../../../../context/UploadContext";
import { PlaybackState, Participant } from "../../../../lib/types";
import { useAuth }   from "../../../../context/AuthContext";

function DeviceIcon({ index }: { index: number }) {
  const icons = [Smartphone, Laptop, Speaker];
  const Icon  = icons[index % icons.length];
  return <Icon className="w-3 h-3 text-zinc-400" />;
}

export default function RoomPage() {
  const params  = useParams();
  const router  = useRouter();
  const roomId  = (params?.id as string) ?? "000000";
  const { user, device } = useAuth();
  const displayName = device?.name ?? user?.name ?? "Guest";

  const audio  = useAudio();
  const upload = useUpload();

  const { snapshot, participants, isConnected, clockOffset, allReady, setReady, leave } = useRoom({
    roomId,
    displayName,
  });

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
        const { trackUrl, title } = await upload.uploadFile(file, roomId);
        audio.setTrack(trackUrl, title);
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

  const handleLeave = () => {
    leave();
    router.push("/hub");
  };

  const handleCopy = () => navigator.clipboard.writeText(roomId).catch(() => {});

  return (
    <div className="flex flex-col items-center md:justify-center relative px-4 sm:px-6 lg:px-8 z-0 pb-32 min-h-[calc(100vh-100px)]">
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl h-[500px] bg-white/[0.015] blur-[150px] rounded-full pointer-events-none -z-10" />

      {/* ── Room code + QR ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="text-center w-full max-w-4xl flex flex-col items-center"
      >
        {/* Badges */}
        <div className="flex items-center gap-3 mb-6">
          <span className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-zinc-300 text-sm font-semibold tracking-widest inline-flex items-center gap-2">
            <Users className="w-4 h-4 text-zinc-400" /> Sync Session Active
          </span>
          <span className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-widest inline-flex items-center gap-1.5 border ${isConnected ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isConnected ? "Connected" : "Connecting…"}
          </span>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-center gap-12 mb-12">
          {/* Room code */}
          <div className="text-center">
            <p className="text-zinc-500 font-bold uppercase tracking-widest text-sm mb-2">Room Code</p>
            <h1
              onClick={handleCopy}
              className="text-[5rem] sm:text-[7rem] font-black text-white tracking-tighter leading-none flex items-center justify-center gap-4 group cursor-pointer drop-shadow-2xl select-all"
            >
              {roomId}
              <div className="w-12 h-12 rounded-full bg-white/10 hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Copy className="w-5 h-5 text-zinc-200" />
              </div>
            </h1>
            <p className="text-zinc-600 text-xs font-medium mt-2">Click to copy</p>
          </div>

          <div className="hidden md:block w-px h-32 bg-white/10" />

          {/* QR */}
          <div className="flex flex-col items-center">
            <div className="p-4 bg-white/5 border border-white/10 rounded-3xl hover:scale-105 transition-transform cursor-pointer group hover:bg-white">
              <QrCode className="w-28 h-28 text-white group-hover:text-black transition-colors" strokeWidth={1} />
            </div>
            <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs mt-4">Scan to Join</p>
          </div>
        </div>

        {/* Playback / readiness status */}
        {snapshot && (
          <div className="mb-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest flex-wrap justify-center">
            <span className={`flex items-center gap-1.5 ${snapshot.state === PlaybackState.PLAYING ? "text-green-400" : "text-zinc-500"}`}>
              <span className={`w-2 h-2 rounded-full ${snapshot.state === PlaybackState.PLAYING ? "bg-green-400 animate-pulse" : "bg-zinc-600"}`} />
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
            className="mb-8 px-6 py-4 rounded-2xl border border-dashed border-white/10 text-zinc-600 text-sm font-medium flex items-center gap-3"
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
        <h3 className="text-sm font-bold tracking-widest uppercase text-zinc-500 text-center md:text-left mb-2">
          Connected Devices ({participants.length})
        </h3>

        {participants.length === 0 && (
          <div className="text-center py-16 text-zinc-600 text-sm font-medium">
            Waiting for others to join…
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {participants.map((p: Participant, i: number) => (
            <div
              key={p.socketId}
              className="glass-panel p-5 rounded-[2rem] border border-white/5 bg-black/60 hover:bg-white/[0.03] transition-colors group flex flex-col gap-4 shadow-[0_10px_20px_rgba(0,0,0,0.4)]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-zinc-800 to-zinc-700 flex items-center justify-center border border-white/10 relative">
                    <span className="font-black text-zinc-300 text-sm tracking-widest">
                      {p.displayName.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center">
                      <DeviceIcon index={i} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-zinc-200">{p.displayName}</h4>
                      {snapshot?.hostId === p.socketId && (
                        <span className="px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-widest bg-zinc-200 text-black">Host</span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
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

              {/* Volume bar (UI placeholder) */}
              <div className="flex items-center gap-3 w-full bg-black/40 p-3 rounded-xl border border-white/5">
                <Volume2 className="w-4 h-4 text-zinc-500" />
                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-zinc-300 rounded-full" style={{ width: "80%" }} />
                </div>
                <span className="text-xs font-bold text-zinc-500 w-8 text-right">80%</span>
              </div>
            </div>
          ))}
        </div>

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
          <p className="text-center text-xs text-zinc-700 font-mono">Clock offset: {clockOffset.toFixed(0)}ms</p>
        )}
      </motion.div>
    </div>
  );
}
