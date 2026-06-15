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
  incomingTrack: { title: string, progress: number } | null;
}

const NTP_SAMPLE_COUNT         = 30;    // High sample count for extreme precision
const NTP_RTT_GATE_MS          = 300;   // Reject noisy pings (>300ms round-trip)
const NTP_PING_GAP_MS          = 20;    // Faster ping burst for accuracy
const NTP_RESYNC_INTERVAL_MS   = 5_000; // Re-sync every 5s to combat clock drift
const DRIFT_CHECK_INTERVAL_MS  = 200;   // Check drift 5 times per second
const DRIFT_HARD_SEEK_MS       = 150;   // Crossfade seek if off by >150ms
const DRIFT_SOFT_SEEK_MS       = 10;    // Soft correction via playback rate if off by >10ms

export function useRoom({ roomId, displayName }: UseRoomOptions): UseRoomReturn {
  const socket = getSocket();
  const audio  = useAudio();

  const [snapshot,     setSnapshot]     = useState<RoomSnapshot | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isConnected,  setIsConnected]  = useState(() => socket.connected);
  const [currentSocketId, setCurrentSocketId] = useState<string | null>(() => socket.id ?? null);
  const [clockOffset,  setClockOffset]  = useState(0);
  const [allReady] = useState(true); // Default true since barrier sync is removed
  const [incomingTrack, setIncomingTrack] = useState<{ title: string, progress: number } | null>(null);

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

  const setReady = useCallback((isReady: boolean) => {
    socket.emit('room:clientReady', { roomId, isReady });
  }, [socket, roomId]);

  const getTrackTitle = useCallback((trackUrl: string | null | undefined, queue: TrackQueueItem[] = []) => {
    const currentQueueItem = queue.find((item) => item.isCurrent);
    if (currentQueueItem?.title) return currentQueueItem.title;
    if (!trackUrl) return "Unknown Track";
    const fileName = trackUrl.split('/').pop() ?? '';
    return fileName.split('?')[0].replace(/\.[^.]+$/, '').replace(/^\d+_/, '').replace(/_/g, ' ') || 'Track';
  }, []);

  const loadAndSetTrack = useCallback(async (trackUrl: string | null | undefined, title: string) => {
    if (!trackUrl) {
      audioRef.current.clearTrack();
      return;
    }
    audioRef.current.setTrack(trackUrl, title);
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
        pendingPlay:  details.live.pendingPlay ?? false,
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
        pendingPlay:  false,
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
        loadAndSetTrack(snap.trackUrl, getTrackTitle(snap.trackUrl, snap.queue));
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

  useEffect(() => {
    // Run NTP resync continuously
    const interval = setInterval(runNtpBurst, NTP_RESYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [runNtpBurst]);

  // Handle drift correction with performance.now() for sub-ms precision
  useEffect(() => {
    // Capture a baseline to convert between performance.now() and Date.now()
    const perfBaseline = performance.now();
    const dateBaseline = Date.now();

    const getServerNow = () => {
      const perfElapsed = performance.now() - perfBaseline;
      return dateBaseline + perfElapsed + clockOffsetRef.current;
    };

    const correctDrift = () => {
      const snap = snapshotRef.current;
      if (!snap || !snap.isPlaying || snap.startEpoch == null) return;
      if (!hasClockSync.current || !audioRef.current.audioUnlocked || !audioRef.current.isReady) return;

      const nowServer = getServerNow();
      
      // Do not run drift correction before the song is actually scheduled to start
      if (nowServer < snap.startEpoch!) return;

      const expected = Math.max(0, (nowServer - snap.startEpoch!) / 1000);
      const actual = audioRef.current.getTruePosition();
      
      // Skip correction if YouTube is buffering (getTruePosition returns -1)
      if (actual < 0) return;

      const drift = expected - actual; // Positive = we are behind server, Negative = we are ahead
      const driftMs = Math.abs(drift) * 1000;

      const isYoutube = snap.trackUrl?.startsWith("youtube:");
      const hardSeekTolerance = isYoutube ? 500 : DRIFT_HARD_SEEK_MS;
      const softSeekTolerance = isYoutube ? 100 : DRIFT_SOFT_SEEK_MS;

      if (driftMs > hardSeekTolerance) {
        // Severe drift: Crossfade seek to avoid jarring jumps
        if (isYoutube || !audioRef.current.audioCtx || !audioRef.current.gainNode) {
          // YouTube or fallback: just hard seek
          audioRef.current.playNow(expected);
          if (audioRef.current.setPlaybackRate) audioRef.current.setPlaybackRate(1);
        } else {
          // WebAudio Crossfade: Fade out over 50ms, seek, fade in over 50ms
          const { audioCtx, gainNode } = audioRef.current;
          const currentVol = audioRef.current.volume / 100;
          
          // Fade out
          gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
          gainNode.gain.setValueAtTime(gainNode.gain.value, audioCtx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
          
          setTimeout(() => {
            // Seek precisely (add the 50ms delay to expected)
            const newExpected = Math.max(0, (getServerNow() - snap.startEpoch!) / 1000);
            audioRef.current.playNow(newExpected);
            if (audioRef.current.setPlaybackRate) audioRef.current.setPlaybackRate(1);
            
            // Fade in
            const newAudioCtx = audioRef.current.audioCtx!;
            const newGainNode = audioRef.current.gainNode!;
            newGainNode.gain.cancelScheduledValues(newAudioCtx.currentTime);
            newGainNode.gain.setValueAtTime(0.01, newAudioCtx.currentTime);
            newGainNode.gain.linearRampToValueAtTime(currentVol, newAudioCtx.currentTime + 0.05);
          }, 50);
        }
      } else if (driftMs > softSeekTolerance) { 
        // Micro-drift: Soft correction via playback rate
        if (audioRef.current.setPlaybackRate) {
          if (isYoutube) {
            // YouTube ignores 1.05, so we use officially supported 1.25 / 0.75
            // To catch up `driftMs` playing at 1.25x (0.25x faster), we need driftMs / 0.25 ms.
            const rate = drift > 0 ? 1.25 : 0.75;
            const correctionDurationMs = driftMs / 0.25; 
            
            audioRef.current.setPlaybackRate(rate);
            
            // Revert back to normal speed after we've caught up
            setTimeout(() => {
              if (audioRef.current?.setPlaybackRate) {
                audioRef.current.setPlaybackRate(1);
              }
            }, Math.min(correctionDurationMs, 2000)); // Cap at 2s just in case
          } else {
            // WebAudio handles fine-grained rates beautifully
            // Use extremely precise rate adjustment based on drift magnitude
            const rateOffset = Math.max(0.01, Math.min(0.05, driftMs / 1000)); 
            const rate = drift > 0 ? (1 + rateOffset) : (1 - rateOffset);
            const correctionDurationMs = driftMs / rateOffset; 
            
            audioRef.current.setPlaybackRate(rate);
            
            setTimeout(() => {
              if (audioRef.current?.setPlaybackRate) {
                audioRef.current.setPlaybackRate(1);
              }
            }, correctionDurationMs);
          }
        }
      } else {
        // Perfectly in sync (< 50ms): Normal playback rate
        if (audioRef.current.setPlaybackRate) {
          audioRef.current.setPlaybackRate(1);
        }
      }
    };

    const driftInterval = setInterval(correctDrift, DRIFT_CHECK_INTERVAL_MS);

    const handleYtBufferEnd = () => {
      setTimeout(correctDrift, 200);
    };
    document.addEventListener('ytBufferEnd', handleYtBufferEnd);

    return () => {
      clearInterval(driftInterval);
      document.removeEventListener('ytBufferEnd', handleYtBufferEnd);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const handleConnect = () => {
      setIsConnected(true);
      setCurrentSocketId(socket.id ?? null);
      socket.emit('room:join', { 
        roomId, 
        displayName, 
        isReady: audioRef.current.isReady && !audioRef.current.isBuffering 
      });
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
      if (snap.trackUrl && audioRef.current.trackUrl !== snap.trackUrl) {
        loadAndSetTrack(snap.trackUrl, getTrackTitle(snap.trackUrl, snap.queue));
      }
    };
    socket.on('room:snapshot', handleSnapshot);

    const handleStateChanged = (snap: RoomSnapshot) => {
      setSnapshot(snap);
      setParticipants(snap.participants);
      if (snap.trackUrl && audioRef.current.trackUrl !== snap.trackUrl) {
        loadAndSetTrack(snap.trackUrl, getTrackTitle(snap.trackUrl, snap.queue));
      }
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

    const handleUploadProgress = ({ title, progress }: { title: string, progress: number }) => {
      if (progress >= 100) {
        setIncomingTrack(null);
      } else {
        setIncomingTrack({ title, progress });
      }
    };
    socket.on('room:upload_progress', handleUploadProgress);

    const handleTrackSet = ({ trackUrl, title }: { trackUrl: string; title: string }) => {
      loadAndSetTrack(trackUrl, title);
    };
    socket.on('room:trackSet', handleTrackSet);

    const handleQueueChanged = ({ queue }: { queue: TrackQueueItem[] }) => {
      setSnapshot((prev) => prev ? { ...prev, queue } : prev);

      const newCurrentItem = queue.find((item) => item.isCurrent);

      if (queue.length === 0) {
        audioRef.current.clearTrack();
      } else if (newCurrentItem) {
        const playingUrl = audioRef.current.trackUrl;
        if (!playingUrl || playingUrl !== newCurrentItem.trackUrl) {
          loadAndSetTrack(newCurrentItem.trackUrl, newCurrentItem.title);
        }
      }
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

  // Pre-seed the next track in the queue
  useEffect(() => {
    if (!snapshot || !snapshot.queue || snapshot.queue.length === 0) return;
    
    const currentIndex = snapshot.queue.findIndex(q => q.isCurrent);
    if (currentIndex === -1 || currentIndex >= snapshot.queue.length - 1) return;
    
    const nextTrack = snapshot.queue[currentIndex + 1];
    if (nextTrack && nextTrack.trackUrl && audioRef.current.prefetchTrack) {
      audioRef.current.prefetchTrack(nextTrack.trackUrl);
    }
  }, [snapshot?.queue]);

  const play  = useCallback(() => socket.emit('playback:play',  { roomId }), [socket, roomId]);
  const pause = useCallback(() => socket.emit('playback:pause', { roomId }), [socket, roomId]);
  const seek  = useCallback((p: number) => socket.emit('playback:seek', { roomId, position: p }), [socket, roomId]);
  const nextTrack = useCallback(() => socket.emit('playback:next', { roomId }), [socket, roomId]);
  const prevTrack = useCallback(() => socket.emit('playback:prev', { roomId }), [socket, roomId]);
  const setParticipantVolume = useCallback((targetSocketId: string, volume: number) =>
    socket.emit('room:setParticipantVolume', { roomId, targetSocketId, volume }), [socket, roomId]);

  const leave = useCallback(() => {
    socket.emit('room:leave', { roomId });
    socket.disconnect();
  }, [socket, roomId]);

  return { snapshot, participants, isConnected, currentSocketId, clockOffset, allReady, play, pause, seek, nextTrack, prevTrack, setReady,
    setParticipantVolume, leave, incomingTrack
  };
}
