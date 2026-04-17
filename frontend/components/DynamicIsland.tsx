"use client";

import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import {
  Disc, Pause, Play, SkipForward, SkipBack,
  Upload, Music2, Loader2, CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth }   from "../context/AuthContext";
import { useAudio }  from "../context/AudioContext";
import { useUpload } from "../context/UploadContext";
import { getSocket } from "../lib/socket";
import { formatTime } from "../hooks/useAudioPlayer";

export function DynamicIsland() {
  const pathname = usePathname();
  const router   = useRouter();
  const { user } = useAuth();
  const audio    = useAudio();
  const upload   = useUpload();

  const [expanded,  setExpanded]  = useState(false);
  const [driveLink, setDriveLink] = useState("");
  const [driveErr,  setDriveErr]  = useState("");

  const pressTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef  = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bounceCtrl   = useAnimation();

  const displayName = user?.name ?? "Guest";
  const initials    = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  const isRoom    = pathname.includes("/room/");
  const isProfile = pathname.includes("/profile");
  const roomId    = isRoom ? (pathname.split("/room/")[1]?.split("/")[0] ?? "") : "";

  // Bounce when a file is dragged over the window
  useEffect(() => {
    if (upload.isDragging) {
      bounceCtrl.start({
        y: [0, -14, 4, -7, 0],
        scale: [1, 1.05, 0.97, 1.02, 1],
        transition: { duration: 0.55, ease: "easeOut", repeat: Infinity, repeatDelay: 0.4 },
      });
    } else {
      bounceCtrl.stop();
      bounceCtrl.set({ y: 0, scale: 1 });
    }
  }, [upload.isDragging, bounceCtrl]);

  // ── Interaction handlers ─────────────────────────────────────────────────
  const clearPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };

  const onMouseEnter = () => {
    if (!isRoom) return;
    // Laptop: remove delay, expand instantly on hover
    setExpanded(true);
  };
  const onMouseLeave = () => {
    // Laptop: smooth shrink on leave
    if (!upload.isUploading) setExpanded(false);
  };
  const onPointerDown = () => {
    if (!isRoom) return;
    // Mobile: hold to expand
    pressTimer.current = setTimeout(() => setExpanded(true), 400);
  };
  const onPointerUp     = () => clearPress();
  const onPointerCancel = () => clearPress();

  // ── Network-Aware Playback Controls ──────────────────────────────────────
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRoom && roomId) {
      if (audio.isPlaying) getSocket().emit('playback:pause', { roomId });
      else                 getSocket().emit('playback:play',  { roomId });
    } else {
      audio.toggle();
    }
  };

  const handleSeek = (posSecs: number) => {
    if (isRoom && roomId) {
      getSocket().emit('playback:seek', { roomId, position: posSecs * 1000 });
    } else {
      audio.seek(posSecs);
    }
  };

  // ── Seek on progress bar click ────────────────────────────────────────────
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const posSecs = pct * audio.duration;
    handleSeek(posSecs);
  };

  // ── Upload handlers ───────────────────────────────────────────────────────
  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChosen = useCallback(async (file: File) => {
    if (!roomId) return;
    try {
      await upload.uploadFile(file, roomId);
      setExpanded(false);
    } catch (err) {
      console.error("Upload failed:", err);
    }
  }, [roomId, upload]);

  const handleDriveLink = () => {
    setDriveErr("");
    const match = driveLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) { setDriveErr("Paste a valid Google Drive share link"); return; }
    const directUrl = `https://drive.google.com/uc?export=download&id=${match[1]}&confirm=t`;
    audio.setTrack(directUrl, "Drive Track");
    setDriveLink("");
    setExpanded(false);
  };

  // ────────────────────────────────────────────────────────────────────────────
  // HUB NAV (not in a room)
  // ────────────────────────────────────────────────────────────────────────────
  if (!isRoom) {
    return (
      <div className="fixed top-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <motion.div layout className="pointer-events-auto bg-black/80 backdrop-blur-3xl w-[90%] max-w-5xl rounded-full border border-white/10 shadow-[0_0_30px_rgba(255,255,255,0.05)]">
          <div className="px-4 sm:px-6 md:px-8 py-4 flex items-center justify-between">
            <Link href="/hub" className="flex items-center gap-2 sm:gap-3 group">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                <Disc className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-300 animate-[spin_5s_linear_infinite]" />
              </div>
              <span className="text-base sm:text-lg font-black tracking-widest text-zinc-200 group-hover:text-white transition-colors">
                SYNC<span className="text-zinc-500">BEATS</span>
              </span>
            </Link>
            <div className="flex items-center gap-4">
              {isProfile ? (
                <Link href="/hub" className="text-xs sm:text-sm font-semibold text-zinc-400 hover:text-white transition-colors uppercase tracking-widest">Done</Link>
              ) : (
                <Link href="/profile" className="flex items-center gap-3 cursor-pointer group">
                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-bold text-zinc-200">{displayName}</div>
                    <div className="text-xs text-zinc-500">{user?.email ?? ""}</div>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-600 flex items-center justify-center border-2 border-transparent group-hover:border-white/20 transition-all">
                    <span className="text-xs sm:text-sm font-bold text-white">{initials}</span>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // IN ROOM — states
  // ────────────────────────────────────────────────────────────────────────────
  const isDragTarget = upload.isDragging;
  const isUploading  = upload.isUploading;
  const hasTrack     = audio.hasTrack;

  return (
    <>
      {/* Invisible backdrop to capture outside taps on mobile and close the island */}
      {expanded && isRoom && !isDragTarget && !isUploading && (
        <div className="fixed inset-0 z-40 pointer-events-auto" onPointerDown={() => setExpanded(false)} />
      )}
      
      <div className="fixed top-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
        {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileChosen(f);
          e.target.value = "";
        }}
      />

      <motion.div
        layout
        animate={bounceCtrl}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        transition={{ layout: { type: "spring", bounce: 0.3, duration: 0.65 } }}
        style={{ borderRadius: expanded ? 40 : 48 }}
        className={`pointer-events-auto bg-black/85 backdrop-blur-3xl border overflow-hidden
          ${isDragTarget
            ? "border-white/40 shadow-[0_0_80px_rgba(255,255,255,0.12)] w-11/12 max-w-sm"
            : expanded
            ? "border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.9)] w-[95%] md:w-[90%] max-w-4xl"
            : "border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.04)] w-fit min-w-[280px] max-w-[95%] md:max-w-3xl"
          }`}
      >
        <AnimatePresence mode="popLayout" initial={false}>

          {/* ━━ DRAG TARGET ━━ */}
          {isDragTarget && (
            <motion.div
              key="drag"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center justify-center py-10 px-6 gap-3 select-none"
            >
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 0.3 }}
              >
                <Music2 className="w-12 h-12 text-white/70" />
              </motion.div>
              <p className="text-2xl font-black text-white tracking-tight">Drop it here</p>
              <p className="text-sm text-zinc-500 font-medium">MP3 · FLAC · WAV · M4A — up to 100 MB</p>
            </motion.div>
          )}

          {/* ━━ UPLOADING ━━ */}
          {!isDragTarget && isUploading && (
            <motion.div
              key="uploading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-8 py-5 flex items-center gap-5"
            >
              <Loader2 className="w-5 h-5 text-white animate-spin shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-zinc-200 mb-2">Uploading to room… {upload.uploadProgress}%</p>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-white rounded-full"
                    style={{ width: `${upload.uploadProgress}%` }}
                    transition={{ ease: "linear" }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* ━━ NO TRACK | EXPANDED → Upload UI ━━ */}
          {!isDragTarget && !isUploading && !hasTrack && expanded && (
            <motion.div
              key="upload-ui"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, delay: 0.15 } }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              className="p-6 md:p-8 flex flex-col gap-5"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Add Music to Room</p>
                <button onClick={() => setExpanded(false)} className="text-xs text-zinc-600 hover:text-zinc-400 font-bold transition-colors">ESC</button>
              </div>

              {/* File upload */}
              <button
                onClick={handlePickFile}
                className="w-full flex items-center gap-4 p-5 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                  <Upload className="w-5 h-5 text-white/60" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-zinc-200">Upload from device</p>
                  <p className="text-xs text-zinc-500 mt-0.5">MP3, FLAC, WAV, M4A · max 100 MB</p>
                </div>
              </button>

              {/* Google Drive */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-zinc-600 uppercase tracking-widest">Or paste a Google Drive link</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={driveLink}
                    onChange={(e) => setDriveLink(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleDriveLink()}
                    placeholder="https://drive.google.com/file/d/…"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-white/30 transition-colors"
                  />
                  <button
                    onClick={handleDriveLink}
                    disabled={!driveLink.trim()}
                    className="px-4 py-2.5 rounded-xl bg-white text-black font-bold text-sm disabled:opacity-30 hover:bg-zinc-100 transition-all shrink-0"
                  >Play</button>
                </div>
                {driveErr && <p className="text-xs text-red-400 font-semibold">{driveErr}</p>}
              </div>

              <p className="text-center text-xs text-zinc-600 font-medium">
                Or drag any audio file anywhere on the page ↗
              </p>
            </motion.div>
          )}

          {/* ━━ NO TRACK | COLLAPSED pill ━━ */}
          {!isDragTarget && !isUploading && !hasTrack && !expanded && (
            <motion.div
              key="empty-pill"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: 0.3, delay: 0.15 } }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              className="px-5 py-3.5 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <Music2 className="w-4 h-4 text-zinc-600" />
                </div>
                <p className="text-sm font-semibold text-zinc-600 hidden sm:block">Hover to add your music and enjoy 🎶</p>
                <p className="text-sm font-semibold text-zinc-600 sm:hidden">Hold to add music</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                className="text-xs font-bold text-zinc-600 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded-full border border-white/5 hover:border-white/20 hover:bg-white/5"
              >Add +</button>
            </motion.div>
          )}

          {/* ━━ HAS TRACK | EXPANDED → Full player ━━ */}
          {!isDragTarget && !isUploading && hasTrack && expanded && (
            <motion.div
              key="player-full"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, delay: 0.15 } }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              className="p-6 md:p-8 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-7">
                <span className="text-xs font-bold tracking-widest text-zinc-500 uppercase flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Live Session
                </span>
                <div className="flex items-center gap-3">
                  <button onClick={handlePickFile} className="text-xs font-bold text-zinc-600 hover:text-zinc-300 flex items-center gap-1.5 transition-colors">
                    <Upload className="w-3.5 h-3.5" /> Add to queue
                  </button>
                  <button onClick={() => router.push("/hub")} className="text-xs font-semibold bg-white/5 hover:bg-red-500/10 hover:text-red-400 px-4 py-1.5 rounded-full text-zinc-400 transition-all">
                    Leave
                  </button>
                </div>
              </div>

              {/* Track info */}
              <div className="flex items-center gap-5 mb-7">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-700 flex items-center justify-center border border-white/10 shrink-0 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                  <Disc className={`w-8 h-8 text-white/40 ${audio.isPlaying ? "animate-[spin_4s_linear_infinite]" : ""}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl sm:text-2xl font-black text-white truncate leading-tight">{audio.trackTitle || "Unknown Track"}</h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    {audio.isReady
                      ? <span className="text-xs text-green-400 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Ready</span>
                      : <span className="text-xs text-zinc-500 font-semibold flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Buffering…</span>
                    }
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mb-7">
                <div
                  ref={progressRef}
                  onClick={handleProgressClick}
                  className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden cursor-pointer group"
                >
                  <div
                    className="h-full bg-white group-hover:bg-zinc-300 rounded-full transition-[width] duration-100"
                    style={{ width: `${audio.progress * 100}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-zinc-500 font-mono font-medium">
                  <span>{formatTime(audio.currentTime)}</span>
                  <span>{formatTime(audio.duration)}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex justify-center items-center gap-8">
                <button onClick={(e) => { e.stopPropagation(); handleSeek(Math.max(0, audio.currentTime - 10)); }}>
                  <SkipBack className="w-7 h-7 text-white/30 hover:text-white transition-colors cursor-pointer" />
                </button>
                <button
                  onClick={handleToggle}
                  className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-[0_0_25px_rgba(255,255,255,0.15)]"
                >
                  {audio.isPlaying
                    ? <Pause className="w-6 h-6" fill="currentColor" />
                    : <Play  className="w-6 h-6 ml-0.5" fill="currentColor" />
                  }
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleSeek(audio.currentTime + 10); }}>
                  <SkipForward className="w-7 h-7 text-white/30 hover:text-white transition-colors cursor-pointer" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ━━ HAS TRACK | COLLAPSED mini-player pill ━━ */}
          {!isDragTarget && !isUploading && hasTrack && !expanded && (
            <motion.div
              key="player-pill"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: 0.3, delay: 0.15 } }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              className="px-4 py-2.5 flex items-center gap-4 sm:gap-6 md:gap-10 justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-700 border border-white/10 flex items-center justify-center shrink-0">
                  <Disc className={`w-4 h-4 text-white/40 ${audio.isPlaying ? "animate-[spin_4s_linear_infinite]" : ""}`} />
                </div>
                <div className="flex flex-col pl-1 max-w-[120px] sm:max-w-[200px] md:max-w-[300px]">
                  <p className="text-sm font-bold text-white leading-tight truncate">{audio.trackTitle}</p>
                  <p className="text-[10px] text-zinc-500 font-mono hidden sm:block">{formatTime(audio.currentTime)} / {formatTime(audio.duration)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <button onClick={(e) => { e.stopPropagation(); handleSeek(Math.max(0, audio.currentTime - 10)); }}>
                  <SkipBack className="w-4 h-4 text-white/40 hover:text-white transition-colors" />
                </button>
                <button
                  onClick={handleToggle}
                  className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                >
                  {audio.isPlaying
                    ? <Pause className="w-3 h-3" fill="currentColor" />
                    : <Play  className="w-3 h-3 ml-0.5" fill="currentColor" />
                  }
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleSeek(audio.currentTime + 10); }}>
                  <SkipForward className="w-4 h-4 text-white/40 hover:text-white transition-colors" />
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
      </div>
    </>
  );
}
