import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const key = 'syncbeats.token';
export const tokenStorage = {
  get: () => Platform.OS === 'web'
    ? Promise.resolve(typeof window === 'undefined' ? null : window.sessionStorage.getItem(key))
    : SecureStore.getItemAsync(key),
  set: (token: string) => Platform.OS === 'web'
    ? Promise.resolve(window.sessionStorage.setItem(key, token))
    : SecureStore.setItemAsync(key, token),
  clear: () => Platform.OS === 'web'
    ? Promise.resolve(window.sessionStorage.removeItem(key))
    : SecureStore.deleteItemAsync(key),
};

export async function getDeviceId() {
  const key = 'syncbeats.device';
  const existing = Platform.OS === 'web'
    ? window.localStorage.getItem(key) : await SecureStore.getItemAsync(key);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  if (Platform.OS === 'web') window.localStorage.setItem(key, id);
  else await SecureStore.setItemAsync(key, id);
  return id;
}
