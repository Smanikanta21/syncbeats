"use client";
// hooks/useRoom.ts — Real-time room state hook
//
// - Connects to the server on mount, disconnects on unmount.
// - Runs NTP clock-sync ping every 5 seconds.
// - Applies clock offset when scheduling audio playback.
// - Exposes host controls: play, pause, seek, setTrack.

import { useEffect, useRef, useCallback, useState } from 'react';
import { getSocket } from '../lib/socket';
import { roomsApi, RoomDetailsResponse } from '../lib/api';
import { RoomSnapshot, PlaybackState, Participant } from '../lib/types';

interface UseRoomOptions {
  roomId:      string;
  displayName: string;
}

interface UseRoomReturn {
  snapshot:     RoomSnapshot | null;
  participants: Participant[];
  isConnected:  boolean;
  isHost:       boolean;
  clockOffset:  number;        // ms — local clock vs server clock
  // Host controls
  play:     () => void;
  pause:    () => void;
  seek:     (positionMs: number) => void;
  setTrack: (trackUrl: string) => void;
  setReady: (isReady: boolean) => void;   // let the UI/audio hook broadcast buffering state
  leave:    () => void;
}

const PING_INTERVAL_MS = 5_000;
const NTP_WINDOW       = 5;

export function useRoom({ roomId, displayName }: UseRoomOptions): UseRoomReturn {
  const socket = getSocket();

  const [snapshot,    setSnapshot]    = useState<RoomSnapshot | null>(null);
  const [participants,setParticipants]= useState<Participant[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);

  // NTP offset history (sliding window of last 5)
  const offsetHistory = useRef<number[]>([]);

  const applyRoomDetails = useCallback((details: RoomDetailsResponse) => {
    if (details.live) {
      setSnapshot({
        roomId: details.live.roomId,
        trackUrl: details.live.trackUrl,
        position: details.live.position,
        state: details.live.state as PlaybackState,
        hostId: details.live.hostId,
        timestamp: details.live.timestamp,
        participants: details.live.participants as Participant[],
      });
      setParticipants(details.live.participants as Participant[]);
      return;
    }

    if (details.db) {
      const fallbackSnapshot: RoomSnapshot = {
        roomId,
        trackUrl: details.db.track_url,
        position: details.db.position_ms,
        state: details.db.playback_state as PlaybackState,
        hostId: details.db.host_id,
        timestamp: Date.now(),
        // Transform DB participants to add missing isReady
        participants: details.participants.map(p => ({ ...p, isReady: false })),
      };

      setSnapshot(fallbackSnapshot);
      setParticipants(details.participants.map(p => ({ ...p, isReady: false })));
    }
  }, [roomId]);

  // ── NTP ping ────────────────────────────────────────────────────────────
  const sendPing = useCallback(() => {
    socket.emit('sync:ping', { t0: Date.now() });
  }, [socket]);

  const medianOffset = (history: number[]): number => {
    const sorted = [...history].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  // ── Socket lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const joinRoom = () => {
      socket.emit('room:join', { roomId, displayName });
      sendPing();
    };

    const handleConnect = () => {
      setIsConnected(true);
      joinRoom();
    };

    const handleDisconnect = () => setIsConnected(false);

    if (socket.connected) {
      setIsConnected(true);
      joinRoom();
    } else {
      socket.connect();
    }

    // ── Connection events ──
    socket.on('connect', handleConnect);

    socket.on('disconnect', handleDisconnect);

    // ── Room state ──
    const handleSnapshot = (snap: RoomSnapshot) => {
      setSnapshot(snap);
      setParticipants(snap.participants);
    };

    socket.on('room:snapshot', handleSnapshot);

    const handleStateChanged = (snap: RoomSnapshot) => {
      setSnapshot(snap);
    };

    socket.on('room:stateChanged', handleStateChanged);

    const handleParticipantJoined = (p: Participant) => {
      setParticipants(prev => {
        if (prev.find(x => x.socketId === p.socketId)) return prev;
        return [...prev, p];
      });
    };

    socket.on('room:participantJoined', handleParticipantJoined);

    const handleParticipantLeft = (socketId: string) => {
      setParticipants(prev => prev.filter(x => x.socketId !== socketId));
    };

    socket.on('room:participantLeft', handleParticipantLeft);

    // ── NTP pong ──
    const handlePong = ({ t0, t1, t2 }: { t0: number; t1: number; t2: number }) => {
      const t3     = Date.now();
      const offset = ((t1 - t0) + (t2 - t3)) / 2;
      offsetHistory.current.push(offset);
      if (offsetHistory.current.length > NTP_WINDOW) offsetHistory.current.shift();
      setClockOffset(medianOffset(offsetHistory.current));
    };

    socket.on('sync:pong', handlePong);

    // ── Error ──
    const handleError = ({ message }: { message: string }) => {
      console.warn('[SyncBeats]', message);
    };

    socket.on('error', handleError);

    void roomsApi.get(roomId)
      .then(details => {
        if (cancelled) return;
        applyRoomDetails(details);
      })
      .catch(err => {
        if (cancelled) return;
        console.warn('[SyncBeats] failed to fetch room details', err);
      });

    // ── Periodic NTP ping ──
    const pingInterval = setInterval(sendPing, PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pingInterval);
      socket.emit('room:leave', { roomId });
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('room:snapshot', handleSnapshot);
      socket.off('room:stateChanged', handleStateChanged);
      socket.off('room:participantJoined', handleParticipantJoined);
      socket.off('room:participantLeft', handleParticipantLeft);
      socket.off('sync:pong', handlePong);
      socket.off('error', handleError);
    };
  }, [applyRoomDetails, roomId, displayName, socket, sendPing]);

  // ── Device-local playback scheduling ───────────────────────────────────
  // Call this in the Room UI whenever snapshot.state === PLAYING
  // to compute the correct audioEl.currentTime from the snapshot.
  //   const localPositionMs = computeLocalPosition(snapshot, clockOffset);
  //   audioEl.currentTime = localPositionMs / 1000;

  // ── Derived ────────────────────────────────────────────────────────────
  const isHost = snapshot?.hostId === socket.id;

  // ── Host controls ───────────────────────────────────────────────────────
  const play     = useCallback(() => socket.emit('playback:play',     { roomId }), [socket, roomId]);
  const pause    = useCallback(() => socket.emit('playback:pause',    { roomId }), [socket, roomId]);
  const seek     = useCallback((p: number) => socket.emit('playback:seek', { roomId, position: p }), [socket, roomId]);
  const setTrack = useCallback((url: string) => socket.emit('playback:setTrack', { roomId, trackUrl: url }), [socket, roomId]);
  const setReady = useCallback((isReady: boolean) => socket.emit('room:ready', { roomId, isReady }), [socket, roomId]);
  const leave    = useCallback(() => {
    socket.emit('room:leave', { roomId });
    socket.disconnect();
  }, [socket, roomId]);

  return { snapshot, participants, isConnected, isHost, clockOffset, play, pause, seek, setTrack, setReady, leave };
}

// ── Utility: compute playback position adjusted for clock offset ─────────
export function computeLocalPosition(snapshot: RoomSnapshot, clockOffset: number): number {
  if (snapshot.state !== PlaybackState.PLAYING) return snapshot.position;
  const elapsed = (Date.now() - snapshot.timestamp) + clockOffset;
  return snapshot.position + elapsed;
}
