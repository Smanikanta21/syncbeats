import { Redirect, router } from 'expo-router';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../session/SessionProvider';
import { useRoom } from '../room/RoomProvider';
import { useAudio } from '../audio/AudioProvider';
import { useTheme } from '../theme/ThemeProvider';
import { artwork, currentTrack, timeLabel } from '../lib/media';
import { Button, Cover, Empty, Icon, IconButton, Label, Notice } from '../components/ui';

export default function Player() { return useSession().user ? <ExpandedPlayer /> : <Redirect href="/login" />; }
function ExpandedPlayer() {
  const room = useRoom();
  const audio = useAudio();
  const { palette } = useTheme();
  const { width, height } = useWindowDimensions();
  const track = currentTrack(room.snapshot);
  const coverSize = Math.min(width - 64, height < 720 ? 248 : 360);
  const duration = audio.duration || track?.durationSec || 0;
  const enabled = room.state === 'connected';
  const close = () => { if (router.canGoBack()) router.back(); else router.replace('/home'); };
  return <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}><ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 32, gap: 24, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><IconButton icon="chevron-down-outline" label="Close player" onPress={close} /><Label secondary style={{ fontSize: 12 }}>Playing in room {room.roomId}</Label><IconButton icon="list-outline" label="Open queue" onPress={() => router.replace('/queue')} /></View>
    {!track ? <Empty icon="musical-notes-outline" title="Choose the first song" detail="Your player follows the shared room queue."><Button onPress={() => router.replace('/home')}>Find a song</Button></Empty> : <>
      <View style={{ alignItems: 'center', paddingVertical: 8 }}><Cover uri={artwork(track)} size={coverSize} label={`${track.title} album artwork`} /></View>
      <View style={{ gap: 8 }}><Text numberOfLines={3} style={{ fontSize: 28, lineHeight: 34, fontWeight: '500', color: palette.text, letterSpacing: -.5 }}>{track.title}</Text><Label secondary>{track.artist || 'Shared with your room'}</Label></View>
      {audio.error && <Notice message={audio.error} error action={{ label: 'Retry audio', onPress: audio.retry }} />}
      {room.state !== 'connected' && <Notice message={room.state === 'approval' ? 'Waiting for the host to approve your request.' : 'Reconnecting to the room. Playback will follow the shared timeline when connected.'} />}
      <View style={{ gap: 4 }}><Slider accessibilityLabel="Playback position" disabled={!enabled || !audio.loaded || duration === 0} minimumValue={0} maximumValue={duration || 1} value={Math.min(audio.position, duration || 1)}
        minimumTrackTintColor={palette.gold} maximumTrackTintColor={palette.line} thumbTintColor={palette.gold} onSlidingComplete={position => room.command('playback:seek', { position: Math.round(position * 1000) })} style={{ width: '100%', height: 36 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Label secondary style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>{timeLabel(audio.position)}</Label><Label secondary style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>{duration ? timeLabel(duration) : '—:—'}</Label></View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <IconButton icon="shuffle-outline" label="Shuffle" active={room.snapshot?.shuffle} disabled={!enabled} onPress={() => room.command('room:toggleShuffle', { shuffle: !room.snapshot?.shuffle })} />
        <IconButton icon="play-skip-back" label="Previous song" disabled={!enabled} onPress={() => room.command('playback:prev')} size={28} />
        <Pressable accessibilityRole="button" accessibilityLabel={room.snapshot?.isPlaying ? 'Pause room' : 'Play room'} disabled={!enabled || !!audio.error} onPress={() => room.command(room.snapshot?.isPlaying ? 'playback:pause' : 'playback:play')} style={({ pressed }) => ({ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.text, opacity: !enabled ? .4 : pressed ? .7 : 1 })}><Icon name={room.snapshot?.isPlaying ? 'pause' : 'play'} size={30} color={palette.buttonText} /></Pressable>
        <IconButton icon="play-skip-forward" label="Next song" disabled={!enabled} onPress={() => room.command('playback:next')} size={28} />
        <IconButton icon="repeat-outline" label={`Repeat ${room.snapshot?.repeatMode ?? 'off'}`} active={room.snapshot?.repeatMode !== 'off'} disabled={!enabled} onPress={() => room.command('room:toggleRepeat', { repeatMode: room.snapshot?.repeatMode === 'off' ? 'all' : room.snapshot?.repeatMode === 'all' ? 'track' : 'off' })} />
      </View>
      <Label secondary style={{ fontSize: 12, textAlign: 'center' }}>{room.snapshot?.pendingPlay ? 'Waiting for every device to prepare…' : audio.loading ? 'Preparing audio on this phone…' : room.snapshot?.isPlaying ? 'Following the room’s timeline' : 'Ready when you are'}</Label>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Icon name="volume-low-outline" size={20} color={palette.quiet} /><Slider accessibilityLabel="This device volume" minimumValue={0} maximumValue={1} value={audio.volume} onSlidingComplete={audio.setVolume} minimumTrackTintColor={palette.secondary} maximumTrackTintColor={palette.line} thumbTintColor={palette.secondary} style={{ flex: 1, height: 40 }} /><Icon name="volume-high-outline" size={20} color={palette.quiet} /></View>
      <View style={{ paddingTop: 16, borderTopWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="radio-outline" size={18} color={palette.ready} /><Label secondary style={{ flex: 1, fontSize: 12 }}>{room.snapshot?.participants.length ?? 0} connected devices</Label><IconButton icon="refresh-outline" label="Resync playback" disabled={!enabled} onPress={() => room.connection?.resync()} /></View>
    </>}
  </ScrollView></SafeAreaView>;
}
