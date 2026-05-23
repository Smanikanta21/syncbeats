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
  clearTrack:  () => void;
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
  
  // YouTube state
  const isYoutubeMode = !!trackUrl?.startsWith("youtube:");
  const ytPlayerRef = useRef<any>(null);
  const ytReadyRef = useRef(false);

  const startTimeRef = useRef<number>(0);
  const pauseOffsetRef = useRef<number>(0);
  const pendingScheduleRef = useRef<{ payload: any; clockOffset: number } | null>(null);

  // Initialize AudioContext
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

  // Initialize YouTube IFrame
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!document.getElementById("global-youtube-player")) {
      const div = document.createElement("div");
      div.id = "global-youtube-player";
      div.style.position = "fixed";
      div.style.bottom = "20px";
      div.style.right = "20px";
      div.style.zIndex = "9999";
      div.style.width = "200px";
      div.style.height = "150px";
      div.style.pointerEvents = "none"; // so it doesn't block clicks
      document.body.appendChild(div);
    }

    if (!(window as any).YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const initYT = () => {
      if (ytPlayerRef.current) return;
      ytPlayerRef.current = new (window as any).YT.Player("global-youtube-player", {
        height: "150",
        width: "200",
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: (event: any) => {
            ytReadyRef.current = true;
            event.target.setVolume(volume);
          },
          onStateChange: (event: any) => {
            // 0 = ended
            if (event.data === 0) {
              setIsPlaying(false);
              setCurrentTime(0);
              document.dispatchEvent(new CustomEvent('audioEnded'));
            }
          }
        }
      });
    };

    if ((window as any).YT && (window as any).YT.Player) {
      initYT();
    } else {
      (window as any).onYouTubeIframeAPIReady = initYT;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopCurrentSource = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null;
      try {
        sourceNodeRef.current.stop();
      } catch (e) {}
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === "function") {
      ytPlayerRef.current.pauseVideo();
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

    // Attempt to unlock YouTube audio on mobile by forcing an unmute and play/pause during a user gesture
    if (ytPlayerRef.current && ytReadyRef.current) {
      try {
        if (typeof ytPlayerRef.current.unMute === "function") ytPlayerRef.current.unMute();
        if (typeof ytPlayerRef.current.setVolume === "function") ytPlayerRef.current.setVolume(100);
        
        // If not playing, explicitly play and pause to register the user gesture with iOS Safari
        if (typeof ytPlayerRef.current.playVideo === "function" && !isPlaying) {
          ytPlayerRef.current.playVideo();
          setTimeout(() => {
            if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === "function") {
              ytPlayerRef.current.pauseVideo();
            }
          }, 100);
        }
      } catch (e) {
        console.warn("Failed to unlock YouTube iframe", e);
      }
    }

    setTimeout(() => {
      const pending = pendingScheduleRef.current;
      if (pending) {
        pendingScheduleRef.current = null;
        const serverNow = Date.now() + pending.clockOffset;
        const elapsed = Math.max(0, (serverNow - pending.payload.startEpoch) / 1000);
        const adjustedPayload = {
          ...pending.payload,
          atEpoch: Date.now() + pending.clockOffset + 100,
          fromPosition: elapsed,
        };
        scheduleStartRef.current?.(adjustedPayload, pending.clockOffset);
      }
    }, 50);
  }, []);

  useEffect(() => {
    const unlock = () => { unlockAudio(); };
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
    if (!trackUrl) {
      audioBufferRef.current = null;
      fetchPromiseRef.current = null;
      setDuration(0);
      setIsReady(false);
      pauseAt(0);
      return;
    }

    if (trackUrl.startsWith("youtube:")) {
      const videoId = trackUrl.split(":")[1];
      const loadYT = () => {
        if (ytPlayerRef.current && ytReadyRef.current) {
          setIsReady(false);
          ytPlayerRef.current.cueVideoById(videoId);
          
          const checkReady = setInterval(() => {
            const dur = ytPlayerRef.current.getDuration();
            if (dur > 0) {
              clearInterval(checkReady);
              setDuration(dur);
              setIsReady(true);
            }
          }, 100);
          setTimeout(() => clearInterval(checkReady), 5000);
        } else {
          setTimeout(loadYT, 100);
        }
      };
      loadYT();
      pauseAt(0);
    } else {
      fetchAndDecode(trackUrl);
      pauseAt(0);
    }
  }, [trackUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = Math.max(0, Math.min(1, volume / 100));
    }
    if (ytPlayerRef.current && ytReadyRef.current && typeof ytPlayerRef.current.setVolume === "function") {
      ytPlayerRef.current.setVolume(Math.max(0, Math.min(100, Math.round(volume))));
    }
  }, [volume]);

  useEffect(() => {
    const tick = () => {
      if (isPlaying) {
        if (isYoutubeMode) {
          if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === "function") {
            setCurrentTime(ytPlayerRef.current.getCurrentTime());
          }
        } else {
          if (audioCtxRef.current) {
            const elapsed = Math.max(0, audioCtxRef.current.currentTime - startTimeRef.current);
            setCurrentTime(pauseOffsetRef.current + elapsed);
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafRef.current);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, isYoutubeMode]);

  const scheduleStartRef = useRef<((payload: any, clockOffset: number) => Promise<void>) | null>(null);

  const scheduleStart = useCallback(async (payload: any, clockOffset: number) => {
    stopCurrentSource();

    if (isYoutubeMode) {
      if (!ytPlayerRef.current || !ytReadyRef.current) return;
      const videoId = payload.trackUrl.split(":")[1];
      
      const localAtEpoch = payload.atEpoch - clockOffset;
      const msUntilStart = localAtEpoch - Date.now();

      if (msUntilStart > 50) {
        ytPlayerRef.current.loadVideoById({ videoId, startSeconds: payload.fromPosition });
        ytPlayerRef.current.pauseVideo();
        
        setTimeout(() => {
          ytPlayerRef.current.playVideo();
          setIsPlaying(true);
        }, msUntilStart);
        
        startTimeRef.current = Date.now() + msUntilStart;
        pauseOffsetRef.current = payload.fromPosition;
      } else {
        const correctPosition = payload.fromPosition + Math.abs(msUntilStart) / 1000;
        ytPlayerRef.current.loadVideoById({ videoId, startSeconds: correctPosition });
        ytPlayerRef.current.playVideo();
        setIsPlaying(true);
      }
      return;
    }

    if (!audioCtxRef.current) return;
    
    let buffer = audioBufferRef.current;
    if (!buffer && payload.trackUrl) {
       buffer = fetchPromiseRef.current ? await fetchPromiseRef.current : await fetchAndDecode(payload.trackUrl);
    }
    if (!buffer) return;

    if (audioCtxRef.current.state === 'suspended') {
      pendingScheduleRef.current = { payload, clockOffset };
      return;
    }

    const localAtEpoch = payload.atEpoch - clockOffset;
    const msUntilStart = localAtEpoch - Date.now();

    const source = audioCtxRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNodeRef.current!);
    
    source.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      document.dispatchEvent(new CustomEvent('audioEnded'));
    };

    if (msUntilStart > 50) {
      const hardwareLatency = (audioCtxRef.current.baseLatency || 0) + (audioCtxRef.current.outputLatency || 0);
      const audioCtxStartTime = Math.max(audioCtxRef.current.currentTime, audioCtxRef.current.currentTime + msUntilStart / 1000 - hardwareLatency);
      source.start(audioCtxStartTime, payload.fromPosition);
      sourceNodeRef.current = source;
      startTimeRef.current = audioCtxStartTime;
      pauseOffsetRef.current = payload.fromPosition;
    } else {
      const hardwareLatency = (audioCtxRef.current.baseLatency || 0) + (audioCtxRef.current.outputLatency || 0);
      const correctPosition = payload.fromPosition + Math.abs(msUntilStart) / 1000 + hardwareLatency;
      const clampedPosition = Math.min(correctPosition, buffer.duration - 0.1);
      source.start(0, Math.max(0, clampedPosition));
      sourceNodeRef.current = source;
      startTimeRef.current = audioCtxRef.current.currentTime;
      pauseOffsetRef.current = Math.max(0, clampedPosition);
    }
    
    setIsPlaying(true);
    setCurrentTime(pauseOffsetRef.current);
  }, [audioUnlocked, stopCurrentSource, isYoutubeMode]);

  scheduleStartRef.current = scheduleStart;

  const playNow = useCallback((expectedPosition: number) => {
    stopCurrentSource();

    if (isYoutubeMode) {
      if (!ytPlayerRef.current || !ytReadyRef.current) return;
      ytPlayerRef.current.seekTo(expectedPosition, true);
      ytPlayerRef.current.playVideo();
      setIsPlaying(true);
      return;
    }

    if (!audioCtxRef.current || !audioBufferRef.current) return;
    if (audioCtxRef.current.state === 'suspended' && !audioUnlocked) return;
    
    const source = audioCtxRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.connect(gainNodeRef.current!);
    
    source.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      document.dispatchEvent(new CustomEvent('audioEnded'));
    };

    const hardwareLatency = (audioCtxRef.current.baseLatency || 0) + (audioCtxRef.current.outputLatency || 0);
    const actualPosition = Math.min(audioBufferRef.current.duration - 0.1, expectedPosition + hardwareLatency);

    source.start(0, Math.max(0, actualPosition));
    sourceNodeRef.current = source;
    
    startTimeRef.current = audioCtxRef.current.currentTime;
    pauseOffsetRef.current = actualPosition;
    setIsPlaying(true);
    setCurrentTime(actualPosition);
  }, [audioUnlocked, stopCurrentSource, isYoutubeMode]);

  const pauseAt = useCallback((position: number) => {
    stopCurrentSource();
    setIsPlaying(false);
    pauseOffsetRef.current = position;
    setCurrentTime(position);
    
    if (isYoutubeMode && ytPlayerRef.current && ytReadyRef.current) {
      ytPlayerRef.current.seekTo(position, true);
      ytPlayerRef.current.pauseVideo();
    }
  }, [stopCurrentSource, isYoutubeMode]);

  const getTruePosition = useCallback(() => {
    if (!isPlaying) return pauseOffsetRef.current;
    if (isYoutubeMode && ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === "function") {
      return ytPlayerRef.current.getCurrentTime();
    }
    if (audioCtxRef.current) {
      const elapsed = Math.max(0, audioCtxRef.current.currentTime - startTimeRef.current);
      return pauseOffsetRef.current + elapsed;
    }
    return pauseOffsetRef.current;
  }, [isPlaying, isYoutubeMode]);

  const play = useCallback(() => {}, []);
  const pause = useCallback(() => {}, []);
  const toggle = useCallback(() => {}, []);
  const seek = useCallback((time: number) => {
    if (isPlaying) playNow(time);
    else pauseAt(time);
  }, [isPlaying, playNow, pauseAt]);

  const seekPct = useCallback((pct: number) => {
    const time = pct * duration;
    seek(time);
  }, [seek, duration]);

  const setVolume = useCallback((nextVolume: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(nextVolume)));
    setVolumeState(clamped);
  }, []);

  const setTrack = useCallback((url: string, title = "Unknown Track", artist = "") => {
    const absoluteUrl = (!url.startsWith('/') && !url.startsWith('http') && !url.startsWith('youtube:')) 
      ? `${getServerUrl()}/${url}` 
      : url.startsWith('/') ? `${getServerUrl()}${url}` : url;
    setTrackUrl(absoluteUrl);
    setTrackTitle(title);
    setTrackArtist(artist);
  }, []);

  const clearTrack = useCallback(() => {
    stopCurrentSource();
    setTrackUrl(null);
    setTrackTitle("");
    setTrackArtist("");
    setIsPlaying(false);
    setCurrentTime(0);
    pauseOffsetRef.current = 0;
    audioBufferRef.current = null;
    fetchPromiseRef.current = null;
  }, [stopCurrentSource]);

  const progress = duration > 0 ? currentTime / duration : 0;
  const hasTrack = trackUrl !== null && trackUrl.length > 0;

  return {
    isPlaying, isReady, hasTrack, audioUnlocked, currentTime, duration, progress, volume,
    trackUrl, trackTitle, trackArtist,
    play, pause, toggle, seek, seekPct, setVolume, setTrack, clearTrack, unlockAudio,
    scheduleStart, playNow, pauseAt, getTruePosition,
    audioEl: null,
  };
}
