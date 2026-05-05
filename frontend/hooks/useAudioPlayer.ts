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

  const unlockAudio = useCallback(() => {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().then(() => {
          setAudioUnlocked(true);
        }).catch(() => {
          console.warn("Failed to resume AudioContext");
        });
      } else {
        setAudioUnlocked(true);
      }
    }
  }, []);

  useEffect(() => {
    const unlock = () => {
      unlockAudio();
    };
    document.addEventListener('pointerdown', unlock, { once: true, passive: true });
    return () => document.removeEventListener('pointerdown', unlock);
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
        const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
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

  const scheduleStart = useCallback(async (payload: any, clockOffset: number) => {
    if (!audioCtxRef.current) return;
    
    let buffer = audioBufferRef.current;
    if (!buffer && payload.trackUrl) {
       buffer = fetchPromiseRef.current ? await fetchPromiseRef.current : await fetchAndDecode(payload.trackUrl);
    }
    if (!buffer) return;

    if (audioCtxRef.current.state === 'suspended' && !audioUnlocked) {
      console.warn("AudioContext suspended, waiting for user gesture...");
      return;
    }

    const localAtEpoch = payload.atEpoch - clockOffset;
    const audioCtxStartTime = audioCtxRef.current.currentTime + (localAtEpoch - performance.now()) / 1000;
    const playTime = Math.max(audioCtxStartTime, audioCtxRef.current.currentTime + 0.01);

    stopCurrentSource();

    const source = audioCtxRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNodeRef.current!);
    
    source.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      document.dispatchEvent(new CustomEvent('audioEnded'));
    };

    source.start(playTime, payload.fromPosition);
    sourceNodeRef.current = source;
    
    startTimeRef.current = playTime;
    pauseOffsetRef.current = payload.fromPosition;
    
    setIsPlaying(true);
    setCurrentTime(payload.fromPosition);
  }, [audioUnlocked, stopCurrentSource]);

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
    scheduleStart, playNow, pauseAt,
    audioEl: null,
  };
}
