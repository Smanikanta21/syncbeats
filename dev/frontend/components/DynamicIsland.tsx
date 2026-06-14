"use client";

import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import {
  Disc, Pause, Play, SkipForward, SkipBack,
  Upload, Music2, Loader2, CheckCircle2, Activity, Play as Youtube
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { SpatialAudioEngine } from "../audio/SpatialAudioEngine";
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

const AudioBars = ({ isPlaying, isSmall }: { isPlaying: boolean; isSmall?: boolean }) => {
  const barsRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!isPlaying) {
      if (barsRef.current) {
         const children = barsRef.current.children;
         for (let i = 0; i < children.length; i++) {
           (children[i] as HTMLElement).style.height = "20%";
         }
      }
      return;
    }
    
    let rafId: number;
    let currentHeights = [20, 20, 20, 20];
    let targetHeights = [20, 20, 20, 20];

    const tick = () => {
      const data = SpatialAudioEngine.getInstance().getFrequencyData();
      
      let isSilence = true;
      let bins = [0, 0, 0, 0];

      if (data) {
        // With fftSize=2048, frequencyBinCount=1024, each bin is ~21.5Hz.
        const getAverage = (start: number, end: number) => {
          let sum = 0;
          let count = 0;
          for (let i = start; i < end; i++) {
            if (i < data.length) {
              sum += data[i];
              count++;
            }
          }
          return count > 0 ? sum / count : 0;
        };

        // Bar 0: Sub/Kick (43Hz - 107Hz) -> Bins 2 to 5
        // Bar 1: Bass/Low-mid (107Hz - 322Hz) -> Bins 5 to 15
        // Bar 2: Mids/Vocals (430Hz - 1000Hz) -> Bins 20 to 46
        // Bar 3: Highs/Hats (3000Hz - 6000Hz) -> Bins 140 to 280
        bins = [
          getAverage(2, 5),
          getAverage(5, 15),
          getAverage(20, 46),
          getAverage(140, 280)
        ];
        
        for (let i = 0; i < 4; i++) if (bins[i] > 0) isSilence = false;
      }

      for (let i = 0; i < 4; i++) {
         if (isSilence) {
           targetHeights[i] = 20;
         } else {
           // Multiply by a factor (e.g. 1.5) to exaggerate the tiny bar movement, clamp to 100%
           const val = 20 + (bins[i] / 255) * 80 * 1.5;
           targetHeights[i] = Math.min(val, 100);
         }

         // Lerp towards target
         currentHeights[i] += (targetHeights[i] - currentHeights[i]) * 0.2;
         
         if (barsRef.current) {
           const children = barsRef.current.children;
           if (children[i]) {
             (children[i] as HTMLElement).style.height = `${currentHeights[i]}%`;
           }
         }
      }
      
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

  const hClass = isSmall ? "h-3.5" : "h-5";
  const wClass = isSmall ? "w-[3px]" : "w-1.5";
  const gapClass = isSmall ? "gap-[2px]" : "gap-1";

  return (
    <div ref={barsRef} className={`flex items-end ${gapClass} ${hClass}`}>
      <div className={`${wClass} bg-foreground/60 rounded-full`} style={{ height: "20%" }} />
      <div className={`${wClass} bg-foreground/60 rounded-full`} style={{ height: "20%" }} />
      <div className={`${wClass} bg-foreground/60 rounded-full`} style={{ height: "20%" }} />
      <div className={`${wClass} bg-foreground/60 rounded-full`} style={{ height: "20%" }} />
    </div>
  );
};

export function DynamicIsland() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, token } = useAuth();
  const audio = useAudio();
  const upload = useUpload();
  const { clockOffset, isRoomPlaying, participants: roomParticipants, pendingPlay, incomingTrack } = useSyncInfo();

  const isRoom = pathname.includes("/room/");

  const [expanded, setExpanded] = useState(false);
  const [pillView, setPillView] = useState<"player" | "add" | "network">("player");
  const [youtubeErr, setYoutubeErr] = useState("");
  const [isYoutubeLoading, setIsYoutubeLoading] = useState(false);
  const [youtubeQuery, setYoutubeQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [localProgress, setLocalProgress] = useState(0);
  const netStats = useNetworkStats(isRoom);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  const bounceCtrl = useAnimation();

  // Keep track of the current shadow state for the RAF loop
  const _shadowStateRef = useRef({ isDragTarget: false, expanded: false });
  useEffect(() => {
    _shadowStateRef.current = { isDragTarget: upload.isDragging, expanded };
  }, [upload.isDragging, expanded]);

  // Refs for smooth RAF-based progress (bypasses React state batching)
  const _isPlayingRef = useRef(false);
  const _getTruePosRef = useRef(audio.getTruePosition);
  const _durationRef = useRef(0);
  _isPlayingRef.current = audio.isPlaying;
  _getTruePosRef.current = audio.getTruePosition;
  _durationRef.current = audio.duration;

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      if (_isPlayingRef.current) {
        const pos = _getTruePosRef.current();
        const dur = _durationRef.current;
        if (dur > 0) setLocalProgress(Math.min(1, pos / dur));
        
        // Removed beat glow mutation from island
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayName = user?.name ?? "Guest";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  const isProfile = pathname.includes("/profile");
  const roomId = isRoom ? (pathname.split("/room/")[1]?.split("/")[0] ?? "") : "";

  // Bounce when a file is dragged over the window
  useEffect(() => {
    if (upload.isDragging) {
      bounceCtrl.start({
        scale: [1, 1.05, 1],
        transition: { repeat: Infinity, duration: 1.5, ease: "easeInOut" }
      });
    } else {
      bounceCtrl.stop();
      bounceCtrl.set({ scale: 1 });
    }
  }, [upload.isDragging, bounceCtrl]);

  // Listen for the "+" button beside the room queue to expand to Add Music tab
  useEffect(() => {
    const handler = () => {
      if (!isRoom) return;
      setExpanded(true);
      setPillView("add");
    };
    document.addEventListener('island:expand-add', handler);
    return () => document.removeEventListener('island:expand-add', handler);
  }, [isRoom]);

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };
  const clearHover = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const onMouseEnter = () => {
    if (!isRoom || upload.isUploading || isSyncing) return;
    pressTimer.current = setTimeout(() => setExpanded(true), 150);
  };
  const onMouseLeave = () => {
    clearHover();
    if (!upload.isUploading && !isSyncing) setExpanded(false);
  };

  const onPointerDown = () => {
    if (!isRoom || upload.isUploading || isSyncing) return;
    pressTimer.current = setTimeout(() => setExpanded(true), 400);
  };
  const onPointerUp = () => clearPress();
  const onPointerCancel = () => clearPress();

  const hasTrack = audio.hasTrack;
  const effectivePlaying = isRoom ? isRoomPlaying : audio.isPlaying;
  const isAnyDeviceBuffering = hasTrack && roomParticipants.some(p => !p.isReady && !p.isBlocked);
  const isPillBuffering = (
    audio.isBuffering ||
    isAnyDeviceBuffering ||
    pendingPlay ||
    (!audio.isReady && (effectivePlaying || !audio.trackUrl?.startsWith("youtube:")))
  ) && hasTrack;

  const currentTrackUrl = audio.trackUrl;
  const activeTransfer = currentTrackUrl ? upload.activeTransfers[currentTrackUrl] : null;
  const isSyncing = !!activeTransfer;
  const isCurrentTrackIframeYt = !!audio.trackUrl?.startsWith("youtube:");
  // Always show the player when a track exists and we're on the player tab
  const showPlayerUi = hasTrack && pillView === "player";

  const handleToggle = (e?: React.MouseEvent | KeyboardEvent) => {
    e?.stopPropagation();
    audio.unlockAudio();
    if (isRoom && roomId) {
      if (effectivePlaying || pendingPlay) {
        getSocket().emit('playback:pause', { roomId });
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

  // Keyboard Shortcuts (Space to play/pause, Arrows to seek)
  const _keyboardStateRef = useRef({ isRoom, roomId, effectivePlaying, pendingPlay });
  useEffect(() => {
    _keyboardStateRef.current = { isRoom, roomId, effectivePlaying, pendingPlay };
  }, [isRoom, roomId, effectivePlaying, pendingPlay]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      const state = _keyboardStateRef.current;

      if (e.code === "Space") {
        e.preventDefault();
        audio.unlockAudio();
        if (state.isRoom && state.roomId) {
          if (state.effectivePlaying || state.pendingPlay) {
            getSocket().emit('playback:pause', { roomId: state.roomId });
          } else {
            getSocket().emit('playback:play', { roomId: state.roomId });
          }
        } else {
          audio.toggle();
        }
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        const newTime = Math.max(0, audio.getTruePosition() - 5);
        if (state.isRoom && state.roomId) {
          getSocket().emit('playback:seek', { roomId: state.roomId, position: newTime * 1000 });
        } else {
          audio.seek(newTime);
        }
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        const newTime = Math.min(audio.duration, audio.getTruePosition() + 5);
        if (state.isRoom && state.roomId) {
          getSocket().emit('playback:seek', { roomId: state.roomId, position: newTime * 1000 });
        } else {
          audio.seek(newTime);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [audio]);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const posSecs = pct * audio.duration;
    handleSeek(posSecs);
  };

  const displayTime = scrubTime !== null ? scrubTime : (audio.currentTime || 0);
  // Use local RAF progress for smoothness; only override when scrubbing
  const displayProgress = scrubTime !== null ? (scrubTime / Math.max(audio.duration, 1)) : localProgress;

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

  const handleYoutubeAction = async () => {
    const val = youtubeQuery.trim();
    if (!roomId || !val) return;
    
    setYoutubeErr("");
    const isUrl = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(val);

    if (isUrl) {
      setIsYoutubeLoading(true);
      try {
        audio.unlockAudio();
        await roomsApi.enqueueYoutube(roomId, val);
        setYoutubeQuery("");
        setExpanded(false);
        setPillView("player");
      } catch (err: any) {
        setYoutubeErr(err.message);
      } finally {
        setIsYoutubeLoading(false);
      }
    } else {
      setIsSearching(true);
      try {
        const results = await roomsApi.searchYoutube(roomId, val);
        setSearchResults(results);
        setIsModalOpen(true);
      } catch (err: any) {
        setYoutubeErr(err.message ?? "Search failed");
      } finally {
        setIsSearching(false);
      }
    }
  };

  if (!isRoom) {
    return (
      <div className="fixed top-4 sm:top-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <motion.div layout className="pointer-events-auto glass-panel bg-background/80 backdrop-blur-3xl w-[92%] max-w-5xl rounded-4xl px-4 sm:px-6 md:px-8 py-3.5 flex items-center justify-between shadow-2xl select-none">
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
      {expanded && isRoom && !isDragTarget && !isUploading && !incomingTrack && (
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
          ref={islandRef}
          animate={bounceCtrl}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          transition={{ layout: { type: "spring", stiffness: 350, damping: 25, mass: 1 } }}
          style={{ borderRadius: expanded ? 40 : 48, boxShadow: "" }}
          className={`pointer-events-auto overflow-hidden bg-background/85 backdrop-blur-3xl border transition-shadow duration-500 select-none
          ${isDragTarget
              ? "border-foreground/40 w-11/12 max-w-sm shadow-2xl"
              : expanded
                ? "border-foreground/10 w-[95%] md:w-[90%] max-w-4xl shadow-2xl"
                : "border-foreground/10 w-fit min-w-70 max-w-[95%] md:max-w-3xl shadow-xl"
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
                animate={{ opacity: 1, transition: { delay: 0.2, duration: 0.3 } }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
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

            {!isDragTarget && !isUploading && incomingTrack && (
              <motion.div
                key="incoming-track"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-8 py-5 flex items-center gap-5"
              >
                <Loader2 className="w-5 h-5 text-orange-500 animate-spin shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground/80 mb-2 truncate">Setting up "{incomingTrack.title}"… {incomingTrack.progress}%</p>
                  <div className="h-1.5 w-full bg-foreground/10 rounded-full overflow-hidden shadow-inner">
                    <motion.div
                      className="h-full bg-orange-500 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.8)]"
                      style={{ width: `${incomingTrack.progress}%` }}
                      transition={{ ease: "linear" }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {!isDragTarget && !isUploading && !incomingTrack && activeTransfer && (
              <motion.div
                key="p2p-syncing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-6 py-3.5 flex items-center gap-4 w-70 sm:w-[320px]"
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

            {!isDragTarget && !isUploading && !incomingTrack && !isSyncing && !hasTrack && expanded && (
              <motion.div
                key="upload-ui"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.2, duration: 0.3 } }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
                className="p-6 md:p-8 flex flex-col gap-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold tracking-widest text-foreground/50 uppercase">Add Music to Room</p>
                  <div className="flex items-center gap-3">
                    <button onClick={() => router.push("/hub")} className="text-xs font-semibold bg-foreground/5 hover:bg-red-500/10 hover:text-red-500 px-4 py-1.5 rounded-full text-foreground/40 transition-all">
                      Leave
                    </button>
                    <button onClick={() => setExpanded(false)} className="text-xs text-foreground/40 hover:text-foreground/60 font-bold transition-colors">ESC</button>
                  </div>
                </div>

                {/* YouTube search */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-foreground/40 flex items-center gap-1.5"><Youtube className="w-3.5 h-3.5 text-[#FF0000]" /> YouTube Search or Link</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={youtubeQuery}
                      onChange={(e) => setYoutubeQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleYoutubeAction()}
                      placeholder="Search for a song or paste YouTube link…"
                      className="flex-1 bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/30 outline-none focus:border-foreground/30 transition-colors"
                    />
                    <button
                      onClick={handleYoutubeAction}
                      disabled={!youtubeQuery.trim() || isSearching || isYoutubeLoading}
                      className="px-4 py-2.5 rounded-xl bg-[#FF0000] text-white font-bold text-sm disabled:opacity-30 transition-all shrink-0 flex items-center gap-2"
                    >
                      {(isSearching || isYoutubeLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />}
                      Go
                    </button>
                  </div>
                  {youtubeErr && <p className="text-xs text-red-500 font-semibold">{youtubeErr}</p>}
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-foreground/10" />
                  <span className="text-[10px] font-bold text-foreground/30 uppercase tracking-widest">or</span>
                  <div className="flex-1 h-px bg-foreground/10" />
                </div>

                {/* File upload */}
                <button
                  onClick={handlePickFile}
                  className="w-full h-12 flex items-center justify-center gap-2 rounded-2xl bg-foreground text-background font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                >
                  <Upload className="w-4 h-4" /> Upload from device
                </button>
                <p className="text-center text-xs text-foreground/40 font-medium">Or drag any audio file anywhere on the page ↗</p>
              </motion.div>
            )}

            {!isDragTarget && !isUploading && !incomingTrack && !isSyncing && !hasTrack && !expanded && (
              <motion.div
                key="empty-pill"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.2, duration: 0.3 } }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
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

            {!isDragTarget && !isUploading && !incomingTrack && !isSyncing && hasTrack && expanded && (pillView === "player" || pillView === "add") && (
              <motion.div
                key="player-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.2, duration: 0.3 } }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
                className="p-6 md:p-8 flex flex-col"
              >
                <div className="flex items-center justify-between mb-5">
                  <span className="text-xs font-bold tracking-widest text-foreground/50 uppercase flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Live Session
                  </span>
                  <button onClick={() => router.push("/hub")} className="text-xs font-semibold bg-foreground/5 hover:bg-red-500/10 hover:text-red-500 px-4 py-1.5 rounded-full text-foreground/40 transition-all">
                    Leave
                  </button>
                </div>

                {/* Tab bar: Player | Add Music | Network */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-foreground/4 border border-foreground/6 mb-6 self-start">
                  <button onClick={() => setPillView("player")} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${pillView === "player" ? "bg-foreground text-background shadow-sm" : "text-foreground/40 hover:text-foreground/60"}`}>
                    Player
                  </button>
                  <button onClick={() => setPillView("add")} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${pillView === "add" ? "bg-foreground text-background shadow-sm" : "text-foreground/40 hover:text-foreground/60"}`}>
                    + Add Music
                  </button>
                  <button onClick={() => setPillView("network")} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${pillView === ("network" as string) ? "bg-foreground text-background shadow-sm" : "text-foreground/40 hover:text-foreground/60"}`}>
                    Network
                  </button>
                </div>

                {pillView === "player" ? (
                  <>
                    <div className="flex items-center gap-5 mb-7">
                      <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center shrink-0 shadow-[0_8px_30px_rgba(0,0,0,0.2)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] ${audio.trackUrl?.startsWith("youtube:") ? "bg-linear-to-br from-[#FF0000]/20 to-[#FF0000]/5 border border-[#FF0000]/20" : "bg-linear-to-br from-foreground/10 to-foreground/5 border border-foreground/10"}`}>
                        {effectivePlaying ? (
                          <AudioBars isPlaying={effectivePlaying} />
                        ) : audio.trackUrl?.startsWith("youtube:") ? (
                          <Youtube className="w-8 h-8 text-[#FF0000]" />
                        ) : (
                          <Disc className={`w-8 h-8 text-foreground/40`} />
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
                              className="h-full bg-foreground"
                              style={{ width: `${displayProgress * 100}%` }}
                            />
                          </div>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={audio.duration || 100}
                          value={displayTime}
                          onChange={(e) => setScrubTime(Number(e.target.value))}
                          onPointerUp={() => {
                            if (scrubTime !== null) {
                              handleSeek(scrubTime);
                              setTimeout(() => setScrubTime(null), 800);
                            }
                          }}
                          className="w-full h-1.5 absolute inset-0 opacity-0 cursor-pointer z-10"
                        />
                        <div
                          className="absolute top-1/2 -mt-1.5 h-3 w-3 bg-background border-2 border-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-sm"
                          style={{ left: `calc(${displayProgress * 100}% - 6px)` }}
                        />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-foreground/50 font-mono font-medium">
                        <span>{formatTime(displayTime)}</span>
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
                  </>
                ) : (
                  /* Add Music Tab — unified YouTube + file upload */
                  <div className="flex flex-col gap-4">
                    <p className="text-xs font-bold text-foreground/50 uppercase tracking-widest">Add to Room Queue</p>

                    {/* YouTube */}
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-semibold text-foreground/40 flex items-center gap-1.5"><Youtube className="w-3.5 h-3.5 text-[#FF0000]" /> YouTube Search or Link</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={youtubeQuery}
                          onChange={(e) => setYoutubeQuery(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleYoutubeAction()}
                          placeholder="Search for a song or paste YouTube link…"
                          className="flex-1 bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/30 outline-none focus:border-foreground/30 transition-colors"
                        />
                        <button
                          onClick={handleYoutubeAction}
                          disabled={!youtubeQuery.trim() || isSearching || isYoutubeLoading}
                          className="px-4 py-2.5 rounded-xl bg-[#FF0000] text-white font-bold text-sm disabled:opacity-30 transition-all shrink-0 flex items-center gap-2"
                        >
                          {(isSearching || isYoutubeLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />}
                          Go
                        </button>
                      </div>
                      {youtubeErr && <p className="text-xs text-red-500 font-semibold">{youtubeErr}</p>}
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-3 my-1">
                      <div className="flex-1 h-px bg-foreground/10" />
                      <span className="text-[10px] font-bold text-foreground/30 uppercase tracking-widest">or</span>
                      <div className="flex-1 h-px bg-foreground/10" />
                    </div>

                    {/* File upload */}
                    <button
                      onClick={handlePickFile}
                      className="w-full h-11 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-foreground/20 text-foreground/50 font-bold text-sm hover:border-foreground/40 hover:text-foreground/70 hover:bg-foreground/5 active:scale-95 transition-all"
                    >
                      <Upload className="w-4 h-4" /> Upload file from device
                    </button>
                    <p className="text-center text-[10px] text-foreground/30 font-medium">MP3 · FLAC · WAV · M4A</p>
                  </div>
                )}
              </motion.div>
            )}

            {!isDragTarget && !isUploading && !incomingTrack && !isSyncing && hasTrack && expanded && pillView === "network" && (
              <motion.div
                key="net-full-wrap"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.2, duration: 0.3 } }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
                className="flex flex-col"
              >
                <div className="px-6 pt-6 md:px-8 md:pt-8">
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-foreground/4 border border-foreground/6 mb-1 self-start">
                    <button onClick={() => setPillView("player")} className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all text-foreground/40 hover:text-foreground/60">Player</button>
                    <button className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all bg-foreground text-background shadow-sm">Network</button>
                    <button onClick={() => setPillView("add")} className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all text-foreground/40 hover:text-foreground/60">+ Add</button>
                  </div>
                </div>
                <NetworkExpanded stats={netStats} onClose={() => setExpanded(false)} />
              </motion.div>
            )}

            {!isDragTarget && !isUploading && !incomingTrack && !isSyncing && hasTrack && !expanded && pillView !== "network" && (
              <motion.div
                key="player-pill"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.2, duration: 0.3 } }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
                className="flex flex-col"
              >
                <div className="px-4 py-2.5 flex items-center gap-4 sm:gap-6 md:gap-10 justify-between">
                  <div className="flex items-center gap-3 cursor-pointer group flex-1" onClick={(e) => { e.stopPropagation(); setExpanded(true); }}>
                    <div className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 group-hover:bg-foreground/10 transition-colors ${audio.trackUrl?.startsWith("youtube:") ? "bg-[#FF0000]/10 border-[#FF0000]/20" : "bg-linear-to-br from-foreground/10 to-foreground/5 border-foreground/10"}`}>
                      {effectivePlaying ? (
                        <AudioBars isPlaying={effectivePlaying} isSmall />
                      ) : audio.trackUrl?.startsWith("youtube:") ? (
                        <Youtube className={`w-4 h-4 text-[#FF0000]`} />
                      ) : (
                        <Disc className={`w-4 h-4 text-foreground/40`} />
                      )}
                    </div>
                    <div className="flex flex-col pl-1 justify-center max-w-30 sm:max-w-50 md:max-w-75">
                      <p className="text-sm font-bold text-foreground leading-tight truncate transition-opacity hover:opacity-80">{audio.trackTitle}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 opacity-80">
                        <p className="text-[9px] text-foreground/50 font-mono hidden sm:block">{formatTime(displayTime)}</p>
                        <div className="h-1 w-16 sm:w-24 bg-foreground/10 rounded-full overflow-hidden shrink-0">
                          <div className="h-full bg-foreground/50 transition-[width] duration-200 ease-linear rounded-full" style={{ width: `${displayProgress * 100}%` }} />
                        </div>
                        <p className="text-[9px] text-foreground/50 font-mono hidden sm:block">{formatTime(audio.duration)}</p>
                      </div>
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
                </div>
              </motion.div>
            )}

            {!isDragTarget && !isUploading && !isSyncing && hasTrack && !expanded && pillView === "network" && netStats.hasData && (
              <motion.div
                key="net-collapsed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.2, duration: 0.3 } }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
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
              className="pointer-events-auto ml-2.5 mt-2 shrink-0 w-10 h-10 rounded-full bg-background/85 backdrop-blur-3xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_20px_rgba(255,255,255,0.06)] hover:scale-110 active:scale-90 transition-transform hidden cursor-pointer border-2 justify-center items-center"
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
        onSelect={async (url, title) => {
          setIsYoutubeLoading(true);
          try {
            audio.unlockAudio();
            await roomsApi.enqueueYoutube(roomId, url, title);
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
