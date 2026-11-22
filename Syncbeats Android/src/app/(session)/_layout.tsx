import { Redirect, Slot, router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../../session/SessionProvider';
import { useRoom } from '../../room/RoomProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { Cover, Icon, IconButton, Label } from '../../components/ui';
import { artwork, currentTrack } from '../../lib/media';
import { useKeyboardVisible } from '../../components/keyboard';

export default function Layout() {
  const session = useSession();
  return session.user ? <Shell /> : <Redirect href="/login" />;
}
function Shell() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const room = useRoom();
  const track = currentTrack(room.snapshot);
  const keyboardVisible = useKeyboardVisible();
  const tabs = [
    { path: '/home' as const, label: 'Listen', icon: 'headset-outline' as const },
    { path: '/library' as const, label: 'Library', icon: 'albums-outline' as const },
    { path: '/queue' as const, label: 'Queue', icon: 'list-outline' as const },
    { path: '/room' as const, label: 'Room', icon: 'radio-outline' as const },
  ];
  return <View style={{ flex: 1, backgroundColor: palette.background }}>
    <View style={{ flex: 1 }}><Slot /></View>
    {!keyboardVisible && <View style={{ borderTopWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, paddingBottom: Math.max(insets.bottom, 8) }}>
      {track && <View style={[shell.mini, { borderBottomColor: palette.line }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open player for ${track.title}`} onPress={() => router.push('/player')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Cover uri={artwork(track)} size={44} /><View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: palette.text, fontSize: 14, fontWeight: '500' }}>{track.title}</Text><Label secondary style={{ fontSize: 12 }}>{room.snapshot?.pendingPlay ? 'Waiting for devices…' : track.artist || 'Shared with your room'}</Label></View>
        </Pressable>
        <IconButton icon={room.snapshot?.isPlaying ? 'pause' : 'play'} label={room.snapshot?.isPlaying ? 'Pause room' : 'Play room'} disabled={room.state !== 'connected'} onPress={() => room.command(room.snapshot?.isPlaying ? 'playback:pause' : 'playback:play')} />
      </View>}
      <View style={shell.tabs}>{tabs.map(tab => <Pressable key={tab.path} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: pathname === tab.path }} onPress={() => router.replace(tab.path)} style={shell.tab}>
        <Icon name={tab.icon} size={22} color={pathname === tab.path ? palette.gold : palette.quiet} /><Label style={{ fontSize: 11, color: pathname === tab.path ? palette.gold : palette.quiet }}>{tab.label}</Label>
      </Pressable>)}</View>
    </View>}
  </View>;
}
const shell = StyleSheet.create({ mini: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 }, tabs: { flexDirection: 'row', paddingTop: 8 }, tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4 } });
