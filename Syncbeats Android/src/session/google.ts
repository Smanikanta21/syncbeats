import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { isRunningInExpoGo } from 'expo';
import { website } from '../lib/config';
import { googleCode, googleRedirectURI } from '../lib/googleCallback';
import type { ApiClient } from '../lib/api';
import type { AuthResponse } from '../lib/types';

const normalize = (value: string) => value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function randomToken() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '', value = 0, bits = 0;
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 6) { bits -= 6; result += alphabet[(value >> bits) & 63]; } }
  if (bits) result += alphabet[(value << (6 - bits)) & 63];
  return result;
}

export async function googleSignIn(api: ApiClient): Promise<AuthResponse | null> {
  if (isRunningInExpoGo()) {
    throw new Error('Google sign-in needs an installed SyncBeats app or development build. Expo Go cannot open the app return link. Use email sign-in here.');
  }
  const capability = await api.request<{ version: number }>('/auth/native/google');
  if (capability.version !== 1) throw new Error('Google sign-in is unavailable right now. Please try again later.');
  const [verifier, state, nonce] = await Promise.all([randomToken(), randomToken(), randomToken()]);
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 });
  const query = new URLSearchParams({ client: 'android', state, nonce, code_challenge: normalize(digest) });
  const startedAt = Date.now();
  const response = await WebBrowser.openAuthSessionAsync(`${website}/auth/native?${query}`, googleRedirectURI);
  if (response.type !== 'success') return null;
  const code = googleCode(response.url, state, startedAt);
  return api.post<AuthResponse>('/auth/native/google/exchange', { code, verifier });
}
