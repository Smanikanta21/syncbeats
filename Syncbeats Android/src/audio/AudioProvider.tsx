import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { AppState, Platform } from 'react-native';
import { audioURL, trackKey } from '../lib/media';
import { useRoom } from '../room/RoomProvider';
import { useSession } from '../session/SessionProvider';
import { PlaybackFollower } from '../sync/playback';

interface AudioState { position: number; duration: number; loaded: boolean; loading: boolean; error: string | null }
const empty: AudioState = { position: 0, duration: 0, loaded: false, loading: false, error: null };
const AudioContext = createContext<(AudioState & { retry: () => void; volume: number; setVolume: (volume: number) => void }) | null>(null);
export function AudioProvider({ children }: PropsWithChildren) {
  const room = useRoom();
  const { api } = useSession();
  const [state, setState] = useState(empty);
  const { socketId, command } = room;
  const volume = Math.max(0, Math.min(1, (room.snapshot?.participants.find(participant => participant.socketId === room.socketId)?.volume ?? 100) / 100));
  const setVolume = useCallback((value: number) => {
    if (socketId && Number.isFinite(value)) command('room:setParticipantVolume', { targetSocketId: socketId, volume: Math.round(Math.max(0, Math.min(1, value)) * 100) });
  }, [socketId, command]);
  const [attempt, setAttempt] = useState(0);
  const roomId = room.roomId;
  const trackUrl = room.snapshot?.trackUrl;
  const source = useMemo<{ uri: string } | { error: string } | null>(() => {
    if (!roomId || !trackUrl || !api) return null;
    try { return { uri: audioURL(api.base, roomId, trackUrl) }; }
    catch (error) { return { error: (error as Error).message }; }
  }, [roomId, trackUrl, api]);
  // A server room-instance change does not invalidate this device's already loaded file.
  const engineKey = `${room.roomId}:${trackKey(room.snapshot?.trackUrl || '')}:${attempt}`;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reflect a new external audio source before its async load completes.
    setState(source && 'error' in source ? { ...empty, error: source.error } : { ...empty, loading: !!source });
    if (source && 'error' in source) room.connection?.blocked();
  }, [engineKey, source, room.connection]);
  return <AudioContext.Provider value={{ ...state, volume, setVolume, retry: () => setAttempt(value => value + 1) }}>
    {source && 'uri' in source && <AudioEngine key={engineKey} uri={source.uri} volume={volume} changed={setState} />}
    {children}
  </AudioContext.Provider>;
}
function AudioEngine({ uri, volume, changed }: { uri: string; volume: number; changed: (state: AudioState) => void }) {
  const room = useRoom();
  const source = useMemo(() => ({ uri }), [uri]);
  const player = useAudioPlayer(source, { updateInterval: 100, downloadFirst: true });
  const status = useAudioPlayerStatus(player);
  const [active, setActive] = useState(Platform.OS === 'web' || AppState.currentState === 'active');
  const live = useRef({ room, status, volume, active });
  useEffect(() => { live.current = { room, status, volume, active }; }, [room, status, volume, active]);
  const [modeReady, setModeReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const follower = useRef<PlaybackFollower | null>(null);
  const ended = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'doNotMix' })
      .then(() => { if (!cancelled) setModeReady(true); })
      .catch(() => { if (!cancelled) setFailure('Could not open the audio output. Tap retry.'); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const controller = new PlaybackFollower(player, () => live.current.room.snapshot,
      () => live.current.room.connection?.clock.serverNow() ?? Date.now(),
      () => !!(modeReady && !failure && live.current.active && live.current.status.isLoaded && !live.current.status.error && !live.current.status.didJustFinish && !live.current.status.isBuffering && live.current.room.state === 'connected' && live.current.room.stats?.sampled),
      () => live.current.room.connection?.clock.params.hardSeek ?? 25,
      message => setFailure(message), () => live.current.volume);
    follower.current = controller;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { controller.follow(); timer = setTimeout(tick, live.current.room.connection?.clock.params.check ?? 350); };
    tick();
    return () => { clearTimeout(timer); controller.dispose(); follower.current = null; };
  }, [player, modeReady, failure]);
  useEffect(() => {
    if (status.isLoaded && !status.isBuffering && !failure && !status.error) room.connection?.markLoaded(room.snapshot?.trackUrl ?? null);
    if (failure || status.error) room.connection?.blocked();
    changed({ position: status.currentTime, duration: status.duration, loaded: status.isLoaded,
      loading: !status.isLoaded || status.isBuffering, error: failure || status.error });
    if (status.didJustFinish && room.snapshot?.trackUrl && room.snapshot.isPlaying) {
      const id = `${room.snapshot.playbackInstanceId}:${room.snapshot.trackUrl}`;
      if (ended.current !== id) {
        ended.current = id;
        room.command('playback:ended', { trackUrl: room.snapshot.trackUrl, playbackInstanceId: room.snapshot.playbackInstanceId });
      }
    }
  }, [status, failure, changed, room]);
  // eslint-disable-next-line react-hooks/immutability -- Expo AudioPlayer is a mutable native shared object; volume is its documented setter.
  useEffect(() => { player.volume = volume; }, [player, volume]);
  useEffect(() => { follower.current?.follow(); }, [room.snapshot, room.state, room.stats, status.isLoaded, modeReady, active]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (status.isLoaded || failure || status.error) return;
    const timer = setTimeout(() => setFailure('Audio took too long to load. Check the connection and tap retry.'), 60_000);
    return () => clearTimeout(timer);
  }, [status.isLoaded, status.error, failure]);
  // Mobile background sync/notification transport requires a native scheduler; this first client uses foreground audio.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const unlock = () => { follower.current?.follow(true); };
    document.addEventListener('pointerdown', unlock, { once: true });
    return () => document.removeEventListener('pointerdown', unlock);
  }, []);
  return null;
}
export function useAudio() { const value = useContext(AudioContext); if (!value) throw new Error('AudioProvider is missing'); return value; }
