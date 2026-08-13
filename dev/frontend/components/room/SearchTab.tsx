"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { useUpload } from "../../context/UploadContext";
import { useAsync } from "../../hooks/useAsync";
import { roomsApi, historyApi, getServerUrl } from "../../lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Search, Upload, Loader2, CheckCircle2, AlertCircle, Plus, Play, Trash2, MoreHorizontal, Edit2, X, Check, Camera, Image, Music, Sparkles, History, Clock } from "lucide-react";
import { cn } from "../../lib/utils";
import { SearchSkeleton } from "../loaders/SearchSkeleton";
import { AppFeedback } from "../feedback/AppFeedback";

import { PlayOrEnqueueModal } from "./PlayOrEnqueueModal";
import { getSocket } from "../../lib/socket";
import { useVisualizer } from "../../context/VisualizerContext";

interface SearchTabProps {
  roomId: string;
  initialMode: "youtube" | "spotify" | null;
  onBack: () => void;
  onResultsCountChange: (count: number) => void;
  onModeChange?: (mode: "youtube" | "spotify" | null) => void;
  onLoadingStateChange?: (isLoading: boolean) => void;
  isSearchOnly?: boolean;
  onSuccess?: () => void;
  onPlaylistViewChange?: (isViewing: boolean) => void;
  onImportingStateChange?: (isImporting: boolean) => void;
  onHasContentChange?: (hasContent: boolean) => void;
  onErrorStateChange?: (error: string | null) => void;
  isPlaying?: boolean;
}

const SPRING = { type: "spring", stiffness: 350, damping: 30 } as any;

