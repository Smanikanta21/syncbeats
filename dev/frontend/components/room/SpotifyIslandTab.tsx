"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { useUpload } from "../../context/UploadContext";
import { Trash2, Disc, Play, Upload, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { ConfirmModal } from "../ConfirmModal";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";

interface ImportedPlaylist {
  id: string;
  name: string;
  coverUrl: string | null;
  sourceType: string;
  tracks: { id: string; title: string; artist: string; thumbnail: string; youtubeId: string }[];
}

interface SpotifyIslandTabProps {
  roomId?: string;
  onBack?: () => void;
  onClose?: () => void;
  onPrivateError?: (isError: boolean) => void;
  onOpenYouTube?: () => void;
}

export function SpotifyIslandTab({
  roomId,
  onBack,
  onClose,
  onPrivateError,
  onOpenYouTube,
}: SpotifyIslandTabProps) {
  const { token } = useAuth();
  const upload = useUpload();
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState<{ total: number; matched: number; playlistId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPrivateError, setIsPrivateError] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportedPlaylist[]>([]);
  const [loadingImported, setLoadingImported] = useState(true);
  const [playingPlaylistId, setPlayingPlaylistId] = useState<string | null>(null);

  const fetchImported = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`${SERVER}/spotify/my-playlists`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const data = await r.json();
        const spotifyPlaylists = data.playlists?.filter(
          (p: any) => p.sourceType === "SPOTIFY" || p.sourceType === "SPOTIFY_BRIDGE"
        ) || [];
        setImported(spotifyPlaylists);
      }
    } catch (e) {
      console.error("Failed to fetch imported playlists:", e);
    } finally {
      setLoadingImported(false);
    }
  }, [token]);

  useEffect(() => {
    fetchImported();
  }, [fetchImported]);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!playlistUrl.includes("spotify.com/playlist/")) {
      setError("Please enter a valid Spotify public playlist URL.");
      return;
    }

    setImporting(true);
    setError(null);
    setSuccess(null);
    setIsPrivateError(false);
    setErrorDetails(null);

    try {
      const r = await fetch(`${SERVER}/api/bridge/import`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playlistUrl,
          playlistName: "Imported Spotify Playlist",
        }),
      });

      const data = await r.json();

      if (!r.ok) {
        throw new Error(data.details || data.error || "Failed to import playlist.");
      }

      setSuccess({
        total: data.totalTracks,
        matched: data.matchedTracks,
        playlistId: data.playlistId,
      });
      setPlaylistUrl("");
      
      await fetchImported();
    } catch (err: any) {
      console.error("[Spotify Bridge] Import error:", err);
      const errMsg = err.message || "Something went wrong during import.";
      if (errMsg.toLowerCase().includes("invalid spotify data structure") || errMsg.toLowerCase().includes("could not extract spotify playlist")) {
        setIsPrivateError(true);
        if (onPrivateError) onPrivateError(true);
      } else {
        setError(errMsg);
      }
    } finally {
      setImporting(false);
    }
  };

  const handlePlayPlaylist = async (playlistId: string) => {
    if (!token || !roomId) return;
    setPlayingPlaylistId(playlistId);
    try {
      const enqueueRes = await fetch(`${SERVER}/rooms/${roomId}/enqueue-playlist`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ playlistId }),
      });
      if (!enqueueRes.ok) throw new Error("Failed to enqueue playlist");

      if (onClose) onClose();
    } catch (e) {
      console.error("Failed to play playlist:", e);
      setPlayingPlaylistId(null);
    }
  };

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const handleDeletePlaylist = async (playlist: ImportedPlaylist) => {
    if (!token) return;

    const performDelete = async () => {
      try {
        const r = await fetch(`${SERVER}/spotify/my-playlists/${playlist.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` }
        });

        if (r.ok) {
          setImported(prev => prev.filter(p => p.id !== playlist.id));
          window.dispatchEvent(new CustomEvent("toast", { detail: { message: "Playlist deleted successfully", type: "success" } }));
        } else {
          throw new Error("Failed to delete");
        }
      } catch (e) {
        console.error("Delete error", e);
        window.dispatchEvent(new CustomEvent("toast", { detail: { message: "Failed to delete playlist.", type: "error" } }));
      }
    };

    if (playlist.tracks.length > 0) {
      setConfirmConfig({
        isOpen: true,
        title: "Delete Playlist",
        message: `This playlist has ${playlist.tracks.length} songs. Are you sure you want to delete it?`,
        onConfirm: performDelete,
      });
    } else {
      await performDelete();
    }
  };

  return (
    <div className="flex flex-col h-auto w-full p-4 relative">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 mb-4">
        <div className="flex items-center gap-2 text-foreground">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1 rounded-lg hover:bg-foreground/10 transition-colors mr-1"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
          )}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#1DB954">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.371-.721.49-1.101.241-3.021-1.858-6.832-2.278-11.322-1.237-.418.092-.851-.179-.942-.601-.09-.421.18-.85.6-.942 4.909-1.121 9.121-.632 12.511 1.43.38.249.5.731.254 1.109zm1.47-3.27c-.301.459-.939.6-1.399.301-3.459-2.127-8.73-2.74-12.81-1.5-.521.157-1.07-.14-1.23-.66-.156-.52.14-1.07.661-1.23 4.669-1.42 10.47-.731 14.419 1.71.461.3.601.94.359 1.379zm.12-3.39C15.241 8.57 8.851 8.37 5.141 9.49c-.62.18-1.27-.17-1.451-.79-.179-.619.17-1.27.791-1.449 4.279-1.291 11.39-1.041 15.88 1.66.54.329.711 1.03.381 1.57-.33.53-1.03.7-1.569.37z"/>
          </svg>
          <span className="font-semibold text-lg text-foreground">Import Spotify</span>
        </div>
      </div>

      <div className="flex flex-col pr-2 space-y-4">
        {/* Import Form */}
        <form onSubmit={handleImport} className="flex flex-col gap-2 relative">
          <input
            type="url"
            required
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder="Paste Spotify Public Playlist URL..."
            className="w-full px-4 py-3 rounded-xl bg-foreground/5 border border-foreground/10 text-foreground text-sm focus:outline-none focus:border-[#1DB954]/50 transition-colors pr-24"
            disabled={importing}
          />
          <div className="absolute right-2 top-[22px] -translate-y-1/2 flex items-center gap-0.5">
            {onOpenYouTube && (
              <button type="button" onClick={(e) => { e.preventDefault(); onOpenYouTube(); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-foreground/10 cursor-pointer transition-colors" title="Search YouTube">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF0000">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </button>
            )}
            <label className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-foreground/10 cursor-pointer text-foreground/50 hover:text-foreground transition-colors" title="Upload Local File">
              {upload.isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <input type="file" accept="audio/*" multiple className="hidden"
                onChange={async e => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0 || !roomId) return;
                  for (let i = 0; i < files.length; i++) {
                    try { await upload.uploadFile(files[i], roomId); } catch(e) { console.error(e); }
                  }
                  e.target.value = '';
                }} 
              />
            </label>
          </div>
          <AnimatePresence>
            {playlistUrl && !importing && (
              <motion.button
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 40 }}
                exit={{ opacity: 0, height: 0 }}
                type="submit"
                className="w-full rounded-xl bg-[#1DB954] text-white font-bold text-sm flex items-center justify-center gap-2"
              >
                Import Playlist
              </motion.button>
            )}
          </AnimatePresence>

          {importing && (
             <div className="w-full h-10 rounded-xl bg-[#1DB954]/50 text-white font-bold text-sm flex items-center justify-center gap-2 mt-2">
                 <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
                 Importing...
             </div>
          )}
        </form>

        {isPrivateError && (
          <div className="w-full p-4 rounded-xl bg-foreground/5 border border-foreground/10 flex flex-col items-center gap-3 mt-2 text-center">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-sm font-bold text-foreground">Private Playlist Detected</p>
            <p className="text-xs text-foreground/70">
              Private playlists cannot be imported right now as it is not a free service. You must convert it to a public playlist first.
            </p>
            
            <div className="w-full border-t border-foreground/10 my-1 pt-3 pb-1 flex flex-col">
              <p className="text-xs font-semibold text-foreground mb-2 text-left">How to make your playlist public:</p>
              
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1.5 items-start w-full">
                  <div className="text-[10px] bg-foreground/10 text-foreground/80 px-2 py-0.5 rounded-full font-semibold">Instructions</div>
                  <p className="text-xs text-foreground/80 text-left pl-1">Tap the three dots on your playlist and tap "Make Public".</p>
                  <div className="w-full aspect-[9/16] max-h-[280px] bg-foreground/[0.03] rounded-lg border border-foreground/10 flex items-center justify-center overflow-hidden p-2 mx-auto">
                    <video src="/make-public.mov" className="object-contain w-full h-full rounded-md" autoPlay loop muted playsInline />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-red-400 text-xs text-center p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-center flex flex-col gap-2">
            <p className="text-[#1DB954] text-xs font-bold">Import Successful!</p>
            <button 
              onClick={() => handlePlayPlaylist(success.playlistId)}
              disabled={playingPlaylistId === success.playlistId}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-100 bg-[#1DB954] text-white flex items-center justify-center mx-auto"
            >
               {playingPlaylistId === success.playlistId ? "Adding to Queue..." : "Play Playlist Now"}
            </button>
          </div>
        )}

        {/* Existing Playlists */}
        {!loadingImported && imported.length > 0 && (
          <div className="space-y-2 pb-4">
            <h3 className="text-xs font-bold text-foreground/50 uppercase tracking-widest pl-1 mt-4 mb-2">Imported</h3>
            <div className="grid grid-cols-1 gap-2">
              {imported.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl bg-foreground/[0.03] border border-foreground/[0.05] hover:bg-foreground/[0.06] transition-colors group">
                  <div className="relative w-12 h-12 flex-shrink-0 cursor-pointer" onClick={() => handlePlayPlaylist(p.id)}>
                    {p.coverUrl ? (
                      <img src={p.coverUrl} alt={p.name} loading="eager" decoding="sync" className="w-12 h-12 rounded-lg object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-foreground/10 flex items-center justify-center">
                        <Disc className="w-5 h-5 text-foreground/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-background/40 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {playingPlaylistId === p.id ? (
                        <svg className="animate-spin w-5 h-5 text-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <Play className="w-5 h-5 text-foreground fill-foreground" />
                      )}
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handlePlayPlaylist(p.id)}>
                    <p className="font-semibold text-sm text-foreground truncate">{p.name}</p>
                    <p className="text-xs text-foreground/50">{p.tracks.length} tracks</p>
                  </div>

                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(p); }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-red-500/50 hover:bg-red-500/10 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0 mr-1"
                    title="Delete Playlist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
