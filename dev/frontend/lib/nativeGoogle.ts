import { request } from './api';

const storageKey = 'syncbeats:native-google';
export const nativeGoogleStatePrefix = 'syncbeats-native:';
export type NativeGoogleRequest = { state: string; nonce: string; challenge: string };
type Pending = NativeGoogleRequest & { createdAt: number };
const token = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export function nativeGoogleRequest(values: Record<string, string | string[] | undefined>): NativeGoogleRequest | null {
  return token(values.state) && token(values.nonce) && token(values.code_challenge)
    ? { state: values.state, nonce: values.nonce, challenge: values.code_challenge } : null;
}
export function googleNativeAuthorization(flow: NativeGoogleRequest, clientID: string, origin: string): string {
  const redirect = new URL(origin);
  // Match web login's registered root callback even when the site serves on www.
  if (redirect.hostname === 'www.syncbeats.in' || redirect.hostname === 'www.syncbeats.app') {
    redirect.hostname = redirect.hostname.slice(4);
  }
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: clientID, redirect_uri: redirect.origin, response_type: 'id_token',
    scope: 'openid email profile', state: nativeGoogleStatePrefix + flow.state, nonce: flow.nonce, prompt: 'select_account' }).toString();
  return url.toString();
}
export function startNativeGoogle(flow: NativeGoogleRequest) {
  const clientID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '1006171035854-cacohriuvvgpb7mu8q11iro8oq2dj2o1.apps.googleusercontent.com';
  window.sessionStorage.setItem(storageKey, JSON.stringify({ ...flow, createdAt: Date.now() }));
  window.location.assign(googleNativeAuthorization(flow, clientID, window.location.origin));
}
export function isNativeGoogleReturn(fragment: string): boolean {
  return (new URLSearchParams(fragment.replace(/^#/, '')).get('state') || '').startsWith(nativeGoogleStatePrefix);
}
export function nativeGooglePending(fragment: string, serialized: string | null, now = Date.now()): { flow: NativeGoogleRequest; credential: string } {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const pending: Pending | null = serialized ? JSON.parse(serialized) : null;
  const flow = pending && nativeGoogleRequest({ state: pending.state, nonce: pending.nonce, code_challenge: pending.challenge });
  const credential = params.get('id_token');
  if (!flow || !Number.isFinite(pending?.createdAt) || now - pending!.createdAt > 600_000 || now < pending!.createdAt ||
      params.getAll('state').length !== 1 || params.get('state') !== nativeGoogleStatePrefix + flow.state ||
      params.getAll('id_token').length !== 1 || !credential || credential.length > 12000 || params.has('error')) {
    throw new Error('Google sign-in expired. Return to SyncBeats and try again.');
  }
  return { flow, credential };
}
export function nativeGoogleCallback(state: string, code: string): string {
  if (!token(state) || !token(code)) throw new Error('Invalid Google sign-in response.');
  return 'syncbeats://google/callback?' + new URLSearchParams({ state, code }).toString();
}
export async function finishNativeGoogle() {
  const fragment = window.location.hash;
  // Remove the Google credential before any network request or other auth handler runs.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  let state: string | undefined;
  try {
    const saved = window.sessionStorage.getItem(storageKey);
    window.sessionStorage.removeItem(storageKey);
    const pending: Pending | null = saved ? JSON.parse(saved) : null;
    const expected = pending && nativeGoogleRequest({ state: pending.state, nonce: pending.nonce, code_challenge: pending.challenge });
    if (expected && new URLSearchParams(fragment.replace(/^#/, '')).get('state') === nativeGoogleStatePrefix + expected.state) state = expected.state;
    const { flow, credential } = nativeGooglePending(fragment, saved); state = flow.state;
    const result = await request<{ version: number; code: string }>('/auth/native/google', {
      method: 'POST', body: JSON.stringify({ credential, codeChallenge: flow.challenge, nonce: flow.nonce }),
    });
    if (result.version !== 1) throw new Error('Update the SyncBeats sign-in server.');
    window.location.replace(nativeGoogleCallback(state, result.code));
  } catch {
    if (state) window.location.replace('syncbeats://google/callback?' + new URLSearchParams({ state, error: 'sign_in_failed' }));
    else window.location.replace('/auth/native?failed=1');
  }
}
