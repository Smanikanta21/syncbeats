import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { ApiClient, ApiError } from '../lib/api';
import { getDeviceId, tokenStorage } from '../lib/storage';
import type { AuthResponse, User } from '../lib/types';
import { googleSignIn } from './google';

interface Session {
  user: User | null; api: ApiClient | null; deviceId: string | null;
  loading: boolean; error: string | null;
  retry: () => void; login: (email: string, password: string) => Promise<void>; google: () => Promise<void>; logout: () => Promise<void>;
}
const SessionContext = createContext<Session | null>(null);
export function SessionProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Session restoration is async and needs a loading state on retry.
    setLoading(true); setError(null);
    void (async () => {
      try {
        const device = await getDeviceId();
        if (cancelled) return;
        setDeviceId(device);
        const stored = await tokenStorage.get();
        if (!stored) return;
        const response = await new ApiClient(stored, device).me();
        if (cancelled) return;
        setToken(stored); setUser(response.user);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 404)) await tokenStorage.clear();
        else setError(error instanceof Error ? error.message : 'Could not restore your session.');
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [attempt]);
  const accept = useCallback(async (response: AuthResponse) => {
    if (!response.token) throw new Error('Sign-in did not return a session. Please try again.');
    await tokenStorage.set(response.token);
    setToken(response.token); setUser(response.user); setError(null);
  }, []);
  const login = useCallback(async (email: string, password: string) => {
    if (!deviceId) throw new Error('Your device is still starting. Please try again.');
    await accept(await new ApiClient(null, deviceId).login(email, password));
  }, [accept, deviceId]);
  const google = useCallback(async () => {
    if (!deviceId) throw new Error('Your device is still starting. Please try again.');
    const response = await googleSignIn(new ApiClient(null, deviceId));
    if (response) await accept(response);
  }, [accept, deviceId]);
  const logout = useCallback(async () => {
    await tokenStorage.clear(); setUser(null); setToken(null); setError(null);
  }, []);
  const api = useMemo(() => deviceId ? new ApiClient(token, deviceId) : null, [deviceId, token]);
  return <SessionContext.Provider value={{ user, api, deviceId, loading, error, login, google, logout, retry: () => setAttempt(value => value + 1) }}>{children}</SessionContext.Provider>;
}
export function useSession() { const value = useContext(SessionContext); if (!value) throw new Error('SessionProvider is missing'); return value; }
