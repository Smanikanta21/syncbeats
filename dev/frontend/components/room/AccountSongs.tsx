"use client";

import { useEffect, useRef, useState } from "react";
import { useAccountRevision } from "../../lib/accountUpdates";
import { Music2, Play, Loader2 } from "lucide-react";
import { accountLibraryApi, type AccountCatalogSong, type AccountPlaylistTrack } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { HighlightedText } from "../HighlightedText";
import { SyncBeatsLoader } from "../SyncBeatsLoader";
import { cleanTitle } from "../SortableTrackItem";

export interface AccountSong extends AccountPlaylistTrack { playlistNames: string[] }
type LibraryPage = { userId: string; query: string; songs: AccountCatalogSong[]; nextCursor: string | null; total: number };
const sourceName = (source: string) => source === "APPLE_MUSIC" ? "Apple Music" : source.startsWith("SPOTIFY") ? "Spotify" : "Saved in SyncBeats";

export function AccountSongs({ query, onChooseSong }: { query: string; onChooseSong: (song: AccountSong) => void }) {
  const { user } = useAuth();
  const [library, setLibrary] = useState<LibraryPage | null>(null);
  const [error, setError] = useState<{ userId: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [resolving, setResolving] = useState<Set<string>>(new Set());
  const revision = useAccountRevision("library");
  const scope = useRef(0);
  const activeUser = useRef(user?.id);
  const mounted = useRef(true);
  const search = query.trim();
  useEffect(() => {
    activeUser.current = user?.id; mounted.current = true;
    return () => { mounted.current = false; };
  }, [user?.id]);

  useEffect(() => {
    const requestScope = ++scope.current;
    let cancelled = false;
    if (!user?.id) return;
    const timer = setTimeout(() => {
      accountLibraryApi.getSongs(search).then(page => {
        if (cancelled || requestScope !== scope.current) return;
        setLibrary({ userId: user.id, query: search, ...page }); setError(null); setLoadingMore(false);
      }).catch(cause => {
        if (!cancelled && requestScope === scope.current) setError({ userId: user.id, message: cause instanceof Error ? cause.message : "Couldn't load your songs." });
      });
    }, search ? 300 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [user?.id, search, attempt, revision]);

  const current = library && library.userId === user?.id && library.query === search ? library : null;
  const currentError = error && error.userId === user?.id ? error.message : null;
  async function loadMore() {
    if (!current?.nextCursor || loadingMore) return;
    const requestScope = scope.current;
    setLoadingMore(true);
    try {
      const page = await accountLibraryApi.getSongs(search, current.nextCursor);
      if (requestScope !== scope.current) return;
      setLibrary(previous => {
        if (!previous || previous.userId !== current.userId || previous.query !== search) return previous;
        const songs = new Map(previous.songs.map(song => [song.id, song]));
        page.songs.forEach(song => songs.set(song.id, song));
        return { ...previous, songs: [...songs.values()], nextCursor: page.nextCursor, total: page.total };
      });
    } catch (cause) {
      if (requestScope === scope.current) setError({ userId: current.userId, message: cause instanceof Error ? cause.message : "Couldn't load more songs." });
    } finally { if (requestScope === scope.current) setLoadingMore(false); }
  }
  async function choose(song: AccountCatalogSong) {
    if (resolving.has(song.id) || !user?.id) return;
    const owner = user.id;
    setResolving(previous => new Set(previous).add(song.id));
    try {
      const version = song.youtubeID ? { youtubeId: song.youtubeID, thumbnail: song.thumbnail ?? undefined } : await accountLibraryApi.resolveSong(song);
      if (!mounted.current || activeUser.current !== owner) return;
      onChooseSong({ id: song.id, title: song.title, artist: song.artist, youtubeId: version.youtubeId,
        thumbnail: song.artwork || version.thumbnail || song.thumbnail, playlistNames: [sourceName(song.source)] });
    } catch (cause) {
      if (mounted.current && activeUser.current === owner) setError({ userId: owner, message: cause instanceof Error ? cause.message : "Couldn't find a playable version." });
    } finally { if (mounted.current) setResolving(previous => { const next = new Set(previous); next.delete(song.id); return next; }); }
  }

  return <div className="flex flex-col gap-1" aria-label="All songs">
    <div className="flex items-center justify-between gap-3 px-1 pb-2">
      <p className="text-xs text-foreground/50">{current ? `${current.total} saved songs` : "Your songs"}</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)} className="text-xs text-foreground/60 hover:text-foreground">Refresh</button>
    </div>
    {!current && !currentError && <SyncBeatsLoader title="Loading your songs" />}
    {currentError && <div className="p-3 text-xs text-red-300" role="alert">{currentError} <button type="button" className="underline ml-2" onClick={() => setAttempt(value => value + 1)}>Retry</button></div>}
    {current?.songs.length === 0 && <p className="px-1 text-xs text-foreground/45">{search ? "No songs match this search." : "Save a song or import Apple Music to build your collection."}</p>}
    {current?.songs.map(song => {
      const busy = resolving.has(song.id);
      const artwork = song.artwork || song.thumbnail;
      return <button key={song.id} type="button" disabled={busy} aria-label={song.youtubeID ? `Choose ${cleanTitle(song.title)}` : `Find playable version of ${cleanTitle(song.title)}`}
        onClick={() => void choose(song)} className="w-full flex gap-3 items-center text-left p-2 rounded-xl hover:bg-foreground/5 cursor-pointer disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-foreground">
        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-foreground/5 flex items-center justify-center">
          {artwork ? <img src={artwork} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <Music2 size={17} className="text-foreground/40" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate"><HighlightedText text={cleanTitle(song.title)} query={query} /></p>
          {song.artist && <p className="text-xs text-foreground/55 truncate"><HighlightedText text={song.artist} query={query} /></p>}
          <p className="text-[11px] text-foreground/40 truncate">{sourceName(song.source)}{!song.youtubeID && " · find playable version"}</p>
        </div>
        {busy ? <Loader2 size={15} className="animate-spin shrink-0 text-foreground/50" /> : <Play size={15} className="shrink-0 text-foreground/50" />}
      </button>;
    })}
    {current?.nextCursor && <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="text-xs p-3 text-foreground/60 hover:text-foreground disabled:opacity-50">{loadingMore ? "Loading…" : "Load more songs"}</button>}
  </div>;
}
