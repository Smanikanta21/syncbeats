"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getServerUrl } from '../lib/api';

export interface AudioPlayerState {
  isPlaying:     boolean;
  isReady:       boolean;
  hasTrack:      boolean;       
  audioUnlocked: boolean;       
  currentTime:   number;       
  duration:      number;       
  progress:      number;       
  volume:        number;       
  trackUrl:      string | null;
  trackTitle:    string;
  trackArtist:   string;
}

interface UseAudioPlayerReturn extends AudioPlayerState {
  play:        () => void;
  pause:       () => void;
  toggle:      () => void;
  seek:        (time: number) => void;
  seekPct:     (pct: number) => void;
  setVolume:   (volume: number) => void;
  setTrack:    (url: string, title?: string, artist?: string) => void;
  unlockAudio: () => void;
  scheduleStart: (payload: any, clockOffset: number) => Promise<void>;
  playNow:     (expectedPosition: number) => void;
  pauseAt:     (position: number) => void;
  getTruePosition: () => number;
  audioEl:     HTMLAudioElement | null;
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const rafRef   = useRef<number>(0);

  const [isPlaying,   setIsPlaying]   = useState(false);
  const [isReady,     setIsReady]     = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [volume,      setVolumeState] = useState(100);
  const [trackUrl,    setTrackUrl]    = useState<string | null>(null);
  const [trackTitle,  setTrackTitle]  = useState("");
  const [trackArtist, setTrackArtist] = useState("");
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const fetchPromiseRef = useRef<Promise<AudioBuffer | null> | null>(null);
  
