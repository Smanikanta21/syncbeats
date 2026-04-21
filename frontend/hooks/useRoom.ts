"use client";
// hooks/useRoom.ts — Real-time room state, upload-aware, no host gate.

import { useEffect, useRef, useCallback, useState } from 'react';
import { getSocket }            from '../lib/socket';
import { roomsApi, RoomDetailsResponse } from '../lib/api';
import { RoomSnapshot, PlaybackState, Participant, TrackQueueItem, DeviceSpatialState } from '../lib/types';
import { useAudio }             from '../context/AudioContext';

interface UseRoomOptions {
  roomId:      string;
  displayName: string;
}

interface UseRoomReturn {
  snapshot:     RoomSnapshot | null;
  participants: Participant[];
  isConnected:  boolean;
  currentSocketId: string | null;
  clockOffset:  number;
  allReady:     boolean;      // all peers have buffered
  play:         () => void;
  pause:        () => void;
  seek:         (positionMs: number) => void;
  setReady:     (isReady: boolean) => void;
  setParticipantVolume: (targetSocketId: string, volume: number) => void;
  leave:        () => void;
}

const PING_INTERVAL_MS        = 2_000;  // ping every 2s for faster offset convergence
const NTP_WINDOW              = 8;      // keep 8 samples for a more stable median
const DRIFT_CHECK_INTERVAL_MS = 250;   // check drift every 250ms
const DRIFT_HARD_SEEK_MS      = 1_500; // hard-seek if drift > 1.5s
const DRIFT_DEADBAND_MS       = 45;    // ignore drift < 45ms (very hard to hear, but prevents rate-oscillation on 4G/WiFi)
const BURST_PING_COUNT        = 3;     // rapid pings on connect to warm up NTP fast
const BURST_PING_INTERVAL_MS  = 120;   // 120ms between burst pings

