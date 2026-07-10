"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useAuth } from "../../context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";

interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  coverUrl: string | null;
  trackCount: number;
  owner: string;
}

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
  const searchParams = useSearchParams();

  const [connected, setConnected] = useState(false);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [imported, setImported] = useState<ImportedPlaylist[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`${SERVER}/spotify/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      setConnected(data.connected);
      if (data.connected) {
        fetchPlaylists();
        fetchImported();
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchPlaylists = async () => {
    if (!token) return;
    const r = await fetch(`${SERVER}/spotify/playlists`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      const data = await r.json();
      setPlaylists(data.playlists || []);
    }
  };

  const fetchImported = async () => {
    if (!token) return;
    const r = await fetch(`${SERVER}/spotify/my-playlists`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      const data = await r.json();
      setImported(data.playlists?.filter((p: any) => p.sourceType === "SPOTIFY") || []);
    }
  };

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    const spotifyConnected = searchParams.get("spotify_connected");
    const spotifyError = searchParams.get("spotify_error");
    if (spotifyConnected === "true") {
      setConnected(true);
      fetchPlaylists();
      fetchImported();
    }
    if (spotifyError) {
      setError(`Spotify connection failed: ${spotifyError}`);
    }
  }, [searchParams]);

  const connectSpotify = () => {
    if (!token) return;
    window.location.href = `${SERVER}/spotify/auth?token=${encodeURIComponent(token)}`;
  };

  const disconnectSpotify = async () => {
    if (!token) return;
    await fetch(`${SERVER}/spotify/disconnect`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setConnected(false);
    setPlaylists([]);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(playlists.map((p) => p.id)));
  const clearAll = () => setSelected(new Set());

  const importSelected = async () => {
    if (selected.size === 0 || !token) return;
    setImporting(true);
    setError(null);

    const toImport = playlists.filter((p) => selected.has(p.id));
    for (let i = 0; i < toImport.length; i++) {
      const playlist = toImport[i];
      setImportProgress({ current: i + 1, total: toImport.length, name: playlist.name });
      try {
        const r = await fetch(`${SERVER}/spotify/import`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            playlistId:   playlist.id,
            playlistName: playlist.name,
            coverUrl:     playlist.coverUrl,
          }),
        });
        if (!r.ok) {
          const err = await r.json();
          console.error(`Failed to import ${playlist.name}:`, err);
        }
      } catch (e) {
        console.error("Import error:", e);
      }
    }

    setImporting(false);
    setImportProgress(null);
    setSelected(new Set());
    await fetchImported();
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
          <p className="text-sm text-white/50">Connect your Spotify and import playlists</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-300 text-sm">{error}</div>
        )}

        {/* Connection Card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1DB954, #158a3e)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.371-.721.49-1.101.241-3.021-1.858-6.832-2.278-11.322-1.237-.418.092-.851-.179-.942-.601-.09-.421.18-.85.6-.942 4.909-1.121 9.121-.632 12.511 1.43.38.249.5.731.254 1.109zm1.47-3.27c-.301.459-.939.6-1.399.301-3.459-2.127-8.73-2.74-12.81-1.5-.521.157-1.07-.14-1.23-.66-.156-.52.14-1.07.661-1.23 4.669-1.42 10.47-.731 14.419 1.71.461.3.601.94.359 1.379zm.12-3.39C15.241 8.57 8.851 8.37 5.141 9.49c-.62.18-1.27-.17-1.451-.79-.179-.619.17-1.27.791-1.449 4.279-1.291 11.39-1.041 15.88 1.66.54.329.711 1.03.381 1.57-.33.53-1.03.7-1.569.37z"/>
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-lg">Spotify</h2>
              <p className={`text-sm ${connected ? "text-green-400" : "text-white/50"}`}>
                {connected ? "✓ Connected" : "Not connected"}
              </p>
            </div>
          </div>
          {connected ? (
            <button
              onClick={disconnectSpotify}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-white/10 hover:bg-red-500/20 hover:text-red-300 border border-white/10 hover:border-red-500/30 transition-all"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={connectSpotify}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-100"
              style={{ background: "linear-gradient(135deg, #1DB954, #158a3e)", boxShadow: "0 4px 20px rgba(29,185,84,0.3)" }}
            >
              Connect Spotify
            </button>
          )}
        </div>

        {/* Playlists to Import */}
        {connected && playlists.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Your Spotify Playlists</h2>
                <p className="text-sm text-white/50">{playlists.length} playlists · {selected.size} selected</p>
              </div>
              <div className="flex gap-2">
                <button onClick={selectAll} className="px-3 py-1.5 rounded-lg text-xs bg-white/10 hover:bg-white/15 transition-colors">Select All</button>
                <button onClick={clearAll} className="px-3 py-1.5 rounded-lg text-xs bg-white/10 hover:bg-white/15 transition-colors">Clear</button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {playlists.map((p) => {
                const isSelected = selected.has(p.id);
                const alreadyImported = imported.some((imp) => imp.name === p.name);
                return (
                  <button
                    key={p.id}
                    onClick={() => !alreadyImported && toggleSelect(p.id)}
                    disabled={alreadyImported}
                    className={`relative rounded-2xl overflow-hidden text-left transition-all border ${
                      alreadyImported
                        ? "opacity-40 cursor-not-allowed border-white/5"
                        : isSelected
                        ? "border-green-500/60 scale-[1.02]"
                        : "border-white/10 hover:border-white/20 hover:scale-[1.01]"
                    }`}
                    style={{ background: isSelected ? "rgba(29,185,84,0.1)" : "rgba(255,255,255,0.04)" }}
                  >
                    <div className="relative aspect-square">
                      {p.coverUrl ? (
                        <img src={p.coverUrl} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/30">
                            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                          </svg>
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                              <path d="M20 6L9 17l-5-5"/>
                            </svg>
                          </div>
                        </div>
                      )}
                      {alreadyImported && (
                        <div className="absolute top-2 right-2 bg-black/60 rounded-full px-2 py-0.5 text-[10px] text-green-400 font-medium">Imported</div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-medium text-sm truncate">{p.name}</p>
                      <p className="text-xs text-white/40 truncate">{p.trackCount} tracks · {p.owner}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Import Button */}
            {selected.size > 0 && (
              <div className="sticky bottom-6">
                <button
                  onClick={importSelected}
                  disabled={importing}
                  className="w-full py-4 rounded-2xl font-semibold text-base transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg, #1DB954, #158a3e)", boxShadow: "0 8px 32px rgba(29,185,84,0.35)" }}
                >
                  {importing && importProgress ? (
                    <span>Importing "{importProgress.name}" ({importProgress.current}/{importProgress.total})...</span>
                  ) : (
                    <span>Import {selected.size} Playlist{selected.size !== 1 ? "s" : ""} →</span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Already Imported */}
        {imported.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Imported Playlists</h2>
            <div className="space-y-3">
              {imported.map((p) => (
                <div key={p.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                  {p.coverUrl ? (
                    <img src={p.coverUrl} alt={p.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-white/10 flex-shrink-0 flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40">
                        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{p.name}</p>
                    <p className="text-sm text-white/40">{p.tracks.length} tracks matched on YouTube</p>
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

        {/* Empty state */}
        {connected && !loading && playlists.length === 0 && (
          <div className="text-center py-16 text-white/40">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-4 opacity-30">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
            <p className="text-lg font-medium">No playlists found</p>
            <p className="text-sm mt-1">Make sure your Spotify account has saved playlists</p>
          </div>
        )}

        {!connected && !loading && (
          <div className="text-center py-16 text-white/40">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center opacity-30" style={{ background: "linear-gradient(135deg, #1DB954, #158a3e)" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.371-.721.49-1.101.241-3.021-1.858-6.832-2.278-11.322-1.237-.418.092-.851-.179-.942-.601-.09-.421.18-.85.6-.942 4.909-1.121 9.121-.632 12.511 1.43.38.249.5.731.254 1.109zm1.47-3.27c-.301.459-.939.6-1.399.301-3.459-2.127-8.73-2.74-12.81-1.5-.521.157-1.07-.14-1.23-.66-.156-.52.14-1.07.661-1.23 4.669-1.42 10.47-.731 14.419 1.71.461.3.601.94.359 1.379zm.12-3.39C15.241 8.57 8.851 8.37 5.141 9.49c-.62.18-1.27-.17-1.451-.79-.179-.619.17-1.27.791-1.449 4.279-1.291 11.39-1.041 15.88 1.66.54.329.711 1.03.381 1.57-.33.53-1.03.7-1.569.37z"/>
              </svg>
            </div>
            <p className="text-lg font-medium">Connect Spotify to import your playlists</p>
            <p className="text-sm mt-1">We'll match each track to YouTube and add it to your SyncBeats library</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SpotifyImportPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-[#0e0e14]">
        <p className="text-white">Loading...</p>
      </div>
    }>
      <SpotifyImportContent />
    </Suspense>
  );
}
