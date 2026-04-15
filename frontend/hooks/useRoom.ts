"use client";
// hooks/useRoom.ts — Real-time room state, upload-aware, no host gate.

import { useEffect, useRef, useCallback, useState } from 'react';
import { getSocket }            from '../lib/socket';
import { roomsApi, RoomDetailsResponse } from '../lib/api';
import { RoomSnapshot, PlaybackState, Participant } from '../lib/types';
import { useAudio }             from '../context/AudioContext';

interface UseRoomOptions {
  roomId:      string;
  displayName: string;
}

interface UseRoomReturn {
  snapshot:     RoomSnapshot | null;
  participants: Participant[];
  isConnected:  boolean;
  clockOffset:  number;
  allReady:     boolean;      // all peers have buffered
  play:         () => void;
  pause:        () => void;
  seek:         (positionMs: number) => void;
  setReady:     (isReady: boolean) => void;
  leave:        () => void;
}

const PING_INTERVAL_MS = 5_000;
const NTP_WINDOW       = 5;

export function useRoom({ roomId, displayName }: UseRoomOptions): UseRoomReturn {
  const socket = getSocket();
  const audio  = useAudio();

  const [snapshot,     setSnapshot]     = useState<RoomSnapshot | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isConnected,  setIsConnected]  = useState(false);
  const [clockOffset,  setClockOffset]  = useState(0);
  const [allReady,     setAllReady]     = useState(false);

  const audioRef = useRef(audio);
  useEffect(() => { audioRef.current = audio; }, [audio]);

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
      });
      setParticipants(details.live.participants as Participant[]);

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
      });
      setParticipants(details.participants.map(p => ({ ...p, isReady: false })));
    }
  }, [roomId]);

  const sendPing = useCallback(() => socket.emit('sync:ping', { t0: Date.now() }), [socket]);

  useEffect(() => {
    let cancelled = false;

    const joinRoom = () => {
      socket.emit('room:join', { roomId, displayName });
      sendPing();
    };

    const handleConnect    = () => { setIsConnected(true); joinRoom(); };
    const handleDisconnect = () => setIsConnected(false);

    if (socket.connected) { setIsConnected(true); joinRoom(); }
    else                    socket.connect();

    socket.on('connect',    handleConnect);
    socket.on('disconnect', handleDisconnect);

    const enforceAudioState = (snap: RoomSnapshot) => {
      const a = audioRef.current;
      const targetSec = snap.position / 1000;
      if (Math.abs(a.currentTime - targetSec) > 1.0) {
        a.seek(targetSec);
      }
      if (snap.state === PlaybackState.PLAYING && !a.isPlaying) a.play();
      if (snap.state !== PlaybackState.PLAYING && a.isPlaying)  a.pause();
    };

    // ── Room state ──────────────────────────────────────────────────────
    const handleSnapshot = (snap: RoomSnapshot) => {
      setSnapshot(snap);
      setParticipants(snap.participants);
      enforceAudioState(snap);
    };
    socket.on('room:snapshot', handleSnapshot);

    const handleStateChanged = (snap: RoomSnapshot) => {
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
      setClockOffset(medianOffset(offsetHistory.current));
    };
    socket.on('sync:pong', handlePong);

    const handleError = ({ message }: { message: string }) => console.warn('[SyncBeats]', message);
    socket.on('error', handleError);

    // Fetch initial room state
    void roomsApi.get(roomId)
      .then(details => { if (!cancelled) applyRoomDetails(details); })
      .catch(() => {});

    const pingInterval = setInterval(sendPing, PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pingInterval);
      socket.emit('room:leave', { roomId });
      socket.off('connect',              handleConnect);
      socket.off('disconnect',           handleDisconnect);
      socket.off('room:snapshot',        handleSnapshot);
      socket.off('room:stateChanged',    handleStateChanged);
      socket.off('room:participantJoined', handleParticipantJoined);
      socket.off('room:participantLeft', handleParticipantLeft);
      socket.off('room:trackSet',        handleTrackSet);
      socket.off('room:allReady',        handleAllReady);
      socket.off('sync:pong',            handlePong);
      socket.off('error',                handleError);
    };
  }, [applyRoomDetails, roomId, displayName, socket, sendPing]);

  // Any participant can control playback — no isHost check
  const play  = useCallback(() => socket.emit('playback:play',  { roomId }), [socket, roomId]);
  const pause = useCallback(() => socket.emit('playback:pause', { roomId }), [socket, roomId]);
  const seek  = useCallback((p: number) => socket.emit('playback:seek', { roomId, position: p }), [socket, roomId]);

  // Emit buffering readiness to server
  const setReady = useCallback((isReady: boolean) =>
    socket.emit('room:clientReady', { roomId, isReady }), [socket, roomId]);

  const leave = useCallback(() => {
    socket.emit('room:leave', { roomId });
    socket.disconnect();
  }, [socket, roomId]);

  return { snapshot, participants, isConnected, clockOffset, allReady, play, pause, seek, setReady, leave };
}

export function computeLocalPosition(snapshot: RoomSnapshot, clockOffset: number): number {
  if (snapshot.state !== PlaybackState.PLAYING) return snapshot.position;
  return snapshot.position + (Date.now() - snapshot.timestamp) + clockOffset;
}
