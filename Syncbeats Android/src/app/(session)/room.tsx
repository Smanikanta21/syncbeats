import { useState } from 'react';
import { Alert, Platform, Pressable, Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button, Field, Heading, Icon, IconButton, Label, Notice, Screen } from '../../components/ui';
import { RoomStatus } from '../../components/RoomStatus';
import { useRoom } from '../../room/RoomProvider';
import { useSession } from '../../session/SessionProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { useAudio } from '../../audio/AudioProvider';
import { website } from '../../lib/config';

export default function Room() {
  const room = useRoom();
  const session = useSession();
  const audio = useAudio();
  const { palette, isDark, toggle } = useTheme();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function share() {
    if (!room.roomId) return;
    try {
      const url = `${website}/room/${room.roomId}`;
      if (Platform.OS === 'web') { await Clipboard.setStringAsync(url); setMessage('Room link copied.'); }
      else await Share.share({ message: `Listen with me on SyncBeats. Room ${room.roomId}: ${url}` });
    } catch { setError('Could not share the room. Try copying the room code.'); }
  }
  function join() {
    try { room.join(code); setCode(''); setError(null); } catch (error) { setError((error as Error).message); }
  }
  function logout() {
    if (Platform.OS === 'web') { void session.logout(); return; }
    Alert.alert('Sign out of SyncBeats?', 'This phone will leave the room.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', onPress: () => void session.logout() }]);
  }
  return <Screen><RoomStatus /><Heading title="Listening together" subtitle="Your room, across all your devices." />
    {message && <Notice message={message} onDismiss={() => setMessage(null)} />}{error && <Notice message={error} error onDismiss={() => setError(null)} />}
    <View style={{ padding: 24, gap: 20, backgroundColor: palette.raised, borderRadius: 16 }}>
      <View style={{ gap: 8 }}><Label secondary style={{ fontSize: 13 }}>Share your room code</Label>
        <Pressable accessibilityRole="button" accessibilityLabel="Copy room code" onPress={() => { if (room.roomId) void Clipboard.setStringAsync(room.roomId).then(() => setMessage('Room code copied.')); }}><Text style={{ color: palette.text, fontSize: 44, fontWeight: '500', letterSpacing: 4, fontVariant: ['tabular-nums'] }}>{room.roomId || '—'}</Text></Pressable>
      </View><Button onPress={() => void share()} disabled={!room.roomId} icon="share-outline">Invite someone to listen</Button>
    </View>
    <View style={{ gap: 16 }}><Label style={{ fontSize: 22, fontWeight: '500' }}>Connected devices</Label>
      {room.snapshot?.participants.map(participant => <View key={participant.socketId} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 8 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: palette.raised, alignItems: 'center', justifyContent: 'center' }}><Icon name={participant.socketId === room.socketId ? 'phone-portrait-outline' : 'hardware-chip-outline'} color={palette.secondary} /></View>
        <View style={{ flex: 1, gap: 4 }}><Label style={{ fontWeight: '500' }}>{participant.displayName}{participant.socketId === room.socketId ? ' · this phone' : ''}</Label><Label secondary style={{ fontSize: 12 }}>{participant.deviceName || participant.outputDeviceName || 'SyncBeats device'}</Label></View>
        <Label style={{ fontSize: 12, color: participant.isBlocked ? palette.error : participant.isReady ? palette.ready : palette.quiet }}>{participant.isBlocked ? 'Audio unavailable' : participant.isReady ? 'Ready' : 'Preparing'}</Label>
      </View>)}
      {!room.snapshot && <Label secondary>{room.state === 'approval' ? 'The host will approve your request before you enter.' : 'Devices appear when the room connects.'}</Label>}
      <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: palette.line, paddingTop: 12 }}>
        <View style={{ flex: 1 }}><Label secondary style={{ fontSize: 12 }}>{room.stats?.sampled ? `${Math.round(room.stats.rtt || 0)} ms round trip · ${room.stats.quality} connection` : 'Measuring the connection…'}</Label></View>
        <IconButton icon="refresh-outline" label="Resync this device" onPress={() => room.connection?.resync()} disabled={room.state !== 'connected'} />
      </View>
      {audio.error && <Notice message={audio.error} error action={{ label: 'Retry audio', onPress: audio.retry }} />}
    </View>
    <View style={{ gap: 16 }}><Label style={{ fontSize: 22, fontWeight: '500' }}>Join another room</Label><Field accessibilityLabel="Room code" placeholder="Six-digit room code" value={code} onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} onSubmitEditing={join} />
      <Button quiet disabled={code.length !== 6} onPress={join}>Join room</Button>
      {room.homeRoomId && room.homeRoomId !== room.roomId && <Button quiet onPress={() => room.join(room.homeRoomId!)}>Return to your room</Button>}
    </View>
    <View style={{ gap: 12, borderTopWidth: 1, borderColor: palette.line, paddingTop: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ flex: 1 }}><Label>{session.user?.name}</Label><Label secondary style={{ fontSize: 12 }}>{session.user?.email}</Label></View>
        <IconButton icon={isDark ? 'sunny-outline' : 'moon-outline'} label={isDark ? 'Use light theme' : 'Use dark theme'} onPress={toggle} /></View>
      <Button quiet onPress={logout}>Sign out</Button>
    </View>
  </Screen>;
}
