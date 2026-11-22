import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useRoom } from '../room/RoomProvider';
import { useTheme } from '../theme/ThemeProvider';
import { Label, Notice } from './ui';

export function RoomStatus() {
  const room = useRoom();
  const { palette } = useTheme();
  const count = room.snapshot?.participants.length ?? 0;
  return <View style={{ gap: 12 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Open room and connected devices" onPress={() => router.replace('/room')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: room.state === 'connected' ? palette.ready : palette.gold }} />
      <Label secondary style={{ fontSize: 12, flex: 1 }}>{room.state === 'connected' ? `Room ${room.roomId}` : room.state === 'approval' ? 'Waiting for the host' : room.state === 'error' ? 'Room unavailable' : 'Connecting to your room…'}</Label>
      {room.state === 'connected' && <Label secondary style={{ fontSize: 12 }}>{count} {count === 1 ? 'device' : 'devices'}</Label>}
    </Pressable>
    {room.error && <Notice message={room.error} error onDismiss={room.dismissError} action={room.state === 'error' ? { label: 'Try again', onPress: room.retry } : undefined} />}
  </View>;
}
