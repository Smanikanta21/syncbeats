"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";

interface ImportedPlaylist {
  id: string;
  name: string;
  coverUrl: string | null;
  sourceType: string;
  tracks: { id: string; title: string; artist: string; thumbnail: string; youtubeId: string }[];
}

function SpotifyImportContent() {
  const { token, user } = useAuth();
  const router = useRouter();

  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState<{ total: number; matched: number; playlistId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportedPlaylist[]>([]);
  const [loadingImported, setLoadingImported] = useState(true);
  const [playingPlaylistId, setPlayingPlaylistId] = useState<string | null>(null);

  const handlePlayPlaylist = async (playlistId: string) => {
    if (!token) return;
    setPlayingPlaylistId(playlistId);
    try {
      // 1. Create a room
      const roomRes = await fetch(`${SERVER}/rooms`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!roomRes.ok) throw new Error("Failed to create room");
      const { roomId } = await roomRes.json();

      // 2. Enqueue the playlist
      const enqueueRes = await fetch(`${SERVER}/rooms/${roomId}/enqueue-playlist`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ playlistId }),
      });
      if (!enqueueRes.ok) throw new Error("Failed to enqueue playlist");

      // 3. Navigate to the room
      router.push(`/room/${roomId}`);
    } catch (e) {
      console.error("Failed to play playlist:", e);
      setPlayingPlaylistId(null);
    }
  };

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

    try {
      const r = await fetch(`${SERVER}/api/bridge/import`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playlistUrl,
          playlistName: playlistName.trim() || "Imported Spotify Playlist",
        }),
      });

      const data = await r.json();

      if (!r.ok) {
        throw new Error(data.error || data.details || "Failed to import playlist.");
      }

      setSuccess({
        total: data.totalTracks,
        matched: data.matchedTracks,
        playlistId: data.playlistId,
      });
      setPlaylistUrl("");
      setPlaylistName("");
      
      // Refresh the imported list
      await fetchImported();
    } catch (err: any) {
      console.error("[Spotify Bridge] Import error:", err);
      setError(err.message || "Something went wrong during import.");
    } finally {
      setImporting(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0e0e14]">
        <p className="text-white">Please log in to continue.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0e0e14] text-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur-xl bg-[#0e0e14]/80 border-b border-white/5 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold">Import from Spotify</h1>
          <p className="text-sm text-white/50">Paste a public playlist URL to bridge tracks to YouTube</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        
        {/* Already Imported Section (Top) */}
        {!loadingImported && imported.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Your Imported Playlists</h2>
              <button onClick={() => router.push('/hub')} className="text-sm text-green-400 hover:text-green-300 transition-colors">
                View in Hub →
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {imported.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer group" onClick={() => handlePlayPlaylist(p.id)}>
                  {p.coverUrl ? (
                    <div className="relative w-12 h-12 flex-shrink-0">
                      <img src={p.coverUrl} alt={p.name} className="w-12 h-12 rounded-xl object-cover" />
                      <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         {playingPlaylistId === p.id ? (
                           <svg className="animate-spin w-5 h-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                           </svg>
                         ) : (
                           <svg width="20" height="20" viewBox="0 0 24 24" fill="white" className="ml-1">
                             <path d="M5 3l14 9-14 9V3z"/>
                           </svg>
                         )}
                      </div>
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-white/10 flex-shrink-0 flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40">
                        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{p.name}</p>
                    <p className="text-xs text-white/40">{p.tracks.length} tracks</p>
                  </div>
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1DB954" strokeWidth="3">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1DB954" strokeWidth="3">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-green-400 mb-2">Import Successful!</h2>
            <p className="text-white/70">
              Matched {success.matched} out of {success.total} tracks to YouTube.
            </p>
            <button 
              onClick={() => handlePlayPlaylist(success.playlistId)}
              disabled={playingPlaylistId === success.playlistId}
              className="mt-6 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-100 flex items-center justify-center gap-2 mx-auto"
              style={{ background: "linear-gradient(135deg, #1DB954, #158a3e)", boxShadow: "0 4px 20px rgba(29,185,84,0.3)" }}
            >
              {playingPlaylistId === success.playlistId ? (
                <>
                   <svg className="animate-spin w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                   </svg>
                   Creating Room...
                </>
              ) : (
                <>
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                     <path d="M5 3l14 9-14 9V3z"/>
                   </svg>
                   Play Playlist Now
                </>
              )}
            </button>
          </div>
        )}

        {/* Input Form */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8 relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-green-500/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="flex items-center gap-4 mb-8 relative z-10">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1DB954, #158a3e)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.371-.721.49-1.101.241-3.021-1.858-6.832-2.278-11.322-1.237-.418.092-.851-.179-.942-.601-.09-.421.18-.85.6-.942 4.909-1.121 9.121-.632 12.511 1.43.38.249.5.731.254 1.109zm1.47-3.27c-.301.459-.939.6-1.399.301-3.459-2.127-8.73-2.74-12.81-1.5-.521.157-1.07-.14-1.23-.66-.156-.52.14-1.07.661-1.23 4.669-1.42 10.47-.731 14.419 1.71.461.3.601.94.359 1.379zm.12-3.39C15.241 8.57 8.851 8.37 5.141 9.49c-.62.18-1.27-.17-1.451-.79-.179-.619.17-1.27.791-1.449 4.279-1.291 11.39-1.041 15.88 1.66.54.329.711 1.03.381 1.57-.33.53-1.03.7-1.569.37z"/>
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-lg">Import New Playlist</h2>
              <p className="text-sm text-white/50">No login or premium required.</p>
            </div>
          </div>

          <form onSubmit={handleImport} className="space-y-6 relative z-10">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">Public Playlist URL</label>
              <input
                type="url"
                required
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
                placeholder="https://open.spotify.com/playlist/..."
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-green-500/50 transition-colors"
                disabled={importing}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">Playlist Name (Optional)</label>
              <input
                type="text"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                placeholder="My Awesome Playlist"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-green-500/50 transition-colors"
                disabled={importing}
              />
            </div>

            <button
              type="submit"
              disabled={importing || !playlistUrl}
              className="w-full py-4 rounded-xl font-semibold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
              style={{ background: "linear-gradient(135deg, #1DB954, #158a3e)", boxShadow: "0 8px 32px rgba(29,185,84,0.35)" }}
            >
              {importing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Bridging Tracks to YouTube...
                </>
              ) : (
                "Import Playlist"
              )}
            </button>
          </form>
        </div>
        
        <div className="text-center text-sm text-white/40">
          <p>Make sure the playlist is set to "Public" in Spotify.</p>
          <p>This uses a credential-free scraper, so large playlists may take a moment to bridge.</p>
        </div>
      </div>
    </div>
  );
}

export default function SpotifyImportPage() {
  return (
    <SpotifyImportContent />
  );
}
