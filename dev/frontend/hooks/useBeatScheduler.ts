"use client";

import { useEffect, useState, useRef } from "react";
import { useBeatEngine, BeatEvent } from "../context/BeatContext";
import { useOptionalAudio } from "../context/AudioContext";
import { useRealtimeBeatDetector } from "./useRealtimeBeatDetector";
import { useSyncInfo } from "../context/SyncContext";
import { getServerUrl, getAuthToken } from "../lib/api";

export function useBeatScheduler(trackUrl?: string | null) {
  const { emitBeat } = useBeatEngine();
  const audioContext = useOptionalAudio();
  const { isRoomPlaying: isPlaying } = useSyncInfo();
  
  const [cachedEvents, setCachedEvents] = useState<BeatEvent[] | null>(null);
  const [useFallback, setUseFallback] = useState(!trackUrl);
  const nextEventIdx = useRef(0);
  const rafRef = useRef(0);

  // 1. Fetch pre-analyzed events if trackUrl is available
  useEffect(() => {
    if (!trackUrl) {
      setUseFallback(true);
      return;
    }
    
    let isMounted = true;
    
    const serverUrl = getServerUrl();
    const token = getAuthToken();

    fetch(`${serverUrl}/spotify/audio-analysis?trackUrl=${encodeURIComponent(trackUrl)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) {
          // Gracefully fallback to FFT for non-Spotify tracks or when analysis is unavailable
          setUseFallback(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!isMounted || !data) return;
        if (data.events && data.events.length > 0) {
          setCachedEvents(data.events);
          setUseFallback(false);
          nextEventIdx.current = 0;
        } else {
          setUseFallback(true);
        }
      })
      .catch(() => {
        if (isMounted) setUseFallback(true);
      });

    return () => {
      isMounted = false;
    };
  }, [trackUrl]);

  // 2. Schedule and emit pre-analyzed events based on AudioContext time
  useEffect(() => {
    if (useFallback || !cachedEvents || cachedEvents.length === 0 || !audioContext?.audioCtx) {
      return;
    }

    const checkAndEmit = () => {
      rafRef.current = requestAnimationFrame(checkAndEmit);
      
      if (!isPlaying || !audioContext.isPlaying) return;

      // This logic requires we know the "track start time" in the AudioContext timeline.
      // Usually, audioContext tracks how much of the song has played.
      // E.g., if the user seeks, the context must know.
      // We will assume audioContext exposes something like `getCurrentTimeMs()` or we use `positionMs` from room state
      // For precision, we use the `AudioContext.currentTime` coupled with the known track start time.
      
      const currentPosMs = audioContext.getTruePosition ? audioContext.getTruePosition() * 1000 : (audioContext.currentTime ? audioContext.currentTime * 1000 : 0);
      
      // Fast forward if we seeked
      while (
        nextEventIdx.current < cachedEvents.length &&
        cachedEvents[nextEventIdx.current].timestamp < currentPosMs - 200
      ) {
        nextEventIdx.current++;
      }

      // Emit if it's time
      while (
        nextEventIdx.current < cachedEvents.length &&
        cachedEvents[nextEventIdx.current].timestamp <= currentPosMs + 16 // lookahead 1 frame
      ) {
        emitBeat(cachedEvents[nextEventIdx.current]);
        nextEventIdx.current++;
      }
    };

    rafRef.current = requestAnimationFrame(checkAndEmit);
    return () => cancelAnimationFrame(rafRef.current);
  }, [useFallback, cachedEvents, isPlaying, audioContext, emitBeat]);

  // 3. Fallback to real-time FFT if needed
  useRealtimeBeatDetector(useFallback);
}
