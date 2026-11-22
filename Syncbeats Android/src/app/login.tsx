import { useState } from 'react';
import { Image, Linking, Platform, Pressable, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Button, Field, Label, Notice, Screen } from '../components/ui';
import { useSession } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { website } from '../lib/config';
import { isRunningInExpoGo } from 'expo';

export default function Login() {
  const session = useSession();
  const { palette } = useTheme();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const expoGo = isRunningInExpoGo();
  const nativeGoogle = Platform.OS !== 'web' && !expoGo;
  if (session.user) return <Redirect href="/home" />;
  async function submit() {
    setError(null);
    if (!email.trim().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { setError('Enter your email address.'); return; }
    if (!password || (mode === 'register' && password.length < 8)) { setError(mode === 'register' ? 'Choose a password with at least eight characters.' : 'Enter your password.'); return; }
    if (mode === 'register' && !name.trim()) { setError('Enter your name.'); return; }
    setBusy(true);
    try {
      if (mode === 'register') { await session.api?.register(name, email, password); setRegistered(true); setMode('login'); setPassword(''); }
      else await session.login(email, password);
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <Screen style={{ flexGrow: 1, justifyContent: 'center', maxWidth: 520, width: '100%', alignSelf: 'center', gap: 32 }}>
      <View style={{ gap: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Image source={require('../../assets/icon.png')} style={{ width: 40, height: 40, borderRadius: 10 }} />
          <Label style={{ fontSize: 20, fontWeight: '500' }}>SyncBeats</Label>
        </View>
        <View style={{ gap: 12 }}><Text accessibilityRole="header" style={{ fontSize: 44, lineHeight: 48, color: palette.text, letterSpacing: -1.2, fontWeight: '500' }}>Good music.{`\n`}Better together.</Text>
          <Label secondary>One room. One queue. Your devices, listening together.</Label></View>
      </View>
      <View style={{ gap: 16 }}>
        <Label style={{ fontSize: 22, fontWeight: '500' }}>{mode === 'register' ? 'Create your account' : 'Sign in to your room'}</Label>
        {nativeGoogle && <Button quiet busy={busy} onPress={() => {
          setBusy(true); setError(null);
          void session.google().catch((error: Error) => setError(error.message)).finally(() => setBusy(false));
        }}>Continue with Google</Button>}
        {expoGo && <Label secondary>Google sign-in requires an installed SyncBeats app or development build. Use email sign-in in Expo Go.</Label>}
        {registered && <Notice message="Check your email to verify your account, then sign in here. Your existing SyncBeats account works on every device." action={{ label: 'Open SyncBeats', onPress: () => void Linking.openURL(website) }} />}
        {error && <Notice message={error} error onDismiss={() => setError(null)} />}
        {mode === 'register' && <Field accessibilityLabel="Name" placeholder="Name" value={name} onChangeText={setName} maxLength={100} autoComplete="name" />}
        <Field accessibilityLabel="Email" placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} autoComplete="email" />
        <Field accessibilityLabel="Password" placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry maxLength={128} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} onSubmitEditing={() => void submit()} />
        <Button busy={busy} disabled={!session.api} onPress={() => void submit()}>{mode === 'register' ? 'Create account' : 'Sign in'}</Button>
        {mode === 'login' && <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`${website}/forgot-password`)}><Label secondary style={{ textAlign: 'center', fontSize: 14 }}>Forgot your password?</Label></Pressable>}
      </View>
      <View style={{ gap: 12 }}>
        <Pressable accessibilityRole="button" onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}><Label style={{ textAlign: 'center', color: palette.gold }}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</Label></Pressable>
        <Label secondary style={{ textAlign: 'center', fontSize: 12 }}>Use the same account as the Apple or web app.</Label>
      </View>
    </Screen>;
}
