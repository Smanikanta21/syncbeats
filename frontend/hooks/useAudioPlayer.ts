"use client";

// hooks/useAudioPlayer.ts — Centralized audio playback engine
// No demo track. trackUrl starts null — user must upload.

import { useEffect, useRef, useState, useCallback } from "react";

export interface AudioPlayerState {
  isPlaying:   boolean;
  isReady:     boolean;
  hasTrack:    boolean;       // true once a track URL is loaded
  currentTime: number;       // seconds
  duration:    number;       // seconds
  progress:    number;       // 0–1
  trackUrl:    string | null;
  trackTitle:  string;
  trackArtist: string;
}

interface UseAudioPlayerReturn extends AudioPlayerState {
  play:     () => void;
  pause:    () => void;
  toggle:   () => void;
  seek:     (time: number) => void;
  seekPct:  (pct: number) => void;
  setTrack: (url: string, title?: string, artist?: string) => void;
  audioEl:  HTMLAudioElement | null;
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
  const [trackUrl,    setTrackUrl]    = useState<string | null>(null);
  const [trackTitle,  setTrackTitle]  = useState("");
  const [trackArtist, setTrackArtist] = useState("");

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
    const onCanPlay = () => setIsReady(true);
    const onWaiting = () => setIsReady(false);
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

  // Load new track
  useEffect(() => {
    if (!audioEl) return;
    setIsReady(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    cancelAnimationFrame(rafRef.current);

    if (trackUrl) {
      audioEl.src = trackUrl;
      audioEl.load();
      audioEl.play().then(() => audioEl.pause()).catch(() => {}); // silent play to force mobile buffer
    } else {
      audioEl.pause();
      audioEl.src = "";
    }
  }, [trackUrl, audioEl]);

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
    audioEl?.play().catch(() => {});
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
    isPlaying, isReady, hasTrack, currentTime, duration, progress,
    trackUrl, trackTitle, trackArtist,
    play, pause, toggle, seek, seekPct, setTrack,
    get audioEl() { return audioEl; },
  };
}
