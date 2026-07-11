"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useUpload } from "../../context/UploadContext";
import { roomsApi } from "../../lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Search, Upload, Loader2, CheckCircle2, AlertCircle, Plus } from "lucide-react";

interface SearchTabProps {
  roomId: string;
  initialMode: "youtube" | "spotify" | null;
  onBack: () => void;
  onResultsCountChange: (count: number) => void;
  isSearchOnly?: boolean;
  onSuccess?: () => void;
}

const SPRING = { type: "spring", stiffness: 350, damping: 30 } as any;

export function SearchTab({ roomId, initialMode, onBack, onResultsCountChange, isSearchOnly, onSuccess }: SearchTabProps) {
  const { token } = useAuth();
  const upload = useUpload();
  
  const [mode, setMode] = useState<"youtube" | "spotify" | null>(initialMode);
  const [query, setQuery] = useState("");
  
  // YouTube State
  const [ytResults, setYtResults] = useState<any[]>([]);
  const [ytSuggestions, setYtSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [enqueuing, setEnqueuing] = useState<string | null>(null);
  const [addedSongs, setAddedSongs] = useState<Set<string>>(new Set());
  const [downloadError, setDownloadError] = useState<string | null>(null);
  
  // Spotify State
  const [spResults, setSpResults] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [spError, setSpError] = useState<string | null>(null);
  
  // Upload State
  const [uploadQueue, setUploadQueue] = useState<{id: string, name: string, status: "pending" | "uploading" | "done" | "error"}[]>([]);
  
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Reset when mode changes
  useEffect(() => {
    setQuery("");
    setYtResults([]);
    setSpResults([]);
    setYtSuggestions([]);
    setShowSuggestions(false);
    setSelectedIndex(0);
    setDownloadError(null);
    setSpError(null);
  }, [mode]);

  useEffect(() => {
    if (!query.trim() || mode === "spotify") { 
      setYtSuggestions([]); 
      setSelectedIndex(0); 
      return; 
    }
    const timer = setTimeout(async () => {
      try { 
        const sugs = await roomsApi.suggestYoutube(query); 
        setYtSuggestions(sugs); 
        setSelectedIndex(0); 
      } catch (err) {}
    }, 300);
    return () => clearTimeout(timer);
  }, [query, mode]);

  useEffect(() => {
    if (isSearching) { onResultsCountChange(1); return; }
    const total = (showSuggestions && ytSuggestions.length > 0 ? ytSuggestions.length : ytResults.length) + spResults.length + uploadQueue.length;
    onResultsCountChange(total);
  }, [isSearching, showSuggestions, ytSuggestions.length, ytResults.length, spResults.length, uploadQueue.length, onResultsCountChange]);

  const performSearch = async (q: string) => {
    if (!q.trim()) return;
    setIsSearching(true); setShowSuggestions(false); setDownloadError(null); setSpError(null); setSelectedIndex(0);
    
    if (mode === "youtube") {
      try { const res = await roomsApi.searchYoutube(roomId, q); setYtResults(res); }
      catch (err) { console.error(err); } finally { setIsSearching(false); }
    } else if (mode === "spotify") {
      setIsSearching(false);
      handleSpotifyImport(q);
    } else {
      // Global Search
      try {
        const [ytRes, spRes] = await Promise.all([
          roomsApi.searchYoutube(roomId, q).catch(() => []),
          roomsApi.searchSpotifyPlaylists(q).catch(() => [])
        ]);
        setYtResults(ytRes);
        setSpResults(spRes);
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
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000"}/api/bridge/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ playlistUrl: url, playlistName: "Imported Playlist" }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.details || data.error || "Failed to import playlist.");
      setQuery("");
      onSuccess?.();
      onBack(); // close search on success
    } catch (err: any) {
      const errMsg = err.message || "Something went wrong during import.";
      if (errMsg.toLowerCase().includes("invalid spotify data structure") || errMsg.toLowerCase().includes("could not extract spotify playlist")) {
        setSpError("Private playlists cannot be imported. Make it public first.");
      } else {
        setSpError(errMsg);
      }
    } finally {
      setImporting(false);
    }
  };

  const handleSpotifyEnqueue = async (playlistId: string) => {
    if (!token || !roomId) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000"}/rooms/${roomId}/enqueue-playlist`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ playlistId }),
      });
      if (!res.ok) throw new Error("Failed to enqueue playlist");
      onSuccess?.();
    } catch (e) {
      console.error(e);
      setSpError("Failed to enqueue playlist.");
    }
  };

  const handlePlay = async (result: any) => {
    setEnqueuing(result.url); setDownloadError(null);
    try {
      const videoId = result.url.split("v=")[1]?.split("&")[0] || result.url.split("youtu.be/")[1]?.split("?")[0];
      await upload.downloadYoutubeToP2P(roomId, videoId, result.title);
      setAddedSongs(prev => new Set(prev).add(result.url));
      onSuccess?.();
    } catch (err: any) {
      setDownloadError(err.message?.includes("RapidAPI") || err.message?.includes("FATAL")
        ? "This track is age-restricted or blocked. Try another." : err.message || "Failed to load.");
    } finally { setEnqueuing(null); }
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
        handleSpotifyImport(query);
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

  const isCentered = !query.trim() && !isSearching && ytResults.length === 0 && spResults.length === 0 && uploadQueue.length === 0;
  const containerPadding = isSearchOnly ? "p-[2px]" : "px-5 sm:px-8 py-6";

  const getPlaceholder = () => {
    if (mode === "youtube") return "Search YouTube...";
    if (mode === "spotify") return "Paste Spotify Playlist URL...";
    return "Search YouTube & Spotify...";
  };

  return (
    <div className={`relative flex flex-col w-full max-h-[400px] ${containerPadding}`}>
      <motion.div layout transition={SPRING} className={`flex items-start gap-3 shrink-0 relative z-50 ${isSearchOnly ? "m-0 h-full" : "mb-4"}`}>
        {!isSearchOnly && (
          <button onClick={e => { e.stopPropagation(); onBack(); }} className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors shrink-0 mt-0.5">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <div className="flex-1 relative h-full">
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); if(mode !== "spotify") setShowSuggestions(true); }}
            onKeyDown={handleKeyDown}
            onClick={e => { e.stopPropagation(); if(mode !== "spotify") setShowSuggestions(true); }}
            onFocus={() => { if(mode !== "spotify") setShowSuggestions(true); }}
            onBlur={() => { /* don't hide immediately */ }}
            placeholder={getPlaceholder()}
            disabled={importing}
            className={`w-full h-full bg-white/10 border border-white/20 rounded-full pl-10 ${query ? "pr-4" : "pr-24"} text-white text-base md:text-sm placeholder-white/40 focus:outline-none focus:bg-white/20 transition-all ${!isSearchOnly ? "py-2.5" : ""}`}
            autoFocus
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
          
          <AnimatePresence>
            {!query && (
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                
                {/* YouTube Toggle */}
                <button onClick={e => { e.preventDefault(); setMode(mode === "youtube" ? null : "youtube"); }} 
                  className={`w-7 h-7 flex items-center justify-center rounded-full cursor-pointer transition-all ${mode === "youtube" ? "bg-white/20 shadow-sm" : "hover:bg-white/10 opacity-50 hover:opacity-100 grayscale hover:grayscale-0"}`} title={mode === "youtube" ? "Disable YouTube Mode" : "Search YouTube"}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF0000">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                </button>

                {/* Spotify Toggle */}
                <button onClick={e => { e.preventDefault(); setMode(mode === "spotify" ? null : "spotify"); }} 
                  className={`w-7 h-7 flex items-center justify-center rounded-full cursor-pointer transition-all ${mode === "spotify" ? "bg-white/20 shadow-sm" : "hover:bg-white/10 opacity-50 hover:opacity-100 grayscale hover:grayscale-0"}`} title={mode === "spotify" ? "Disable Spotify Mode" : "Import from Spotify"}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="#1DB954">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.371-.721.49-1.101.241-3.021-1.858-6.832-2.278-11.322-1.237-.418.092-.851-.179-.942-.601-.09-.421.18-.85.6-.942 4.909-1.121 9.121-.632 12.511 1.43.38.249.5.731.254 1.109zm1.47-3.27c-.301.459-.939.6-1.399.301-3.459-2.127-8.73-2.74-12.81-1.5-.521.157-1.07-.14-1.23-.66-.156-.52.14-1.07.661-1.23 4.669-1.42 10.47-.731 14.419 1.71.461.3.601.94.359 1.379zm.12-3.39C15.241 8.57 8.851 8.37 5.141 9.49c-.62.18-1.27-.17-1.451-.79-.179-.619.17-1.27.791-1.449 4.279-1.291 11.39-1.041 15.88 1.66.54.329.711 1.03.381 1.57-.33.53-1.03.7-1.569.37z"/>
                  </svg>
                </button>

                {/* Upload Button */}
                <label className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 cursor-pointer text-white/50 hover:text-white transition-colors" title="Upload Local File">
                  {upload.isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
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
          className="bg-red-500/20 border border-red-500/30 text-red-200 text-xs px-3 py-2 rounded-xl mb-3 shrink-0">
          {downloadError}
        </motion.div>
      )}
      
      {spError && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
          className="bg-red-500/20 border border-red-500/30 text-red-200 text-xs px-3 py-2 rounded-xl mb-3 shrink-0">
          {spError}
        </motion.div>
      )}

      {importing && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
          className="flex items-center justify-center gap-2 text-white/70 text-sm mb-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Importing Spotify Playlist...
        </motion.div>
      )}

      <AnimatePresence>
        {!isCentered && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 15 }}
            transition={{ ...SPRING, opacity: { duration: 0.2 } }}
            className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 space-y-2 -mx-2 px-2 flex flex-col pointer-events-auto"
            style={{ scrollSnapType: "y mandatory" }}
            onClick={e => e.stopPropagation()}>
            
            {isSearching ? (
              <div className="flex-1 flex items-center justify-center min-h-[37.5px] h-full">
                <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
              </div>
            ) : showSuggestions && ytSuggestions.length > 0 ? (
              ytSuggestions.map((s, idx) => (
                <div key={idx} onMouseDown={e => { e.preventDefault(); setQuery(s); performSearch(s); }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`px-4 py-3 text-sm rounded-xl cursor-pointer flex items-center gap-3 transition-colors shrink-0 ${selectedIndex === idx ? "bg-white/20 text-white" : "text-white/80 hover:text-white hover:bg-white/10"}`}
                  style={{ scrollSnapAlign: "start" }}>
                  <Search className="w-3.5 h-3.5 text-white/40" />{s}
                </div>
              ))
            ) : (ytResults.length > 0 || spResults.length > 0 || uploadQueue.length > 0) ? (
              <>
                {uploadQueue.map(uq => (
                  <div key={uq.id} className="flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-transparent shrink-0" style={{ scrollSnapAlign: "start" }}>
                    <div className="w-20 h-14 bg-white/10 rounded-lg flex items-center justify-center shrink-0">
                      <Upload className="w-6 h-6 text-white/50" />
                    </div>
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="text-white text-sm font-bold truncate">{uq.name}</div>
                      <div className="text-white/50 text-[10px] uppercase tracking-widest truncate">Local Upload</div>
                    </div>
                    <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-white/10 text-white">
                      {uq.status === "uploading" ? <Loader2 className="w-4 h-4 animate-spin" /> : uq.status === "done" ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : uq.status === "error" ? <AlertCircle className="w-5 h-5 text-red-500" /> : <Loader2 className="w-4 h-4 animate-spin opacity-50" />}
                    </div>
                  </div>
                ))}
                
                {/* Spotify Results */}
                {spResults.map((r, idx) => (
                  <div key={r.id} 
                    className="flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-transparent hover:bg-white/10 transition-all duration-300 group shrink-0"
                    style={{ scrollSnapAlign: "start" }}>
                    <img src={r.coverUrl || "/placeholder-playlist.png"} className="w-14 h-14 object-cover rounded-lg bg-black/50 shrink-0" />
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="text-white text-sm font-bold truncate flex items-center gap-2">
                        {r.name}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#1DB954" className="shrink-0"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.371-.721.49-1.101.241-3.021-1.858-6.832-2.278-11.322-1.237-.418.092-.851-.179-.942-.601-.09-.421.18-.85.6-.942 4.909-1.121 9.121-.632 12.511 1.43.38.249.5.731.254 1.109zm1.47-3.27c-.301.459-.939.6-1.399.301-3.459-2.127-8.73-2.74-12.81-1.5-.521.157-1.07-.14-1.23-.66-.156-.52.14-1.07.661-1.23 4.669-1.42 10.47-.731 14.419 1.71.461.3.601.94.359 1.379zm.12-3.39C15.241 8.57 8.851 8.37 5.141 9.49c-.62.18-1.27-.17-1.451-.79-.179-.619.17-1.27.791-1.449 4.279-1.291 11.39-1.041 15.88 1.66.54.329.711 1.03.381 1.57-.33.53-1.03.7-1.569.37z"/></svg>
                      </div>
                      <div className="text-white/50 text-[10px] uppercase tracking-widest truncate">{r.trackCount} Tracks • {r.owner}</div>
                    </div>
                    <button onClick={() => handleSpotifyEnqueue(r.id)}
                      className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-[#1DB954] text-white active:scale-90 transition-all">
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                ))}

                {/* YouTube Results */}
                {ytResults.map((r, idx) => {
                  const isAdded = addedSongs.has(r.url);
                  return (
                    <div key={r.url} 
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center gap-3 p-2 rounded-xl transition-all duration-300 group shrink-0 ${isAdded ? "bg-green-500/20 border border-green-500/30" : selectedIndex === idx ? "bg-white/15 border border-white/20" : "bg-white/5 border border-transparent hover:bg-white/10"}`}
                      style={{ scrollSnapAlign: "start" }}>
                      <div className="relative">
                        <img src={r.thumbnail} className="w-20 h-14 object-cover rounded-lg bg-black/50 shrink-0" />
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#FF0000" className="absolute -bottom-1 -right-1 drop-shadow-md"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                      </div>
                      <div className="space-y-1 min-w-0 flex-1 pl-1">
                        <div className="text-white text-sm font-bold truncate">{r.title}</div>
                        <div className="text-white/50 text-[10px] uppercase tracking-widest truncate">{r.uploaderName}</div>
                      </div>
                      <button onClick={() => !isAdded && handlePlay(r)} disabled={enqueuing === r.url || isAdded}
                        className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-full transition-all ${isAdded ? "bg-green-500 text-white" : "bg-white/10 hover:bg-[#FF0000] text-white active:scale-90"}`}>
                        {enqueuing === r.url ? <Loader2 className="w-4 h-4 animate-spin" />
                          : isAdded ? <CheckCircle2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                      </button>
                    </div>
                  );
                })}
              </>
            ) : query && mode !== "spotify" ? <div className="text-center text-white/40 text-sm mt-10">Press Enter to search</div> : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
