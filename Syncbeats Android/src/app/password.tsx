import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Field, Label, Notice, Screen } from '../components/ui';
import { useSession } from '../session/SessionProvider';

export default function Password() {
  const session = useSession();
  const params = useLocalSearchParams<{ email?: string; sent?: string }>();
  const initialEmail = typeof params.email === 'string' ? params.email : '';
  const alreadySent = !session.user && params.sent === '1' && !!initialEmail;
  const [step, setStep] = useState<'email' | 'code' | 'done'>(alreadySent ? 'code' : 'email');
  const [email, setEmail] = useState(session.user?.email ?? initialEmail);
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const address = (session.user?.email ?? email).trim().toLowerCase();

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace(session.user ? '/room' : '/login');
  }

  async function sendCode() {
    if (busy || !session.api) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError('Enter your email address.'); return; }
    setBusy(true);
    setError('');
    try {
      await session.api.post('/auth/password/forgot', { email: address });
      setResent(step === 'code');
      setStep('code');
      setOtp('');
    } catch (failure) {
      setError((failure as Error).message);
    } finally { setBusy(false); }
  }

  async function setNewPassword() {
    if (busy || !session.api) return;
    if (!/^\d{6}$/.test(otp)) { setError('Enter the six-digit code from your email.'); return; }
    if (password.length < 8) { setError('Choose a password with at least eight characters.'); return; }
    if (password !== confirm) { setError('The passwords must match.'); return; }
    setBusy(true);
    setError('');
    try {
      await session.api.post('/auth/password/reset', { email: address, otp, password });
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
      return;
    }
    setOtp('');
    setPassword('');
    setConfirm('');
    setStep('done');
    try {
      if (!session.user) {
        await session.login(address, password);
        router.replace('/home');
      }
    } catch {
      setNeedsLogin(true);
    } finally { setBusy(false); }
  }

  return <Screen style={{ flexGrow: 1, justifyContent: 'center', maxWidth: 520, width: '100%', alignSelf: 'center', gap: 16 }}>
    <Label style={{ fontSize: 24, fontWeight: '500' }}>
      {step === 'done' ? 'Your password is set' : alreadySent ? 'Set up your password' : session.user ? 'Set your account password' : 'Reset your password'}
    </Label>
    {error ? <Notice message={error} error /> : null}
    {step === 'email' && <>
      <Label secondary>{session.user ? `Send a six-digit code to ${address} to choose a new password.` : 'Enter your SyncBeats email to get a six-digit reset code.'}</Label>
      {!session.user && <Field accessibilityLabel="Email" placeholder="Email" value={email} onChangeText={setEmail}
        editable={!busy} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} autoComplete="email" onSubmitEditing={() => void sendCode()} />}
      <Button busy={busy} disabled={!session.api} onPress={() => void sendCode()}>Send code</Button>
    </>}
    {step === 'code' && <>
      <Label secondary>{resent ? 'We sent a new six-digit code to ' : 'Enter the six-digit code sent to '}{address}.</Label>
      <Field accessibilityLabel="Email code" placeholder="Six-digit code" value={otp} onChangeText={setOtp}
        editable={!busy} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" />
      <Field accessibilityLabel="New password" placeholder="New password (at least 8 characters)" value={password} onChangeText={setPassword}
        editable={!busy} secureTextEntry maxLength={128} autoComplete="new-password" />
      <Field accessibilityLabel="Confirm password" placeholder="Confirm password" value={confirm} onChangeText={setConfirm}
        editable={!busy} secureTextEntry maxLength={128} autoComplete="new-password" onSubmitEditing={() => void setNewPassword()} />
      <Button busy={busy} disabled={!session.api} onPress={() => void setNewPassword()}>{session.user ? 'Save password' : 'Set password and sign in'}</Button>
      <Button quiet disabled={busy} onPress={() => void sendCode()}>Send a new code</Button>
    </>}
    {step === 'done' && <Label secondary>{needsLogin ? 'Sign in with your new password to continue.' : `You can now sign in as ${address} with your password.`}</Label>}
    <Button quiet disabled={busy} onPress={needsLogin ? () => router.replace('/login') : back}>{needsLogin ? 'Go to sign in' : step === 'done' ? 'Done' : 'Back'}</Button>
  </Screen>;
}
