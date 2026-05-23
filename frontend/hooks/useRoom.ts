"use client";

import { useEffect, useRef, useCallback, useState } from 'react';
import { getSocket } from '../lib/socket';
import { roomsApi, RoomDetailsResponse } from '../lib/api';
import { RoomSnapshot, PlaybackState, Participant, TrackQueueItem, DeviceSpatialState, PlaybackSchedulePayload, PlaybackPausePayload } from '../lib/types';
import { useAudio } from '../context/AudioContext';

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
  allReady:     boolean;      
  play:         () => void;
  pause:        () => void;
  seek:         (positionMs: number) => void;
  nextTrack:    () => void;
  prevTrack:    () => void;
  setReady:     (isReady: boolean) => void;
  setParticipantVolume: (targetSocketId: string, volume: number) => void;
  leave:        () => void;
}

const NTP_SAMPLE_COUNT         = 20;    // More samples → better median accuracy
const NTP_RTT_GATE_MS          = 500;   // Reject noisy pings (>500ms round-trip)
const NTP_PING_GAP_MS          = 40;    // Slightly faster burst
const NTP_RESYNC_INTERVAL_MS   = 15_000; // Re-sync every 15s to track clock drift
const DRIFT_CHECK_INTERVAL_MS  = 500;   // Check drift twice per second
const DRIFT_HARD_SEEK_MS       = 150;   // Seek if off by >150ms (was 500ms)

