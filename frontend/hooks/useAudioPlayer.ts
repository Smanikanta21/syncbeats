"use client";

// hooks/useAudioPlayer.ts — Centralized audio playback engine
// Controls a singleton <audio> element, exposes play/pause/seek + real-time position.

import { useEffect, useRef, useState, useCallback } from "react";

export interface AudioPlayerState {
  isPlaying:   boolean;
  isReady:     boolean;
  currentTime: number;   // seconds
  duration:    number;   // seconds
  progress:    number;   // 0–1
  trackUrl:    string;
  trackTitle:  string;
  trackArtist: string;
  isRoomHost: boolean;
  allDevicesReady: boolean;
  roomCallbacks: {play:()=>void, pause:()=>void, seek:(ms:number)=>void} | null;
}

interface UseAudioPlayerReturn extends AudioPlayerState {
  setIsRoomHost: (host: boolean) => void;
  setAllDevicesReady: (ready: boolean) => void;
  setRoomCallbacks: (callbacks: {play:()=>void, pause:()=>void, seek:(ms:number)=>void} | null) => void;
  play:    () => void;
  pause:   () => void;
  toggle:  () => void;
  seek:    (time: number) => void;    // seconds
  seekPct: (pct: number) => void;     // 0–1
  setTrack: (url: string, title?: string, artist?: string) => void;
  audioEl: HTMLAudioElement | null;
}

// Format seconds → mm:ss
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// Default demo track
const DEMO_URL    = "/Dhruv - double take (Official Video).mp3";
const DEMO_TITLE  = "Double Take";
const DEMO_ARTIST = "Dhruv";

export function useAudioPlayer(): UseAudioPlayerReturn {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef   = useRef<number>(0);

  const [isPlaying,   setIsPlaying]   = useState(false);
  const [isReady,     setIsReady]     = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [trackUrl,    setTrackUrl]    = useState(DEMO_URL);
  const [trackTitle,  setTrackTitle]  = useState(DEMO_TITLE);
  const [trackArtist, setTrackArtist] = useState(DEMO_ARTIST);

  const [isRoomHost, setIsRoomHost] = useState(false);
  const [allDevicesReady, setAllDevicesReady] = useState(true);
  const [roomCallbacks, setRoomCallbacks] = useState<{play:()=>void, pause:()=>void, seek:(ms:number)=>void} | null>(null);

  // Create audio element once
  useEffect(() => {
    setIsReady(false);
    const audio = new Audio(trackUrl);
    audio.preload = "auto"; // Changed from metadata to auto to force buffering
    audioRef.current = audio;

    const onLoaded   = () => setDuration(audio.duration);
    const onCanPlay  = () => setIsReady(true);
    const onWaiting  = () => setIsReady(false);
    const onEnded    = () => { setIsPlaying(false); setCurrentTime(0); };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("canplaythrough", onCanPlay);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("ended", onEnded);

    return () => {
      cancelAnimationFrame(rafRef.current);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("canplaythrough", onCanPlay);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      audio.src = "";
    };
  }, [trackUrl]);

  // requestAnimationFrame loop for smooth real-time updates
  useEffect(() => {
    const tick = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
        if (audioRef.current.duration) setDuration(audioRef.current.duration);
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

  const play = useCallback(() => {
    audioRef.current?.play().catch(() => {});
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) pause(); else play();
  }, [isPlaying, play, pause]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(time, audioRef.current.duration || 0));
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const seekPct = useCallback((pct: number) => {
    if (audioRef.current && audioRef.current.duration) {
      seek(pct * audioRef.current.duration);
    }
  }, [seek]);

  const setTrack = useCallback((url: string, title = "Unknown", artist = "Unknown") => {
    setTrackUrl(url);
    setTrackTitle(title);
    setTrackArtist(artist);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setIsReady(false);
  }, []);

  const progress = duration > 0 ? currentTime / duration : 0;

  return {
    isPlaying, isReady, currentTime, duration, progress,
    trackUrl, trackTitle, trackArtist,
    play, pause, toggle, seek, seekPct, setTrack,
    isRoomHost, allDevicesReady, roomCallbacks,
    setIsRoomHost, setAllDevicesReady, setRoomCallbacks,
    // Add raw ref access if page needs to precisely override time
    get audioEl() { return audioRef.current; }
  };
}