export function useRoom({ roomId, displayName }: UseRoomOptions): UseRoomReturn {
  const socket = getSocket();
  const audio  = useAudio();

  const [snapshot,     setSnapshot]     = useState<RoomSnapshot | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isConnected,  setIsConnected]  = useState(() => socket.connected);
  const [currentSocketId, setCurrentSocketId] = useState<string | null>(() => socket.id ?? null);
  const [clockOffset,  setClockOffset]  = useState(0);
  const [allReady,     setAllReady]     = useState(false);

  const audioRef = useRef(audio);
  useEffect(() => { audioRef.current = audio; }, [audio]);
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);
  const clockOffsetRef = useRef(clockOffset);
  useEffect(() => { clockOffsetRef.current = clockOffset; }, [clockOffset]);
  const hasClockSync = useRef(false); // true after first NTP pong
  const driftStreak  = useRef(0);     // consecutive checks with drift > deadband
  const driftIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentSocketIdRef = useRef<string | null>(currentSocketId);
  useEffect(() => { currentSocketIdRef.current = currentSocketId; }, [currentSocketId]);

  const offsetHistory = useRef<number[]>([]);

  const medianOffset = (history: number[]): number => {
    const sorted = [...history].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  const applyRoomDetails = useCallback((details: RoomDetailsResponse) => {
    if (details.live) {
      setSnapshot({
        roomId:       details.live.roomId,
        trackUrl:     details.live.trackUrl,
        position:     details.live.position,
        state:        details.live.state as PlaybackState,
        hostId:       details.live.hostId,
        timestamp:    details.live.timestamp,
        participants: details.live.participants as Participant[],
        queue:        details.live.queue as TrackQueueItem[],
        spatial:      (details.live.spatial as DeviceSpatialState[]) || [],
      });
      setParticipants(details.live.participants as Participant[]);
      const currentParticipant = details.live.participants.find(p => p.socketId === currentSocketIdRef.current);
      if (currentParticipant) audioRef.current.setVolume(currentParticipant.volume);

      // If room already has a track, load it immediately
      if (details.live.trackUrl) {
        audioRef.current.setTrack(details.live.trackUrl, details.live.trackUrl.split('/').pop() ?? 'Track');
      }
      return;
    }

    if (details.db?.track_url) {
      audioRef.current.setTrack(details.db.track_url, details.db.track_url.split('/').pop() ?? 'Track');
    }

    if (details.db) {
      setSnapshot({
        roomId,
        trackUrl:     details.db.track_url,
        position:     details.db.position_ms,
        state:        details.db.playback_state as PlaybackState,
        hostId:       details.db.host_id,
        timestamp:    Date.now(),
        participants: details.participants.map(p => ({ ...p, isReady: false })),
        queue:        details.queue as TrackQueueItem[],
        spatial:      [],
      });
      setParticipants(details.participants.map(p => ({ ...p, isReady: false })));
    }
  }, [roomId]);

  const sendPing = useCallback(() => socket.emit('sync:ping', { t0: Date.now() }), [socket]);

  // Fire BURST_PING_COUNT rapid pings on connect so NTP warms up in ~360ms
  // instead of waiting up to 2000ms for the first regular interval ping.
  const burstPing = useCallback(() => {
    for (let i = 0; i < BURST_PING_COUNT; i++) {
      setTimeout(() => socket.emit('sync:ping', { t0: Date.now() }), i * BURST_PING_INTERVAL_MS);
    }
  }, [socket]);

  const enforceAudioState = useCallback((snap: RoomSnapshot) => {
    const a = audioRef.current;

    // Don't correct until NTP has warmed up — avoids a wrong hard-seek on join.
    if (!hasClockSync.current) return;

    if (!snap.trackUrl) {
      if (a.hasTrack) a.setTrack('', '', '');
      a.pause();
      return;
    }

    const expectedPositionMs = snap.state === PlaybackState.PLAYING
      ? snap.position + (Date.now() - snap.timestamp) + clockOffsetRef.current
      : snap.position;

    const expectedSec = Math.max(0, expectedPositionMs / 1000);
    const actualSec   = a.currentTime;
    const signedDrift = (actualSec - expectedSec) * 1000; // +ve = ahead, -ve = behind
    const driftMs     = Math.abs(signedDrift);

    if (driftMs > DRIFT_HARD_SEEK_MS) {
      // Drift too large to recover — snap immediately.
      console.log(`[Sync] Hard seek: ${driftMs.toFixed(0)}ms drift`);
      a.seek(expectedSec);
      if (a.audioEl) a.audioEl.playbackRate = 1.0;
      driftStreak.current = 0;

    } else if (driftMs > DRIFT_DEADBAND_MS && a.audioEl && snap.state === PlaybackState.PLAYING) {
      // Only change rate after 2 consecutive drift observations (~500ms).
      // This prevents a single noisy NTP sample from causing an audible rate glitch.
      driftStreak.current++;
      if (driftStreak.current >= 3) {
        // Proportional rate: 25ms→2%, 100ms→3%, 500ms→7%, ≥800ms→10%
        const nudge = Math.min(0.10, 0.02 + (driftMs / 10000));
        const targetRate = signedDrift > 0 ? 1.0 - nudge : 1.0 + nudge;
        // Only write playbackRate if change is > 0.5% — avoids micro-oscillation artifacts
        if (Math.abs((a.audioEl.playbackRate ?? 1.0) - targetRate) > 0.005) {
          a.audioEl.playbackRate = targetRate;
        }
      }

    } else {
      // In deadband — reset streak and restore 1× rate
      driftStreak.current = 0;
      if (a.audioEl && a.audioEl.playbackRate !== 1.0) a.audioEl.playbackRate = 1.0;
    }

    if (snap.state === PlaybackState.PLAYING && !a.isPlaying) a.play();
    if (snap.state !== PlaybackState.PLAYING && a.isPlaying)  a.pause();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const joinRoom = () => {
      socket.emit('room:join', { roomId, displayName });
      // Burst pings to converge NTP offset in ~360ms instead of waiting 2s
      burstPing();
    };

    const handleConnect    = () => {
      setIsConnected(true);
      setCurrentSocketId(socket.id ?? null);
      joinRoom();
    };
    const handleDisconnect = () => setIsConnected(false);

    if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    socket.on('connect',    handleConnect);
    socket.on('disconnect', handleDisconnect);

    // ── Room state ──────────────────────────────────────────────────────
    const handleSnapshot = (snap: RoomSnapshot) => {
      snapshotRef.current = snap;
      setSnapshot(snap);
      setParticipants(snap.participants);
      enforceAudioState(snap);
    };
    socket.on('room:snapshot', handleSnapshot);

    const handleStateChanged = (snap: RoomSnapshot) => {
      snapshotRef.current = snap;
      setSnapshot(snap);
      setParticipants(snap.participants);
      enforceAudioState(snap);
    };
    socket.on('room:stateChanged', handleStateChanged);

    const handleParticipantJoined = (p: Participant) => {
      setParticipants(prev => prev.find(x => x.socketId === p.socketId) ? prev : [...prev, p]);
    };
    socket.on('room:participantJoined', handleParticipantJoined);

    const handleParticipantLeft = (socketId: string) => {
      setParticipants(prev => prev.filter(x => x.socketId !== socketId));
    };
    socket.on('room:participantLeft', handleParticipantLeft);

    // ── Track set by server after upload ────────────────────────────────
    const handleTrackSet = ({ trackUrl, title }: { trackUrl: string; title: string }) => {
      console.log('[Room] New track:', title, trackUrl);
      setAllReady(false);
      audioRef.current.setTrack(trackUrl, title);
    };
    socket.on('room:trackSet', handleTrackSet);

    const handleQueueChanged = ({ queue }: { queue: TrackQueueItem[] }) => {
      setSnapshot((prev) => prev ? { ...prev, queue } : prev);
    };
    socket.on('room:queueChanged', handleQueueChanged);

    // Also listen for direct queue sync from REST routes (reorder, delete)
    const handleQueueSynced = (queue: TrackQueueItem[]) => {
      setSnapshot((prev) => prev ? { ...prev, queue } : prev);
    };
    socket.on('room:queueSynced', handleQueueSynced);

    // ── All clients are buffered — play is now safe ──────────────────────
    const handleAllReady = () => {
      console.log('[Room] All devices ready ✓');
      setAllReady(true);
    };
    socket.on('room:allReady', handleAllReady);

    // ── NTP pong ────────────────────────────────────────────────────────
    const handlePong = ({ t0, t1, t2 }: { t0: number; t1: number; t2: number }) => {
      const t3     = Date.now();
      const offset = ((t1 - t0) + (t2 - t3)) / 2;
      offsetHistory.current.push(offset);
      if (offsetHistory.current.length > NTP_WINDOW) offsetHistory.current.shift();
      const computed = medianOffset(offsetHistory.current);
      setClockOffset(computed);
      // Mark clock as synced after first pong
      if (!hasClockSync.current) {
        hasClockSync.current = true;
        // Immediately run a sync check now that we have an offset
        const snap = snapshotRef.current;
        if (snap) enforceAudioState(snap);
      }
    };
    socket.on('sync:pong', handlePong);

    const handleError = ({ message }: { message: string }) => console.warn('[syncbeats]', message);
    socket.on('error', handleError);

    // Fetch initial room state
    void roomsApi.get(roomId)
      .then(details => {
        if (cancelled) return;
        applyRoomDetails(details);

        const initialSnap: RoomSnapshot | null = details.live
          ? {
              roomId: details.live.roomId,
              trackUrl: details.live.trackUrl,
              position: details.live.position,
              state: details.live.state as PlaybackState,
              hostId: details.live.hostId,
              timestamp: details.live.timestamp,
              participants: details.live.participants as Participant[],
              queue: details.live.queue as TrackQueueItem[],
              spatial: (details.live.spatial as DeviceSpatialState[]) || [],
            }
          : details.db
            ? {
                roomId,
                trackUrl: details.db.track_url,
                position: details.db.position_ms,
                state: details.db.playback_state as PlaybackState,
                hostId: details.db.host_id,
                timestamp: Date.now(),
                participants: details.participants.map(p => ({ ...p, isReady: false })),
                queue: details.queue as TrackQueueItem[],
                spatial: [],
              }
            : null;

        if (initialSnap) {
          snapshotRef.current = initialSnap;
          enforceAudioState(initialSnap);
        }
      })
      .catch(() => {});

    const pingInterval = setInterval(sendPing, PING_INTERVAL_MS);
    driftIntervalRef.current = setInterval(() => {
      const latestSnapshot = snapshotRef.current;
      if (!latestSnapshot) return;
      enforceAudioState(latestSnapshot);
    }, DRIFT_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pingInterval);
      if (driftIntervalRef.current) {
        clearInterval(driftIntervalRef.current);
        driftIntervalRef.current = null;
      }
      socket.emit('room:leave', { roomId });
      socket.off('connect',              handleConnect);
      socket.off('disconnect',           handleDisconnect);
      socket.off('room:snapshot',        handleSnapshot);
      socket.off('room:stateChanged',    handleStateChanged);
      socket.off('room:participantJoined', handleParticipantJoined);
      socket.off('room:participantLeft', handleParticipantLeft);
      socket.off('room:trackSet',        handleTrackSet);
      socket.off('room:queueChanged',    handleQueueChanged);
      socket.off('room:queueSynced',     handleQueueSynced);
      socket.off('room:allReady',        handleAllReady);
      socket.off('sync:pong',            handlePong);
      socket.off('error',                handleError);
    };
  }, [applyRoomDetails, roomId, displayName, socket, sendPing, burstPing, enforceAudioState]);

  useEffect(() => {
    const audioEl = audioRef.current.audioEl;
    if (!audioEl) return;

    const onEnded = () => {
      const currentTrackUrl = snapshotRef.current?.trackUrl;
      if (!roomId || !currentTrackUrl) return;
      socket.emit('playback:ended', { roomId, trackUrl: currentTrackUrl });
    };

    audioEl.addEventListener('ended', onEnded);
    return () => audioEl.removeEventListener('ended', onEnded);
  }, [roomId, socket]);

  useEffect(() => {
    if (!currentSocketId || !snapshot) return;
    const me = snapshot.participants.find(p => p.socketId === currentSocketId);
    if (me) audioRef.current.setVolume(me.volume);
  }, [snapshot, currentSocketId]);

  // Any participant can control playback — no isHost check
  const play  = useCallback(() => socket.emit('playback:play',  { roomId }), [socket, roomId]);
  const pause = useCallback(() => socket.emit('playback:pause', { roomId }), [socket, roomId]);
  const seek  = useCallback((p: number) => socket.emit('playback:seek', { roomId, position: p }), [socket, roomId]);

  const setParticipantVolume = useCallback((targetSocketId: string, volume: number) =>
    socket.emit('room:setParticipantVolume', { roomId, targetSocketId, volume }), [socket, roomId]);

  // Emit buffering readiness to server
  const setReady = useCallback((isReady: boolean) =>
    socket.emit('room:clientReady', { roomId, isReady }), [socket, roomId]);

  const leave = useCallback(() => {
    socket.emit('room:leave', { roomId });
    socket.disconnect();
  }, [socket, roomId]);

  return { snapshot, participants, isConnected, currentSocketId, clockOffset, allReady, play, pause, seek, setReady, setParticipantVolume, leave };
}

export function computeLocalPosition(snapshot: RoomSnapshot, clockOffset: number): number {
  if (snapshot.state !== PlaybackState.PLAYING) return snapshot.position;
  return snapshot.position + (Date.now() - snapshot.timestamp) + clockOffset;
}