export function useRoom({ roomId, displayName }: UseRoomOptions): UseRoomReturn {
  const socket = getSocket();
  const audio  = useAudio();

  const [snapshot,     setSnapshot]     = useState<RoomSnapshot | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isConnected,  setIsConnected]  = useState(() => socket.connected);
  const [currentSocketId, setCurrentSocketId] = useState<string | null>(() => socket.id ?? null);
  const [clockOffset,  setClockOffset]  = useState(0);
  const [allReady,     setAllReady]     = useState(true); // Default true since barrier sync is removed

  const audioRef = useRef(audio);
  useEffect(() => { audioRef.current = audio; }, [audio]);
  
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const clockOffsetRef = useRef(clockOffset);
  
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);
  useEffect(() => { clockOffsetRef.current = clockOffset; }, [clockOffset]);

  const seqRef = useRef(0);
  const syncInFlightRef = useRef(false);
  const hasClockSync = useRef(false);
  const reportedBlockedRef = useRef<boolean | null>(null);

  const getTrackTitle = useCallback((trackUrl: string | null | undefined, queue: TrackQueueItem[] = []) => {
    const currentQueueItem = queue.find((item) => item.isCurrent);
    if (currentQueueItem?.title) return currentQueueItem.title;
    if (!trackUrl) return "Unknown Track";
    const fileName = trackUrl.split('/').pop() ?? '';
    return fileName.split('?')[0].replace(/\.[^.]+$/, '').replace(/^\d+_/, '').replace(/_/g, ' ') || 'Track';
  }, []);

  const applyRoomDetails = useCallback((details: RoomDetailsResponse) => {
    let snap: RoomSnapshot | null = null;
    let parts: Participant[] = [];

    if (details.live) {
      snap = {
        roomId:       details.live.roomId,
        trackUrl:     details.live.trackUrl,
        position:     details.live.position,
        state:        details.live.state as PlaybackState,
        startEpoch:   details.live.startEpoch ?? null,
        pauseOffset:  details.live.pauseOffset ?? 0,
        isPlaying:    details.live.isPlaying ?? details.live.state === 'PLAYING',
        hostId:       details.live.hostId,
        timestamp:    details.live.timestamp,
        participants: details.live.participants as Participant[],
        queue:        details.live.queue as TrackQueueItem[],
        spatial:      (details.live.spatial as DeviceSpatialState[]) || [],
      };
      parts = details.live.participants as Participant[];
    } else if (details.db) {
      snap = {
        roomId,
        trackUrl:     details.db.track_url,
        position:     details.db.position_ms,
        state:        details.db.playback_state as PlaybackState,
        startEpoch:   null,
        pauseOffset:  Math.max(0, details.db.position_ms / 1000),
        isPlaying:    details.db.playback_state === 'PLAYING',
        hostId:       details.db.host_id,
        timestamp:    Date.now(),
        participants: details.participants.map(p => ({ ...p, isReady: false })),
        queue:        details.queue as TrackQueueItem[],
        spatial:      [],
      };
      parts = details.participants.map(p => ({ ...p, isReady: false }));
    }

    if (snap) {
      setSnapshot(snap);
      setParticipants(parts);
      const currentParticipant = parts.find(p => p.socketId === currentSocketId);
      if (currentParticipant) audioRef.current.setVolume(currentParticipant.volume);

      if (snap.trackUrl) {
        audioRef.current.setTrack(snap.trackUrl, getTrackTitle(snap.trackUrl, snap.queue));
      }
    }
  }, [roomId, currentSocketId, getTrackTitle]);

  const pingOnce = useCallback((seq: number) => new Promise<{ t0: number; t1: number; t3: number }>((resolve) => {
    const t0 = Date.now();
    const timeout = window.setTimeout(() => {
      socket.off('sync:pong', onPong);
      resolve({ t0, t1: t0, t3: Date.now() });
    }, 1000);

    const onPong = ({ t1, seq: pongSeq }: { t1: number; seq?: number }) => {
      if (pongSeq !== seq) return;
      window.clearTimeout(timeout);
      socket.off('sync:pong', onPong);
      resolve({ t0, t1, t3: Date.now() });
    };

    socket.on('sync:pong', onPong);
    socket.emit('sync:ping', { t0, seq });
  }), [socket]);

  const runNtpBurst = useCallback(async () => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;

    const samples: number[] = [];

    for (let i = 0; i < NTP_SAMPLE_COUNT; i++) {
      const seq = ++seqRef.current;
      const { t0, t1, t3 } = await pingOnce(seq);
      const rtt = t3 - t0;
      if (rtt <= NTP_RTT_GATE_MS) {
        const offset = t1 - (t0 + t3) / 2;
        samples.push(offset);
      }
      await new Promise(r => setTimeout(r, NTP_PING_GAP_MS));
    }

    if (samples.length > 0) {
      const sorted = [...samples].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const filtered = sorted.filter(o => o >= q1 && o <= q3);
      const median = filtered[Math.floor(filtered.length / 2)] ?? sorted[Math.floor(sorted.length / 2)];
      
      clockOffsetRef.current = median;
      setClockOffset(median);
      hasClockSync.current = true;
    }

    syncInFlightRef.current = false;
  }, [pingOnce]);

  // Handle drift correction
  useEffect(() => {
    const driftInterval = setInterval(() => {
      const snap = snapshotRef.current;
      if (!snap || !snap.isPlaying || snap.startEpoch == null) return;
      if (!hasClockSync.current || !audioRef.current.audioUnlocked || !audioRef.current.isReady) return;

      const nowServer = Date.now() + clockOffsetRef.current;
      
      // Do not run drift correction before the song is actually scheduled to start
      if (nowServer < snap.startEpoch!) return;

      const expected = Math.max(0, (nowServer - snap.startEpoch!) / 1000);
      const actual = audioRef.current.getTruePosition();
      const driftMs = Math.abs(actual - expected) * 1000;

      const isYoutube = snap.trackUrl?.startsWith("youtube:");
      const tolerance = isYoutube ? 2000 : DRIFT_HARD_SEEK_MS;

      if (driftMs > tolerance) {
        audioRef.current.playNow(expected);
      }
    }, DRIFT_CHECK_INTERVAL_MS);

    return () => clearInterval(driftInterval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const handleConnect = () => {
      setIsConnected(true);
      setCurrentSocketId(socket.id ?? null);
      socket.emit('room:join', { roomId, displayName });
      runNtpBurst();
    };

    const handleDisconnect = () => setIsConnected(false);

    if (socket.connected) handleConnect();
    else socket.connect();

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    const handleSnapshot = (snap: RoomSnapshot) => {
      setSnapshot(snap);
      setParticipants(snap.participants);
    };
    socket.on('room:snapshot', handleSnapshot);

    const handleStateChanged = (snap: RoomSnapshot) => {
      setSnapshot(snap);
      setParticipants(snap.participants);
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

    const handleTrackSet = ({ trackUrl, title }: { trackUrl: string; title: string }) => {
      audioRef.current.setTrack(trackUrl, title);
    };
    socket.on('room:trackSet', handleTrackSet);

    const handleQueueChanged = ({ queue }: { queue: TrackQueueItem[] }) => {
      setSnapshot((prev) => prev ? { ...prev, queue } : prev);

      const newCurrentItem = queue.find((item) => item.isCurrent);

      if (queue.length === 0) {
        audioRef.current.clearTrack();
      } else if (newCurrentItem) {
        const playingUrl = audioRef.current.trackUrl;
        if (playingUrl && playingUrl !== newCurrentItem.trackUrl) {
          audioRef.current.setTrack(newCurrentItem.trackUrl, newCurrentItem.title);
        }
      }
      // If queue has songs but none is isCurrent, let room:trackSet / room:stateChanged handle it
    };
    socket.on('room:queueChanged', handleQueueChanged);

    const handleSchedule = (payload: PlaybackSchedulePayload) => {
      setSnapshot(prev => prev ? { ...prev, startEpoch: payload.startEpoch, pauseOffset: payload.fromPosition, isPlaying: true, state: PlaybackState.PLAYING } : prev);
      audioRef.current.scheduleStart(payload, clockOffsetRef.current);
    };
    socket.on('playback:schedule', handleSchedule);

    const handlePause = (payload: PlaybackPausePayload) => {
      setSnapshot(prev => prev ? { ...prev, startEpoch: null, pauseOffset: payload.pauseOffset, isPlaying: false, state: PlaybackState.PAUSED } : prev);
      audioRef.current.pauseAt(payload.pauseOffset);
    };
    socket.on('playback:pause', handlePause);

    const handleError = ({ message }: { message: string }) => console.warn('[syncbeats]', message);
    socket.on('error', handleError);

    roomsApi.get(roomId).then(details => {
      if (!cancelled) applyRoomDetails(details);
    }).catch(() => {});

    const ntpInterval = setInterval(runNtpBurst, NTP_RESYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(ntpInterval);
      socket.emit('room:leave', { roomId });
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('room:snapshot', handleSnapshot);
      socket.off('room:stateChanged', handleStateChanged);
      socket.off('room:participantJoined', handleParticipantJoined);
      socket.off('room:participantLeft', handleParticipantLeft);
      socket.off('room:trackSet', handleTrackSet);
      socket.off('room:queueChanged', handleQueueChanged);
      socket.off('playback:schedule', handleSchedule);
      socket.off('playback:pause', handlePause);
      socket.off('error', handleError);
    };
  }, [applyRoomDetails, roomId, displayName, socket, runNtpBurst]);

  useEffect(() => {
    const handleAudioEnded = () => {
      const currentTrackUrl = snapshotRef.current?.trackUrl;
      if (!roomId || !currentTrackUrl) return;
      socket.emit('playback:ended', { roomId, trackUrl: currentTrackUrl });
    };
    document.addEventListener('audioEnded', handleAudioEnded);
    return () => document.removeEventListener('audioEnded', handleAudioEnded);
  }, [roomId, socket]);

  useEffect(() => {
    const checkInterval = setInterval(() => {
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

      // Local state is blocked if we should be playing, but local audio is not playing
      const isBlocked = !!(shouldBePlaying && audioRef.current.isReady && !audioRef.current.isPlaying);

      if (reportedBlockedRef.current !== isBlocked) {
        reportedBlockedRef.current = isBlocked;
        socket.emit('playback:blocked', { roomId, blocked: isBlocked });
      }
    }, 2000);

    return () => clearInterval(checkInterval);
  }, [roomId, socket]);

  useEffect(() => {
    if (!currentSocketId || !snapshot) return;
    const me = snapshot.participants.find(p => p.socketId === currentSocketId);
    if (me) audioRef.current.setVolume(me.volume);
  }, [snapshot, currentSocketId]);

  const play  = useCallback(() => socket.emit('playback:play',  { roomId }), [socket, roomId]);
  const pause = useCallback(() => socket.emit('playback:pause', { roomId }), [socket, roomId]);
  const seek  = useCallback((p: number) => socket.emit('playback:seek', { roomId, position: p }), [socket, roomId]);
  const nextTrack = useCallback(() => socket.emit('playback:next', { roomId }), [socket, roomId]);
  const prevTrack = useCallback(() => socket.emit('playback:prev', { roomId }), [socket, roomId]);
  const setReady = useCallback((isReady: boolean) => {
    if (isReady) socket.emit('room:clientReady', { roomId });
  }, [socket, roomId]);
  const setParticipantVolume = useCallback((targetSocketId: string, volume: number) =>
    socket.emit('room:setParticipantVolume', { roomId, targetSocketId, volume }), [socket, roomId]);

  const leave = useCallback(() => {
    socket.emit('room:leave', { roomId });
    socket.disconnect();
  }, [socket, roomId]);

  return { snapshot, participants, isConnected, currentSocketId, clockOffset, allReady, play, pause, seek, nextTrack, prevTrack, setReady, setParticipantVolume, leave };
}
