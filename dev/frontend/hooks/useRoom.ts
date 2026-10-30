"use client";

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAdaptiveSync, NetworkQuality } from './useAdaptiveSync';
import { useSyncController } from './useSyncController';
import { useSyncTelemetry } from './useSyncTelemetry';
import { getSocket } from '../lib/socket';
import { roomsApi, historyApi, RoomDetailsResponse, getDeviceId } from '../lib/api';
import { RoomSnapshot, PlaybackState, Participant, TrackQueueItem, DeviceSpatialState, PlaybackSchedulePayload, PlaybackPausePayload, type TrackActivity } from '../lib/types';
import { useAudio } from '../context/AudioContext';
import { useTrackPrefetcher, type PrefetchState } from './useTrackPrefetcher';
import { toast } from 'sonner';
import { getYoutubeTrackTitle } from '../lib/colorExtractor';
import { ytId } from '../lib/youtube';

import { isSameTrack } from '../lib/trackIdentity';
import { applyQueueUpdate, normalizeRoomSnapshot, type QueueUpdate } from '../lib/roomState';
import { resolvePlayableTrack } from '../lib/trackDownload';
import { updateTransferActivities, visibleTransferActivity } from '../lib/transferActivity';
import { estimateClockSample } from '../lib/syncClock';

interface UseRoomOptions {
  roomId:      string;
  displayName: string;
  userId?:     string;
  authLoading?: boolean;
}

interface UseRoomReturn {
  snapshot:     RoomSnapshot | null;
  participants: Participant[];
  isConnected:  boolean;
  joinStatus:   'joined' | 'pending' | 'denied' | 'connecting' | 'not_found';
  pendingRequests: { socketId: string, displayName: string, isNudge?: boolean, userId?: string }[];
  currentSocketId: string | null;
  clockOffset:  number;

  allReady:     boolean;      
  play:         () => void;
  pause:        () => void;
  seek:         (positionMs: number) => void;
  nextTrack:    () => void;
  prevTrack:    () => void;
  setReady:     (isReady: boolean) => void;
  setParticipantVolume: (targetSocketId: string, volume: number) => void;
  leave:        () => void;
  incomingTrack: TrackActivity | null;
  deviceSyncProgress: Record<string, number>;
  togglePrivate: (isPrivate: boolean) => void;
  approveJoin:  (targetSocketId: string, displayName: string) => void;
  denyJoin:     (targetSocketId: string) => void;
  notifyHost:   () => void;
  resetRoom:    () => void;
  removeFromQueue: (itemId: string) => void;
  syncInFlightRef: React.MutableRefObject<boolean>;
  hasClockSync: React.MutableRefObject<boolean>;
  /** Current network quality tier for this device — updates reactively */
  networkQuality: NetworkQuality;
  /** Smart next-track prefetch state */
  prefetch: PrefetchState;
  /** True only during a reconnect when we already have a snapshot — use for a subtle banner, not a full-screen loader */
  isReconnecting: boolean;
}

// NTP / drift parameters are now dynamically adjusted per-device by useAdaptiveSync.
// See hooks/useAdaptiveSync.ts for the tier table and EWMA blending logic.