export function SearchTab({ roomId, initialMode, onBack, onResultsCountChange, onModeChange, onLoadingStateChange, isSearchOnly, onSuccess, onPlaylistViewChange, onImportingStateChange, onHasContentChange, onErrorStateChange, isPlaying = false }: SearchTabProps) {
  const { token, user } = useAuth();
  const upload = useUpload();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<"youtube" | "spotify" | null>(initialMode);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // YouTube State
  const [ytResults, setYtResults] = useState<any[]>([]);
  const [dbResults, setDbResults] = useState<any[]>([]);
  const [ytSuggestions, setYtSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [enqueuing, setEnqueuing] = useState<string | null>(null);
  const [addedSongs, setAddedSongs] = useState<Set<string>>(new Set());
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Spotify State
  const [spResults, setSpResults] = useState<any[]>([]);
  const [mySpotifyPlaylists, setMySpotifyPlaylists] = useState<any[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedPlaylistData, setSelectedPlaylistData] = useState<any>(null);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const [importing, setImporting] = useState(false);
  const [spError, setSpError] = useState<string | null>(null);
  const [importStage, setImportStage] = useState<"scraping" | "indexing" | "enriching" | "done">("scraping");
  const [importProgress, setImportProgress] = useState(0);
  const [importStats, setImportStats] = useState<{ total: number; playlistName?: string; playlistId?: string; coverUrl?: string }>({ total: 0 });

  // Single-flight async wrappers — prevents duplicate API calls on rapid clicks
  const enqueueAsync = useAsync(async (playlistId: string) => {
    if (!token || !roomId) throw new Error('Not authenticated');
    const SERVER = getServerUrl();
    const res = await fetch(`${SERVER}/rooms/${roomId}/enqueue-playlist`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ playlistId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to add playlist to queue.");
    }
    return res.json();
  });

  const importAsync = useAsync(async (url: string) => {
    if (!token) throw new Error('Not authenticated');
    return handleSpotifyImport(url);
  });

  // Playlist Edit/Delete State
  const [playlistToDelete, setPlaylistToDelete] = useState<string | null>(null);
  const [isDeletingPlaylist, setIsDeletingPlaylist] = useState(false);
  const [isEditingPlaylist, setIsEditingPlaylist] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCoverUrl, setEditCoverUrl] = useState("");
  const [isSavingPlaylist, setIsSavingPlaylist] = useState(false);
  const [isFixingMetadata, setIsFixingMetadata] = useState(false);
  const [recentHistory, setRecentHistory] = useState<{ listens: any[]; searches: any[] }>({ listens: [], searches: [] });

  useEffect(() => {
    if (user?.id) {
      historyApi.getRecent(user.id).then(res => {
        if (res) setRecentHistory(res);
      }).catch(() => {});
    }
  }, [user?.id]);

  useEffect(() => {
    onImportingStateChange?.(importing);
  }, [importing, onImportingStateChange]);

  useEffect(() => {
    const hasContent = !!(spError || downloadError || query.includes("spotify.com/playlist/"));
    onHasContentChange?.(hasContent);
  }, [spError, downloadError, query, onHasContentChange]);

  // Upload State
  const [uploadQueue, setUploadQueue] = useState<{ id: string, name: string, status: "pending" | "uploading" | "done" | "error" }[]>([]);

  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Reset when mode changes
  useEffect(() => {
    setQuery("");
    setYtResults([]);
    setSpResults([]);
    setDbResults([]);
    setMySpotifyPlaylists([]);
    setSelectedPlaylistId(null);
    setSelectedPlaylistData(null);
    setYtSuggestions([]);
    setShowSuggestions(false);
    setSelectedIndex(0);
    setDownloadError(null);
    setSpError(null);
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  const displayedSpotifyPlaylists = mode === "spotify" && !selectedPlaylistId
    ? (query.trim() 
        ? mySpotifyPlaylists.filter(p => p.name?.toLowerCase().includes(query.trim().toLowerCase()) || p.description?.toLowerCase().includes(query.trim().toLowerCase()) || p.tracks?.some((t: any) => t.song?.title?.toLowerCase().includes(query.trim().toLowerCase())))
        : mySpotifyPlaylists)
    : [];

  useEffect(() => {
    if (!query.trim()) {
      setYtSuggestions([]);
      setYtResults([]);
      setSpResults([]);
      setDbResults([]);
      setShowSuggestions(false);
      setSelectedIndex(0);
    }

    if (mode === "spotify") {
      if (!query.trim()) {
        setSpResults([]);
        if (!mySpotifyPlaylists.length) {
          setLoadingPlaylists(true);
          roomsApi.getUserSpotifyPlaylists().then(data => {
            setMySpotifyPlaylists(data);
          }).finally(() => {
            setLoadingPlaylists(false);
          });
        }
        return;
      }

      const isUrl = query.trim().startsWith("http") || query.trim().startsWith("spotify:");
      if (!isUrl) {
        setIsSearching(true);
        const timer = setTimeout(async () => {
          try {
            const spRes = await roomsApi.searchSpotifyPlaylists(query.trim()).catch(() => []);
            setSpResults(spRes);
          } catch (err) { } finally {
            setIsSearching(false);
          }
        }, 150);
        return () => clearTimeout(timer);
      }
      return;
    }

    if (!query.trim()) return;

    const timer = setTimeout(async () => {
      try {
        const sugs = await roomsApi.suggestYoutube(query);
        setYtSuggestions(sugs);
        setSelectedIndex(0);
      } catch (err) { }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, mode]);

  const isLoading = (mode !== "spotify" && isSearching) || loadingPlaylists || loadingPlaylist || importing || enqueuing !== null;

  useEffect(() => {
    onLoadingStateChange?.(isLoading);
  }, [isLoading, onLoadingStateChange]);

  useEffect(() => {
    onPlaylistViewChange?.(!!selectedPlaylistId);
  }, [selectedPlaylistId, onPlaylistViewChange]);

  const activeError = downloadError || spError;
  useEffect(() => {
    onErrorStateChange?.(activeError);
  }, [activeError, onErrorStateChange]);

  useEffect(() => {
    let total = 0;
    if (mode === "spotify") {
      if (selectedPlaylistId) {
        total = selectedPlaylistData?.tracks?.length || 1;
      } else {
        total = displayedSpotifyPlaylists.length + spResults.length;
      }
    } else {
      if (!query.trim()) {
        total = 0;
      } else {
        total = (showSuggestions && ytSuggestions.length > 0 ? ytSuggestions.length : ytResults.length) + spResults.length + dbResults.length + uploadQueue.length;
      }
    }
    onResultsCountChange(total);
  }, [isSearching, loadingPlaylists, loadingPlaylist, showSuggestions, ytSuggestions.length, ytResults.length, spResults.length, dbResults.length, uploadQueue.length, mySpotifyPlaylists.length, displayedSpotifyPlaylists.length, mode, query, onResultsCountChange, selectedPlaylistId, selectedPlaylistData]);

  const performSearch = async (q: string) => {
    if (!q.trim()) return;
    setIsSearching(true); setShowSuggestions(false); setDownloadError(null); setSpError(null); setSelectedIndex(0);

    // Save to search history if user is logged in
    if (user?.id) {
      historyApi.logSearch(user.id, q).catch((err) => {
        console.warn("[SearchTab] Failed to log search history:", err);
      });
      setRecentHistory(prev => ({
        ...prev,
        searches: [{ id: `temp-${Date.now()}`, query: q, createdAt: new Date().toISOString() }, ...prev.searches.filter(s => s.query !== q)].slice(0, 10)
      }));
    }

    if (mode === "youtube") {
      try {
        const [ytRes, dbRes] = await Promise.all([
          roomsApi.searchYoutube(roomId, q).catch(() => []),
          roomsApi.searchLocalSongs(q).catch(() => ({ results: [] }))
        ]);
        setYtResults(ytRes);
        setDbResults(dbRes.results || []);
      }
      catch (err) { console.error(err); } finally { setIsSearching(false); }
    } else if (mode === "spotify") {
      const isUrl = q.trim().startsWith("http") || q.trim().startsWith("spotify:");
      if (isUrl) {
        setIsSearching(false);
        handleSpotifyImport(q);
      } else {
        try {
          const spRes = await roomsApi.searchSpotifyPlaylists(q).catch(() => []);
          setSpResults(spRes);
        } catch (err) { console.error(err); } finally { setIsSearching(false); }
      }
    } else {
      // Global Search
      try {
        const [ytRes, spRes, dbRes] = await Promise.all([
          roomsApi.searchYoutube(roomId, q).catch(() => []),
          roomsApi.searchSpotifyPlaylists(q).catch(() => []),
          roomsApi.searchLocalSongs(q).catch(() => ({ results: [] }))
        ]);
        setYtResults(ytRes);
        setSpResults(spRes);
        setDbResults(dbRes.results || []);
      } catch (err) { console.error(err); } finally { setIsSearching(false); }
    }
  };

  const handleSpotifyImport = async (url: string) => {
    if (!token) return;
    if (!url.includes("spotify.com/playlist/")) {
      setSpError("Please enter a valid Spotify public playlist URL.");
      return;
    }
    setImporting(true);
    setSpError(null);
    setImportStage("scraping");
    setImportProgress(15);
    setImportStats({ total: 0 });

    upload.setActiveImport({
      playlistName: "Imported Playlist",
      progress: 15,
      stage: "scraping",
      totalTracks: 0,
      isImporting: true,
    });

    const progressTimer = setInterval(() => {
      setImportProgress(prev => {
        const next = prev < 40 ? prev + 5 : prev < 80 ? prev + 2 : prev < 95 ? prev + 0.5 : prev;
        upload.setActiveImport(curr => curr ? { ...curr, progress: Math.min(98, next) } : null);
        return next;
      });
    }, 300);

    try {
      setTimeout(() => {
        setImportStage("indexing");
        upload.setActiveImport(curr => curr ? { ...curr, stage: "indexing" } : null);
      }, 1200);

      setTimeout(() => {
        setImportStage("enriching");
        upload.setActiveImport(curr => curr ? { ...curr, stage: "enriching" } : null);
      }, 2800);

      const r = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000"}/api/bridge/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ playlistUrl: url }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.details || data.error || "Failed to import playlist.");
      
      clearInterval(progressTimer);
      setImportProgress(100);
      setImportStage("done");
      const finalStats = {
        total: data.totalTracks || data.trackCount || 0,
        playlistName: data.playlistName || "Spotify Playlist",
        playlistId: data.playlistId,
        coverUrl: data.coverUrl,
      };
      setImportStats(finalStats);

      upload.setActiveImport({
        playlistId: data.playlistId,
        playlistName: data.playlistName || "Spotify Playlist",
        progress: 100,
        stage: "done",
        totalTracks: data.totalTracks || data.trackCount || 0,
        isImporting: false,
      });

      // Refetch user's playlists so the new playlist is listed immediately
      try {
        const plRes = await roomsApi.getUserSpotifyPlaylists();
        if (plRes && Array.isArray(plRes)) {
          setMySpotifyPlaylists(plRes);
        }
      } catch (plErr) {}

      setQuery("");
      onSuccess?.();
    } catch (err: any) {
      clearInterval(progressTimer);
      upload.setActiveImport(null);
      const errMsg = err.message || "Something went wrong during import.";
      if (errMsg.toLowerCase().includes("invalid spotify data structure") || errMsg.toLowerCase().includes("could not extract spotify playlist")) {
        setSpError("Private playlists cannot be imported. Make it public first.");
      } else {
        setSpError(errMsg);
      }
    } finally {
      clearInterval(progressTimer);
      setImporting(false);
    }
  };

  // handleSpotifyEnqueue: now a thin wrapper — actual logic in enqueueAsync above
  const handleSpotifyEnqueue = useCallback(async (playlistId: string) => {
    setSpError(null);
    try {
      await enqueueAsync.run(playlistId);
      onSuccess?.();
    } catch (e: any) {
      setSpError(e?.message || "Failed to add playlist to queue.");
    }
  }, [enqueueAsync, onSuccess]);

  const handlePlaylistClick = (id: string) => {
    setSelectedPlaylistId(id);
    const playlist = mySpotifyPlaylists.find(p => p.id === id);
    if (playlist) {
      setSelectedPlaylistData(playlist);
    }
  };

  const handleDeletePlaylist = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPlaylistToDelete(id);
  };

  const confirmDeletePlaylist = async () => {
    if (!playlistToDelete || isDeletingPlaylist) return;
    setIsDeletingPlaylist(true);
    try {
      await roomsApi.deletePlaylist(playlistToDelete);
      setMySpotifyPlaylists(prev => prev.filter(p => p.id !== playlistToDelete));
      if (selectedPlaylistId === playlistToDelete) {
        setSelectedPlaylistId(null);
        setSelectedPlaylistData(null);
      }
    } catch (err) {
      console.error("Failed to delete playlist", err);
    } finally {
      setIsDeletingPlaylist(false);
      setPlaylistToDelete(null);
    }
  };

  const handleUpdatePlaylist = async () => {
    if (!selectedPlaylistId || !selectedPlaylistData) return;
    setIsSavingPlaylist(true);
    try {
      const { playlist } = await roomsApi.updatePlaylist(selectedPlaylistId, {
        name: editName.trim() || undefined,
        coverUrl: editCoverUrl || undefined
      });
      // Update local state
      const updatedPlaylist = { ...selectedPlaylistData, name: playlist.name, coverUrl: playlist.coverUrl };
      setSelectedPlaylistData(updatedPlaylist);
      setMySpotifyPlaylists(prev => prev.map(p => p.id === selectedPlaylistId ? { ...p, name: playlist.name, coverUrl: playlist.coverUrl } : p));
      setIsEditingPlaylist(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingPlaylist(false);
    }
  };

  const handleCoverImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setEditCoverUrl(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleFixPlaylistMetadata = async (playlistIdToFix?: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const targetId = playlistIdToFix || selectedPlaylistId;
    if (!targetId || isFixingMetadata || !token) return;
    setIsFixingMetadata(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000"}/api/playlists/${targetId}/enrich`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      if (res.ok && data.playlist) {
        if (selectedPlaylistId === targetId) {
          setSelectedPlaylistData(data.playlist);
        }
        setMySpotifyPlaylists(prev => prev.map(p => p.id === targetId ? { ...p, coverUrl: data.playlist.coverUrl || p.coverUrl } : p));
      }
    } catch (err) {
      console.error("Failed to fix metadata", err);
    } finally {
      setIsFixingMetadata(false);
    }
  };

  const [promptTrack, setPromptTrack] = useState<any | null>(null);

  const executeEnqueueAndPlay = async (result: any, shouldPlayNow: boolean) => {
    if (addedSongs.has(result.url)) {
      setDownloadError("Song already exists in the queue!");
      return;
    }
    setEnqueuing(result.url);
    setDownloadError(null);

    try {
      let videoId = "";
      if (result.url.startsWith("youtube:")) {
        videoId = result.url.split(":")[1];
      } else {
        videoId = result.url.split("v=")[1]?.split("&")[0] || result.url.split("youtu.be/")[1]?.split("?")[0];
      }

      // Fast enqueue via YouTube API (~50ms)
      const res = await roomsApi.enqueueYoutube(roomId, videoId, result.title);
      setAddedSongs(prev => new Set(prev).add(result.url));

      // If user selected "Play Now", trigger immediate jump to the enqueued item
      if (shouldPlayNow && res && (res as any).item?.id) {
        getSocket().emit("playback:jumpTo", { roomId, trackId: (res as any).item.id });
      }

      if (user?.id) {
        historyApi.logListen(user.id, {
          youtubeId: videoId,
          title: result.title,
          artist: result.uploaderName || result.artist || '',
          thumbnail: result.thumbnail
        }).then(() => historyApi.getRecent(user.id))
          .then(res => { if (res) setRecentHistory(res); })
          .catch(() => {});
      }

      onSuccess?.();
    } catch (err: any) {
      setDownloadError(err.message?.includes("RapidAPI") || err.message?.includes("FATAL")
        ? "This track is age-restricted or blocked. Try another." : err.message || "Failed to load.");
    } finally {
      setEnqueuing(null);
    }
  };

  const { dataRef } = useVisualizer();

  const handlePlay = (result: any) => {
    const activePlayback = isPlaying || (dataRef?.current?.isPlaying) || false;
    if (activePlayback) {
      // Prompt user with PlayOrEnqueueModal when a song is currently playing
      setPromptTrack(result);
    } else {
      executeEnqueueAndPlay(result, true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const list = showSuggestions && ytSuggestions.length > 0 ? ytSuggestions : ytResults;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => (prev < list.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (mode === "spotify") {
        const isUrl = query.trim().startsWith("http") || query.trim().startsWith("spotify:");
        if (isUrl) {
          handleSpotifyImport(query);
        } else if (displayedSpotifyPlaylists.length > 0) {
          handlePlaylistClick(displayedSpotifyPlaylists[0].id);
        }
      } else if (showSuggestions && ytSuggestions.length > 0) {
        const s = ytSuggestions[selectedIndex];
        if (s) { setQuery(s); performSearch(s); }
      } else if (ytResults.length > 0) {
        const r = ytResults[selectedIndex];
        if (r && !addedSongs.has(r.url) && enqueuing !== r.url) handlePlay(r);
      } else if (query) {
        performSearch(query);
      }
    }
  };

  const isCentered = !query.trim() && !isSearching && ytResults.length === 0 && spResults.length === 0 && dbResults.length === 0 && uploadQueue.length === 0 && (mode !== "spotify" || (mySpotifyPlaylists.length === 0 && !selectedPlaylistId));
  const containerPadding = isSearchOnly ? "p-[2px]" : "px-5 sm:px-8 py-6";

  const getPlaceholder = () => {
    if (mode === "youtube") return "Search YouTube...";
    if (mode === "spotify") return "Paste Spotify Playlist URL...";
    return "Search YouTube & Spotify...";
  };

  return (
    <div className={`relative flex flex-col w-full h-full min-h-0 flex-1 ${containerPadding}`}>
      <motion.div layout transition={SPRING} className={`flex items-start gap-3 shrink-0 relative z-50 ${isSearchOnly ? "m-0 h-full" : "mb-4"}`}>
        {!isSearchOnly && (
          <button 
            type="button"
            onClick={e => { 
              e.preventDefault();
              e.stopPropagation(); 
              if (selectedPlaylistId) {
                setSelectedPlaylistId(null);
                setSelectedPlaylistData(null);
              } else {
                onBack?.();
              }
            }} 
            className={cn('p-2', '-ml-2', 'rounded-full', 'hover:bg-white/10', 'active:bg-white/20', 'text-white/70', 'hover:text-white', 'transition-colors', 'shrink-0', 'mt-0.5', 'cursor-pointer', 'touch-manipulation', 'z-50')}
            title="Back"
          >
            <ChevronLeft className={cn('w-6', 'h-6')} />
          </button>
        )}
        <div className={cn('flex-1', 'relative', 'h-full')}>
          <input
            name="syncbeats-search-input"
            type="search"
            inputMode="search"
            value={query}
            onChange={e => { setQuery(e.target.value); setSpError(null); if (mode !== "spotify") setShowSuggestions(true); }}
            onKeyDown={handleKeyDown}
            onClick={e => { e.stopPropagation(); if (mode !== "spotify") setShowSuggestions(true); }}
            onFocus={() => { if (mode !== "spotify") setShowSuggestions(true); }}
            onBlur={() => { /* don't hide immediately */ }}
            placeholder={getPlaceholder()}
            disabled={importing}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck="false"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            aria-autocomplete="none"
            className={`w-full h-full bg-white/10 border border-white/20 rounded-full pl-10 ${query ? "pr-4" : "pr-24"} text-white text-base md:text-sm placeholder-white/40 focus:outline-none focus:bg-white/20 transition-all ${!isSearchOnly ? "py-2.5" : ""}`}
            autoFocus
          />
          <Search className={cn('absolute', 'left-3.5', 'top-1/2', '-translate-y-1/2', 'w-4', 'h-4', 'text-white/50')} />

          <AnimatePresence>
            {!query && (
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                className={cn('absolute', 'right-1.5', 'top-1/2', '-translate-y-1/2', 'flex', 'items-center', 'gap-0.5')}>

                {/* YouTube Toggle */}
                <button onClick={e => { e.preventDefault(); setMode(mode === "youtube" ? null : "youtube"); }}
                  className={`w-7 h-7 flex items-center justify-center rounded-full cursor-pointer transition-all ${mode === "youtube" ? "bg-white/20 shadow-sm" : " opacity-80 hover:opacity-100 grayscale hover:grayscale-0"}`} title={mode === "youtube" ? "Disable YouTube Mode" : "Search YouTube"}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF0000">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                </button>

                {/* Spotify Toggle */}
                <button onClick={e => { e.preventDefault(); setMode(mode === "spotify" ? null : "spotify"); }}
                  className={`w-7 h-7 flex items-center justify-center rounded-full cursor-pointer transition-all ${mode === "spotify" ? "bg-white/20 shadow-sm" : " opacity-50 hover:opacity-100 grayscale hover:grayscale-0"}`} title={mode === "spotify" ? "Disable Spotify Mode" : "Import from Spotify"}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="#1DB954">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.371-.721.49-1.101.241-3.021-1.858-6.832-2.278-11.322-1.237-.418.092-.851-.179-.942-.601-.09-.421.18-.85.6-.942 4.909-1.121 9.121-.632 12.511 1.43.38.249.5.731.254 1.109zm1.47-3.27c-.301.459-.939.6-1.399.301-3.459-2.127-8.73-2.74-12.81-1.5-.521.157-1.07-.14-1.23-.66-.156-.52.14-1.07.661-1.23 4.669-1.42 10.47-.731 14.419 1.71.461.3.601.94.359 1.379zm.12-3.39C15.241 8.57 8.851 8.37 5.141 9.49c-.62.18-1.27-.17-1.451-.79-.179-.619.17-1.27.791-1.449 4.279-1.291 11.39-1.041 15.88 1.66.54.329.711 1.03.381 1.57-.33.53-1.03.7-1.569.37z" />
                  </svg>
                </button>

                {/* Upload Button */}
                <label className={cn('w-7', 'h-7', 'flex', 'items-center', 'justify-center', 'rounded-full', 'hover:bg-white/10', 'cursor-pointer', 'text-white/50', 'hover:text-white', 'transition-colors')} title="Upload Local File">
                  {upload.isUploading ? <Loader2 className={cn('w-3.5', 'h-3.5', 'animate-spin')} /> : <Upload className={cn('w-3.5', 'h-3.5')} />}
                  <input type="file" accept="audio/*" multiple className="hidden"
                    onChange={async e => {
                      const files = Array.from(e.target.files || []);
                      if (files.length === 0) return;
                      const fileIds = files.map(f => ({ id: Math.random().toString(36).substr(2, 9), name: f.name, status: "pending" as const }));
                      setUploadQueue(prev => [...prev, ...fileIds]);
                      e.target.value = '';

                      for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        const fid = fileIds[i].id;
                        setUploadQueue(prev => prev.map(item => item.id === fid ? { ...item, status: "uploading" } : item));
                        try {
                          await upload.uploadFile(file, roomId);
                          setUploadQueue(prev => prev.map(item => item.id === fid ? { ...item, status: "done" } : item));
                          onSuccess?.();
                          setTimeout(() => {
                            setUploadQueue(prev => prev.filter(item => item.id !== fid));
                          }, 3000);
                        } catch (err) {
                          console.error(err);
                          setUploadQueue(prev => prev.map(item => item.id === fid ? { ...item, status: "error" } : item));
                        }
                      }
                    }} />
                </label>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {downloadError && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
          className={cn('bg-red-500/20', 'border', 'border-red-500/30', 'text-red-200', 'text-xs', 'px-3', 'py-2', 'rounded-xl', 'mb-3', 'shrink-0')}>
          {downloadError}
        </motion.div>
      )}

      {spError && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
          className={cn('bg-red-500/20', 'border', 'border-red-500/30', 'text-red-200', 'text-xs', 'px-3', 'py-3', 'rounded-xl', 'mb-3', 'shrink-0', 'flex', 'flex-col', 'gap-2')}>
          <div>{spError}</div>
          {spError === "Private playlists cannot be imported. Make it public first." && (
            <div className="w-full rounded-lg overflow-hidden border border-red-500/30 mt-1 relative bg-black/50 aspect-video flex-shrink-0">
              <video 
                className="w-full h-full object-cover"
                autoPlay 
                loop 
                muted 
                playsInline
                src="/demo-make-public.mp4"
              />
              <div className="absolute bottom-2 left-2 pointer-events-none">
                 <span className="bg-black/60 text-white/80 text-[9px] px-2 py-1 rounded-md uppercase tracking-wider font-bold backdrop-blur-md">How to make public</span>
              </div>
            </div>
          )}
        </motion.div>
      )}

      <AnimatePresence>
        {importing && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.95 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="p-5 rounded-3xl bg-foreground/5 border border-foreground/15 shadow-2xl backdrop-blur-2xl relative overflow-hidden my-3 shrink-0"
          >
            {/* Ambient Pulsing Background Aura */}
            <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-violet-500/10 blur-3xl animate-pulse pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full bg-emerald-500/10 blur-3xl animate-pulse pointer-events-none" />

            {/* Header Info */}
            <div className="flex items-center justify-between mb-3 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-foreground/10 border border-foreground/15 flex items-center justify-center text-foreground shrink-0 shadow-md">
                  {importStage === "done" ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : <Loader2 className="w-5 h-5 animate-spin text-foreground/80" />}
                </div>
                <div>
                  <h4 className="text-sm font-black text-foreground flex items-center gap-2">
                    <span>{importStage === "done" ? `Imported "${importStats.playlistName || "Spotify Playlist"}"` : "Importing Spotify Playlist"}</span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-foreground/10 text-foreground/80 font-bold border border-foreground/15 uppercase tracking-widest">
                      {importStage === "done" ? "SUCCESS" : "ACTIVE STAGE"}
                    </span>
                  </h4>
                  <p className="text-xs text-foreground/60 mt-0.5">
                    {importStage === "scraping" && "Stage 1/3: Extracting tracks & metadata..."}
                    {importStage === "indexing" && "Stage 2/3: Building catalog & checking duplicates..."}
                    {importStage === "enriching" && "Stage 3/3: Fetching 600x600 artwork & audio streams..."}
                    {importStage === "done" && `${importStats.total} songs successfully imported into "${importStats.playlistName || "Playlist"}"!`}
                  </p>
                </div>
              </div>
              <span className="text-xl font-black text-foreground font-mono tracking-wider ml-2">
                {Math.round(importProgress)}%
              </span>
            </div>

            {/* Animated Progress Bar in Pure White */}
            <div className="w-full h-3.5 rounded-full bg-white/10 overflow-hidden relative border border-white/15 p-0.5 z-10 shadow-inner">
              <motion.div
                className="h-full rounded-full bg-white relative shadow-[0_0_12px_rgba(255,255,255,0.6)]"
                initial={{ width: "0%" }}
                animate={{ width: `${importProgress}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                {/* Subtle glowing head light */}
                <div className="absolute top-0 right-0 w-3 h-full bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.9)] opacity-100" />
              </motion.div>
            </div>

            {/* Completion Actions or Stage Footer */}
            {importStage === "done" && importStats.playlistId ? (
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-foreground/10 relative z-10">
                <button
                  onClick={() => {
                    if (importStats.playlistId) {
                      handlePlaylistClick(importStats.playlistId);
                      setImporting(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-foreground hover:bg-foreground/90 text-background font-extrabold text-xs transition-all active:scale-95 flex items-center gap-1.5 shadow-lg"
                >
                  <Music className="w-4 h-4" /> View Playlist ({importStats.total} Tracks)
                </button>
                <button
                  onClick={() => {
                    if (importStats.playlistId) {
                      handleSpotifyEnqueue(importStats.playlistId);
                      setImporting(false);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-foreground/10 hover:bg-foreground/20 text-foreground font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5 border border-foreground/10"
                >
                  <Play className="w-3.5 h-3.5 fill-current" /> Play All
                </button>
                <button
                  onClick={() => setImporting(false)}
                  className="ml-auto px-3 py-2 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-foreground/60 hover:text-foreground text-xs font-bold transition-all"
                >
                  Dismiss
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between mt-3 text-[11px] text-foreground/60 relative z-10">
                <div className="flex items-center gap-1.5 font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-foreground/70 animate-spin" />
                  <span>{importStats.total ? `${importStats.total} Tracks Processed` : "Scanning playlist items..."}</span>
                </div>
                <span className="text-foreground/40 italic">Auto-resumes on network dropout</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isCentered && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 15 }}
            transition={{ ...SPRING, opacity: { duration: 0.2 } }}
            ref={scrollRef}
            className={cn('flex-1', 'min-h-0', 'overflow-y-auto', 'custom-scrollbar', 'pr-2', 'space-y-2', '-mx-2', 'px-2', 'flex', 'flex-col', 'pointer-events-auto', 'scroll-smooth')}
            data-lenis-prevent="true"
            onClick={e => e.stopPropagation()}>

            {spError && (
              <AppFeedback message={spError} severity="error" onDismiss={() => setSpError(null)} className="mb-2" />
            )}
            {downloadError && (
              <AppFeedback message={downloadError} severity="error" onDismiss={() => setDownloadError(null)} className="mb-2" />
            )}

            {isSearching ? (
              <SearchSkeleton count={5} />
            ) : showSuggestions && ytSuggestions.length > 0 ? (
              ytSuggestions.map((s, idx) => (
                <div key={idx} onMouseDown={e => { e.preventDefault(); setQuery(s); performSearch(s); }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`px-4 py-3 text-sm rounded-xl cursor-pointer flex items-center gap-3 transition-colors shrink-0 ${selectedIndex === idx ? "bg-white/20 text-white" : "text-white/80 hover:text-white hover:bg-white/10"}`}>

                  <Search className={cn('w-3.5', 'h-3.5', 'text-white/40')} />{s}
                </div>
              ))
            ) : (ytResults.length > 0 || spResults.length > 0 || uploadQueue.length > 0 || (mode === "spotify" && (mySpotifyPlaylists.length > 0 || selectedPlaylistId))) ? (
              <>
                {uploadQueue.map(uq => (
                  <div key={uq.id} className={cn('flex', 'items-center', 'gap-3', 'p-2', 'rounded-xl', 'bg-white/5', 'border', 'border-transparent', 'shrink-0')}>
                    <div className={cn('w-20', 'h-14', 'bg-white/10', 'rounded-lg', 'flex', 'items-center', 'justify-center', 'shrink-0')}>
                      <Upload className={cn('w-6', 'h-6', 'text-white/50')} />
                    </div>
                    <div className={cn('space-y-1', 'min-w-0', 'flex-1')}>
                      <div className={cn('text-white', 'text-sm', 'font-bold', 'truncate')}>{uq.name}</div>
                      <div className={cn('text-white/50', 'text-[10px]', 'uppercase', 'tracking-widest', 'truncate')}>Local Upload</div>
                    </div>
                    <div className={cn('w-10', 'h-10', 'shrink-0', 'flex', 'items-center', 'justify-center', 'rounded-full', 'bg-white/10', 'text-white')}>
                      {uq.status === "uploading" ? <Loader2 className={cn('w-4', 'h-4', 'animate-spin')} /> : uq.status === "done" ? <CheckCircle2 className={cn('w-5', 'h-5', 'text-green-500')} /> : uq.status === "error" ? <AlertCircle className={cn('w-5', 'h-5', 'text-red-500')} /> : <Loader2 className={cn('w-4', 'h-4', 'animate-spin', 'opacity-50')} />}
                    </div>
                  </div>
                ))}

                {/* Spotify Results */}
                {spResults.map((r, idx) => (
                  <div key={r.id}
                    className={cn('flex', 'items-center', 'gap-3', 'p-2', 'rounded-xl', 'bg-white/5', 'border', 'border-transparent', 'hover:bg-white/10', 'transition-all', 'duration-300', 'group', 'shrink-0')}>
                    <img src={r.coverUrl || "/placeholder-playlist.png"} loading="eager" decoding="sync" className={cn('w-14', 'h-14', 'object-cover', 'rounded-lg', 'bg-black/50', 'shrink-0')} />
                    <div className={cn('space-y-1', 'min-w-0', 'flex-1')}>
                      <div className={cn('text-white', 'text-sm', 'font-bold', 'truncate', 'flex', 'items-center', 'gap-2')}>
                        {r.name}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#1DB954" className="shrink-0"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.371-.721.49-1.101.241-3.021-1.858-6.832-2.278-11.322-1.237-.418.092-.851-.179-.942-.601-.09-.421.18-.85.6-.942 4.909-1.121 9.121-.632 12.511 1.43.38.249.5.731.254 1.109zm1.47-3.27c-.301.459-.939.6-1.399.301-3.459-2.127-8.73-2.74-12.81-1.5-.521.157-1.07-.14-1.23-.66-.156-.52.14-1.07.661-1.23 4.669-1.42 10.47-.731 14.419 1.71.461.3.601.94.359 1.379zm.12-3.39C15.241 8.57 8.851 8.37 5.141 9.49c-.62.18-1.27-.17-1.451-.79-.179-.619.17-1.27.791-1.449 4.279-1.291 11.39-1.041 15.88 1.66.54.329.711 1.03.381 1.57-.33.53-1.03.7-1.569.37z" /></svg>
                      </div>
                      <div className={cn('text-white/50', 'text-[10px]', 'uppercase', 'tracking-widest', 'truncate')}>{r.trackCount} Tracks • {r.owner}</div>
                    </div>
                    <button
                      onClick={() => handleSpotifyEnqueue(r.id)}
                      disabled={enqueueAsync.isPending}
                      className={cn('w-10', 'h-10', 'shrink-0', 'flex', 'items-center', 'justify-center', 'rounded-full', 'bg-white/10', 'hover:bg-[#1DB954]', 'text-white', 'active:scale-90', 'transition-all', 'disabled:opacity-50', 'disabled:cursor-wait')}
                    >
                      {enqueueAsync.isPending ? <Loader2 className={cn('w-4', 'h-4', 'animate-spin')} /> : <Plus className={cn('w-5', 'h-5')} />}
                    </button>
                  </div>
                ))}

                {/* My Spotify Playlists */}
                {displayedSpotifyPlaylists.map((r, idx) => {
                  const isThisPlaylistImporting = !!(
                    upload.activeImport?.isImporting && (
                      upload.activeImport?.playlistId === r.id ||
                      upload.activeImport?.playlistName?.toLowerCase() === r.name?.toLowerCase()
                    )
                  );

                  return (
                    <div key={r.id}
                      onClick={() => handlePlaylistClick(r.id)}
                      className={cn('flex', 'items-center', 'gap-3', 'p-2', 'rounded-xl', 'relative', 'overflow-hidden',
                        isThisPlaylistImporting 
                          ? 'bg-foreground/10 border border-foreground/20 shadow-md' 
                          : 'bg-white/5 border border-transparent hover:bg-white/10',
                        'transition-all', 'duration-300', 'group', 'shrink-0', 'cursor-pointer')}
                    >
                      {/* Background Fill Progress Bar */}
                      {isThisPlaylistImporting && (
                        <motion.div
                          className="absolute inset-y-0 left-0 bg-foreground/10 z-0 pointer-events-none border-r border-foreground/30"
                          initial={{ width: "0%" }}
                          animate={{ width: `${upload.activeImport?.progress ?? 0}%` }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                        >
                          <div className="absolute top-0 right-0 w-2 h-full bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.8)] opacity-90" />
                        </motion.div>
                      )}

                      {r.coverUrl ? (
                        <img src={r.coverUrl} loading="eager" decoding="sync" className={cn('w-14', 'h-14', 'object-cover', 'rounded-lg', 'bg-black/50', 'shrink-0', 'relative', 'z-10')} />
                      ) : (
                        <div className={cn('w-14', 'h-14', 'rounded-lg', 'bg-black/50', 'shrink-0', 'flex', 'items-center', 'justify-center', 'relative', 'z-10')}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.371-.721.49-1.101.241-3.021-1.858-6.832-2.278-11.322-1.237-.418.092-.851-.179-.942-.601-.09-.421.18-.85.6-.942 4.909-1.121 9.121-.632 12.511 1.43.38.249.5.731.254 1.109zm1.47-3.27c-.301.459-.939.6-1.399.301-3.459-2.127-8.73-2.74-12.81-1.5-.521.157-1.07-.14-1.23-.66-.156-.52.14-1.07.661-1.23 4.669-1.42 10.47-.731 14.419 1.71.461.3.601.94.359 1.379zm.12-3.39C15.241 8.57 8.851 8.37 5.141 9.49c-.62.18-1.27-.17-1.451-.79-.179-.619.17-1.27.791-1.449 4.279-1.291 11.39-1.041 15.88 1.66.54.329.711 1.03.381 1.57-.33.53-1.03.7-1.569.37z" /></svg>
                        </div>
                      )}
                      <div className={cn('space-y-1', 'min-w-0', 'flex-1', 'relative', 'z-10')}>
                        <div className={cn('text-white', 'text-sm', 'font-bold', 'truncate', 'flex', 'items-center', 'gap-2')}>
                          {r.name}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="#1DB954" className="shrink-0"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.371-.721.49-1.101.241-3.021-1.858-6.832-2.278-11.322-1.237-.418.092-.851-.179-.942-.601-.09-.421.18-.85.6-.942 4.909-1.121 9.121-.632 12.511 1.43.38.249.5.731.254 1.109zm1.47-3.27c-.301.459-.939.6-1.399.301-3.459-2.127-8.73-2.74-12.81-1.5-.521.157-1.07-.14-1.23-.66-.156-.52.14-1.07.661-1.23 4.669-1.42 10.47-.731 14.419 1.71.461.3.601.94.359 1.379zm.12-3.39C15.241 8.57 8.851 8.37 5.141 9.49c-.62.18-1.27-.17-1.451-.79-.179-.619.17-1.27.791-1.449 4.279-1.291 11.39-1.041 15.88 1.66.54.329.711 1.03.381 1.57-.33.53-1.03.7-1.569.37z" /></svg>
                        </div>
                        <div className={cn('text-white/50', 'text-[10px]', 'uppercase', 'tracking-widest', 'truncate')}>{r.trackCount} Tracks • {r.owner}</div>
                        {isThisPlaylistImporting && (
                          <div className="text-cyan-300 text-xs font-extrabold truncate flex items-center gap-1.5 mt-1 bg-cyan-500/20 border border-cyan-500/30 px-2 py-0.5 rounded-md w-fit max-w-full shadow-md">
                            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-cyan-400" />
                            <span>Importing & Enriching ({Math.round(upload.activeImport?.progress ?? 0)}%)</span>
                          </div>
                        )}
                        {(() => {
                          const term = query.trim().toLowerCase();
                          if (!term) return null;
                          const matchedTracks = r.tracks?.filter((t: any) => t.song?.title?.toLowerCase().includes(term) || t.song?.artist?.toLowerCase().includes(term)) || [];
                          if (matchedTracks.length === 0) return null;
                          const firstSong = matchedTracks[0].song;
                          return (
                            <div className="text-emerald-400 text-xs font-semibold truncate flex items-center gap-1.5 mt-1 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-md w-fit max-w-full">
                              <Music className="w-3 h-3 shrink-0 text-emerald-400 opacity-90" />
                              <span className="truncate">
                                Contains <span className="text-white font-bold">{firstSong?.title}</span>
                                {firstSong?.artist ? ` • ${firstSong.artist}` : ""}
                                {matchedTracks.length > 1 ? ` (+${matchedTracks.length - 1} more)` : ""}
                              </span>
                            </div>
                          );
                        })()}
                      </div>

                      <button onClick={(e) => handleFixPlaylistMetadata(r.id, e)}
                        disabled={isFixingMetadata}
                        className={cn('w-10', 'h-10', 'shrink-0', 'flex', 'items-center', 'justify-center', 'rounded-full', 'bg-emerald-500/10', 'hover:bg-emerald-500/20', 'text-emerald-400', 'border', 'border-emerald-500/20', 'active:scale-90', 'transition-all', 'hidden', 'group-hover:flex', 'relative', 'z-10')}
                        title="Fix & refetch missing artwork and metadata">
                        <Sparkles className={cn('w-4', 'h-4', isFixingMetadata && 'animate-spin')} />
                      </button>

                      <button onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(r.id, e); }}
                        className={cn('w-10', 'h-10', 'shrink-0', 'flex', 'items-center', 'justify-center', 'rounded-full', 'bg-white/5', 'hover:bg-red-500/20', 'text-white/50', 'hover:text-red-400', 'active:scale-90', 'transition-all', 'sm:hidden', 'group-hover:flex', 'relative', 'z-10')}>
                        <Trash2 className={cn('w-4', 'h-4')} />
                      </button>

                      <button onClick={(e) => { e.stopPropagation(); handleSpotifyEnqueue(r.id); }}
                        disabled={enqueueAsync.isPending}
                        className={cn('w-10', 'h-10', 'shrink-0', 'flex', 'items-center', 'justify-center', 'rounded-full', 'bg-white/10', 'hover:bg-[#1DB954]', 'text-white', 'active:scale-90', 'transition-all', 'relative', 'z-10', 'disabled:opacity-50', 'disabled:cursor-wait')}>
                        {enqueueAsync.isPending ? <Loader2 className={cn('w-4', 'h-4', 'animate-spin')} /> : <Play className={cn('w-5', 'h-5', 'ml-0.5')} />}
                      </button>
                    </div>
                  );
                })}

                {/* Playlist Info Drill-down View */}
                {mode === "spotify" && !query.trim() && selectedPlaylistId && (
                  <div className={cn('flex', 'flex-col', 'gap-2')}>
                    <button
                      type="button"
                      onClick={e => { 
                        e.preventDefault();
                        e.stopPropagation(); 
                        setSelectedPlaylistId(null); 
                        setSelectedPlaylistData(null); 
                      }}
                      className={cn('flex', 'items-center', 'gap-2', 'text-white/80', 'hover:text-white', 'active:text-white', 'transition-colors', 'py-2.5', 'px-1', 'text-sm', 'font-semibold', 'sticky', 'top-0', 'bg-black/90', 'backdrop-blur-md', 'z-30', 'cursor-pointer', 'touch-manipulation')}
                    >
                      <ChevronLeft className={cn('w-5', 'h-5')} /> Back to Playlists
                    </button>

                    {selectedPlaylistData && (
                      <>
                        <div className={cn('flex', 'items-end', 'gap-4', 'p-4', 'bg-white/5', 'rounded-2xl', 'relative')}>
                          {isEditingPlaylist ? (
                            <label className={cn('relative', 'w-24', 'h-24', 'rounded-xl', 'shadow-xl', 'shrink-0', 'bg-black/50', 'flex', 'items-center', 'justify-center', 'cursor-pointer', 'group', 'overflow-hidden', 'border', 'border-white/10', 'hover:border-white/30', 'transition-colors')}>
                              <img src={editCoverUrl || "/placeholder-playlist.png"} loading="eager" decoding="sync" className={cn('absolute', 'inset-0', 'w-full', 'h-full', 'object-cover', 'opacity-50', 'group-hover:opacity-30', 'transition-opacity')} />
                              <Camera className={cn('w-8', 'h-8', 'text-white', 'relative', 'z-10', 'drop-shadow-md')} />
                              <input type="file" accept="image/*" className="hidden" onChange={handleCoverImageUpload} />
                            </label>
                          ) : (
                            selectedPlaylistData.coverUrl ? (
                              <img src={selectedPlaylistData.coverUrl} loading="eager" decoding="sync" className={cn('w-24', 'h-24', 'object-cover', 'rounded-xl', 'shadow-xl', 'shrink-0')} />
                            ) : (
                              <div className={cn('w-24', 'h-24', 'rounded-xl', 'shadow-xl', 'shrink-0', 'bg-black/50', 'flex', 'items-center', 'justify-center')}>
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.371-.721.49-1.101.241-3.021-1.858-6.832-2.278-11.322-1.237-.418.092-.851-.179-.942-.601-.09-.421.18-.85.6-.942 4.909-1.121 9.121-.632 12.511 1.43.38.249.5.731.254 1.109zm1.47-3.27c-.301.459-.939.6-1.399.301-3.459-2.127-8.73-2.74-12.81-1.5-.521.157-1.07-.14-1.23-.66-.156-.52.14-1.07.661-1.23 4.669-1.42 10.47-.731 14.419 1.71.461.3.601.94.359 1.379zm.12-3.39C15.241 8.57 8.851 8.37 5.141 9.49c-.62.18-1.27-.17-1.451-.79-.179-.619.17-1.27.791-1.449 4.279-1.291 11.39-1.041 15.88 1.66.54.329.711 1.03.381 1.57-.33.53-1.03.7-1.569.37z" /></svg>
                              </div>
                            )
                          )}
                          <div className={cn('flex-1', 'min-w-0', 'pb-1')}>
                            <div className={cn('text-white/50', 'text-[10px]', 'uppercase', 'tracking-widest', 'mb-1', 'flex', 'items-center', 'justify-between')}>
                              <span>Playlist</span>
                              {!isEditingPlaylist && (
                                <button onClick={() => {
                                  setEditName(selectedPlaylistData.name);
                                  setEditCoverUrl(selectedPlaylistData.coverUrl || "");
                                  setIsEditingPlaylist(true);
                                }} className={cn('p-1', 'hover:bg-white/10', 'rounded-full', 'transition-colors')}>
                                  <Edit2 className={cn('w-3.5', 'h-3.5')} />
                                </button>
                              )}
                            </div>

                            {isEditingPlaylist ? (
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className={cn('w-full', 'bg-black/40', 'border', 'border-white/20', 'rounded', 'px-2', 'py-1', 'text-white', 'text-lg', 'font-bold', 'mb-2', 'outline-none', 'focus:border-[#1DB954]')}
                                autoFocus
                              />
                            ) : (
                              <div className={cn('text-white', 'text-xl', 'font-bold', 'truncate', 'mb-2')}>{selectedPlaylistData.name}</div>
                            )}

                            <div className={cn('flex', 'items-center', 'gap-2')}>
                              {isEditingPlaylist ? (
                                <>
                                  <button onClick={handleUpdatePlaylist} disabled={isSavingPlaylist} className={cn('h-8', 'px-4', 'bg-[#1DB954]', 'hover:bg-[#1ed760]', 'disabled:opacity-50', 'text-black', 'text-sm', 'font-bold', 'rounded-full', 'flex', 'items-center', 'gap-1', 'active:scale-95', 'transition-all')}>
                                    {isSavingPlaylist ? <Loader2 className={cn('w-4', 'h-4', 'animate-spin')} /> : <Check className={cn('w-4', 'h-4')} />} Save
                                  </button>
                                  <button onClick={() => setIsEditingPlaylist(false)} className={cn('h-8', 'px-3', 'bg-white/10', 'hover:bg-white/20', 'text-white', 'text-sm', 'font-bold', 'rounded-full', 'flex', 'items-center', 'gap-1', 'active:scale-95', 'transition-all')}>
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => handleSpotifyEnqueue(selectedPlaylistData.id)}
                                  className={cn('h-8', 'px-4', 'bg-[#1DB954]', 'hover:bg-[#1ed760]', 'text-black', 'text-sm', 'font-bold', 'rounded-full', 'flex', 'items-center', 'gap-2', 'active:scale-95', 'transition-all')}>
                                  <Play className={cn('w-4', 'h-4', 'fill-current')} /> Play All
                                </button>
                              )}
                              {!isEditingPlaylist && (
                                <>
                                  <button onClick={(e) => handleFixPlaylistMetadata(selectedPlaylistData.id, e)}
                                    disabled={isFixingMetadata}
                                    className={cn('h-8', 'px-3', 'bg-emerald-500/20', 'hover:bg-emerald-500/30', 'border', 'border-emerald-500/30', 'text-emerald-300', 'text-xs', 'font-bold', 'rounded-full', 'flex', 'items-center', 'gap-1.5', 'active:scale-95', 'transition-all')}
                                    title="Refetch missing album art, artist names, and YouTube links">
                                    <Sparkles className={cn('w-3.5', 'h-3.5', isFixingMetadata && 'animate-spin')} />
                                    <span>{isFixingMetadata ? 'Refetching...' : 'Fix Missing Info'}</span>
                                  </button>
                                  <button onClick={(e) => handleDeletePlaylist(selectedPlaylistData.id, e)}
                                    className={cn('h-8', 'w-8', 'bg-white/10', 'hover:bg-red-500/20', 'text-white', 'hover:text-red-400', 'rounded-full', 'flex', 'items-center', 'justify-center', 'active:scale-95', 'transition-all')}>
                                    <Trash2 className={cn('w-4', 'h-4')} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className={cn('flex', 'flex-col', 'gap-1', 'mt-2')}>
                          {selectedPlaylistData.tracks?.map((track: any, idx: number) => {
                            const song = track.song || track;
                            if (!song || (!song.title && !song.youtubeId)) return null;

                            // Map to expected ytResults format for handlePlay
                            const mappedSong = {
                              url: `https://youtube.com/watch?v=${song.youtubeId}`,
                              title: song.title,
                              thumbnail: song.youtubeThumbnail,
                              uploaderName: song.artist,
                              duration: song.duration
                            };
                            const isAdded = addedSongs.has(mappedSong.url);
                            const isMatch = !!(query.trim() && (song.title?.toLowerCase().includes(query.trim().toLowerCase()) || song.artist?.toLowerCase().includes(query.trim().toLowerCase())));

                            return (
                              <div key={`${track.id}-${idx}`}
                                className={cn('flex', 'items-center', 'gap-3', 'p-2', 'rounded-xl', 'transition-all', 'duration-300', 'group', 'shrink-0', 'animate-in', 'fade-in', 'slide-in-from-bottom-2',
                                  isAdded ? 'bg-green-500/20 border border-green-500/30' : (isMatch ? 'bg-emerald-500/15 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'bg-white/5 border border-transparent hover:bg-white/10')
                                )}
                                style={{ animationFillMode: 'both', animationDelay: `${Math.min(idx * 30, 500)}ms` }}
                              >
                                <img src={song.youtubeThumbnail} loading="eager" decoding="sync" className={cn('w-12', 'h-10', 'object-cover', 'rounded-lg', 'bg-black/50', 'shrink-0')} />
                                <div className={cn('space-y-1', 'min-w-0', 'flex-1', 'pl-1')}>
                                  <div className={cn('text-white', 'text-sm', 'font-medium', 'truncate', 'flex', 'items-center', 'gap-2')}>
                                    {song.title}
                                    {isMatch && <span className="text-[9px] bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">Matches search</span>}
                                  </div>
                                  <div className={cn('text-white/50', 'text-[10px]', 'truncate')}>{song.artist}</div>
                                </div>
                                <button onClick={() => !isAdded && handlePlay(mappedSong)} disabled={enqueuing === mappedSong.url || isAdded}
                                  className={cn('w-8', 'h-8', 'shrink-0', 'flex', 'items-center', 'justify-center', 'rounded-full', 'transition-all',
                                    isAdded ? 'bg-green-500 text-white' : 'bg-white/10 hover:bg-[#FF0000] text-white active:scale-90'
                                  )}>
                                  {enqueuing === mappedSong.url ? <Loader2 className={cn('w-3', 'h-3', 'animate-spin')} />
                                    : isAdded ? <CheckCircle2 className={cn('w-4', 'h-4')} /> : <Plus className={cn('w-4', 'h-4')} />}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Local DB Songs (from Spotify library) */}
                {dbResults.length > 0 && (
                  <>
                    <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold px-2 mb-1.5 mt-2">From Spotify Library (DB)</div>
                    {dbResults.map((r, idx) => {
                      const isAdded = addedSongs.has(r.url);
                      return (
                        <div key={`db-${r.url}-${idx}`}
                          className={`flex items-center gap-3 p-2 rounded-xl transition-all duration-300 group shrink-0 ${isAdded ? "bg-green-500/20 border border-green-500/30" : "bg-white/5 border border-transparent hover:bg-white/10"}`}>
                          <div className="relative">
                            <img src={r.thumbnail || "/placeholder-playlist.png"} loading="eager" decoding="sync" className={cn('w-20', 'h-14', 'object-cover', 'rounded-lg', 'bg-black/50', 'shrink-0')} />
                            <div className="absolute -bottom-1 -right-1 bg-black/80 p-0.5 rounded-full border border-white/10 shadow-md">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.371-.721.49-1.101.241-3.021-1.858-6.832-2.278-11.322-1.237-.418.092-.851-.179-.942-.601-.09-.421.18-.85.6-.942 4.909-1.121 9.121-.632 12.511 1.43.38.249.5.731.254 1.109zm1.47-3.27c-.301.459-.939.6-1.399.301-3.459-2.127-8.73-2.74-12.81-1.5-.521.157-1.07-.14-1.23-.66-.156-.52.14-1.07.661-1.23 4.669-1.42 10.47-.731 14.419 1.71.461.3.601.94.359 1.379zm.12-3.39C15.241 8.57 8.851 8.37 5.141 9.49c-.62.18-1.27-.17-1.451-.79-.179-.619.17-1.27.791-1.449 4.279-1.291 11.39-1.041 15.88 1.66.54.329.711 1.03.381 1.57-.33.53-1.03.7-1.569.37z" /></svg>
                            </div>
                          </div>
                          <div className={cn('space-y-1', 'min-w-0', 'flex-1', 'pl-1')}>
                            <div className={cn('text-white', 'text-sm', 'font-bold', 'truncate')}>{r.title}</div>
                            <div className={cn('text-white/50', 'text-[10px]', 'uppercase', 'tracking-widest', 'truncate')}>{r.uploaderName}</div>
                          </div>
                          <button onClick={() => !isAdded && handlePlay(r)} disabled={enqueuing === r.url || isAdded}
                            className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-full transition-all ${isAdded ? "bg-green-500 text-white" : "bg-white/10 hover:bg-[#1DB954] text-black hover:text-white active:scale-90"}`}>
                            {enqueuing === r.url ? <Loader2 className={cn('w-4', 'h-4', 'animate-spin')} />
                              : isAdded ? <CheckCircle2 className={cn('w-5', 'h-5')} /> : <Plus className={cn('w-5', 'h-5')} />}
                          </button>
                        </div>
                      );
                    })}
                    <div className="border-b border-white/10 my-3" />
                  </>
                )}

                {/* YouTube Results */}
                {ytResults.map((r, idx) => {
                  const isAdded = addedSongs.has(r.url);
                  return (
                    <div key={r.url}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center gap-3 p-2 rounded-xl transition-all duration-300 group shrink-0 ${isAdded ? "bg-green-500/20 border border-green-500/30" : selectedIndex === idx ? "bg-white/15 border border-white/20" : "bg-white/5 border border-transparent hover:bg-white/10"}`}>
                      <div className="relative">
                        <img src={r.thumbnail} loading="eager" decoding="sync" className={cn('w-20', 'h-14', 'object-cover', 'rounded-lg', 'bg-black/50', 'shrink-0')} />
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#FF0000" className={cn('absolute', '-bottom-1', '-right-1', 'drop-shadow-md')}><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
                      </div>
                      <div className={cn('space-y-1', 'min-w-0', 'flex-1', 'pl-1')}>
                        <div className={cn('text-white', 'text-sm', 'font-bold', 'truncate')}>{r.title}</div>
                        <div className={cn('text-white/50', 'text-[10px]', 'uppercase', 'tracking-widest', 'truncate')}>{r.uploaderName}</div>
                      </div>
                      <button onClick={() => !isAdded && handlePlay(r)} disabled={enqueuing === r.url || isAdded}
                        className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-full transition-all ${isAdded ? "bg-green-500 text-white" : "bg-white/10 hover:bg-[#FF0000] text-white active:scale-90"}`}>
                        {enqueuing === r.url ? <Loader2 className={cn('w-4', 'h-4', 'animate-spin')} />
                          : isAdded ? <CheckCircle2 className={cn('w-5', 'h-5')} /> : <Plus className={cn('w-5', 'h-5')} />}
                      </button>
                    </div>
                  );
                })}
              </>
            ) : !query.trim() && mode !== "spotify" ? (
              <div className="space-y-6 mt-4">
                {/* Recent Searches */}
                {recentHistory.searches.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50 mb-2 px-1">
                      <History className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Recent Searches</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recentHistory.searches.slice(0, 8).map((s, idx) => (
                        <button
                          key={`s-${s.id || idx}`}
                          onClick={() => {
                            setQuery(s.query);
                            performSearch(s.query);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/15 text-white/80 hover:text-white text-xs font-medium border border-white/10 transition-all active:scale-95"
                        >
                          <Search className="w-3 h-3 text-white/40" />
                          <span>{s.query}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recently Listened */}
                {recentHistory.listens.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50 mb-2 px-1">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Recently Listened</span>
                    </div>
                    <div className="space-y-1.5">
                      {recentHistory.listens.slice(0, 6).map((item, idx) => {
                        const mappedSong = {
                          url: `https://youtube.com/watch?v=${item.youtubeId}`,
                          title: item.title,
                          thumbnail: item.thumbnail || `https://img.youtube.com/vi/${item.youtubeId}/hqdefault.jpg`,
                          uploaderName: item.artist || 'SyncBeats',
                        };
                        const isAdded = addedSongs.has(mappedSong.url);

                        return (
                          <div
                            key={`l-${item.id || idx}`}
                            className="flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-transparent hover:bg-white/10 transition-all duration-200 group shrink-0"
                          >
                            <img
                              src={mappedSong.thumbnail}
                              loading="eager"
                              decoding="sync"
                              className="w-16 h-12 object-cover rounded-lg bg-black/50 shrink-0"
                            />
                            <div className="space-y-0.5 min-w-0 flex-1 pl-1">
                              <div className="text-white text-sm font-bold truncate">{item.title}</div>
                              <div className="text-white/50 text-[10px] uppercase tracking-widest truncate">{item.artist || 'SyncBeats'}</div>
                            </div>
                            <button
                              onClick={() => !isAdded && handlePlay(mappedSong)}
                              disabled={enqueuing === mappedSong.url || isAdded}
                              className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-full transition-all ${
                                isAdded ? "bg-green-500 text-white" : "bg-white/10 hover:bg-[#FF0000] text-white active:scale-90"
                              }`}
                            >
                              {enqueuing === mappedSong.url ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : isAdded ? (
                                <CheckCircle2 className="w-4 h-4" />
                              ) : (
                                <Plus className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : query && mode !== "spotify" ? <div className={cn('text-center', 'text-white/40', 'text-sm', 'mt-10')}>Press Enter to search</div> : null}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {playlistToDelete && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={cn('absolute', 'inset-0', 'z-50', 'flex', 'items-center', 'justify-center', 'bg-black/60', 'backdrop-blur-sm', 'p-4')}
            onClick={(e) => { e.stopPropagation(); if (!isDeletingPlaylist) setPlaylistToDelete(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className={cn('bg-[#1A1A1A]', 'border', 'border-white/10', 'rounded-2xl', 'p-6', 'max-w-sm', 'w-full', 'shadow-2xl', 'flex', 'flex-col', 'items-center', 'text-center', 'gap-4')}
            >
              <div className={cn('w-12', 'h-12', 'rounded-full', 'bg-red-500/20', 'flex', 'items-center', 'justify-center', 'text-red-400', 'mb-2')}>
                {isDeletingPlaylist ? <Loader2 className="w-6 h-6 animate-spin text-red-400" /> : <Trash2 className={cn('w-6', 'h-6')} />}
              </div>
              <h3 className={cn('text-white', 'font-bold', 'text-lg')}>
                {isDeletingPlaylist ? "Deleting Playlist..." : "Delete Playlist?"}
              </h3>
              <p className={cn('text-white/60', 'text-sm')}>
                {isDeletingPlaylist ? "Removing playlist catalog and cached tracks..." : "Are you sure you want to delete this playlist entirely? This action cannot be undone."}
              </p>

              <div className={cn('flex', 'items-center', 'gap-3', 'w-full', 'mt-2')}>
                <button
                  onClick={() => !isDeletingPlaylist && setPlaylistToDelete(null)}
                  disabled={isDeletingPlaylist}
                  className={cn('flex-1', 'py-2.5', 'rounded-xl', 'bg-white/10', 'hover:bg-white/15', 'text-white', 'font-medium', 'transition-colors', 'disabled:opacity-50', 'disabled:cursor-not-allowed')}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeletePlaylist}
                  disabled={isDeletingPlaylist}
                  className={cn('flex-1', 'py-2.5', 'rounded-xl', 'bg-red-500', 'hover:bg-red-600', 'text-white', 'font-medium', 'transition-colors', 'flex', 'items-center', 'justify-center', 'gap-2', 'disabled:opacity-75', 'disabled:cursor-not-allowed')}
                >
                  {isDeletingPlaylist ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Delete</span>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instant Play or Add to Queue Prompt Modal */}
      <PlayOrEnqueueModal
        isOpen={!!promptTrack}
        track={promptTrack}
        onPlayNow={() => {
          if (promptTrack) executeEnqueueAndPlay(promptTrack, true);
        }}
        onAddToQueue={() => {
          if (promptTrack) executeEnqueueAndPlay(promptTrack, false);
        }}
        onClose={() => setPromptTrack(null)}
      />
    </div>
  );
}
