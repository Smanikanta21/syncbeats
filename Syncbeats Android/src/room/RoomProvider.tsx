import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';
import { server } from '../lib/config';
import type { ConnectionState, RoomSnapshot, SearchResult } from '../lib/types';
import { RoomConnection } from '../sync/roomConnection';
import type { ClockStats } from '../sync/clock';
import { useSession } from '../session/SessionProvider';

interface RoomContextValue {
  roomId: string | null; homeRoomId: string | null; snapshot: RoomSnapshot | null;
  state: ConnectionState; error: string | null; stats: ClockStats | null; connection: RoomConnection | null;
  socketId: string | undefined;
  join: (code: string) => void; retry: () => void; dismissError: () => void;
  command: (event: string, payload?: object) => boolean;
  enqueue: (result: SearchResult, playNow?: boolean) => Promise<void>;
}
const RoomContext = createContext<RoomContextValue | null>(null);
export function RoomProvider({ children }: PropsWithChildren) {
  const { api, user, deviceId } = useSession();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [homeRoomId, setHomeRoomId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [state, setState] = useState<ConnectionState>('opening');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ClockStats | null>(null);
  const [connection, setConnection] = useState<RoomConnection | null>(null);
  const current = useRef<RoomConnection | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (!api || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reflect opening while the backend creates or finds the default room.
    setState('opening'); setError(null);
    void api.defaultRoom().then(({ roomId }) => {
      if (!cancelled) { setHomeRoomId(roomId); setRoomId(previous => previous ?? roomId); }
    }).catch((error: Error) => { if (!cancelled) { setError(error.message); setState('error'); } });
    return () => { cancelled = true; };
  }, [api, user, attempt]);
  useEffect(() => {
    if (!roomId || !user || !deviceId || !api?.token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear the previous room before subscribing to a different socket scope.
    setSnapshot(null); setStats(null); setError(null);
    const socket = io(server.origin, {
      path: server.socketPath, autoConnect: false, transports: ['websocket', 'polling'], tryAllTransports: true,
      timeout: 8000, reconnectionDelay: 1500, reconnectionDelayMax: 10000,
      auth: { token: api.token }, extraHeaders: { 'X-Device-Id': deviceId, Authorization: `Bearer ${api.token}` },
    });
    const session = new RoomConnection(socket, roomId, user, deviceId, {
      snapshot: snapshot => { setSnapshot(snapshot); setError(null); }, state: setState, error: setError, stats: setStats,
    });
    current.current = session; setConnection(session); socket.connect();
    const listener = AppState.addEventListener('change', value => {
      if (value === 'active') { if (!socket.connected) socket.connect(); else session.resync(); }
    });
    return () => { listener.remove(); session.dispose(); socket.disconnect(); if (current.current === session) current.current = null; };
  }, [roomId, user, deviceId, api, attempt]);
  const command = useCallback((event: string, payload: object = {}) => current.current?.command(event, payload) ?? false, []);
  const join = useCallback((code: string) => {
    if (!/^\d{6}$/.test(code.trim())) throw new Error('Enter a six-digit room code.');
    if (code.trim() === current.current?.roomId) current.current.join();
    else setRoomId(code.trim());
  }, []);
  const enqueue = useCallback(async (result: SearchResult, playNow = false) => {
    const session = current.current;
    if (!api || !session || session.state !== 'connected') throw new Error('Wait until the room reconnects before adding a song.');
    const response = await api.enqueue(session.roomId, result);
    if (current.current !== session) return;
    // Queue state always comes from the socket. Follow-up playback also round-trips.
    if (playNow) session.command('playback:jumpTo', { trackId: response.item.id });
  }, [api]);
  return <RoomContext.Provider value={{ roomId, homeRoomId, snapshot, state, error, stats, connection,
    socketId: connection?.socket.id, command, join, enqueue, retry: () => setAttempt(value => value + 1), dismissError: () => setError(null) }}>{children}</RoomContext.Provider>;
}
export function useRoom() { const value = useContext(RoomContext); if (!value) throw new Error('RoomProvider is missing'); return value; }
