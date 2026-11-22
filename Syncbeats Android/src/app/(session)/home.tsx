import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Button, Cover, Empty, Field, Heading, IconButton, Label, Notice, Screen } from '../../components/ui';
import { RoomStatus } from '../../components/RoomStatus';
import { SongRow } from '../../components/SongRow';
import { useSession } from '../../session/SessionProvider';
import { useRoom } from '../../room/RoomProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { artwork, trackKey, youtubeId } from '../../lib/media';
import type { Feed, SearchResult } from '../../lib/types';

const genres = [
  { name: 'All', query: 'chill indie electronic soul music' }, { name: 'Electronic', query: 'electronic music chill' },
  { name: 'Indie', query: 'indie music' }, { name: 'Instrumental', query: 'instrumental music' }, { name: 'Soul', query: 'soul music' },
];
export default function Home() {
  const { api } = useSession();
  const room = useRoom();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(240, (width - 64) / 2);
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState(0);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [history, setHistory] = useState<SearchResult[]>([]);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const generation = useRef(0);
  const lastQuery = useRef(genres[0].query);
  const load = useCallback(async (query: string, isSearch: boolean) => {
    if (!api || !room.roomId) return;
    const version = ++generation.current;
    lastQuery.current = query; setSearched(isSearch); setLoading(true); setError(null);
    try {
      const id = youtubeId(query);
      const results = id && isSearch ? [{ url: `youtube:${id}`, title: '', thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }] : await api.search(room.roomId, query);
      if (version === generation.current) setResults(results);
    } catch (error) { if (version === generation.current) { setError((error as Error).message); setResults([]); } }
    finally { if (version === generation.current) setLoading(false); }
  }, [api, room.roomId]);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Start discovery from the backend when the room or selected genre changes.
  useEffect(() => { void load(genres[genre].query, false); return invalidate; }, [load, genre, invalidate]);
  useEffect(() => {
    let cancelled = false;
    if (!api) return;
    void Promise.allSettled([api.feed(), api.history()]).then(([feed, history]) => {
      if (cancelled) return;
      if (feed.status === 'fulfilled') setFeed(feed.value);
      if (history.status === 'fulfilled') {
        const seen = new Set<string>();
        setHistory(history.value.listens.filter(item => /^[A-Za-z0-9_-]{11}$/.test(item.youtubeId) && !seen.has(item.youtubeId) && !!seen.add(item.youtubeId)).slice(0, 6)
          .map(item => ({ url: `youtube:${item.youtubeId}`, title: item.title, uploaderName: item.artist, thumbnail: item.thumbnail })));
      }
    });
    return () => { cancelled = true; };
  }, [api]);
  async function add(result: SearchResult, play = false) {
    if (adding.has(result.url)) return;
    setAdding(previous => new Set(previous).add(result.url)); setNotice(null);
    try { await room.enqueue(result, play); setNotice(play ? 'Starting this song in your room.' : 'Added to your room queue.'); }
    catch (error) { setError((error as Error).message); }
    finally { setAdding(previous => { const next = new Set(previous); next.delete(result.url); return next; }); }
  }
  const picks = feed?.sections.flatMap(section => section.picks).filter((pick, index, all) => all.findIndex(other => other.id === pick.id) === index).slice(0, 6) ?? [];
  const queued = (result: SearchResult) => !!room.snapshot?.queue.some(track => trackKey(track.trackUrl) === trackKey(result.url));
  const submit = () => { if (query.trim()) void load(query.trim(), true); };
  return <Screen>
    <RoomStatus />
    <Heading title="Find your next song." subtitle="A little discovery. A shared listening session." />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: palette.panel, borderRadius: 10, borderWidth: 1, borderColor: palette.line }}>
      <Field accessibilityLabel="Search songs" placeholder="Songs, artists or a YouTube link" value={query} onChangeText={setQuery} onSubmitEditing={submit} returnKeyType="search" maxLength={200} style={{ flex: 1, borderWidth: 0, fontSize: 14 }} />
      <IconButton icon="search-outline" label="Search" onPress={submit} />
    </View>
    {notice && <Notice message={notice} onDismiss={() => setNotice(null)} />}
    {error && <Notice message={error} error onDismiss={() => setError(null)} action={{ label: 'Try again', onPress: () => void load(lastQuery.current, searched) }} />}
    {!searched && picks.length > 0 && <View style={{ gap: 12 }}><Label style={{ fontSize: 20, fontWeight: '500' }}>Made for your listening</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>{picks.map(pick => <Pressable key={pick.id} accessibilityRole="button" accessibilityLabel={`Find songs by ${pick.name}`} onPress={() => { setQuery(pick.query); void load(pick.query, true); }} style={{ width: 180, padding: 16, gap: 8, backgroundColor: palette.raised, borderRadius: 12 }}>
        <Text numberOfLines={1} style={{ color: palette.text, fontWeight: '500', fontSize: 16 }}>{pick.name}</Text><Label secondary style={{ fontSize: 12, lineHeight: 18 }}>{pick.reason}</Label>
      </Pressable>)}</ScrollView></View>}
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Label style={{ fontSize: 22, fontWeight: '500' }}>{searched ? 'Search results' : 'Discover'}</Label>
        {searched && <IconButton icon="close-outline" label="Clear search" onPress={() => { setQuery(''); void load(genres[genre].query, false); }} />}</View>
      {!searched && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{genres.map((item, index) => <Pressable key={item.name} accessibilityRole="button" accessibilityState={{ selected: genre === index }} onPress={() => setGenre(index)} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: genre === index ? palette.text : palette.raised }}><Text style={{ color: genre === index ? palette.buttonText : palette.secondary, fontSize: 13 }}>{item.name}</Text></Pressable>)}</ScrollView>}
      {loading ? <View style={{ padding: 32, alignItems: 'center', gap: 12 }}><ActivityIndicator color={palette.gold} /><Label secondary>Finding songs…</Label></View>
        : results.length === 0 ? <Empty icon="search-outline" title={error ? 'Discovery is unavailable' : 'No songs found'} detail={error ? 'Try again once your connection is back.' : 'Try another song title or artist.'} />
        : searched ? <View>{results.map(result => <SongRow key={result.url} title={result.title || 'YouTube link'} artist={result.uploaderName} cover={artwork(result)} duration={result.duration} onPlay={() => void add(result, true)} onAdd={() => void add(result)} busy={adding.has(result.url)} added={queued(result)} disabled={room.state !== 'connected'} />)}</View>
        : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>{results.map(result => <View key={result.url} style={{ width: cardWidth, gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Play ${result.title}`} disabled={room.state !== 'connected' || adding.has(result.url)} onPress={() => void add(result, true)}><Cover uri={artwork(result)} size={cardWidth} label={`${result.title} artwork`} /></Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ flex: 1, gap: 4 }}><Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 19, fontWeight: '500', color: palette.text }}>{result.title}</Text><Text numberOfLines={1} style={{ fontSize: 12, color: palette.secondary }}>{result.uploaderName}</Text></View>
            <IconButton icon={adding.has(result.url) ? 'hourglass-outline' : queued(result) ? 'checkmark-outline' : 'add-outline'} label={`Add ${result.title} to queue`} disabled={room.state !== 'connected' || adding.has(result.url) || queued(result)} onPress={() => void add(result)} />
          </View></View>)}</View>}
    </View>
    {!searched && history.length > 0 && <View style={{ gap: 12 }}><Label style={{ fontSize: 22, fontWeight: '500' }}>Back in rotation</Label>{history.map(result => <SongRow key={result.url} title={result.title} artist={result.uploaderName} cover={artwork(result)} onPlay={() => void add(result, true)} onAdd={() => void add(result)} busy={adding.has(result.url)} added={queued(result)} disabled={room.state !== 'connected'} />)}</View>}
    {room.state === 'approval' && <Button quiet onPress={() => room.homeRoomId && room.join(room.homeRoomId)}>Back to your own room</Button>}
  </Screen>;
}
