"use client";

// hooks/useAudioPlayer.ts — Centralized audio playback engine
// No demo track. trackUrl starts null — user must upload.

import { useEffect, useRef, useState, useCallback } from "react";

export interface AudioPlayerState {
  isPlaying:     boolean;
  isReady:       boolean;
  hasTrack:      boolean;       // true once a track URL is loaded
  audioUnlocked: boolean;       // true after user has tapped/clicked (unlocks autoplay)
  currentTime:   number;       // seconds
  duration:      number;       // seconds
  progress:      number;       // 0–1
  volume:        number;       // 0–100
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
  unlockAudio: () => void;   // call from a click/tap handler to grant autoplay
  audioEl:     HTMLAudioElement | null;
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

import { getServerUrl } from '../lib/api';

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
  // Has the user tapped/clicked on this device? Required by browser autoplay policy.
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const readyOnce = useRef(false); // prevent canplaythrough spam from rate changes

  // Persist a single Audio instance to retain mobile gesture blessings
  const [audioEl] = useState<HTMLAudioElement | null>(() => {
    if (typeof window !== "undefined") {
      const a = new Audio();
      a.preload = "auto";
      return a;
    }
    return null;
  });

  // Attach global event listeners once
  useEffect(() => {
    if (!audioEl) return;
    
    const onMeta    = () => setDuration(audioEl.duration);
    const onCanPlay = () => {
      // canplaythrough fires after every playbackRate change.
      // Use readyOnce so we only set isReady=true once per track load,
      // preventing the room:clientReady spam seen in server logs.
      if (!readyOnce.current) {
        readyOnce.current = true;
        setIsReady(true);
      }
    };
    // Only mark not-ready on actual buffer stall (the 'waiting' event).
    // This is distinct from rate changes which also fire canplaythrough.
    const onWaiting = () => { setIsReady(false); readyOnce.current = false; };
    const onEnded   = () => { setIsPlaying(false); setCurrentTime(0); };

    audioEl.addEventListener("loadedmetadata", onMeta);
    audioEl.addEventListener("canplaythrough",  onCanPlay);
    audioEl.addEventListener("waiting",         onWaiting);
    audioEl.addEventListener("ended",           onEnded);

    return () => {
      audioEl.removeEventListener("loadedmetadata", onMeta);
      audioEl.removeEventListener("canplaythrough",  onCanPlay);
      audioEl.removeEventListener("waiting",         onWaiting);
      audioEl.removeEventListener("ended",           onEnded);
    };
  }, [audioEl]);

  // Load new track — reset readyOnce so canplaythrough fires fresh
  useEffect(() => {
    if (!audioEl) return;
    setIsReady(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    readyOnce.current = false;
    cancelAnimationFrame(rafRef.current);

    if (trackUrl) {
      audioEl.src = trackUrl;
      audioEl.load();
      // Attempt a silent play to pre-warm the audio context.
      // This only succeeds if the user has already tapped the page (audioUnlocked).
      // If it fails (NotAllowedError) we catch silently — the unlock overlay handles it.
      audioEl.play().then(() => audioEl.pause()).catch(() => {});
    } else {
      audioEl.pause();
      audioEl.src = "";
    }
  }, [trackUrl, audioEl]);

  useEffect(() => {
    if (!audioEl) return;
    audioEl.volume = Math.max(0, Math.min(1, volume / 100));
  }, [audioEl, volume]);

  // RAF loop for real-time time updates
  useEffect(() => {
    const tick = () => {
      if (audioEl) {
        setCurrentTime(audioEl.currentTime);
        if (audioEl.duration) setDuration(audioEl.duration);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafRef.current);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, audioEl]);

  const play = useCallback(() => {
    if (!audioEl) return;
    audioEl.play().catch(() => {
      // NotAllowedError — user hasn't interacted yet.
      // The unlock overlay should appear; we do nothing here.
    });
    setIsPlaying(true);
  }, [audioEl]);

  const pause = useCallback(() => {
    audioEl?.pause();
    setIsPlaying(false);
  }, [audioEl]);

  const toggle = useCallback(() => {
    if (isPlaying) pause(); else play();
  }, [isPlaying, play, pause]);

  const seek = useCallback((time: number) => {
    if (audioEl) {
      audioEl.currentTime = Math.max(0, Math.min(time, audioEl.duration || 0));
      setCurrentTime(audioEl.currentTime);
    }
  }, [audioEl]);

  const seekPct = useCallback((pct: number) => {
    if (audioEl?.duration) seek(pct * audioEl.duration);
  }, [seek, audioEl]);

  const setVolume = useCallback((nextVolume: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(nextVolume)));
    setVolumeState(clamped);
    if (audioEl) {
      audioEl.volume = clamped / 100;
    }
  }, [audioEl]);

  // Called when user taps the "Enable Audio" overlay.
  // This creates the user-gesture context that unlocks autoplay for the session.
  const unlockAudio = useCallback(() => {
    if (!audioEl || audioUnlocked) return;
    // A play+pause inside a click handler is the standard unlock technique
    audioEl.play().then(() => {
      audioEl.pause();
      audioEl.currentTime = 0;
      setAudioUnlocked(true);
    }).catch(() => {
      // Already paused / no src yet — still mark as unlocked
      setAudioUnlocked(true);
    });
  }, [audioEl, audioUnlocked]);

  const setTrack = useCallback((url: string, title = "Unknown Track", artist = "") => {
    // If the server gave us a relative path, resolve it against the exact IP the frontend talks to
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
    get audioEl() { return audioEl; },
  };
}
