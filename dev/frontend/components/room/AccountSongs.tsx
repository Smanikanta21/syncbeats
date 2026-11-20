"use client";

import { useEffect, useMemo, useState } from "react";
import { Music2, Play } from "lucide-react";
import { accountLibraryApi, type AccountPlaylist, type AccountPlaylistTrack } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { HighlightedText } from "../HighlightedText";
import { SyncBeatsLoader } from "../SyncBeatsLoader";
import { cleanTitle } from "../SortableTrackItem";

const EMPTY_PLAYLISTS: AccountPlaylist[] = [];

export interface AccountSong extends AccountPlaylistTrack { playlistNames: string[] }

export function AccountSongs({ query, onChooseSong }: { query: string; onChooseSong: (song: AccountSong) => void }) {
  const { user } = useAuth();
  const [library, setLibrary] = useState<{ userId: string; playlists: AccountPlaylist[] } | null>(null);
  const [error, setError] = useState<{ userId: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;
    accountLibraryApi.getPlaylists().then(({ playlists }) => {
      if (!cancelled) setLibrary({ userId: user.id, playlists });
    }).catch(cause => {
      if (!cancelled) setError({ userId: user.id, message: cause instanceof Error ? cause.message : "Couldn't load your songs." });
    });
    return () => { cancelled = true; };
  }, [user?.id, attempt]);

  const playlists = library?.userId === user?.id ? library?.playlists || EMPTY_PLAYLISTS : EMPTY_PLAYLISTS;
  const currentError = error && error.userId === user?.id ? error.message : "";
  const loading = library?.userId !== user?.id && !currentError;
  const songs = useMemo(() => {
    const unique = new Map<string, AccountSong>();
    for (const playlist of playlists) {
      for (const track of playlist.tracks) {
        const key = track.youtubeId || track.id;
        const existing = unique.get(key);
        if (existing) {
          if (!existing.playlistNames.includes(playlist.name)) existing.playlistNames.push(playlist.name);
        } else unique.set(key, { ...track, playlistNames: [playlist.name] });
      }
    }
    return [...unique.values()];
  }, [playlists]);
  const needle = query.trim().toLocaleLowerCase();
  const matchingSongs = songs.filter(song => !needle || [cleanTitle(song.title), song.artist || ""].some(text => text.toLocaleLowerCase().includes(needle)));

  if (!user) return <p className="p-3 text-sm text-foreground/55">Sign in to see songs saved in your account.</p>;
  if (loading) return <div className="flex min-h-32 items-center justify-center"><SyncBeatsLoader compact title="Loading your songs" /></div>;
  if (currentError) return <div className="p-3 text-sm"><p role="alert" className="text-foreground/65">{currentError}</p><button type="button" onClick={() => { setError(null); setLibrary(null); setAttempt(value => value + 1); }} className="mt-3 underline cursor-pointer">Try again</button></div>;

  return <div className="space-y-1">
    <p role="status" className="px-2 pb-3 text-xs text-foreground/50">{needle ? `${matchingSongs.length} matching songs` : `${songs.length} songs across ${playlists.length} playlists in your account`}</p>
    {matchingSongs.length === 0 ? <p className="px-2 py-6 text-sm text-foreground/55">{needle ? "No saved songs match your search." : "No saved songs yet. Save or import a playlist to fill your library."}</p> : matchingSongs.map(song => (
      <button key={song.youtubeId || song.id} type="button" disabled={!song.youtubeId}
        aria-label={song.youtubeId ? `Choose ${cleanTitle(song.title)}` : `${cleanTitle(song.title)} — audio unavailable`}
        onClick={() => onChooseSong(song)} className="w-full flex gap-3 items-center text-left p-2 rounded-xl hover:bg-foreground/5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-foreground">
        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-foreground/5 flex items-center justify-center">
          {song.thumbnail ? <img src={song.thumbnail} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <Music2 size={17} className="text-foreground/40" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate"><HighlightedText text={cleanTitle(song.title)} query={query} /></p>
          {song.artist && <p className="text-xs text-foreground/55 truncate"><HighlightedText text={song.artist} query={query} /></p>}
          <p className="text-[11px] text-foreground/40 truncate">{song.playlistNames.join(" · ")}</p>
        </div>
        <Play size={15} className="shrink-0 text-foreground/50" />
      </button>
    ))}
  </div>;
}