  const startTimeRef = useRef<number>(0);
  const pauseOffsetRef = useRef<number>(0);
  const pendingScheduleRef = useRef<{ payload: any; clockOffset: number } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass && !audioCtxRef.current) {
        audioCtxRef.current = new AudioContextClass();
        gainNodeRef.current = audioCtxRef.current.createGain();
        gainNodeRef.current.connect(audioCtxRef.current.destination);
      }
    }
  }, []);

  const unlockAudio = useCallback(async () => {
    if (!audioCtxRef.current) return;
    if (audioCtxRef.current.state === 'suspended') {
      try {
        await audioCtxRef.current.resume();
        setAudioUnlocked(true);
      } catch {
        console.warn("Failed to resume AudioContext");
        return;
      }
    } else {
      setAudioUnlocked(true);
    }
    // Flush any pending schedule that arrived before user interaction
    setTimeout(() => {
      const pending = pendingScheduleRef.current;
      if (pending) {
        pendingScheduleRef.current = null;
        // Recalculate: the original atEpoch is likely in the past now.
        // Compute where the song SHOULD be right now based on startEpoch.
        const serverNow = Date.now() + pending.clockOffset;
        const elapsed = Math.max(0, (serverNow - pending.payload.startEpoch) / 1000);
        const adjustedPayload = {
          ...pending.payload,
          atEpoch: Date.now() + pending.clockOffset + 100, // start in 100ms
          fromPosition: elapsed,
        };
        console.log(`[Audio] Flushing pending schedule: seeking to ${elapsed.toFixed(1)}s`);
        scheduleStartRef.current?.(adjustedPayload, pending.clockOffset);
      }
    }, 50);
  }, []);

  useEffect(() => {
    const unlock = () => {
      unlockAudio();
    };
    // Use multiple events to ensure iOS Safari catches the user gesture
    document.addEventListener('touchstart', unlock, { once: true, passive: true });
    document.addEventListener('click', unlock, { once: true, passive: true });
    document.addEventListener('pointerdown', unlock, { once: true, passive: true });
    return () => {
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('click', unlock);
      document.removeEventListener('pointerdown', unlock);
    };
  }, [unlockAudio]);

  const fetchAndDecode = async (url: string) => {
    if (!audioCtxRef.current) return null;
    
    // If already fetching this url, return the existing promise
    if (fetchPromiseRef.current) return fetchPromiseRef.current;

    const promise = (async () => {
      setIsReady(false);
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const decodedData = await audioCtxRef.current!.decodeAudioData(arrayBuffer);
        audioBufferRef.current = decodedData;
        setDuration(decodedData.duration);
        setIsReady(true);
        return decodedData;
      } catch (err) {
        console.error("Error decoding audio data", err);
        return null;
      } finally {
        fetchPromiseRef.current = null;
      }
    })();

    fetchPromiseRef.current = promise;
    return promise;
  };

  useEffect(() => {
    if (trackUrl) {
      fetchAndDecode(trackUrl);
    } else {
      audioBufferRef.current = null;
      fetchPromiseRef.current = null;
      setDuration(0);
      setIsReady(false);
    }
    pauseAt(0);
  }, [trackUrl]);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = Math.max(0, Math.min(1, volume / 100));
    }
  }, [volume]);

  useEffect(() => {
    const tick = () => {
      if (isPlaying && audioCtxRef.current) {
        const elapsed = Math.max(0, audioCtxRef.current.currentTime - startTimeRef.current);
        setCurrentTime(pauseOffsetRef.current + elapsed);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafRef.current);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  const stopCurrentSource = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null;
      try {
        sourceNodeRef.current.stop();
      } catch (e) {}
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
  }, []);

  // Ref to latest scheduleStart so pendingSchedule flush can call it
  const scheduleStartRef = useRef<((payload: any, clockOffset: number) => Promise<void>) | null>(null);

  const scheduleStart = useCallback(async (payload: any, clockOffset: number) => {
    if (!audioCtxRef.current) return;
    
    let buffer = audioBufferRef.current;
    if (!buffer && payload.trackUrl) {
       buffer = fetchPromiseRef.current ? await fetchPromiseRef.current : await fetchAndDecode(payload.trackUrl);
    }
    if (!buffer) {
      console.warn('[Audio] No buffer available, cannot play');
      return;
    }

    if (audioCtxRef.current.state === 'suspended') {
      // Store for replay once user unlocks audio
      console.warn("AudioContext suspended — queuing schedule for after user gesture");
      pendingScheduleRef.current = { payload, clockOffset };
      return;
    }

    const localAtEpoch = payload.atEpoch - clockOffset;
    const msUntilStart = localAtEpoch - Date.now();

    stopCurrentSource();

    const source = audioCtxRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNodeRef.current!);
    
    source.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      document.dispatchEvent(new CustomEvent('audioEnded'));
    };

    if (msUntilStart > 50) {
      // Schedule in the future — normal sync path
      const audioCtxStartTime = audioCtxRef.current.currentTime + msUntilStart / 1000;
      source.start(audioCtxStartTime, payload.fromPosition);
      sourceNodeRef.current = source;
      startTimeRef.current = audioCtxStartTime;
      pauseOffsetRef.current = payload.fromPosition;
    } else {
      // atEpoch is in the past (stale pending or late arrival) — play NOW at the correct position
      const correctPosition = payload.fromPosition + Math.abs(msUntilStart) / 1000;
      const clampedPosition = Math.min(correctPosition, buffer.duration - 0.1);
      console.log(`[Audio] Late start: jumping to ${clampedPosition.toFixed(1)}s`);
      source.start(0, Math.max(0, clampedPosition));
      sourceNodeRef.current = source;
      startTimeRef.current = audioCtxRef.current.currentTime;
      pauseOffsetRef.current = Math.max(0, clampedPosition);
    }
    
    setIsPlaying(true);
    setCurrentTime(pauseOffsetRef.current);
  }, [audioUnlocked, stopCurrentSource]);

  // Keep ref in sync so unlockAudio can flush pending schedule
  scheduleStartRef.current = scheduleStart;

  const playNow = useCallback((expectedPosition: number) => {
    if (!audioCtxRef.current || !audioBufferRef.current) return;
    if (audioCtxRef.current.state === 'suspended' && !audioUnlocked) return;
    
    stopCurrentSource();
    
    const source = audioCtxRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.connect(gainNodeRef.current!);
    
    source.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      document.dispatchEvent(new CustomEvent('audioEnded'));
    };

    source.start(0, expectedPosition);
    sourceNodeRef.current = source;
    
    startTimeRef.current = audioCtxRef.current.currentTime;
    pauseOffsetRef.current = expectedPosition;
    setIsPlaying(true);
    setCurrentTime(expectedPosition);
  }, [audioUnlocked, stopCurrentSource]);

  const pauseAt = useCallback((position: number) => {
    stopCurrentSource();
    setIsPlaying(false);
    pauseOffsetRef.current = position;
    setCurrentTime(position);
  }, [stopCurrentSource]);

  const getTruePosition = useCallback(() => {
    if (!isPlaying || !audioCtxRef.current) return pauseOffsetRef.current;
    const elapsed = Math.max(0, audioCtxRef.current.currentTime - startTimeRef.current);
    return pauseOffsetRef.current + elapsed;
  }, [isPlaying]);

  const play = useCallback(() => {}, []);
  const pause = useCallback(() => {}, []);
  const toggle = useCallback(() => {}, []);
  const seek = useCallback((time: number) => {}, []);
  const seekPct = useCallback((pct: number) => {}, []);

  const setVolume = useCallback((nextVolume: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(nextVolume)));
    setVolumeState(clamped);
  }, []);

  const setTrack = useCallback((url: string, title = "Unknown Track", artist = "") => {
    const absoluteUrl = url.startsWith('/') ? `${getServerUrl()}${url}` : url;
    setTrackUrl(absoluteUrl);
    setTrackTitle(title);
    setTrackArtist(artist);
  }, []);

  const progress = duration > 0 ? currentTime / duration : 0;
  const hasTrack = trackUrl !== null && trackUrl.length > 0;

  return {
    isPlaying, isReady, hasTrack, audioUnlocked, currentTime, duration, progress, volume,
    trackUrl, trackTitle, trackArtist,
    play, pause, toggle, seek, seekPct, setVolume, setTrack, unlockAudio,
    scheduleStart, playNow, pauseAt, getTruePosition,
    audioEl: null,
  };
}
