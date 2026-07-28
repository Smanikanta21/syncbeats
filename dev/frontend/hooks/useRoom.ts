"use client";

import { useEffect, useRef, useCallback, useState,useMemo } from 'react';
import { useAdaptiveSync, NetworkQuality } from './useAdaptiveSync';
import { getSocket } from '../lib/socket';
import { roomsApi, historyApi, RoomDetailsResponse, getDeviceId } from '../lib/api';
import { RoomSnapshot, PlaybackState, Participant, TrackQueueItem, DeviceSpatialState, PlaybackSchedulePayload, PlaybackPausePayload } from '../lib/types';
import { useAudio } from '../context/AudioContext';
import { useTrackPrefetcher, type PrefetchState } from './useTrackPrefetcher';
import { toast } from 'sonner';

interface UseRoomOptions {
  roomId:      string;
  displayName: string;
  userId?:     string;
}

interface UseRoomReturn {
  snapshot:     RoomSnapshot | null;
  participants: Participant[];
  isConnected:  boolean;
  joinStatus:   'joined' | 'pending' | 'denied' | 'connecting';
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
  incomingTrack: { title: string, progress: number } | null;
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

export function useRoom({ roomId, displayName, userId }: UseRoomOptions): UseRoomReturn {
  // ── Adaptive network-quality engine ──────────────────────────────────────
  // paramsRef holds all 7 NTP/drift constants and updates after every burst.
  // networkQuality is a reactive string tier for UI display.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- socket is module-singleton
  const socket = getSocket();
  const { paramsRef, networkQuality, reportBurst } = useAdaptiveSync(socket);
  const audio  = useAudio();

  const [snapshot,     setSnapshot]     = useState<RoomSnapshot | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isConnected,  setIsConnected]  = useState(() => socket.connected);
  const [joinStatus,   setJoinStatus]   = useState<'joined' | 'pending' | 'denied' | 'connecting'>('connecting');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<{ socketId: string, displayName: string, isNudge?: boolean, userId?: string }[]>([]);
  const [currentSocketId, setCurrentSocketId] = useState<string | null>(() => socket.id ?? null);
  const [clockOffset,  setClockOffset]  = useState(0);
  const [allReady] = useState(true); // Default true since barrier sync is removed
  const [incomingTrack, setIncomingTrack] = useState<{ title: string, progress: number } | null>(null);
  const [deviceSyncProgress, setDeviceSyncProgress] = useState<Record<string, number>>({}); 

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
    if (trackUrl) {
      console.log("[DEBUG] getTrackTitle searching for url:", trackUrl);
      console.log("[DEBUG] queue urls:", queue.map(i => i.trackUrl));
      
      const extractId = (url: string): string | null => {
        if (!url) return null;
        const m = url.match(/[?&]videoId=([a-zA-Z0-9_-]{11})/) || url.match(/youtube:([a-zA-Z0-9_-]{11})/) || url.match(/^youtube_([a-zA-Z0-9_-]{11})\.yt$/) || url.match(/vi\/([a-zA-Z0-9_-]{11})/);
        if (m) return m[1];
        if (url.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
        return null;
      };

      const playingId = extractId(trackUrl);
      const match = queue.find((item) => {
        if (item.trackUrl === trackUrl) return true;
        const itemId = extractId(item.trackUrl);
        return playingId !== null && itemId !== null && playingId === itemId;
      });

      if (match?.title && !match.title.startsWith('youtube:') && match.title !== 'Track') {
        console.log("[DEBUG] getTrackTitle found match:", match.title);
        return match.title;
      }
    }
    
    const currentQueueItem = queue.find((item) => item.isCurrent);
    if (currentQueueItem?.title && !currentQueueItem.title.startsWith('youtube:') && currentQueueItem.title !== 'Track') {
      return currentQueueItem.title;
    }
    
    if (!trackUrl) return "Unknown Track";
    const clean = trackUrl.replace(/^(?:youtube:|ws-p2p:yt:)/, '');
    const fileName = clean.split('/').pop() ?? '';
    const formatted = fileName.split('?')[0].replace(/\.[^.]+$/, '').replace(/^\d+_/, '').replace(/_/g, ' ');
    if (formatted && !formatted.startsWith('youtube:')) return formatted;
    return "SyncBeats Track";
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
        createdAt:    details.live.createdAt ?? (details.db?.created_at ? new Date(details.db.created_at).getTime() : undefined),
        participants: details.live.participants as Participant[],
        queue:        details.live.queue as TrackQueueItem[],
        spatial:      (details.live.spatial as DeviceSpatialState[]) || [],
        isPrivate:    details.live.isPrivate,
        shuffle:      details.live.shuffle ?? false,
        repeatMode:   details.live.repeatMode ?? 'off',
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
        createdAt:    details.db.created_at ? new Date(details.db.created_at).getTime() : undefined,
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

    // Read adaptive params snapshot for this burst
    const p = paramsRef.current; // paramsRef is a stable ref — no dep needed
    const offsetSamples: { offset: number; rtt: number }[] = [];
    const rttSamples:    number[] = []; // ALL rtts (including rejected) for quality classification

    for (let i = 0; i < p.NTP_SAMPLE_COUNT; i++) {
      const seq = ++seqRef.current;
      const { t0, t1, t3 } = await pingOnce(seq);
      const rtt = t3 - t0;
      rttSamples.push(rtt); // always collect, even noisy ones
      if (rtt <= p.NTP_RTT_GATE_MS) {
        const offset = t1 - (t0 + t3) / 2;
        offsetSamples.push({ offset, rtt });
      }
      await new Promise(r => setTimeout(r, p.NTP_PING_GAP_MS));
    }

    if (offsetSamples.length > 0) {
      // Sort by RTT ascending to select samples with minimum network delay/asymmetry
      const sortedByRtt = [...offsetSamples].sort((a, b) => a.rtt - b.rtt);
      // Select top 35% lowest latency samples
      const bestSamples = sortedByRtt.slice(0, Math.max(1, Math.ceil(sortedByRtt.length * 0.35)));
      const bestOffsets = bestSamples.map(s => s.offset).sort((a, b) => a - b);
      const median = bestOffsets[Math.floor(bestOffsets.length / 2)];
      
      clockOffsetRef.current = median;
      setClockOffset(median);
      hasClockSync.current = true;
    }

    // Feed raw RTTs into the adaptive engine — updates params and reports stats to server
    reportBurst(rttSamples, roomId);

    syncInFlightRef.current = false;
  }, [pingOnce, reportBurst, roomId]); // paramsRef is a stable ref, not listed

  // NTP resync — self-scheduling so the interval dynamically follows paramsRef.
  // Each burst schedules the next one after it finishes, reading the current
  // adaptive resync delay at that point in time.
  useEffect(() => {
    let cancelled = false;
    let timer: number;

    const scheduleNext = () => {
      if (cancelled) return;
      // Read delay fresh from adaptive params at scheduling time
      timer = window.setTimeout(async () => {
        if (!cancelled) {
          await runNtpBurst();
          scheduleNext();
        }
      }, paramsRef.current.NTP_RESYNC_INTERVAL_MS);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [runNtpBurst]); // paramsRef is a stable ref, safe to omit

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

      // PAUSE BUG FIX: If snapshot is paused/stopped, guarantee local audio player is paused!
      if (!snap || !snap.isPlaying || snap.startEpoch == null) {
        if (audioRef.current.isPlaying) {
          audioRef.current.pauseAt(snap?.pauseOffset ?? audioRef.current.getTruePosition());
        }
        return;
      }

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

      const { DRIFT_HARD_SEEK_MS } = paramsRef.current;
      const hardSeekTolerance = Math.min(DRIFT_HARD_SEEK_MS, 45); // Max 45ms hard seek for tight sync

      if (driftMs > hardSeekTolerance) {
        // Severe drift (>45ms): Quick crossfade seek to immediately close the gap
        if (!audioRef.current.audioCtx || !audioRef.current.gainNode) {
          audioRef.current.playNow(expected);
          if (audioRef.current.setPlaybackRate) audioRef.current.setPlaybackRate(1);
        } else {
          const { audioCtx, gainNode } = audioRef.current;
          const currentVol = audioRef.current.volume / 100;
          
          gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
          gainNode.gain.setValueAtTime(gainNode.gain.value, audioCtx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.03);
          
          setTimeout(() => {
            const newExpected = Math.max(0, (getServerNow() - snap.startEpoch!) / 1000);
            audioRef.current.playNow(newExpected);
            if (audioRef.current.setPlaybackRate) audioRef.current.setPlaybackRate(1);
            
            const newAudioCtx = audioRef.current.audioCtx!;
            const newGainNode = audioRef.current.gainNode!;
            newGainNode.gain.cancelScheduledValues(newAudioCtx.currentTime);
            newGainNode.gain.setValueAtTime(0.01, newAudioCtx.currentTime);
            newGainNode.gain.linearRampToValueAtTime(currentVol, newAudioCtx.currentTime + 0.03);
          }, 30);
        }
      } else if (driftMs > 2) {
        // Micro-rate phase lock (2ms - 45ms gap):
        // Micro-adjust playback speed by ±0.5% - 2% to continuously pull devices into <1ms phase lock!
        const nudgeRate = 1.0 + Math.max(-0.02, Math.min(0.02, drift * 0.45));
        if (audioRef.current.setPlaybackRate) {
          audioRef.current.setPlaybackRate(nudgeRate);
        }
      } else {
        // Perfect sync phase (< 2ms gap)!
        if (audioRef.current.setPlaybackRate) {
          audioRef.current.setPlaybackRate(1);
        }
      }
    };

    // Drift check — 50 ms base tick with an accumulator so the effective
    // check frequency adapts to paramsRef.DRIFT_CHECK_INTERVAL_MS without
    // needing to restart the interval.
    const BASE_TICK_MS = 50;
    let accumulated = 0;
    const driftInterval = setInterval(() => {
      accumulated += BASE_TICK_MS;
      if (accumulated >= paramsRef.current.DRIFT_CHECK_INTERVAL_MS) {
        accumulated = 0;
        correctDrift();
      }
    }, BASE_TICK_MS);

    const handleYtBufferEnd = () => {
      setTimeout(correctDrift, 200);
    };
    document.addEventListener('ytBufferEnd', handleYtBufferEnd);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        correctDrift();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(driftInterval);
      document.removeEventListener('ytBufferEnd', handleYtBufferEnd);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // paramsRef is a stable ref, correctDrift is a closure — intentional empty dep

  useEffect(() => {
    let cancelled = false;

    const handleConnect = () => {
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
        isReady: audioRef.current.isReady && !audioRef.current.isBuffering 
      });
      runNtpBurst();
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setIsReconnecting(false);
      audioRef.current.pauseAt(audioRef.current.getTruePosition());
    };

    if (socket.connected) handleConnect();
    else socket.connect();

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    const handleSnapshot = (snap: RoomSnapshot) => {
      setJoinStatus('joined');
      setIsReconnecting(false); // Reconnect complete — clear the banner
      setSnapshot(snap);
      setParticipants(snap.participants);

      // Dispatch welcome beat burst for local user entering room
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("syncbeats:welcome-burst"));
      }

      const logListenHistory = (url: string, queueItems?: TrackQueueItem[]) => {
        if (!userId || !url) return;
        const currentItem = queueItems?.find(q => q.isCurrent || q.trackUrl === url);
        const title = currentItem?.title || getTrackTitle(url, queueItems);
        const artist = currentItem?.artist || currentItem?.addedByName || '';
        const thumbnail = currentItem?.thumbnail || currentItem?.coverUrl || '';
        const youtubeId = url.replace(/^(?:youtube:|ws-p2p:yt:)/, '').split('?')[0];

        historyApi.logListen(userId, {
          youtubeId,
          title,
          artist,
          thumbnail,
        }).catch(() => {});
      };

      if (snap.trackUrl && audioRef.current.trackUrl !== snap.trackUrl) {
        loadAndSetTrack(snap.trackUrl, getTrackTitle(snap.trackUrl, snap.queue));
        logListenHistory(snap.trackUrl, snap.queue);
      } else if (!snap.trackUrl) {
        audioRef.current.clearTrack();
      }
    };
    socket.on('room:snapshot', handleSnapshot);

    const handleStateChanged = (snap: RoomSnapshot) => {
      setSnapshot(snap);
      setParticipants(snap.participants);
      if (snap.trackUrl && audioRef.current.trackUrl !== snap.trackUrl) {
        loadAndSetTrack(snap.trackUrl, getTrackTitle(snap.trackUrl, snap.queue));
        if (userId && snap.trackUrl) {
          const currentItem = snap.queue?.find(q => q.isCurrent || q.trackUrl === snap.trackUrl);
          const title = currentItem?.title || getTrackTitle(snap.trackUrl, snap.queue);
          const artist = currentItem?.artist || currentItem?.addedByName || '';
          const thumbnail = currentItem?.thumbnail || currentItem?.coverUrl || '';
          const youtubeId = snap.trackUrl.replace(/^(?:youtube:|ws-p2p:yt:)/, '').split('?')[0];

          historyApi.logListen(userId, {
            youtubeId,
            title,
            artist,
            thumbnail,
          }).catch(() => {});
        }
      } else if (!snap.trackUrl) {
        audioRef.current.clearTrack();
      }
    };
    socket.on('room:stateChanged', handleStateChanged);

    const handleQueueChanged = (data: { queue: TrackQueueItem[] } | TrackQueueItem[]) => {
      // Legacy handler kept for shape compatibility — handleQueueChangedNew below is the authoritative one.
      // Only handle if data is an array (old server format), the new format is handled below.
      if (Array.isArray(data)) {
        const newQueue = data;
        setSnapshot(prev => prev ? { ...prev, queue: newQueue } : prev);
      }
    };
    socket.on('room:queueChanged', handleQueueChanged);

    const handleReset = () => {
      audioRef.current.clearTrack();
      setSnapshot(prev => prev ? { ...prev, trackUrl: null, queue: [], isPlaying: false } : prev);
    };
    socket.on('room:reset', handleReset);

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
    };
    socket.on('room:participantLeft', handleParticipantLeft);

    // Register OS System Media Controls (macOS Menu Bar / Control Center / iOS / Android)
    if (typeof window !== "undefined" && "mediaSession" in navigator) {
      const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
        } catch (e) {}
      };

      setHandler("previoustrack", () => {
        prevTrack();
      });
      setHandler("nexttrack", () => {
        nextTrack();
      });
    }

    const handleUploadProgress = ({ title, progress }: { title: string; progress: number }) => {
      if (progress >= 100) {
        setIncomingTrack(null);
      } else {
        setIncomingTrack({ title, progress });
      }
    };
    socket.on('room:upload_progress', handleUploadProgress);

    const handleSyncProgress = ({ socketId, progress }: { socketId: string; progress: number }) => {
      setDeviceSyncProgress(prev => ({ ...prev, [socketId]: progress }));
    };
    socket.on('room:sync_progress', handleSyncProgress);

    const handleTrackSet = ({ trackUrl, title }: { trackUrl: string; title: string }) => {
      loadAndSetTrack(trackUrl, title);
    };
    socket.on('room:trackSet', handleTrackSet);

    const handleQueueChangedNew = ({ queue }: { queue: TrackQueueItem[] }) => {
      setSnapshot((prev) => prev ? { ...prev, queue } : prev);

      const newCurrentItem = queue.find((item) => item.isCurrent);

      if (queue.length === 0) {
        if (!snapshotRef.current?.isPlaying && !audioRef.current.isPlaying) {
          audioRef.current.clearTrack();
        }
      } else if (newCurrentItem) {
        const playingUrl = audioRef.current.trackUrl;
        if (!playingUrl || playingUrl !== newCurrentItem.trackUrl) {
          loadAndSetTrack(newCurrentItem.trackUrl, newCurrentItem.title);
        }
      }
    };
    socket.on('room:queueChanged', handleQueueChangedNew);

    const handleSchedule = (payload: PlaybackSchedulePayload) => {
      setSnapshot(prev => prev ? { ...prev, startEpoch: payload.startEpoch, pauseOffset: payload.fromPosition, isPlaying: true, state: PlaybackState.PLAYING, trackUrl: payload.trackUrl ?? prev.trackUrl } : prev);
      if (payload.trackUrl && audioRef.current.trackUrl !== payload.trackUrl) {
        loadAndSetTrack(payload.trackUrl, payload.title || getTrackTitle(payload.trackUrl, snapshotRef.current?.queue ?? []));
      }
      audioRef.current.scheduleStart(payload, clockOffsetRef.current);
    };
    socket.on('playback:schedule', handleSchedule);

    const handlePause = (payload: PlaybackPausePayload) => {
      setSnapshot(prev => prev ? { ...prev, startEpoch: null, pauseOffset: payload.pauseOffset, isPlaying: false, state: PlaybackState.PAUSED } : prev);
      audioRef.current.pauseAt(payload.pauseOffset);
    };
    socket.on('playback:pause', handlePause);

    const handlePendingApproval = () => setJoinStatus('pending');
    socket.on('room:joinPendingApproval', handlePendingApproval);

    const handleJoinApproved = () => setJoinStatus('joined');
    socket.on('room:joinApproved', handleJoinApproved);

    const handleJoinDenied = () => setJoinStatus('denied');
    socket.on('room:joinDenied', handleJoinDenied);

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
      audioRef.current.clearTrack();
      setSnapshot(prev => prev ? { ...prev, trackUrl: null, queue: [], isPlaying: false, state: PlaybackState.IDLE, startEpoch: null, pauseOffset: 0 } : prev);
      setIncomingTrack(null);
    };
    socket.on('room:reset', handleRoomReset);

    const handleDevicePing = ({ message }: { message: string, from: string }) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent("toast", { detail: { message, type: "info" } }));
      }
    };
    socket.on('device:ping', handleDevicePing);

    const handleError = ({ message }: { message: string }) => console.warn('[syncbeats]', message);
    socket.on('error', handleError);

    roomsApi.get(roomId).then(details => {
      if (!cancelled && !snapshotRef.current) applyRoomDetails(details);
    }).catch(() => {});

    // Note: NTP resync is owned by the dedicated self-scheduling useEffect above.
    // No duplicate interval here.

    return () => {
      cancelled = true;
      socket.emit('room:leave', { roomId });
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('room:snapshot', handleSnapshot);
      socket.off('room:stateChanged', handleStateChanged);
      socket.off('room:participantJoined', handleParticipantJoined);
      socket.off('room:participantLeft', handleParticipantLeft);
      socket.off('room:trackSet', handleTrackSet);
      socket.off('room:queueChanged', handleQueueChanged);
      socket.off('room:reset', handleReset);
      socket.off('playback:schedule', handleSchedule);
      socket.off('playback:pause', handlePause);
      socket.off('room:joinPendingApproval', handlePendingApproval);
      socket.off('room:joinApproved', handleJoinApproved);
      socket.off('room:joinDenied', handleJoinDenied);
      socket.off('room:hostJoinRequest', handleHostJoinRequest);
      socket.off('room:joinRequestResolved', handleJoinRequestResolved);
      socket.off('room:hostChanged', handleHostChanged);
      socket.off('device:ping', handleDevicePing);
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

    const localReady = audioRef.current?.isReady && !audioRef.current?.isBuffering;
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
    roomId,
  });

  const play  = useCallback(() => socket.emit('playback:play',  { roomId }), [socket, roomId]);
  const pause = useCallback(() => {
    socket.emit('playback:pause', {
      roomId,
      positionMs: Math.round(audioRef.current.getTruePosition() * 1000)
    });
  }, [socket, roomId]);
  const seek  = useCallback((p: number) => socket.emit('playback:seek', { roomId, position: p }), [socket, roomId]);
  const nextTrack = useCallback(() => socket.emit('playback:next', { roomId }), [socket, roomId]);
  const prevTrack = useCallback(() => socket.emit('playback:prev', { roomId }), [socket, roomId]);

  // Handle Track Completion (audioEnded) — auto-loop, auto-advance, or pause when queue finishes
  useEffect(() => {
    const handleAudioEnded = () => {
      const snap = snapshotRef.current;
      if (!snap) return;

      const repeatMode = snap.repeatMode ?? "off";
      const q = snap.queue ?? [];
      const currentIdx = q.findIndex(item => item.isCurrent);
      const hasNextInQueue = currentIdx >= 0 && currentIdx < q.length - 1;

      if (repeatMode === "track") {
        seek(0);
        play();
      } else if (hasNextInQueue || repeatMode === "all") {
        nextTrack();
      } else {
        pause();
      }
    };

    window.addEventListener("audioEnded", handleAudioEnded);
    return () => window.removeEventListener("audioEnded", handleAudioEnded);
  }, [seek, play, nextTrack, pause]);
  const setParticipantVolume = useCallback((targetSocketId: string, volume: number) =>
    socket.emit('room:setParticipantVolume', { roomId, targetSocketId, volume }), [socket, roomId]);

  const togglePrivate = useCallback((isPrivate: boolean) => socket.emit('room:togglePrivate', { roomId, isPrivate }), [socket, roomId]);
  const approveJoin = useCallback((targetSocketId: string, displayName: string) => {
    socket.emit('room:approveJoin', { roomId, targetSocketId, displayName });
    setPendingRequests(prev => prev.filter(r => r.socketId !== targetSocketId));
  }, [socket, roomId]);
  const denyJoin = useCallback((targetSocketId: string) => {
    socket.emit('room:denyJoin', { roomId, targetSocketId });
    setPendingRequests(prev => prev.filter(r => r.socketId !== targetSocketId));
  }, [socket, roomId]);
  const notifyHost = useCallback(() => socket.emit('room:notifyHost', { roomId, displayName }), [socket, roomId, displayName]);

  const leave = useCallback(() => {
    socket.emit('room:leave', { roomId });
    socket.disconnect();
  }, [socket, roomId]);

  const removeFromQueue = useCallback(async (itemId: string) => {
    socket.emit('room:removeFromQueue', { roomId, itemId });
    try {
      await roomsApi.removeFromQueue(roomId, itemId);
    } catch (err) {
      console.warn('[useRoom] removeFromQueue API error:', err);
    }
  }, [roomId, socket]);

  const resetRoom = useCallback(async () => {
    socket.emit('room:reset', { roomId });
    try {
      await roomsApi.reset(roomId);
    } catch (err) {
      console.warn('[useRoom] resetRoom API error:', err);
    }
  }, [roomId, socket]);

  return { snapshot, participants, isConnected, joinStatus, isReconnecting, pendingRequests, currentSocketId, clockOffset, allReady, play, pause, seek, nextTrack, prevTrack, setReady, setParticipantVolume, leave, togglePrivate, approveJoin, denyJoin, notifyHost, resetRoom, removeFromQueue, syncInFlightRef, hasClockSync, incomingTrack, deviceSyncProgress, networkQuality, prefetch };
}
