import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Empty, Field, Heading, Label, Notice, Screen } from '../../components/ui';
import { RoomStatus } from '../../components/RoomStatus';
import { SongRow } from '../../components/SongRow';
import { useSession } from '../../session/SessionProvider';
import { useRoom } from '../../room/RoomProvider';
import { useTheme } from '../../theme/ThemeProvider';
import type { CatalogSong } from '../../lib/types';
import { trackKey } from '../../lib/media';

export default function Library() {
  const { api } = useSession();
  const room = useRoom();
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [songs, setSongs] = useState<CatalogSong[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const generation = useRef(0);
  const searchQuery = useRef('');
  const load = useCallback(async (query = '', cursor: string | null = null) => {
    if (!api) return;
    const version = ++generation.current;
    searchQuery.current = query; setLoading(true); setError(null);
    try {
      const page = await api.catalog(query, cursor);
      if (version !== generation.current) return;
      setSongs(previous => cursor ? [...previous, ...page.songs.filter(song => !previous.some(old => old.id === song.id))] : page.songs);
      setCursor(page.nextCursor); setTotal(page.total);
    } catch (error) { if (version === generation.current) setError((error as Error).message); }
    finally { if (version === generation.current) setLoading(false); }
  }, [api]);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Load the remote account catalog on entry.
  useEffect(() => { void load(); return invalidate; }, [load, invalidate]);
  async function add(song: CatalogSong, playNow: boolean) {
    if (!api || busy) return;
    setBusy(song.id); setError(null);
    const roomId = room.roomId;
    try {
      const resolved = song.youtubeID ? { youtubeId: song.youtubeID, thumbnail: undefined } : await api.resolve(song);
      if (roomId !== room.connection?.roomId) return;
      await room.enqueue({ url: `youtube:${resolved.youtubeId}`, title: song.title, uploaderName: song.artist,
        thumbnail: song.artwork || song.thumbnail || resolved.thumbnail || undefined, duration: song.duration || undefined, metadataSource: 'library' }, playNow);
    } catch (error) { setError((error as Error).message); } finally { setBusy(null); }
  }
  return <Screen><RoomStatus /><Heading title="Your library" subtitle="Songs saved to your SyncBeats account." />
    <Field accessibilityLabel="Search your library" placeholder="Find a saved song" value={query} onChangeText={setQuery} maxLength={200} returnKeyType="search" onSubmitEditing={() => void load(query.trim())} />
    {error && <Notice message={error} error onDismiss={() => setError(null)} action={{ label: 'Try again', onPress: () => void load(searchQuery.current) }} />}
    <View style={{ gap: 8 }}><Label secondary style={{ fontSize: 13 }}>{total} saved {total === 1 ? 'song' : 'songs'}</Label>
      {!songs.length && loading ? <ActivityIndicator color={palette.gold} style={{ padding: 32 }} /> : !songs.length ? <Empty icon="albums-outline" title={error ? 'Library unavailable' : 'Your collection starts here'} detail={error ? 'Try again when your connection is back.' : 'Songs imported or saved in the Apple and web apps appear here on Android too.'} />
        : songs.map(song => <SongRow key={song.id} title={song.title} artist={song.artist} cover={song.artwork || song.thumbnail || undefined} duration={song.duration || undefined}
          onPlay={() => void add(song, true)} onAdd={() => void add(song, false)} busy={busy === song.id} disabled={room.state !== 'connected' || (!!busy && busy !== song.id)}
          added={!!song.youtubeID && !!room.snapshot?.queue.some(track => trackKey(track.trackUrl) === `youtube:${song.youtubeID}`)} />)}
    </View>
    {cursor && <Button quiet busy={loading} onPress={() => void load(searchQuery.current, cursor)}>Load more songs</Button>}
  </Screen>;
}
