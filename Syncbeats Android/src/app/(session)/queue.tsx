import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Cover, Empty, Heading, IconButton, Label, Notice, Screen, Button } from '../../components/ui';
import { RoomStatus } from '../../components/RoomStatus';
import { useRoom } from '../../room/RoomProvider';
import { useSession } from '../../session/SessionProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { artwork } from '../../lib/media';
import type { Track } from '../../lib/types';

export default function Queue() {
  const room = useRoom();
  const { api } = useSession();
  const { palette } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tracks = [...(room.snapshot?.queue ?? [])].sort((a, b) => a.queueIndex - b.queueIndex);
  const enabled = room.state === 'connected';
  async function change(track: Track, index?: number) {
    if (!api || !room.roomId || busy || !enabled) return;
    setBusy(track.id); setError(null);
    try {
      if (index === undefined) await api.remove(room.roomId, track.id);
      else await api.reorder(room.roomId, track.id, index);
      // Keep server order until room:stateChanged arrives.
    } catch (error) { setError((error as Error).message); } finally { setBusy(null); }
  }
  return <Screen><RoomStatus /><Heading title="The shared queue" subtitle={`${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}. Everyone gets a say.`} />
    {error && <Notice message={error} error onDismiss={() => setError(null)} />}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Label secondary style={{ fontSize: 13 }}>Playing order</Label><View style={{ flexDirection: 'row', gap: 4 }}>
        <IconButton icon="shuffle-outline" label="Shuffle queue" active={room.snapshot?.shuffle} disabled={!enabled} onPress={() => room.command('room:toggleShuffle', { shuffle: !room.snapshot?.shuffle })} />
        <IconButton icon="repeat-outline" label={`Repeat: ${room.snapshot?.repeatMode ?? 'off'}`} active={room.snapshot?.repeatMode !== 'off'} disabled={!enabled} onPress={() => room.command('room:toggleRepeat', { repeatMode: room.snapshot?.repeatMode === 'off' ? 'all' : room.snapshot?.repeatMode === 'all' ? 'track' : 'off' })} />
      </View>
    </View>
    {tracks.length === 0 ? <Empty icon="list-outline" title="Start the room’s soundtrack" detail="Find a song and add it here. The queue updates on every connected device."><Button onPress={() => router.replace('/home')}>Find a song</Button></Empty>
      : <View style={{ gap: 8 }}>{tracks.map((track, index) => <View key={track.id} style={{ padding: 12, borderRadius: 12, gap: 4, backgroundColor: track.isCurrent ? palette.raised : 'transparent' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Label secondary style={{ width: 20, fontSize: 12, fontVariant: ['tabular-nums'] }}>{String(index + 1).padStart(2, '0')}</Label>
          <Pressable accessibilityRole="button" accessibilityLabel={`Play ${track.title}`} disabled={!enabled || !!busy} onPress={() => room.command('playback:jumpTo', { trackId: track.id })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Cover uri={artwork(track)} size={48} /><View style={{ flex: 1, gap: 2 }}><Text numberOfLines={2} style={{ color: palette.text, fontSize: 14, lineHeight: 19, fontWeight: '500' }}>{track.title}</Text><Text numberOfLines={1} style={{ color: palette.secondary, fontSize: 12 }}>{track.artist || 'Shared with your room'}</Text></View>
          </Pressable>
          <IconButton icon={busy === track.id ? 'hourglass-outline' : 'close-outline'} label={`Remove ${track.title}`} disabled={!enabled || !!busy} onPress={() => void change(track)} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 32 }}>
          <Label style={{ flex: 1, fontSize: 11, color: track.isCurrent ? palette.gold : palette.quiet }}>{track.isCurrent ? 'Now playing' : track.playedAt ? 'Played earlier' : 'Up next'}</Label>
          <IconButton icon="chevron-up-outline" size={18} label={`Move ${track.title} up`} disabled={!enabled || index === 0 || !!busy} onPress={() => void change(track, index - 1)} />
          <IconButton icon="chevron-down-outline" size={18} label={`Move ${track.title} down`} disabled={!enabled || index === tracks.length - 1 || !!busy} onPress={() => void change(track, index + 1)} />
        </View>
      </View>)}</View>}
  </Screen>;
}
