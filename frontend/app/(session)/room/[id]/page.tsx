"use client";

import { motion } from "framer-motion";
import { Copy, Users, QrCode, Smartphone, Laptop, Speaker, Volume2, Wifi, WifiOff } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useRoom } from "../../../../hooks/useRoom";
import { PlaybackState, Participant } from "../../../../lib/types";
import { useAuth } from "../../../../context/AuthContext";
import { useAudio } from "../../../../context/AudioContext";
import { useEffect, useMemo } from "react";

// Helper: pick a nice icon per device (mocked — real impl would come from participant metadata)
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

  const { snapshot, participants, isConnected, isHost, clockOffset, leave, setReady, play, pause, seek } = useRoom({
    roomId,
    displayName,
  });

  const audio = useAudio();

  useEffect(() => {
    if (isConnected) {
      setReady(audio.isReady);
    }
  }, [audio.isReady, isConnected, setReady]);

  const allReady = useMemo(() => {
    return participants.every(p => p.isReady);
  }, [participants]);

  // Sync Room -> Audio Context for DynamicIsland to consume
  useEffect(() => {
    audio.setIsRoomHost(isHost);
    audio.setAllDevicesReady(allReady);
    audio.setRoomCallbacks({ play, pause, seek });
  }, [isHost, allReady, play, pause, seek, audio.setIsRoomHost, audio.setAllDevicesReady, audio.setRoomCallbacks]);

  // Handle Playback State syncing
  useEffect(() => {
    if (!snapshot || !audio.audioEl) return;

    if (snapshot.state === PlaybackState.PLAYING) {
      if (!audio.isPlaying) {
        // Compute correct position to play from
        const elapsed = (Date.now() - snapshot.timestamp) + clockOffset;
        const currentTargetPos = (snapshot.position + elapsed) / 1000;
        
        // Only jump if we are desynced by more than 100ms
        if (Math.abs(audio.audioEl.currentTime - currentTargetPos) > 0.1) {
             audio.audioEl.currentTime = currentTargetPos;
        }
        audio.audioEl.play().catch(e => console.warn("Failed to auto-play", e));
      }
    } else {
      if (audio.isPlaying || (!audio.audioEl.paused)) {
        audio.audioEl.pause();
      }
    }
  }, [snapshot, audio.audioEl, audio.isPlaying, clockOffset]);

  const handleLeave = () => {
    leave();
    router.push("/hub");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(roomId).catch(() => {});
  };

  return (
    <div className="flex flex-col items-center justify-start relative px-4 sm:px-6 lg:px-8 mt-[450px] z-0 pb-32">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl h-[500px] bg-white/[0.015] blur-[150px] rounded-full pointer-events-none -z-10" />

      {/* Code & QR Section */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="text-center w-full max-w-4xl flex flex-col items-center"
      >
        {/* Live badge + connection indicator */}
        <div className="flex items-center gap-3 mb-6">
          <span className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-zinc-300 text-sm font-semibold tracking-widest inline-flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.05)]">
            <Users className="w-4 h-4 text-zinc-400" />
            Sync Session Active
          </span>
          <span className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-widest inline-flex items-center gap-1.5 border ${isConnected ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isConnected ? "Connected" : "Connecting…"}
          </span>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-center gap-12 mb-16">
          {/* Room Code */}
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

          {/* QR Code */}
          <div className="flex flex-col items-center">
            <div className="p-4 bg-white/5 border border-white/10 rounded-3xl shadow-[0_0_30px_rgba(255,255,255,0.05)] hover:scale-105 transition-transform cursor-pointer group hover:bg-white">
              <QrCode className="w-28 h-28 text-white group-hover:text-black transition-colors" strokeWidth={1} />
            </div>
            <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs mt-4">Scan to Join</p>
          </div>
        </div>

        {/* Playback state indicator */}
        {snapshot && (
          <div className="mb-8 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            <span className={`w-2 h-2 rounded-full ${snapshot.state === PlaybackState.PLAYING ? "bg-green-400 animate-pulse" : "bg-zinc-600"}`} />
            {snapshot.state === PlaybackState.PLAYING ? "Playing" : snapshot.state}
            {isConnected && <span className="ml-4 text-zinc-600">Clock offset: {clockOffset.toFixed(0)}ms</span>}
          </div>
        )}
      </motion.div>

      {/* Connected Devices Grid */}
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
                    <p className={`text-xs font-bold ${p.isReady ? "text-green-500" : "text-yellow-500 animate-pulse"}`}>
                      {snapshot?.state === PlaybackState.PLAYING 
                        ? "Synced • 0ms" 
                        : (p.isReady ? "Ready to play" : "Buffering...")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Volume bar (UI only — volume API comes in next phase) */}
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
        {isHost && (
          <motion.button
            onClick={handleLeave}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="mt-6 mx-auto h-12 px-10 rounded-full border border-red-500/30 text-red-400 font-bold text-sm hover:bg-red-500/10 transition-all uppercase tracking-widest"
          >
            End Session
          </motion.button>
        )}
      </motion.div>
    </div>
  );
}