export function useRoom({ roomId, displayName, userId, authLoading = false }: UseRoomOptions): UseRoomReturn {
  // ── Adaptive network-quality engine ──────────────────────────────────────
  // paramsRef holds the adaptive NTP/drift settings and updates after every burst.
  // networkQuality is a reactive string tier for UI display.

  const socket = getSocket();
  const { paramsRef, networkQuality, reportBurst } = useAdaptiveSync(socket);
  const audio  = useAudio();

  // ── SyncController — single authority for playback + drift correction ──
  const syncRef = useSyncController();
  const sync = syncRef.current;

  const [snapshot,     setSnapshotState]     = useState<RoomSnapshot | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isConnected,  setIsConnected]  = useState(() => socket.connected);
  const [joinStatus,   setJoinStatus]   = useState<'joined' | 'pending' | 'denied' | 'connecting' | 'not_found'>('connecting');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<{ socketId: string, displayName: string, isNudge?: boolean, userId?: string }[]>([]);
  const [currentSocketId, setCurrentSocketId] = useState<string | null>(() => socket.id ?? null);
  const [clockOffset,  setClockOffset]  = useState(0);
  const allReady = participants.length > 0 && participants.every(p => p.isReady || p.isBlocked);
  const [incomingTrack, setIncomingTrack] = useState<TrackActivity | null>(null);
  const incomingActivities = useRef(new Map<string, TrackActivity>());
  const publishIncoming = useCallback((activity: TrackActivity) => {
    incomingActivities.current = updateTransferActivities(incomingActivities.current, activity);
    setIncomingTrack(visibleTransferActivity(incomingActivities.current));
  }, []);
  const clearIncoming = useCallback(() => {
    incomingActivities.current.clear();
    setIncomingTrack(null);
  }, []);
  const [deviceSyncProgress, setDeviceSyncProgress] = useState<Record<string, number>>({}); 

  const audioRef = useRef(audio);
  useEffect(() => { audioRef.current = audio; }, [audio]);

  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const clockOffsetRef = useRef(clockOffset);

  const connectionGenerationRef = useRef(0);
  const joinedRef = useRef(false);
  const receivedSnapshotRef = useRef(false);
  const ntpPromiseRef = useRef<Promise<void> | null>(null);
  const lazyLoadRef = useRef<{ key: string; controller: AbortController } | null>(null);
  const pauseOnRejoinRef = useRef(false);
  const lastCompletionRef = useRef<{ trackUrl: string; playbackInstanceId?: string | null } | null>(null);
  const setSnapshot = useCallback((update: React.SetStateAction<RoomSnapshot | null>) => {
    const next = typeof update === 'function' ? update(snapshotRef.current) : update;
    snapshotRef.current = next;
    setSnapshotState(next);
  }, []);
  useEffect(() => { clockOffsetRef.current = clockOffset; }, [clockOffset]);

  // Bind SyncController to the audio system + refs (runs once)
  const lastBurstRttsRef = useRef<number[]>([]);

  useEffect(() => {
    sync.bind(audioRef, clockOffsetRef, paramsRef, hasClockSync);
    sync.updateRoom({ roomId });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- bind once
  }, []);

  // ── ML telemetry — silent, best-effort, runs on idle callbacks ────────────
  useSyncTelemetry({
    syncRef,
    clockOffsetRef,
    snapshot,
    networkQuality,
    roomId,
    userId,
    sessionId: currentSocketId ?? 'unknown',
    lastBurstRttsRef,
  });

  const seqRef = useRef(0);
  const syncInFlightRef = useRef(false);
  const hasClockSync = useRef(false);
  const reportedBlockedRef = useRef<boolean | null>(null);

  const setReady = useCallback((isReady: boolean) => {
    const snap = snapshotRef.current;
    if (!socket.connected || !joinedRef.current || !snap?.trackUrl) return;
    socket.emit('room:clientReady', {
      roomId, trackUrl: snap.trackUrl,
      isReady: isReady && audioRef.current.isReadyForTrack(snap.trackUrl),
    });
  }, [socket, roomId]);

  const getTrackTitle = useCallback((trackUrl: string | null | undefined, queue: TrackQueueItem[] = []) => {
    if (trackUrl) {
      const playingId = ytId(trackUrl);
      const match = queue.find((item) => {
        if (item.trackUrl === trackUrl) return true;
        const itemId = ytId(item.trackUrl);
        return playingId !== null && itemId !== null && playingId === itemId;
      });

      if (match?.title && !match.title.startsWith('youtube:') && match.title !== 'Track') {
        return match.title;
      }

      if (playingId) {
        const fetchedTitle = getYoutubeTrackTitle(playingId);
        if (fetchedTitle) return fetchedTitle;
        return playingId;
      }
    }

    const currentQueueItem = queue.find((item) => item.isCurrent);
    if (currentQueueItem?.title && !currentQueueItem.title.startsWith('youtube:') && currentQueueItem.title !== 'Track') {
      return currentQueueItem.title;
    }

    if (!trackUrl) return "Unknown Track";
    const clean = trackUrl.replace(/^(?:youtube:|ws-p2p:yt:)/, '');
    const fileName = clean.split('/').pop() ?? '';
    const rawId = fileName.split('?')[0].replace(/\.[^.]+$/, '');
    const id = ytId(rawId);
    if (id) {
      const fetchedTitle = getYoutubeTrackTitle(id);
      if (fetchedTitle) return fetchedTitle;
      return id;
    }
    const formatted = rawId.replace(/^\d+_/, '').replace(/_/g, ' ');
    if (formatted && !formatted.startsWith('youtube:')) return formatted;
    return "SyncBeats Track";
  }, []);

  const loadAndSetTrack = useCallback((trackUrl: string | null | undefined, title: string, artist = '') => {
    if (!trackUrl) {
      if (lazyLoadRef.current) incomingActivities.current.delete('resolve:' + lazyLoadRef.current.key);
      lazyLoadRef.current?.controller.abort();
      lazyLoadRef.current = null;
      setIncomingTrack(visibleTransferActivity(incomingActivities.current));
      audioRef.current.clearTrack();
      return;
    }
    if (trackUrl.startsWith('spotify-lazy:')) {
      const item = snapshotRef.current?.queue.find(track => track.trackUrl === trackUrl);
      if (!item || lazyLoadRef.current?.key === item.id) return;
      lazyLoadRef.current?.controller.abort();
      const controller = new AbortController();
      lazyLoadRef.current = { key: item.id, controller };
      audioRef.current.clearTrack();
      const operation: TrackActivity = { id: 'resolve:' + item.id, roomId, title, trackUrl, status: 'active', progress: 0, indeterminate: true };
      publishIncoming(operation);
      void resolvePlayableTrack(item, roomId, controller.signal).then(() => {
        if (!controller.signal.aborted) publishIncoming({ ...operation, status: 'complete', progress: 100 });
        if (!controller.signal.aborted && socket.connected && joinedRef.current) socket.emit('room:resync', { roomId });
      }).catch(error => {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : 'Could not prepare this track';
          publishIncoming({ ...operation, status: 'failed', error: message });
          toast.error(message);
        }
      }).finally(() => {
        if (lazyLoadRef.current?.controller === controller) {
          lazyLoadRef.current = null;
        }
      });
      return;
    }
    if (lazyLoadRef.current) {
      lazyLoadRef.current.controller.abort();
      incomingActivities.current.delete('resolve:' + lazyLoadRef.current.key);
      lazyLoadRef.current = null;
      setIncomingTrack(visibleTransferActivity(incomingActivities.current));
    }
    audioRef.current.setTrack(trackUrl, title, artist);
  }, [roomId, socket, publishIncoming]);

  const applyRoomDetails = useCallback((details: RoomDetailsResponse) => {
    let snap: RoomSnapshot | null = null;
    let parts: Participant[] = [];

    if (details.live) {
      const parsedLiveCreated = details.live.createdAt ? (typeof details.live.createdAt === 'number' ? details.live.createdAt : new Date(details.live.createdAt).getTime()) : undefined;
      const liveCreatedMs = parsedLiveCreated ?? (details.db?.created_at ? new Date(details.db.created_at).getTime() : undefined);
      const fallbackDurationMs = typeof liveCreatedMs === 'number' ? Math.max(0, Date.now() - liveCreatedMs) : undefined;
      const durationMs = details.live.sessionDurationMs ?? fallbackDurationMs;

      snap = {
        roomId:       details.live.roomId,
        trackUrl:     details.live.trackUrl,
        position:     details.live.position,
        state:        details.live.state as PlaybackState,
        startEpoch:   details.live.startEpoch ?? null,
        pauseOffset:  details.live.pauseOffset ?? 0,
        isPlaying:    details.live.isPlaying ?? (details.live.startEpoch != null && details.live.state === 'PLAYING'),
        pendingPlay:  details.live.pendingPlay ?? false,
        hostId:       details.live.hostId,
        timestamp:    details.live.timestamp,
        createdAt:    liveCreatedMs,
        sessionDurationMs: durationMs,
        accumulatedSessionTime: details.live.accumulatedSessionTime ?? (durationMs ? Math.floor(durationMs / 1000) : undefined),
        participants: details.live.participants as Participant[],
        queue:        details.live.queue as TrackQueueItem[],
        spatial:      (details.live.spatial as DeviceSpatialState[]) || [],
        isPrivate:    details.live.isPrivate,
        shuffle:      details.live.shuffle ?? false,
        repeatMode:   details.live.repeatMode ?? 'off',
      };
      parts = details.live.participants as Participant[];
    } else if (details.db) {
      const dbCreatedMs = details.db.created_at ? new Date(details.db.created_at).getTime() : Date.now();
      const durationMs = Math.max(0, Date.now() - dbCreatedMs);
      snap = {
        roomId,
        trackUrl:     details.db.track_url,
        position:     details.db.position_ms,
        state:        PlaybackState.PAUSED,
        startEpoch:   null,
        pauseOffset:  Math.max(0, details.db.position_ms / 1000),
        isPlaying:    false,
        pendingPlay:  false,
        hostId:       details.db.host_id,
        timestamp:    Date.now(),
        createdAt:    dbCreatedMs,
        sessionDurationMs: durationMs,
        accumulatedSessionTime: Math.floor(durationMs / 1000),
        participants: details.participants.map(p => ({ ...p, isReady: false })),
        queue:        details.queue as TrackQueueItem[],
        spatial:      [],
        isPrivate:    details.db.is_private,
        shuffle:      details.db.shuffle ?? false,
        repeatMode:   (details.db.repeat_mode as "off" | "track" | "all") ?? 'off',
      };
      parts = details.participants.map(p => ({ ...p, isReady: false }));
    }

    if (snap) {
      setSnapshot(snap);
      setParticipants(parts);
      const currentParticipant = parts.find(p => p.socketId === socket.id);
      if (currentParticipant) audioRef.current.setVolume(currentParticipant.volume);

      if (snap.trackUrl) {
        loadAndSetTrack(snap.trackUrl, getTrackTitle(snap.trackUrl, snap.queue));
      }
    }
  }, [roomId, socket, getTrackTitle, loadAndSetTrack, setSnapshot]);

  const pingOnce = useCallback((seq: number) => new Promise<{ t0: number; t1: number; t2: number; t3: number; elapsedMs: number }>((resolve) => {
    const t0 = Date.now();
    const perf0 = performance.now();
    const timeout = window.setTimeout(() => {
      socket.off('sync:pong', onPong);
      const elapsedMs = performance.now() - perf0;
      resolve({ t0, t1: Number.NaN, t2: Number.NaN, t3: t0 + elapsedMs, elapsedMs });
    }, 1000);

    const onPong = ({ t1, t2, seq: pongSeq }: { t1: number; t2: number; seq?: number }) => {
      if (pongSeq !== seq) return;
      window.clearTimeout(timeout);
      socket.off('sync:pong', onPong);
      // Reconstruct receive wall-time from monotonic elapsed time. This keeps
      // OS clock corrections during an in-flight ping out of the offset math.
      const elapsedMs = performance.now() - perf0;
      resolve({ t0, t1, t2, t3: t0 + elapsedMs, elapsedMs });
    };

    socket.on('sync:pong', onPong);
    socket.emit('sync:ping', { t0, seq });
  }), [socket]);

  const runNtpBurst = useCallback((): Promise<void> => {
    if (!socket.connected) return Promise.resolve();
    if (ntpPromiseRef.current) return ntpPromiseRef.current;
    const generation = connectionGenerationRef.current;
    syncInFlightRef.current = true;
    const work = (async () => {

    // Read adaptive params snapshot for this burst
    const p = paramsRef.current; // paramsRef is a stable ref — no dep needed
    const offsetSamples: { offset: number; rtt: number }[] = [];
    const rttSamples:    number[] = []; // ALL rtts (including rejected) for quality classification

    for (let i = 0; i < p.NTP_SAMPLE_COUNT; i++) {
      const seq = ++seqRef.current;
      const { t0, t1, t2, t3, elapsedMs } = await pingOnce(seq);
      if (generation !== connectionGenerationRef.current || !socket.connected) return;
      const sample = estimateClockSample({ t0, t1, t2, t3 });
      const validServerSample = Number.isFinite(t1) && Number.isFinite(t2) && Number.isFinite(sample.rttMs) && sample.rttMs >= 0;
      const rtt = validServerSample ? sample.rttMs : elapsedMs;
      rttSamples.push(rtt); // always collect, even noisy ones
      if (validServerSample && rtt <= p.NTP_RTT_GATE_MS) {
        offsetSamples.push({ offset: sample.offsetMs, rtt });
      }
      await new Promise(r => setTimeout(r, p.NTP_PING_GAP_MS));
    }

    if (generation !== connectionGenerationRef.current || !socket.connected) return;
    if (offsetSamples.length > 0) {
      // Sort by RTT ascending to select samples with minimum network delay/asymmetry
      const sortedByRtt = [...offsetSamples].sort((a, b) => a.rtt - b.rtt);

      // IQR outlier rejection: discard samples where RTT > Q3 + 1.5×IQR
      // This strips GC pause spikes and Wi-Fi jitter outliers from the offset estimation
      const rtts = sortedByRtt.map(s => s.rtt);
      const q1Rtt = rtts[Math.floor(rtts.length * 0.25)];
      const q3Rtt = rtts[Math.floor(rtts.length * 0.75)];
      const iqrRtt = q3Rtt - q1Rtt;
      const rttFence = q3Rtt + 1.5 * iqrRtt;
      const cleanSamples = sortedByRtt.filter(s => s.rtt <= rttFence);

      // Select top 35% lowest latency samples from the clean set
      const bestSamples = cleanSamples.slice(0, Math.max(1, Math.ceil(cleanSamples.length * 0.35)));
      const bestOffsets = bestSamples.map(s => s.offset).sort((a, b) => a - b);
      const median = bestOffsets[Math.floor(bestOffsets.length / 2)];

      // EWMA blend to smooth network jitter. If we already have a sync, 
      // blend the new measurement (20% new, 80% old) unless it's a massive shift (>100ms).
      if (hasClockSync.current) {
        const diff = Math.abs(median - clockOffsetRef.current);
        const alpha = diff > 100 ? 0.8 : 0.2; 
        const blended = clockOffsetRef.current * (1 - alpha) + median * alpha;
        clockOffsetRef.current = blended;
        setClockOffset(blended);
      } else {
        clockOffsetRef.current = median;
        setClockOffset(median);
        hasClockSync.current = true;
      }
    }

    // Feed raw RTTs into the adaptive engine — updates params and reports stats to server
    reportBurst(rttSamples, roomId);
    // Also store them for ML telemetry batching
    lastBurstRttsRef.current = rttSamples.slice();

    sync.resetClockBaseline();
    })().finally(() => {
      if (ntpPromiseRef.current === work) {
        ntpPromiseRef.current = null;
        syncInFlightRef.current = false;
      }
    });
    ntpPromiseRef.current = work;
    return work;
  }, [pingOnce, reportBurst, roomId, socket, sync]); // paramsRef is a stable ref, not listed

  // NTP resync — self-scheduling so the interval dynamically follows paramsRef.
  // Each burst schedules the next one after it finishes, reading the current
  // adaptive resync delay at that point in time.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const scheduleNext = () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      // Read delay fresh from adaptive params at scheduling time
      timer = window.setTimeout(async () => {
        timer = undefined;
        if (!cancelled) {
          await runNtpBurst();
          scheduleNext();
        }
      }, paramsRef.current.NTP_RESYNC_INTERVAL_MS);
    };

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') {
        if (timer !== undefined) window.clearTimeout(timer);
        timer = undefined;
        return;
      }
      if (joinedRef.current && socket.connected) {
        void runNtpBurst().finally(scheduleNext);
      } else {
        scheduleNext();
      }
    };

    scheduleNext();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [runNtpBurst, socket]); // paramsRef is a stable ref, safe to omit

  // ── Drift correction — now fully delegated to SyncController ──────────────
  // Keep pitch fixed at 1.0; use a short crossfade for larger drift. A low-rate
  // timer avoids waking mobile browsers 20 times per second for tiny errors.
  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;
    const tick = () => {
      timer = undefined;
      if (cancelled || document.visibilityState !== 'visible') return;
      sync.correctDrift();
      timer = window.setTimeout(tick, Math.max(250, paramsRef.current.DRIFT_CHECK_INTERVAL_MS));
    };
    const onVisibility = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      if (document.visibilityState === 'visible') {
        sync.correctDrift();
        timer = window.setTimeout(tick, Math.max(250, paramsRef.current.DRIFT_CHECK_INTERVAL_MS));
      }
    };
    if (document.visibilityState === 'visible') {
      timer = window.setTimeout(tick, Math.max(250, paramsRef.current.DRIFT_CHECK_INTERVAL_MS));
    }
    document.addEventListener('visibilitychange', onVisibility);

    const handleYtBufferEnd = () => {
      setTimeout(() => {
        if (document.visibilityState === 'visible') sync.correctDrift();
      }, 200);
    };
    document.addEventListener('ytBufferEnd', handleYtBufferEnd);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('ytBufferEnd', handleYtBufferEnd);
    };
  }, [sync, paramsRef]);

  useEffect(() => {
    receivedSnapshotRef.current = false;
    joinedRef.current = false;
    hasClockSync.current = false;
    setSnapshot(null);
    clearIncoming();
    setDeviceSyncProgress({});
    lastCompletionRef.current = null;
    sync.updateRoom({ roomId });
    return () => {
      connectionGenerationRef.current++;
      joinedRef.current = false;
      lazyLoadRef.current?.controller.abort();
      lazyLoadRef.current = null;
      sync.idle();
      audioRef.current.clearTrack();
    };
  }, [roomId, setSnapshot, sync, clearIncoming]);

  useEffect(() => {
    let cancelled = false;

    const handleConnect = () => {
      connectionGenerationRef.current++;
      ntpPromiseRef.current = null;
      joinedRef.current = false;
      hasClockSync.current = false;
      setIsConnected(true);
      setCurrentSocketId(socket.id ?? null);
      // If we already have a snapshot (we've been in this room before), this is a
      // RECONNECT not a first join. Keep joinStatus as-is and use isReconnecting
      // so the room UI stays visible with only a subtle banner shown.
      if (snapshotRef.current) {
        setIsReconnecting(true);
      } else {
        setJoinStatus('connecting');
      }
      socket.emit('room:join', { 
        roomId, 
        displayName, 
        userId,
        deviceId: getDeviceId(),
        isReady: false // readiness is re-declared for the accepted snapshot's track
      });
      runNtpBurst();
    };

    const handleDisconnect = () => {
      connectionGenerationRef.current++;
      ntpPromiseRef.current = null;
      joinedRef.current = false;
      hasClockSync.current = false;
      setIsConnected(false);
      setIsReconnecting(!!snapshotRef.current);
      audioRef.current.cancelPendingStart();
      // Cached audio can continue; shared commands are gated until the room is rejoined.
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    const applySnapshot = (snap: RoomSnapshot, isJoin = false) => {
      if (cancelled || snap.roomId !== roomId) return;
      const previous = snapshotRef.current;
      if (!isJoin && !joinedRef.current) return;
      if (!isJoin && previous?.roomInstanceId && snap.roomInstanceId && previous.roomInstanceId !== snap.roomInstanceId) return;
      if (!isJoin && previous?.queueVersion != null && snap.queueVersion != null && snap.queueVersion < previous.queueVersion) return;
      const trackChanged = !isSameTrack(previous?.trackUrl, snap.trackUrl);
      if (isJoin) {
        receivedSnapshotRef.current = true;
        joinedRef.current = true;
        setJoinStatus('joined');
        setIsReconnecting(false);
      }
      setSnapshot(snap);
      setParticipants(snap.participants);
      const completion = lastCompletionRef.current;
      if (completion && (!isSameTrack(completion.trackUrl, snap.trackUrl) || completion.playbackInstanceId !== snap.playbackInstanceId || !snap.isPlaying)) {
        lastCompletionRef.current = null;
      } else if (isJoin && completion?.playbackInstanceId && !pauseOnRejoinRef.current) {
        // A cached source may finish during transport loss. Report it only after
        // the server confirms that this exact instance is still current.
        socket.emit('playback:ended', { roomId, ...completion });
      }
      setDeviceSyncProgress(progress => trackChanged ? {} : Object.fromEntries(
        snap.participants.filter(p => p.socketId in progress).map(p => [p.socketId, p.isReady || p.isBlocked ? 100 : progress[p.socketId]])
      ));
      const item = snap.queue.find(track => track.isCurrent || isSameTrack(track.trackUrl, snap.trackUrl));
      loadAndSetTrack(snap.trackUrl, item?.title || getTrackTitle(snap.trackUrl, snap.queue), item?.artist || '');
      const before = sync.getGen();
      if (pauseOnRejoinRef.current && snap.isPlaying) {
        sync.pause(audioRef.current.getTruePosition());
        if (isJoin) socket.emit('playback:pause', { roomId });
      } else {
        pauseOnRejoinRef.current = false;
        sync.reconcile(snap);
      }
      const myParticipant = snap.participants.find(p => p.socketId === socket.id);
      if (snap.trackUrl && !myParticipant?.isReady && audioRef.current.isReadyForTrack(snap.trackUrl)) setReady(true);
      if (snap.isPlaying && snap.startEpoch != null && !pauseOnRejoinRef.current && (isJoin || before !== sync.getGen())) {
        const gen = sync.getGen();
        const connection = connectionGenerationRef.current;
        const applyCurrentSchedule = () => {
          if (cancelled || !joinedRef.current || !hasClockSync.current || connection !== connectionGenerationRef.current) return;
          sync.applyScheduleIfCurrent(gen, {
            roomId, roomInstanceId: snap.roomInstanceId,
            playbackInstanceId: snap.playbackInstanceId,
            startEpoch: snap.startEpoch!, fromPosition: snap.pauseOffset ?? 0,
            atEpoch: snap.startEpoch! + (snap.pauseOffset ?? 0) * 1000,
            trackUrl: snap.trackUrl || undefined,
          }, clockOffsetRef.current);
        };
        if (hasClockSync.current) {
          // Do not make a live playback event wait behind a new ping burst.
          // The existing offset is enough to schedule against the epoch; a
          // background burst then refines it and drift recovery corrects error.
          applyCurrentSchedule();
          void runNtpBurst().then(() => sync.correctDrift());
        } else {
          // On first join there is no measured offset yet, so wait for the
          // first burst before translating server epoch to the local clock.
          void runNtpBurst().then(applyCurrentSchedule);
        }
      }
      if (!isJoin && trackChanged && snap.trackUrl && previous?.isPlaying && userId) {
        historyApi.logListen(userId, {
          youtubeId: ytId(snap.trackUrl) || snap.trackUrl,
          title: item?.title || getTrackTitle(snap.trackUrl, snap.queue),
          artist: item?.artist || '', thumbnail: item?.thumbnail || item?.coverUrl || '',
        }).catch(() => {});
      }
    };

    const handleSnapshot = (raw: unknown) => {
      const snap = normalizeRoomSnapshot(raw, roomId);
      if (!snap) return;
      const firstJoin = !receivedSnapshotRef.current;
      applySnapshot(snap, true);
      if (firstJoin) window.dispatchEvent(new CustomEvent('syncbeats:welcome-burst'));
    };
    const handleStateChanged = (raw: unknown) => {
      const snap = normalizeRoomSnapshot(raw, roomId);
      if (snap) applySnapshot(snap);
    };
    socket.on('room:snapshot', handleSnapshot);
    socket.on('room:stateChanged', handleStateChanged);

    const refreshOnReturn = () => {
      if (document.visibilityState !== 'visible') return;
      sync.resetClockBaseline();
      if (!socket.connected) { socket.connect(); return; }
      if (joinedRef.current) {
        hasClockSync.current = false;
        socket.emit('room:resync', { roomId });
        void runNtpBurst().then(() => sync.correctDrift());
      }
    };
    document.addEventListener('visibilitychange', refreshOnReturn);
    window.addEventListener('pageshow', refreshOnReturn);
    window.addEventListener('online', refreshOnReturn);

    const handleParticipantJoined = (p: Participant) => {
      setParticipants(prev => {
        if (prev.find(x => x.socketId === p.socketId)) return prev;
        return [...prev, p];
      });

      // Notify room members via room-activity event (no emojis / no toast popup)
      if (p.socketId !== socket.id) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("syncbeats:room-activity", {
            detail: { type: "join", displayName: p.displayName }
          }));
          window.dispatchEvent(new CustomEvent("syncbeats:welcome-burst"));
        }
      }
    };
    socket.on('room:participantJoined', handleParticipantJoined);

    const handleParticipantLeft = (socketId: string) => {
      setParticipants(prev => {
        const leaving = prev.find(x => x.socketId === socketId);
        if (leaving && leaving.socketId !== socket.id) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("syncbeats:room-activity", {
              detail: { type: "leave", displayName: leaving.displayName }
            }));
          }
        }
        return prev.filter(x => x.socketId !== socketId);
      });
      // Clean up stale deviceSyncProgress for departed socket
      setDeviceSyncProgress(prev => {
        if (!(socketId in prev)) return prev;
        const copy = { ...prev };
        delete copy[socketId];
        return copy;
      });
      for (const activity of incomingActivities.current.values()) {
        if (activity.socketId === socketId && activity.status === 'active') publishIncoming({ ...activity, status: 'cancelled' });
      }
    };
    socket.on('room:participantLeft', handleParticipantLeft);

    const uploadExpiry = new Map<string, ReturnType<typeof setTimeout>>();
    const handleUploadProgress = ({ roomId: progressRoom, title, progress, status, operationId, socketId, trackUrl, indeterminate, error }: {
      roomId?: string; title: string; progress: number; status?: string; operationId?: string; socketId?: string;
      trackUrl?: string; indeterminate?: boolean; error?: string;
    }) => {
      if ((progressRoom && progressRoom !== roomId) || !Number.isFinite(progress)) return;
      if (socketId && !snapshotRef.current?.participants.some(p => p.socketId === socketId)) return;
      const id = `${socketId || 'legacy'}:${operationId || title}`;
      clearTimeout(uploadExpiry.get(id));
      uploadExpiry.delete(id);
      const activity: TrackActivity = { id, roomId, socketId, title, trackUrl, indeterminate, error,
        progress: Math.max(0, Math.min(100, progress)),
        status: status === 'failed' || status === 'cancelled' ? status : progress >= 100 || status === 'complete' ? 'complete' : 'active' };
      publishIncoming(activity);
      if (activity.status === 'active') {
        uploadExpiry.set(id, setTimeout(() => {
          uploadExpiry.delete(id);
          const latest = incomingActivities.current.get(id);
          if (latest?.status === 'active') publishIncoming({ ...latest, status: 'failed', error: 'The transfer stopped. Try adding the track again.' });
        }, 120_000));
      }
    };
    socket.on('room:upload_progress', handleUploadProgress);

    const handleSyncProgress = ({ roomId: progressRoom, socketId, progress, trackUrl }: {
      roomId?: string; socketId: string; progress: number; trackUrl?: string;
    }) => {
      if ((progressRoom && progressRoom !== roomId) || !Number.isFinite(progress)) return;
      if (trackUrl && !isSameTrack(trackUrl, snapshotRef.current?.trackUrl)) return;
      const participant = snapshotRef.current?.participants.find(p => p.socketId === socketId);
      if (!participant) return;
      if (participant.isReady || participant.isBlocked) progress = 100;
      setDeviceSyncProgress(prev => ({ ...prev, [socketId]: Math.max(0, Math.min(100, progress)) }));
    };
    socket.on('room:sync_progress', handleSyncProgress);
    socket.on('room:deviceSyncProgress', handleSyncProgress);

    const handleTitleResolved = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.ytId && detail?.title && audioRef.current.trackUrl) {
        if (audioRef.current.trackUrl.includes(detail.ytId)) {
          loadAndSetTrack(audioRef.current.trackUrl, detail.title);
        }
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("syncbeats:title-resolved", handleTitleResolved);
    }

    const handleTrackSet = ({ roomId: eventRoom, trackUrl, title }: { roomId?: string; trackUrl: string; title: string }) => {
      if (eventRoom && eventRoom !== roomId) return;
      if (isSameTrack(snapshotRef.current?.trackUrl, trackUrl)) loadAndSetTrack(trackUrl, title);
    };
    socket.on('room:trackSet', handleTrackSet);

    const handleQueueChangedNew = (update: QueueUpdate) => {
      if (joinedRef.current) setSnapshot(prev => applyQueueUpdate(prev, update));
    };
    socket.on('room:queueChanged', handleQueueChangedNew);

    const validPlaybackEvent = (payload: { roomId?: string; roomInstanceId?: string }) =>
      joinedRef.current && (!payload.roomId || payload.roomId === roomId) &&
      (!payload.roomInstanceId || !snapshotRef.current?.roomInstanceId || payload.roomInstanceId === snapshotRef.current.roomInstanceId);
    const handleSchedule = (payload: PlaybackSchedulePayload) => {
      const current = snapshotRef.current;
      if (!current || !validPlaybackEvent(payload) || !Number.isFinite(payload.startEpoch)) return;
      applySnapshot({
        ...current, startEpoch: payload.startEpoch, pauseOffset: payload.fromPosition,
        playbackInstanceId: payload.playbackInstanceId ?? null,
        isPlaying: true, state: PlaybackState.PLAYING, pendingPlay: false,
        trackUrl: payload.trackUrl ?? current.trackUrl,
      });
    };
    socket.on('playback:schedule', handleSchedule);

    const handlePause = (payload: PlaybackPausePayload) => {
      const current = snapshotRef.current;
      if (!current || !validPlaybackEvent(payload)) return;
      applySnapshot({ ...current, startEpoch: null, pauseOffset: payload.pauseOffset,
        playbackInstanceId: null, isPlaying: false, pendingPlay: false, state: PlaybackState.PAUSED });
    };
    socket.on('playback:pause', handlePause);

    const handlePendingApproval = () => setJoinStatus('pending');
    socket.on('room:joinPendingApproval', handlePendingApproval);

    const handleJoinApproved = () => setJoinStatus('joined');
    socket.on('room:joinApproved', handleJoinApproved);

    const handleJoinDenied = () => setJoinStatus('denied');
    socket.on('room:joinDenied', handleJoinDenied);

    const handleRoomNotFound = () => setJoinStatus('not_found');
    socket.on('room:notFound', handleRoomNotFound);

    const handleRoomKicked = ({ reason }: { reason?: string } = {}) => {
      console.warn('[Room] Kicked from room:', reason);
      joinedRef.current = false;
      socket.disconnect();
      setJoinStatus('denied');
      toast.error(reason || 'Session displaced by another tab on this device');
    };
    socket.on('room:kicked', handleRoomKicked);

    const handleHostJoinRequest = ({ socketId, userId, displayName, isNudge }: any) => {
      setPendingRequests(prev => {
        const existing = prev.find(r => (userId && r.userId === userId) || r.socketId === socketId);
        if (existing) {
          if (isNudge || existing.socketId !== socketId) {
            return [
              { ...existing, socketId, isNudge: isNudge || existing.isNudge },
              ...prev.filter(r => (userId && r.userId !== userId) && r.socketId !== socketId)
            ];
          }
          return prev;
        }
        return [...prev, { socketId, userId, displayName, isNudge }];
      });
    };
    socket.on('room:hostJoinRequest', handleHostJoinRequest);

    const handleJoinRequestResolved = ({ targetSocketId }: { targetSocketId: string }) => {
      setPendingRequests(prev => prev.filter(r => r.socketId !== targetSocketId));
    };
    socket.on('room:joinRequestResolved', handleJoinRequestResolved);

    const handleHostChanged = (newHostId: string | null) => {
      setSnapshot(prev => prev ? { ...prev, hostId: newHostId } : prev);
    };
    socket.on('room:hostChanged', handleHostChanged);

    const handleRoomReset = () => {
      sync.idle();
      audioRef.current.clearTrack();
      setSnapshot(prev => prev ? { ...prev, trackUrl: null, queue: [], isPlaying: false, state: PlaybackState.IDLE, startEpoch: null, pauseOffset: 0 } : prev);
      clearIncoming();
      setDeviceSyncProgress({});
    };
    socket.on('room:reset', handleRoomReset);

    const handleDevicePing = ({ message }: { message: string, from: string }) => {
      if (typeof window !== 'undefined') {
        toast.info(message);
      }
    };
    socket.on('device:ping', handleDevicePing);

    const handleEqUpdate = ({ gains }: { gains: number[] }) => {
      if (gains && Array.isArray(gains) && audioRef.current?.setAllEqBands) {
        audioRef.current.setAllEqBands(gains);
      }
    };
    socket.on('room:eqUpdate', handleEqUpdate);

    const handleError = ({ message }: { message: string }) => console.warn('[syncbeats]', message);
    socket.on('error', handleError);

    if (!authLoading) {
      if (socket.connected) handleConnect();
      else socket.connect();
    }
    const bootstrapGeneration = connectionGenerationRef.current;
    roomsApi.get(roomId).then(details => {
      if (!cancelled && !receivedSnapshotRef.current && bootstrapGeneration === connectionGenerationRef.current && !snapshotRef.current) applyRoomDetails(details);
    }).catch(() => {});

    // Note: NTP resync is owned by the dedicated self-scheduling useEffect above.
    // No duplicate interval here.

    return () => {
      cancelled = true;
      joinedRef.current = false;
      connectionGenerationRef.current++;
      if (socket.connected) socket.emit('room:leave', { roomId });
      for (const timer of uploadExpiry.values()) clearTimeout(timer);
      document.removeEventListener('visibilitychange', refreshOnReturn);
      window.removeEventListener('pageshow', refreshOnReturn);
      window.removeEventListener('online', refreshOnReturn);
      window.removeEventListener('syncbeats:title-resolved', handleTitleResolved);
      socket.off('room:upload_progress', handleUploadProgress);
      socket.off('room:sync_progress', handleSyncProgress);
      socket.off('room:deviceSyncProgress', handleSyncProgress);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('room:snapshot', handleSnapshot);
      socket.off('room:stateChanged', handleStateChanged);
      socket.off('room:participantJoined', handleParticipantJoined);
      socket.off('room:participantLeft', handleParticipantLeft);
      socket.off('room:trackSet', handleTrackSet);
      socket.off('room:reset', handleRoomReset);
      socket.off('playback:schedule', handleSchedule);
      socket.off('playback:pause', handlePause);
      socket.off('room:joinPendingApproval', handlePendingApproval);
      socket.off('room:joinApproved', handleJoinApproved);
      socket.off('room:joinDenied', handleJoinDenied);
      socket.off('room:notFound', handleRoomNotFound);
      socket.off('room:kicked', handleRoomKicked);
      socket.off('room:hostJoinRequest', handleHostJoinRequest);
      socket.off('room:joinRequestResolved', handleJoinRequestResolved);
      socket.off('room:hostChanged', handleHostChanged);
      socket.off('device:ping', handleDevicePing);
      socket.off('room:eqUpdate', handleEqUpdate);
      socket.off('error', handleError);
      socket.off('room:queueChanged', handleQueueChangedNew);
    };
  }, [applyRoomDetails, roomId, displayName, userId, authLoading, socket, runNtpBurst, getTrackTitle, loadAndSetTrack, setReady, setSnapshot, sync]);

  useEffect(() => {
    const handleAudioEnded = (event: Event) => {
      const detail = (event as CustomEvent<{ trackUrl?: string; playbackInstanceId?: string | null }>).detail;
      if (!detail?.trackUrl || !sync.complete(detail.trackUrl, detail.playbackInstanceId)) return;
      lastCompletionRef.current = { trackUrl: detail.trackUrl, playbackInstanceId: detail.playbackInstanceId };
      if (socket.connected && joinedRef.current) {
        socket.emit('playback:ended', { roomId, trackUrl: detail.trackUrl, playbackInstanceId: detail.playbackInstanceId ?? undefined });
      }
    };
    document.addEventListener('audioEnded', handleAudioEnded);
    return () => document.removeEventListener('audioEnded', handleAudioEnded);
  }, [roomId, socket, sync]);

  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (!socket.connected || !joinedRef.current) return;
      const snap = snapshotRef.current;
      if (!snap || !snap.trackUrl) {
        if (reportedBlockedRef.current !== false) {
          reportedBlockedRef.current = false;
          socket.emit('playback:blocked', { roomId, blocked: false });
        }
        return;
      }

      const nowServer = Date.now() + clockOffsetRef.current;
      const isPastStart = snap.startEpoch == null || nowServer >= snap.startEpoch;
      const shouldBePlaying = snap.isPlaying && isPastStart;

      // Local state is blocked if we should be playing but audio is not playing, or if we have a loading/playback error
      const isBlocked = !!(
        (shouldBePlaying && audioRef.current.isReady && !audioRef.current.isPlaying) ||
        audioRef.current.error
      );

      if (reportedBlockedRef.current !== isBlocked) {
        reportedBlockedRef.current = isBlocked;
        socket.emit('playback:blocked', { roomId, blocked: isBlocked });
      }
    }, 2000);

    return () => clearInterval(checkInterval);
  }, [roomId, socket]);

  // Sync local ready state with server if they differ (e.g. on repeat track)
  useEffect(() => {
    if (!isConnected || !currentSocketId) return;
    const me = participants.find(p => p.socketId === currentSocketId);
    if (!me) return;

    const localReady = audioRef.current.isReadyForTrack(snapshotRef.current?.trackUrl ?? null);
    if (me.isReady === false && localReady) {
      setReady(true);
    }
  }, [participants, isConnected, currentSocketId, setReady]);

  useEffect(() => {
    if (!currentSocketId || !snapshot) return;
    const me = snapshot.participants.find(p => p.socketId === currentSocketId);
    if (me) audioRef.current.setVolume(me.volume);
  }, [snapshot, currentSocketId]);

  // Smart track prefetcher
  const prefetch = useTrackPrefetcher({
    snapshot,
    currentTime: audio.currentTime,
    duration: audio.duration,
    isCurrentReady: audio.isReady,
    roomId,
  });

  useEffect(() => {
    const trackUrl = snapshotRef.current?.trackUrl;
    if (!trackUrl || !socket.connected || !joinedRef.current || !isSameTrack(trackUrl, audio.trackUrl)) return;
    socket.emit('room:sync_progress', { roomId, trackUrl, progress: audio.isReady ? 100 : audio.downloadProgress });
  }, [socket, roomId, audio.trackUrl, audio.isReady, audio.downloadProgress, isConnected, joinStatus]);

  const emitCommand = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    if (!socket.connected || !joinedRef.current) return;
    socket.emit(event, { roomId, ...payload });
  }, [roomId, socket]);
  const play = useCallback(() => {
    if (!socket.connected || !joinedRef.current) return;
    if (audioRef.current.error) audioRef.current.retryTrack();
    const snap = snapshotRef.current;
    if (snap?.trackUrl?.startsWith('spotify-lazy:')) loadAndSetTrack(snap.trackUrl, getTrackTitle(snap.trackUrl, snap.queue));
    emitCommand('playback:play');
  }, [socket, emitCommand, loadAndSetTrack, getTrackTitle]);
  const pause = useCallback(() => {
    if (!socket.connected || !joinedRef.current) {
      pauseOnRejoinRef.current = true;
      sync.pause(audioRef.current.getTruePosition());
      return;
    }
    emitCommand('playback:pause', { positionMs: Math.round(audioRef.current.getTruePosition() * 1000) });
  }, [socket, emitCommand, sync]);
  const seek = useCallback((position: number) => emitCommand('playback:seek', { position }), [emitCommand]);
  const nextTrack = useCallback(() => emitCommand('playback:next'), [emitCommand]);
  const prevTrack = useCallback(() => emitCommand('playback:prev'), [emitCommand]);

  useEffect(() => {
    audioRef.current.setRoomCommands({ play, pause, seek, next: nextTrack, previous: prevTrack });
    return () => audioRef.current.setRoomCommands(null);
  }, [play, pause, seek, nextTrack, prevTrack]);

  const setParticipantVolume = useCallback((targetSocketId: string, volume: number) =>
    emitCommand('room:setParticipantVolume', { targetSocketId, volume }), [emitCommand]);

  const togglePrivate = useCallback((isPrivate: boolean) => emitCommand('room:togglePrivate', { isPrivate }), [emitCommand]);
  const approveJoin = useCallback((targetSocketId: string, displayName: string) => {
    if (!socket.connected || !joinedRef.current) return;
    emitCommand('room:approveJoin', { targetSocketId, displayName });
    setPendingRequests(prev => prev.filter(r => r.socketId !== targetSocketId));
  }, [socket, emitCommand]);
  const denyJoin = useCallback((targetSocketId: string) => {
    if (!socket.connected || !joinedRef.current) return;
    emitCommand('room:denyJoin', { targetSocketId });
    setPendingRequests(prev => prev.filter(r => r.socketId !== targetSocketId));
  }, [socket, emitCommand]);
  const notifyHost = useCallback(() => {
    if (socket.connected) socket.emit('room:notifyHost', { roomId, displayName });
  }, [socket, roomId, displayName]);

  const leave = useCallback(() => {
    joinedRef.current = false;
    sync.idle();
    audioRef.current.clearTrack();
    if (socket.connected) socket.emit('room:leave', { roomId });
    socket.disconnect();
  }, [socket, roomId, sync]);

  // Socket only — the REST twins do the same mutation, and firing both produced
  // two broadcasts for one user action.
  const removeFromQueue = useCallback((itemId: string) => {
    emitCommand('room:removeFromQueue', { itemId });
  }, [emitCommand]);

  const resetRoom = useCallback(() => {
    emitCommand('room:reset');
  }, [emitCommand]);

  return { snapshot, participants, isConnected, joinStatus, isReconnecting, pendingRequests, currentSocketId, clockOffset, allReady, play, pause, seek, nextTrack, prevTrack, setReady, setParticipantVolume, leave, togglePrivate, approveJoin, denyJoin, notifyHost, resetRoom, removeFromQueue, syncInFlightRef, hasClockSync, incomingTrack, deviceSyncProgress, networkQuality, prefetch };
}
