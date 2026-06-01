"use client";

import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import {
  Disc, Pause, Play, SkipForward, SkipBack,
  Upload, Music2, Loader2, CheckCircle2, Activity, Play as Youtube
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useAudio } from "../context/AudioContext";
import { useUpload } from "../context/UploadContext";
import { getSocket } from "../lib/socket";
import { roomsApi } from "../lib/api";
import { formatTime } from "../hooks/useAudioPlayer";
import { ThemeToggle } from "./ThemeToggle";
import { useSyncInfo } from "../context/SyncContext";
import { useNetworkStats, qualityColor } from "../hooks/useNetworkStats";
import { NetworkPill, NetworkExpanded } from "./NetworkStats";
import { YouTubeSearchModal } from "./YouTubeSearchModal";

export function DynamicIsland() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, token } = useAuth();
  const audio = useAudio();
  const upload = useUpload();
  const { clockOffset, isRoomPlaying, participants: roomParticipants } = useSyncInfo();

  const isRoom = pathname.includes("/room/");

  const [expanded, setExpanded] = useState(false);
  const [pillView, setPillView] = useState<"player" | "network" | "youtube">("player");
  const [driveLink, setDriveLink] = useState("");
  const [driveErr, setDriveErr] = useState("");
  const [youtubeLink, setYoutubeLink] = useState("");
  const [youtubeErr, setYoutubeErr] = useState("");
  const [isYoutubeLoading, setIsYoutubeLoading] = useState(false);
  const [youtubeQuery, setYoutubeQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const netStats = useNetworkStats(isRoom);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bounceCtrl = useAnimation();

  const displayName = user?.name ?? "Guest";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  const isProfile = pathname.includes("/profile");
  const roomId = isRoom ? (pathname.split("/room/")[1]?.split("/")[0] ?? "") : "";

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

  const clearPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHover = () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); };

  const onMouseEnter = () => {
    if (!isRoom || upload.isUploading || upload.isDownloadingYt || isSyncing) return;
    clearHover();
    hoverTimerRef.current = setTimeout(() => setExpanded(true), 800);
  };
  const onMouseLeave = () => {
    clearHover();
    if (!upload.isUploading && !upload.isDownloadingYt && !isSyncing) setExpanded(false);
  };

  const onPointerDown = () => {
    if (!isRoom || upload.isUploading || upload.isDownloadingYt || isSyncing) return;
    pressTimer.current = setTimeout(() => setExpanded(true), 400);
  };
  const onPointerUp = () => clearPress();
  const onPointerCancel = () => clearPress();

  const hasTrack = audio.hasTrack;
  const effectivePlaying = isRoom ? isRoomPlaying : audio.isPlaying;
  const isAnyDeviceBuffering = effectivePlaying && hasTrack && roomParticipants.some(p => !p.isReady && !p.isBlocked);
  const isPillBuffering = (
    audio.isBuffering ||
    isAnyDeviceBuffering ||
    (!audio.isReady && (effectivePlaying || !audio.trackUrl?.startsWith("youtube:")))
  ) && hasTrack;

  const currentTrackUrl = audio.trackUrl;
  const activeTransfer = currentTrackUrl ? upload.activeTransfers[currentTrackUrl] : null;
  const isSyncing = !!activeTransfer;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    audio.unlockAudio();
    if (isRoom && roomId) {
      if (effectivePlaying) {
        const exactPos = audio.getTruePosition();
        audio.pauseAt(exactPos);
        getSocket().emit('playback:pause', { roomId, positionMs: exactPos * 1000 });
      } else {
        getSocket().emit('playback:play', { roomId });
      }
    } else {
      audio.toggle();
    }
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    audio.unlockAudio();
    if (isRoom && roomId) getSocket().emit('playback:next', { roomId });
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    audio.unlockAudio();
    if (isRoom && roomId) getSocket().emit('playback:prev', { roomId });
  };

  const handleSeek = (posSecs: number) => {
    if (isRoom && roomId) {
      getSocket().emit('playback:seek', { roomId, position: posSecs * 1000 });
    } else {
      audio.seek(posSecs);
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const posSecs = pct * audio.duration;
    handleSeek(posSecs);
  };

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

  const handleYoutubeSubmit = async () => {
    if (!roomId) return;
    setYoutubeErr("");
    setIsYoutubeLoading(true);

    try {
      audio.unlockAudio();
      await roomsApi.enqueueYoutube(roomId, youtubeLink);

      setYoutubeLink("");
      setExpanded(false);
      setPillView("player");
    } catch (err: any) {
      setYoutubeErr(err.message);
    } finally {
      setIsYoutubeLoading(false);
    }
  };

  const handleYoutubeSearch = async () => {
    if (!roomId || !youtubeQuery.trim()) return;
    setIsSearching(true);
    setYoutubeErr("");
    try {
      const results = await roomsApi.searchYoutube(roomId, youtubeQuery.trim());
      setSearchResults(results);
      setIsModalOpen(true);
    } catch (err: any) {
      setYoutubeErr(err.message ?? "Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  if (!isRoom) {
    return (
      <div className="fixed top-4 sm:top-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <motion.div layout className="pointer-events-auto glass-panel bg-background/80 backdrop-blur-3xl w-[92%] max-w-5xl rounded-[2rem] px-4 sm:px-6 md:px-8 py-3.5 flex items-center justify-between shadow-2xl">
          <Link href="/hub" className="flex items-center gap-2 sm:gap-3 group">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-foreground/5 border border-foreground/10 flex items-center justify-center group-hover:bg-foreground/10 group-hover:scale-105 transition-all outline-none">
              <Disc className="w-4 h-4 sm:w-5 sm:h-5 text-foreground/70 animate-[spin_5s_linear_infinite]" />
            </div>
            <span className="text-base sm:text-lg font-black tracking-widest text-foreground transition-opacity hover:opacity-80">
              SYNC<span className="text-foreground/50">BEATS</span>
            </span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <ThemeToggle />
            <div className="w-px h-6 bg-foreground/10 hidden sm:block" />
            {isProfile ? (
              <Link href="/hub" className="h-9 px-5 flex items-center justify-center rounded-xl bg-foreground/10 text-foreground text-xs sm:text-sm font-bold tracking-widest uppercase hover:bg-foreground hover:text-background active:scale-95 transition-all">Done</Link>
            ) : (
              <Link href="/profile" className="flex items-center gap-3 cursor-pointer group outline-none">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-bold text-foreground">{displayName}</div>
                  <div className="text-xs font-semibold text-foreground/40">{user?.email ?? ""}</div>
                </div>
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl  flex items-center justify-center border-2 border-transparent glass-panel group-active:scale-95 transition-all shadow-md">
                  <span className="text-xs sm:text-sm font-black text-foreground">{initials}</span>
                </div>
              </Link>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  const isDragTarget = upload.isDragging;
  const isUploading = upload.isUploading;

  return (
    <>
      {expanded && isRoom && !isDragTarget && !isUploading && (
        <div className="fixed inset-0 z-40 pointer-events-auto" onPointerDown={() => { setExpanded(false); setPillView("player"); }} />
      )}

      <div className="fixed top-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
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
          className={`pointer-events-auto bg-background/85 backdrop-blur-3xl border overflow-hidden
          ${isDragTarget
              ? "border-foreground/40 shadow-[0_0_80px_rgba(0,0,0,0.12)] dark:shadow-[0_0_80px_rgba(255,255,255,0.12)] w-11/12 max-w-sm"
              : expanded
                ? "border-foreground/10 shadow-[0_20px_80px_rgba(0,0,0,0.9)] w-[95%] md:w-[90%] max-w-4xl"
                : "border-foreground/10 shadow-[0_0_20px_rgba(0,0,0,0.04)] dark:shadow-[0_0_20px_rgba(255,255,255,0.04)] w-fit min-w-[280px] max-w-[95%] md:max-w-3xl"
            }`}
        >
          <AnimatePresence mode="popLayout" initial={false}>

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
                  <Music2 className="w-12 h-12 text-foreground/70" />
                </motion.div>
                <p className="text-2xl font-black text-foreground tracking-tight">Drop it here</p>
                <p className="text-sm text-foreground/50 font-medium">MP3 · FLAC · WAV · M4A — up to 100 MB</p>
              </motion.div>
            )}

            {!isDragTarget && isUploading && (
              <motion.div
                key="uploading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-8 py-5 flex items-center gap-5"
              >
                <Loader2 className="w-5 h-5 text-foreground animate-spin shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground/80 mb-2">Uploading to room… {upload.uploadProgress}%</p>
                  <div className="h-1.5 w-full bg-foreground/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-foreground rounded-full"
                      style={{ width: `${upload.uploadProgress}%` }}
                      transition={{ ease: "linear" }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {!isDragTarget && !isUploading && upload.isDownloadingYt && (
              <motion.div
                key="yt-downloading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-6 py-3.5 flex items-center gap-4 w-[280px] sm:w-[320px]"
              >
                <div className="w-8 h-8 rounded-full bg-foreground/5 border border-foreground/10 flex items-center justify-center shrink-0">
                  <Loader2 className="w-4 h-4 text-foreground animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground leading-tight truncate">Downloading track…</p>
                  <p className="text-[10px] text-foreground/50 font-medium truncate mt-0.5">{upload.ytDownloadTitle}</p>
                </div>
              </motion.div>
            )}

            {!isDragTarget && !isUploading && !upload.isDownloadingYt && activeTransfer && (
              <motion.div
                key="p2p-syncing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-6 py-3.5 flex items-center gap-4 w-[280px] sm:w-[320px]"
              >
                <div className="w-8 h-8 rounded-full bg-foreground/5 border border-foreground/10 flex items-center justify-center shrink-0">
                  <Loader2 className="w-4 h-4 text-foreground animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground leading-tight truncate">Syncing track…</p>
                  <p className="text-[10px] text-foreground/50 font-medium truncate mt-0.5">{audio.trackTitle || "Audio Track"} — {activeTransfer.progress}%</p>
                </div>
              </motion.div>
            )}

            {!isDragTarget && !isUploading && !upload.isDownloadingYt && !isSyncing && !hasTrack && expanded && (
              <motion.div
                key="upload-ui"
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, delay: 0.15 } }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                className="p-6 md:p-8 flex flex-col gap-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold tracking-widest text-foreground/50 uppercase">Add Music to Room</p>
                  <button onClick={() => setExpanded(false)} className="text-xs text-foreground/40 hover:text-foreground/60 font-bold transition-colors">ESC</button>
                </div>

                <div className="flex items-center gap-1 p-1 rounded-xl bg-foreground/[0.04] border border-foreground/[0.06] mb-2 self-start">
                  <button onClick={() => setPillView("player")} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${pillView === "player" ? "bg-foreground text-background shadow-sm" : "text-foreground/40 hover:text-foreground/60"}`}>
                    Files
                  </button>
                  <button onClick={() => setPillView("youtube")} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${pillView === "youtube" ? "bg-[#FF0000] text-white shadow-sm" : "text-foreground/40 hover:text-foreground/60"}`}>
                    YouTube
                  </button>
                </div>

                {pillView === "youtube" ? (
                  <div className="flex flex-col gap-3">
                    {/* Search */}
                    <label className="text-xs font-bold text-foreground/50 uppercase tracking-widest">Search YouTube</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={youtubeQuery}
                        onChange={(e) => setYoutubeQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleYoutubeSearch()}
                        placeholder="Search for a song..."
                        className="flex-1 bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/30 outline-none focus:border-foreground/30 transition-colors"
                      />
                      <button
                        onClick={handleYoutubeSearch}
                        disabled={!youtubeQuery.trim() || isSearching}
                        className="px-4 py-2.5 rounded-xl bg-[#FF0000] text-white font-bold text-sm disabled:opacity-30 transition-all shrink-0 flex items-center gap-2"
                      >
                        {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />}
                        Search
                      </button>
                    </div>
                    <div className="flex items-center gap-2 my-1">
                      <div className="flex-1 h-px bg-foreground/10" />
                      <span className="text-[10px] text-foreground/30 font-bold">OR PASTE URL DIRECTLY</span>
                      <div className="flex-1 h-px bg-foreground/10" />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={youtubeLink}
                        onChange={(e) => setYoutubeLink(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleYoutubeSubmit()}
                        placeholder="https://youtube.com/watch?v=..."
                        className="flex-1 bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/30 outline-none focus:border-foreground/30 transition-colors"
                      />
                      <button
                        onClick={handleYoutubeSubmit}
                        disabled={!youtubeLink.trim() || isYoutubeLoading}
                        className="px-4 py-2.5 rounded-xl bg-foreground/10 text-foreground font-bold text-sm disabled:opacity-30 transition-all shrink-0 flex items-center gap-2"
                      >
                        {isYoutubeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />}
                        Play <span className="bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded text-[10px]">Beta</span>
                      </button>
                    </div>
                    {youtubeErr && <p className="text-xs text-red-500 font-semibold">{youtubeErr}</p>}
                  </div>
                ) : (
                  <>
                    <button
                      onClick={handlePickFile}
                      className="w-full h-12 flex items-center justify-center rounded-2xl bg-foreground text-background font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                    >
                      Upload from device
                    </button>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-foreground/50 uppercase tracking-widest">Or paste a Google Drive link</label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={driveLink}
                          onChange={(e) => setDriveLink(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleDriveLink()}
                          placeholder="https://drive.google.com/file/d/…"
                          className="flex-1 bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/30 outline-none focus:border-foreground/30 transition-colors"
                        />
                        <button
                          onClick={handleDriveLink}
                          disabled={!driveLink.trim()}
                          className="px-4 py-2.5 rounded-xl bg-foreground text-background font-bold text-sm disabled:opacity-30 transition-all shrink-0"
                        >Play</button>
                      </div>
                      {driveErr && <p className="text-xs text-red-500 font-semibold">{driveErr}</p>}
                    </div>
                    <p className="text-center text-xs text-foreground/40 font-medium">Or drag any audio file anywhere on the page ↗</p>
                  </>
                )}
              </motion.div>
            )}

            {!isDragTarget && !isUploading && !upload.isDownloadingYt && !isSyncing && !hasTrack && !expanded && (
              <motion.div
                key="empty-pill"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1, transition: { duration: 0.3, delay: 0.15 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="px-5 py-3.5 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-foreground/5 border border-foreground/10 flex items-center justify-center shrink-0">
                    <Music2 className="w-4 h-4 text-foreground/40" />
                  </div>
                  <p className="text-sm font-semibold hidden md:block px-2 text-foreground/40">Hover to add your music and enjoy</p>
                  <p className="text-sm font-semibold text-foreground/40 md:hidden">Hold to add music</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                  className="text-xs font-bold text-foreground/40 hover:text-foreground/70 transition-colors px-3 py-1.5 rounded-full border border-foreground/5 hover:border-foreground/20 hover:bg-foreground/5"
                >Add +</button>
              </motion.div>
            )}

            {!isDragTarget && !isUploading && !upload.isDownloadingYt && !isSyncing && hasTrack && expanded && (pillView === "player" || pillView === "youtube") && (
              <motion.div
                key="player-full"
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, delay: 0.15 } }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                className="p-6 md:p-8 flex flex-col"
              >
                <div className="flex items-center justify-between mb-5">
                  <span className="text-xs font-bold tracking-widest text-foreground/50 uppercase flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Live Session
                  </span>
                  <div className="flex items-center gap-3">
                    <button onClick={handlePickFile} className="text-xs font-bold text-foreground/40 hover:text-foreground/70 flex items-center gap-1.5 transition-colors">
                      <Upload className="w-3.5 h-3.5" /> Add to queue
                    </button>
                    <button onClick={() => router.push("/hub")} className="text-xs font-semibold bg-foreground/5 hover:bg-red-500/10 hover:text-red-500 px-4 py-1.5 rounded-full text-foreground/40 transition-all">
                      Leave
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1 p-1 rounded-xl bg-foreground/[0.04] border border-foreground/[0.06] mb-5 self-start">
                  <button onClick={() => setPillView("player")} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${pillView === "player" ? "bg-foreground text-background shadow-sm" : "text-foreground/40 hover:text-foreground/60"}`}>
                    Player
                  </button>
                  <button onClick={() => setPillView("network")} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${pillView === ("network" as string) ? "bg-foreground text-background shadow-sm" : "text-foreground/40 hover:text-foreground/60"}`}>
                    Network
                  </button>
                  <button onClick={() => setPillView("youtube")} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${pillView === "youtube" ? "bg-[#FF0000] text-white shadow-sm" : "text-foreground/40 hover:text-foreground/60"}`}>
                    YouTube
                  </button>
                </div>

                {pillView === "youtube" ? (
                  <div className="flex flex-col gap-2 mb-7">
                    <label className="text-xs font-bold text-foreground/50 uppercase tracking-widest">Queue a YouTube video</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={youtubeLink}
                        onChange={(e) => setYoutubeLink(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleYoutubeSubmit()}
                        placeholder="https://youtube.com/watch?v=..."
                        className="flex-1 bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/30 outline-none focus:border-foreground/30 transition-colors"
                      />
                      <button
                        onClick={handleYoutubeSubmit}
                        disabled={!youtubeLink.trim() || isYoutubeLoading}
                        className="px-4 py-2.5 rounded-xl bg-[#FF0000] text-white font-bold text-sm disabled:opacity-30 transition-all shrink-0 flex items-center gap-2"
                      >
                        {isYoutubeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />}
                        Add
                      </button>
                    </div>
                    {youtubeErr && <p className="text-xs text-red-500 font-semibold">{youtubeErr}</p>}
                  </div>
                ) : null}

                <div className="flex items-center gap-5 mb-7">
                  <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center shrink-0 shadow-[0_8px_30px_rgba(0,0,0,0.2)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] ${audio.trackUrl?.startsWith("youtube:") ? "bg-gradient-to-br from-[#FF0000]/20 to-[#FF0000]/5 border border-[#FF0000]/20" : "bg-gradient-to-br from-foreground/10 to-foreground/5 border border-foreground/10"}`}>
                    {audio.trackUrl?.startsWith("youtube:") ? (
                      <Youtube className={`w-8 h-8 text-[#FF0000] ${effectivePlaying ? "animate-pulse" : ""}`} />
                    ) : (
                      <Disc className={`w-8 h-8 text-foreground/40 ${effectivePlaying ? "animate-[spin_4s_linear_infinite]" : ""}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl sm:text-2xl font-black text-foreground truncate leading-tight">{audio.trackTitle || "Unknown Track"}</h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      {audio.isReady
                        ? <span className="text-xs text-green-500 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Ready</span>
                        : <span className="text-xs text-foreground/40 font-semibold flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Buffering…</span>
                      }
                    </div>
                  </div>
                </div>

                <div className="mb-7">
                  <div className="relative group">
                    <div className="absolute inset-0 flex items-center pointer-events-none">
                      <div className="h-1.5 w-full bg-foreground/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-foreground transition-[width] duration-100"
                          style={{ width: `${audio.progress * 100}%` }}
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={audio.duration || 100}
                      value={audio.currentTime || 0}
                      onChange={(e) => handleSeek(Number(e.target.value))}
                      className="w-full h-1.5 absolute inset-0 opacity-0 cursor-pointer z-10"
                    />
                    <div 
                      className="absolute top-1/2 -mt-1.5 h-3 w-3 bg-background border-2 border-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-sm"
                      style={{ left: `calc(${audio.progress * 100}% - 6px)` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-foreground/50 font-mono font-medium">
                    <span>{formatTime(audio.currentTime)}</span>
                    <span>{formatTime(audio.duration)}</span>
                  </div>
                </div>

                <div className="flex justify-center items-center gap-8">
                  <button onClick={handlePrev}><SkipBack className="w-7 h-7 text-foreground/30 hover:text-foreground/70 transition-colors cursor-pointer" /></button>
                  <button onClick={handleToggle} className="w-14 h-14 rounded-full bg-foreground text-background flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-[0_0_25px_rgba(0,0,0,0.1)] dark:shadow-[0_0_25px_rgba(255,255,255,0.15)] relative">
                    <AnimatePresence mode="wait" initial={false}>
                      {isPillBuffering ? (
                        <motion.div key="buffer" initial={{ opacity: 0, scale: 0.5, rotate: -90 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.5, rotate: 90 }} transition={{ duration: 0.2 }} className="absolute"><Loader2 className="w-6 h-6 animate-spin" /></motion.div>
                      ) : effectivePlaying ? (
                        <motion.div key="pause" initial={{ opacity: 0, scale: 0.5, rotate: -45 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.5, rotate: 45 }} transition={{ duration: 0.2, ease: "backOut" }} className="absolute"><Pause className="w-6 h-6" fill="currentColor" /></motion.div>
                      ) : (
                        <motion.div key="play" initial={{ opacity: 0, scale: 0.5, rotate: 45 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.5, rotate: -45 }} transition={{ duration: 0.2, ease: "backOut" }} className="absolute"><Play className="w-6 h-6 ml-0.5" fill="currentColor" /></motion.div>
                      )}
                    </AnimatePresence>
                  </button>
                  <button onClick={handleNext}><SkipForward className="w-7 h-7 text-foreground/30 hover:text-foreground/70 transition-colors cursor-pointer" /></button>
                </div>
              </motion.div>
            )}

            {!isDragTarget && !isUploading && !upload.isDownloadingYt && !isSyncing && hasTrack && expanded && pillView === "network" && (
              <motion.div
                key="net-full-wrap"
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, delay: 0.15 } }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                className="flex flex-col"
              >
                <div className="px-6 pt-6 md:px-8 md:pt-8">
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-foreground/[0.04] border border-foreground/[0.06] mb-1 self-start">
                    <button onClick={() => setPillView("player")} className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all text-foreground/40 hover:text-foreground/60">Player</button>
                    <button className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all bg-foreground text-background shadow-sm">Network</button>
                    <button onClick={() => setPillView("youtube")} className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all text-foreground/40 hover:text-foreground/60">YouTube</button>
                  </div>
                </div>
                <NetworkExpanded stats={netStats} onClose={() => setExpanded(false)} />
              </motion.div>
            )}

            {!isDragTarget && !isUploading && !upload.isDownloadingYt && !isSyncing && hasTrack && !expanded && pillView !== "network" && (
              <motion.div
                key="player-pill"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1, transition: { duration: 0.3, delay: 0.15 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="px-4 py-2.5 flex items-center gap-4 sm:gap-6 md:gap-10 justify-between"
              >
                <div className="flex items-center gap-3 cursor-pointer group flex-1" onClick={(e) => { e.stopPropagation(); setExpanded(true); }}>
                  <div className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 group-hover:bg-foreground/10 transition-colors ${audio.trackUrl?.startsWith("youtube:") ? "bg-[#FF0000]/10 border-[#FF0000]/20" : "bg-gradient-to-br from-foreground/10 to-foreground/5 border-foreground/10"}`}>
                    {audio.trackUrl?.startsWith("youtube:") ? (
                      <Youtube className={`w-4 h-4 text-[#FF0000] ${effectivePlaying ? "animate-pulse" : ""}`} />
                    ) : (
                      <Disc className={`w-4 h-4 text-foreground/40 ${effectivePlaying ? "animate-[spin_4s_linear_infinite]" : ""}`} />
                    )}
                  </div>
                  <div className="flex flex-col pl-1 max-w-[120px] sm:max-w-[200px] md:max-w-[300px]">
                    <p className="text-sm font-bold text-foreground leading-tight truncate transition-opacity hover:opacity-80">{audio.trackTitle}</p>
                    <p className="text-[10px] text-foreground/50 font-mono hidden sm:block">{formatTime(audio.currentTime)} / {formatTime(audio.duration)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <button onClick={handlePrev}><SkipBack className="w-4 h-4 text-foreground/40 hover:text-foreground transition-colors" /></button>
                  <button onClick={handleToggle} className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center hover:scale-105 active:scale-95 transition-transform relative">
                    <AnimatePresence mode="wait" initial={false}>
                      {isPillBuffering ? (
                        <motion.div key="b" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.15 }} className="absolute"><Loader2 className="w-3 h-3 animate-spin" /></motion.div>
                      ) : effectivePlaying ? (
                        <motion.div key="p" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.15 }} className="absolute"><Pause className="w-3 h-3" fill="currentColor" /></motion.div>
                      ) : (
                        <motion.div key="r" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.15 }} className="absolute"><Play className="w-3 h-3 ml-0.5" fill="currentColor" /></motion.div>
                      )}
                    </AnimatePresence>
                  </button>
                  <button onClick={handleNext}><SkipForward className="w-4 h-4 text-foreground/40 hover:text-foreground transition-colors" /></button>
                </div>
              </motion.div>
            )}

            {!isDragTarget && !isUploading && !upload.isDownloadingYt && !isSyncing && hasTrack && !expanded && pillView === "network" && netStats.hasData && (
              <motion.div
                key="net-collapsed"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1, transition: { duration: 0.3, delay: 0.15 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="px-4 py-2.5 flex items-center gap-4 sm:gap-6 justify-between cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border" style={{ borderColor: `${qualityColor(netStats.quality)}30`, background: `${qualityColor(netStats.quality)}10` }}>
                    <Activity className="w-4 h-4" style={{ color: qualityColor(netStats.quality) }} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground leading-tight">Network</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: qualityColor(netStats.quality), background: `${qualityColor(netStats.quality)}15` }}>
                        {netStats.quality === "excellent" ? "Excellent" : netStats.quality === "good" ? "Good" : netStats.quality === "fair" ? "Fair" : "Poor"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] font-mono text-foreground/40"><span style={{ color: qualityColor(netStats.quality) }}>{netStats.rtt.toFixed(0)}</span>ms RTT</span>
                      <span className="text-[10px] font-mono text-foreground/40 hidden sm:inline"><span style={{ color: qualityColor(netStats.quality) }}>{netStats.jitter.toFixed(0)}</span>ms jitter</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>

        <AnimatePresence mode="wait">
          {isRoom && hasTrack && !expanded && netStats.hasData && (
            <motion.button
              key={pillView === "network" ? "ext-player" : "ext-net"}
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.3 }}
              transition={{ type: "spring", bounce: 0.4, duration: 0.5 }}
              onClick={(e) => { e.stopPropagation(); setPillView(pillView === "network" ? "player" : "network"); }}
              className="pointer-events-auto ml-2.5 mt-[8px] shrink-0 w-10 h-10 rounded-full bg-background/85 backdrop-blur-3xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_20px_rgba(255,255,255,0.06)] hover:scale-110 active:scale-90 transition-transform hidden cursor-pointer border-2 justify-center items-center"
              style={{
                borderColor: pillView === ("player" as string) || pillView === ("youtube" as string)
                  ? `${qualityColor(netStats.quality)}50`
                  : effectivePlaying ? "#22c55e80" : "#ef444480",
              }}
            >
              {pillView === ("player" as string) || pillView === ("youtube" as string) ? (
                <span className="text-[10px] font-black tabular-nums" style={{ color: qualityColor(netStats.quality) }}>
                  {netStats.rtt.toFixed(0)}
                </span>
              ) : (
                effectivePlaying
                  ? <Pause className="w-3.5 h-3.5" style={{ color: "#22c55e" }} fill="#22c55e" />
                  : <Play className="w-3.5 h-3.5 ml-0.5" style={{ color: "#ef4444" }} fill="#ef4444" />
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <YouTubeSearchModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        results={searchResults}
        roomId={roomId}
        query={youtubeQuery}
        onSelect={async (url) => {
          setIsYoutubeLoading(true);
          try {
            audio.unlockAudio();
            await roomsApi.enqueueYoutube(roomId, url);
            setIsModalOpen(false);
            setYoutubeQuery("");
            setExpanded(false);
            setPillView("player");
          } catch (err: any) {
            setYoutubeErr(err.message);
          } finally {
            setIsYoutubeLoading(false);
          }
        }}
      />
    </>
  );
}
