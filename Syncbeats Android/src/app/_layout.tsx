import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, View } from 'react-native';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';
import { SessionProvider, useSession } from '../session/SessionProvider';
import { RoomProvider } from '../room/RoomProvider';
import { AudioProvider } from '../audio/AudioProvider';
import { Button, Label, Notice, Screen } from '../components/ui';
import { KeyboardRoot } from '../components/keyboard';

export default function RootLayout() {
  return <SafeAreaProvider><KeyboardRoot><ThemeProvider><SessionProvider><Navigator /></SessionProvider></ThemeProvider></KeyboardRoot></SafeAreaProvider>;
}
function Navigator() {
  const { palette, isDark } = useTheme();
  const session = useSession();
  if (session.loading) return <Screen scroll={false} style={{ justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={palette.gold} /><Label>Opening SyncBeats…</Label></Screen>;
  if (session.error) return <Screen scroll={false} style={{ justifyContent: 'center' }}>
    <Label style={{ fontSize: 28, fontWeight: '500' }}>Let’s reconnect</Label><Notice message={session.error} error />
    <Button onPress={session.retry}>Try again</Button><Button quiet onPress={() => void session.logout()}>Sign out</Button>
  </Screen>;
  const navigator = <View style={{ flex: 1, backgroundColor: palette.background }}>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background } }}>
      <Stack.Screen name="index" /><Stack.Screen name="login" />
      <Stack.Screen name="(session)" /><Stack.Screen name="player" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  </View>;
  return session.user ? <RoomProvider><AudioProvider>{navigator}</AudioProvider></RoomProvider> : navigator;
}
