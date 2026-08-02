import React, { useState } from 'react';
import { Search as SearchIcon, Music, Play, Plus, Loader2 } from 'lucide-react';
import { apiClient, TrackSearchResult } from '../services/apiClient';
import { playerEngine, PlayableTrack } from '../services/playerEngine';

export const SearchView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TrackSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);

    try {
      const res = await apiClient.searchTracks(query);
      setResults(res);
    } catch {
      // Demo mock fallback if offline
      setResults([
        {
          id: 'demo-1',
          title: 'Cyberpunk Neon Nights',
          artist: 'Synthwave Alliance',
          thumbnailUrl: '',
          duration: 210,
        },
        {
          id: 'demo-2',
          title: 'Lo-Fi Chill Beat',
          artist: 'Bedroom Beats',
          thumbnailUrl: '',
          duration: 180,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayTrack = (track: TrackSearchResult) => {
    const playable: PlayableTrack = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      artworkURL: track.thumbnailUrl,
      duration: track.duration,
    };
    playerEngine.playTrack(playable);
  };

  return (
    <div className="h-full w-full p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar select-none">
      <div>
        <h1 className="text-2xl font-bold text-white font-display tracking-tight flex items-center gap-2.5">
          <SearchIcon className="w-6 h-6 text-purple-400" />
          Search Tracks
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Search YouTube audio catalog and add streamable tracks to your sync session.
        </p>
      </div>

      <form onSubmit={handleSearch} className="relative w-full max-w-xl">
        <SearchIcon className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
        <input
          type="text"
          placeholder="Search songs, artists, or keywords..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-12 pr-28 py-3 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-purple-500/60 transition-colors shadow-lg"
        />
        <button
          type="submit"
          disabled={loading}
          className="absolute right-2 top-2 bottom-2 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Search</span>}
        </button>
      </form>

      {results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {results.map((track) => (
            <div
              key={track.id}
              onClick={() => handlePlayTrack(track)}
              className="glass-panel p-3.5 rounded-2xl flex items-center gap-3.5 cursor-pointer hover:border-purple-500/50 transition-all border border-white/10 group"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center overflow-hidden shrink-0 shadow-md">
                {track.thumbnailUrl ? (
                  <img src={track.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Music className="w-6 h-6 text-purple-400" />
                )}
              </div>

              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-semibold text-white truncate group-hover:text-purple-300 transition-colors">
                  {track.title}
                </span>
                <span className="text-xs text-slate-400 truncate">{track.artist}</span>
              </div>

              <button className="w-9 h-9 rounded-xl bg-purple-600/20 group-hover:bg-purple-600 flex items-center justify-center text-purple-300 group-hover:text-white transition-all">
                <Play className="w-4 h-4 fill-current ml-0.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
