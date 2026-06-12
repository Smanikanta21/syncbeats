"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getServerUrl } from '../lib/api';
import { getWebTorrentClient } from '../lib/webtorrent';

export interface AudioPlayerState {
  isPlaying:     boolean;
  isReady:       boolean;
  isBuffering:   boolean;
  hasTrack:      boolean;       
  audioUnlocked: boolean;       
  currentTime:   number;       
  duration:      number;       
  progress:      number;       
  volume:        number;       
  trackUrl:      string | null;
  trackTitle:    string;
  trackArtist:   string;
  isSyncing:     boolean;
  syncProgress:  number;
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
  setPlaybackRate: (rate: number) => void;
  audioEl:     HTMLAudioElement | null;
  audioCtx?:   AudioContext | null;
  gainNode?:   GainNode | null;
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
  const [isBuffering, setIsBuffering] = useState(false);
  const [isSyncing,   setIsSyncing]   = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
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
  const playbackRateRef = useRef<number>(1);
  
  // YouTube state
  const isYoutubeMode = !!trackUrl?.startsWith("youtube:");
  const ytPlayerRef = useRef<any>(null);
  const ytReadyRef = useRef(false);
  // Track which video ID was loaded during a user gesture (for iOS unlock)
  const ytGestureVideoIdRef = useRef<string | null>(null);
  const ytLoadedVideoIdRef = useRef<string | null>(null);
  // Track buffering state to prevent drift correction seek spam
  const ytBufferingRef = useRef(false);
  // Cooldown: timestamp of last drift-correction seek (prevents re-seek while YT buffers)
  const ytLastSeekRef = useRef<number>(0);
  // Active schedule: stores the server timeline so we can re-sync after buffering
  const ytScheduleRef = useRef<{ startEpoch: number; clockOffset: number } | null>(null);

  const startTimeRef = useRef<number>(0);
  const pauseOffsetRef = useRef<number>(0);
  const pendingScheduleRef = useRef<{ payload: any; clockOffset: number } | null>(null);
  const unlockTimeoutRef = useRef<number | null>(null);

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
      div.style.left = "-9999px";
      div.style.top = "-9999px";
      div.style.width = "1px";
      div.style.height = "1px";
      div.style.opacity = "0.01";
      div.style.zIndex = "-9999";
      div.style.pointerEvents = "none";
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
          autoplay: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            ytReadyRef.current = true;
            event.target.setVolume(volume);
            try {
              const iframe = event.target.getIframe();
              if (iframe) {
                iframe.setAttribute("allow", "autoplay; encrypted-media; gyroscope; accelerometer");
              }
            } catch (e) {
              console.warn("Failed to set allow attribute on YouTube iframe", e);
            }
          },
          onStateChange: (event: any) => {
            const YT_STATES = { BUFFERING: 3, PLAYING: 1, ENDED: 0, PAUSED: 2 };
            
            if (event.data === YT_STATES.BUFFERING) {
              ytBufferingRef.current = true;
              setIsBuffering(true);
            }
            
            if (event.data === YT_STATES.PLAYING) {
              const wasBuffering = ytBufferingRef.current;
              ytBufferingRef.current = false;
              setIsBuffering(false);
              
              // After buffering → playing, snap to the correct server-synchronized position.
              // This is the KEY fix: YouTube takes variable time to buffer after seekTo(),
              // so we re-calculate where we should be RIGHT NOW and seek there.
              if (wasBuffering && ytScheduleRef.current && ytPlayerRef.current) {
                const { startEpoch, clockOffset } = ytScheduleRef.current;
                const nowServer = Date.now() + clockOffset;
                const expected = Math.max(0, (nowServer - startEpoch) / 1000);
                const actual = ytPlayerRef.current.getCurrentTime();
                const driftMs = Math.abs(actual - expected) * 1000;
                
                // If we're more than 300ms off after buffering, correct immediately
                if (driftMs > 300) {
                  ytPlayerRef.current.seekTo(expected, true);
                  pauseOffsetRef.current = expected;
                  startTimeRef.current = Date.now();
                }
              }
              
              document.dispatchEvent(new CustomEvent('ytBufferEnd'));
            }
            
            if (event.data === YT_STATES.ENDED) {
              ytBufferingRef.current = false;
              ytScheduleRef.current = null;
              setIsBuffering(false);
              setIsPlaying(false);
              setCurrentTime(0);
              document.dispatchEvent(new CustomEvent('audioEnded'));
            }
            
            if (event.data === YT_STATES.PAUSED) {
              ytBufferingRef.current = false;
              setIsBuffering(false);
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

  const getTruePosition = useCallback(() => {
    if (!isPlaying) return pauseOffsetRef.current;
    
    if (isYoutubeMode) {
      // Return -1 while buffering so callers know to skip drift correction
      if (ytBufferingRef.current) return -1;
      if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === "function") {
        const ytTime = ytPlayerRef.current.getCurrentTime();
        if (ytTime > 0) return ytTime;
      }
    }
    
    // For WebAudio, use the same clock (audioCtx.currentTime) that scheduled playback
    // This avoids drift caused by comparing server NTP time against Date.now()
    if (audioCtxRef.current && !isYoutubeMode) {
      const elapsed = Math.max(0, audioCtxRef.current.currentTime - startTimeRef.current) * playbackRateRef.current;
      return pauseOffsetRef.current + elapsed;
    }
    // Fallback for YouTube when getCurrentTime returns 0
    const elapsed = ((Date.now() - startTimeRef.current) / 1000) * playbackRateRef.current;
    return pauseOffsetRef.current + elapsed;
  }, [isPlaying, isYoutubeMode]);

  const unlockAudio = useCallback(async () => {
    if (!audioCtxRef.current) return;

    // Quick path if already fully unlocked
    const isCtxRunning = audioCtxRef.current.state === 'running';
    let isYtUnlocked = false;
    if (isYoutubeMode) {
      const videoId = trackUrl?.split(":")[1];
      if (videoId && ytLoadedVideoIdRef.current === videoId) {
        isYtUnlocked = true;
      }
    } else {
      isYtUnlocked = true;
    }

    if (isCtxRunning && isYtUnlocked) {
      return;
    }

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

    // Pre-load the YouTube video DURING the user gesture so iOS allows playback.
    // iOS blocks loadVideoById in non-gesture contexts (like socket callbacks),
    // but allows seekTo/playVideo on an already-loaded video.
    if (isYoutubeMode && ytPlayerRef.current && ytReadyRef.current) {
      const videoId = trackUrl!.split(":")[1];
      if (ytLoadedVideoIdRef.current !== videoId) {
        try {
          if (typeof ytPlayerRef.current.unMute === "function") ytPlayerRef.current.unMute();
          if (typeof ytPlayerRef.current.setVolume === "function") ytPlayerRef.current.setVolume(100);
          
          const expectedPos = getTruePosition();
          ytPlayerRef.current.loadVideoById({ videoId, startSeconds: expectedPos });
          
          ytGestureVideoIdRef.current = videoId;
          ytLoadedVideoIdRef.current = videoId;
          
          // If the room state is actually paused, pause after unlocking
          if (!isPlaying) {
            if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);
            unlockTimeoutRef.current = window.setTimeout(() => {
              if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === "function") {
                ytPlayerRef.current.pauseVideo();
              }
            }, 400);
          }
        } catch (e) {
          console.warn("Failed to unlock YouTube iframe", e);
        }
      }
    }

    setTimeout(() => {
      const pending = pendingScheduleRef.current;
      if (pending) {
        pendingScheduleRef.current = null;
        const serverNow = Date.now() + pending.clockOffset;
        const elapsed = Math.max(0, (serverNow - pending.payload.startEpoch) / 1000);
        
        // For YouTube, store the schedule timeline for re-sync after buffering
        if (pending.payload.trackUrl?.startsWith('youtube:')) {
          ytScheduleRef.current = { startEpoch: pending.payload.startEpoch, clockOffset: pending.clockOffset };
        }
        
        const adjustedPayload = {
          ...pending.payload,
          atEpoch: Date.now() + pending.clockOffset + 100,
          fromPosition: elapsed,
        };
        scheduleStartRef.current?.(adjustedPayload, pending.clockOffset);
      }
    }, 50);
  }, [trackUrl, isYoutubeMode, isPlaying, getTruePosition]);

  useEffect(() => {
    const unlock = () => { unlockAudio(); };
    document.addEventListener('touchstart', unlock, { passive: true });
    document.addEventListener('click', unlock, { passive: true });
    document.addEventListener('pointerdown', unlock, { passive: true });
    return () => {
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('click', unlock);
      document.removeEventListener('pointerdown', unlock);
    };
  }, [unlockAudio]);

  const fetchAndDecode = (url: string) => {
    if (fetchPromiseRef.current) return fetchPromiseRef.current;

    const promise = (async () => {
      setIsReady(false);
      try {
        let arrayBuffer: ArrayBuffer;

        if (url.startsWith('magnet:')) {
          console.log('[WebTorrent] Downloading magnet URI...');
          setIsSyncing(true);
          setSyncProgress(0);
          const client = await getWebTorrentClient();
          if (!client) throw new Error("WebTorrent failed to load");

          const { getTrack, saveTrack } = await import('../lib/idb');
          const cachedBlob = await getTrack(url);

          if (cachedBlob) {
            console.log('[WebTorrent] Found cached track in IndexedDB! Seeding to swarm...');
            client.seed(cachedBlob);
            arrayBuffer = await cachedBlob.arrayBuffer();
          } else {
            arrayBuffer = await new Promise((resolve, reject) => {
              const onTorrent = (torrent: any) => {
                torrent.on('download', () => {
                  setSyncProgress(Math.round(torrent.progress * 100));
                });
                const file = torrent.files.find((f: any) => f.name.endsWith('.mp3') || f.name.endsWith('.wav') || f.name.endsWith('.flac'));
                if (!file) return reject(new Error("No audio file found in torrent"));

                file.getBlob(async (err: any, blob: Blob) => {
                  if (err) return reject(err);
                  try {
                    await saveTrack(url, blob);
                  } catch (e) {
                    console.error("Failed to save to IDB", e);
                  }
                  blob.arrayBuffer().then(resolve).catch(reject);
                });
              };

              const existing = client.get(url);
              if (existing) {
                if (existing.ready) onTorrent(existing);
                else existing.on('ready', () => onTorrent(existing));
              } else {
                client.add(url, onTorrent);
              }
            });
          }
        } else {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
          }
          arrayBuffer = await response.arrayBuffer();
        }

        const decodedData = await audioCtxRef.current!.decodeAudioData(arrayBuffer);
        audioBufferRef.current = decodedData;
        setDuration(decodedData.duration);
        setIsReady(true);
        return decodedData;
      } catch (err) {
        console.error("Error decoding audio data", err);
        return null;
      } finally {
        setIsSyncing(false);
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
          
          if (audioUnlocked) {
            // If already unlocked, aggressively load to enable instant buffering for Next Song
            ytPlayerRef.current.loadVideoById({ videoId });
            ytLoadedVideoIdRef.current = videoId;
            // Prevent it from blasting audio if the room is currently paused
            if (!isPlaying) {
              setTimeout(() => {
                if (ytPlayerRef.current && !isPlaying) {
                  ytPlayerRef.current.pauseVideo();
                }
              }, 150);
            }
          } else {
            ytPlayerRef.current.cueVideoById(videoId);
          }
          
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
  }, [trackUrl]); 

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
            const elapsed = Math.max(0, audioCtxRef.current.currentTime - startTimeRef.current) * playbackRateRef.current;
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
    if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);

    if (isYoutubeMode) {
      // If YouTube player isn't ready OR the video isn't loaded yet, save as pending
      // This mirrors the WebAudio behavior when AudioContext is suspended
      if (!ytPlayerRef.current || !ytReadyRef.current) {
        pendingScheduleRef.current = { payload, clockOffset };
        return;
      }
      
      const videoId = payload.trackUrl.split(":")[1];
      
      // If the video isn't loaded in the iframe yet, we need to save as pending
      // The user gesture (touch/click) will load the video via unlockAudio
      if (ytLoadedVideoIdRef.current !== videoId) {
        pendingScheduleRef.current = { payload, clockOffset };
        return;
      }
      
      // Store the schedule timeline so onStateChange can re-sync after buffering
      ytScheduleRef.current = { startEpoch: payload.startEpoch, clockOffset };
      
      const localAtEpoch = payload.atEpoch - clockOffset;
      const msUntilStart = localAtEpoch - Date.now();

      const startPlayback = () => {
        if (!ytPlayerRef.current) return;
        ytPlayerRef.current.seekTo(payload.fromPosition, true);
        ytPlayerRef.current.playVideo();
        setIsPlaying(true);
        startTimeRef.current = Date.now();
        pauseOffsetRef.current = payload.fromPosition;
      };

      if (msUntilStart > 50) {
        // Wait until the synchronized epoch, then start
        setTimeout(startPlayback, msUntilStart);
      } else {
        // Already past the epoch — seek to the corrected position
        const correctPosition = Math.max(0, payload.fromPosition + Math.abs(msUntilStart) / 1000);
        ytPlayerRef.current.seekTo(correctPosition, true);
        ytPlayerRef.current.playVideo();
        setIsPlaying(true);
        startTimeRef.current = Date.now();
        pauseOffsetRef.current = correctPosition;
      }
      return;
    }

    if (!audioCtxRef.current) return;
    
    let buffer = audioBufferRef.current;
    if (!buffer && payload.trackUrl) {
      // Always check if a decode is already in-flight first (e.g. from the blob URL
      // that loadAndSetTrack created). This is the common fast path.
      if (fetchPromiseRef.current) {
        buffer = await fetchPromiseRef.current;
      }
      
      // For remote tracks, resolve the URL and fetch+decode
      if (!buffer) {
        const absoluteUrl = (!payload.trackUrl.startsWith('/') && !payload.trackUrl.startsWith('http') && !payload.trackUrl.startsWith('youtube:') && !payload.trackUrl.startsWith('magnet:') && !payload.trackUrl.startsWith('blob:') && !payload.trackUrl.startsWith('data:')) 
          ? `${getServerUrl()}/${payload.trackUrl}` 
          : payload.trackUrl.startsWith('/') ? `${getServerUrl()}${payload.trackUrl}` : payload.trackUrl;
        buffer = await fetchAndDecode(absoluteUrl);
      }
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
    if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);

    if (isYoutubeMode) {
      if (!ytPlayerRef.current || !ytReadyRef.current) return;
      // Cooldown: don't re-seek if we just sought < 3s ago (YT may still be buffering)
      if (Date.now() - ytLastSeekRef.current < 3000) return;
      ytLastSeekRef.current = Date.now();
      ytPlayerRef.current.seekTo(expectedPosition, true);
      ytPlayerRef.current.playVideo();
      setIsPlaying(true);
      startTimeRef.current = Date.now();
      pauseOffsetRef.current = expectedPosition;
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

    // No hardware latency adjustment here — playNow is for drift correction,
    // not initial scheduling. Adding latency here would overshoot the target.
    const clampedPosition = Math.min(audioBufferRef.current.duration - 0.1, expectedPosition);

    source.start(0, Math.max(0, clampedPosition));
    sourceNodeRef.current = source;
    
    startTimeRef.current = audioCtxRef.current.currentTime;
    pauseOffsetRef.current = clampedPosition;
    setIsPlaying(true);
    setCurrentTime(clampedPosition);
  }, [audioUnlocked, stopCurrentSource, isYoutubeMode]);

  const pauseAt = useCallback((position: number) => {
    stopCurrentSource();
    setIsPlaying(false);
    pauseOffsetRef.current = position;
    setCurrentTime(position);
    
    if (isYoutubeMode && ytPlayerRef.current && ytReadyRef.current) {
      ytPlayerRef.current.pauseVideo();
    }
  }, [stopCurrentSource, isYoutubeMode]);

  const play = useCallback(() => {
    if (!isPlaying) playNow(pauseOffsetRef.current);
  }, [isPlaying, playNow]);

  const pause = useCallback(() => {
    if (isPlaying) pauseAt(getTruePosition());
  }, [isPlaying, pauseAt, getTruePosition]);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const seek = useCallback((time: number) => {
    if (isPlaying) playNow(time);
    else pauseAt(time);
  }, [isPlaying, playNow, pauseAt]);

  const seekPct = useCallback((pct: number) => {
    const time = pct * duration;
    seek(time);
  }, [seek, duration]);

  const setPlaybackRate = useCallback((rate: number) => {
    const currentTruePosition = getTruePosition();
    
    if (isYoutubeMode && ytPlayerRef.current && typeof ytPlayerRef.current.setPlaybackRate === "function") {
      ytPlayerRef.current.setPlaybackRate(rate);
      playbackRateRef.current = rate;
    } else if (sourceNodeRef.current && sourceNodeRef.current.playbackRate) {
      sourceNodeRef.current.playbackRate.value = rate;
      pauseOffsetRef.current = currentTruePosition;
      if (audioCtxRef.current) {
        startTimeRef.current = audioCtxRef.current.currentTime;
      } else {
        startTimeRef.current = Date.now();
      }
      playbackRateRef.current = rate;
    }
  }, [isYoutubeMode, getTruePosition]);

  const setVolume = useCallback((nextVolume: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(nextVolume)));
    setVolumeState(clamped);
  }, []);

  const setTrack = useCallback((url: string, title = "Unknown Track", artist = "") => {
    if (url.startsWith('local:')) {
      console.warn("Ignoring deprecated local: track url", url);
      return;
    }
    const absoluteUrl = (!url.startsWith('/') && !url.startsWith('http') && !url.startsWith('youtube:') && !url.startsWith('magnet:') && !url.startsWith('blob:') && !url.startsWith('data:')) 
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
    ytGestureVideoIdRef.current = null;
    ytLoadedVideoIdRef.current = null;
  }, [stopCurrentSource]);

  const progress = duration > 0 ? currentTime / duration : 0;
  const hasTrack = trackUrl !== null && trackUrl.length > 0;

  return {
    isPlaying, isReady, isBuffering, hasTrack, audioUnlocked, currentTime, duration, progress, volume,
    trackUrl, trackTitle, trackArtist, isSyncing, syncProgress,
    play, pause, toggle, seek, seekPct, setVolume, setTrack, clearTrack, unlockAudio,
    scheduleStart, playNow, pauseAt, getTruePosition, setPlaybackRate,
    audioEl: null,
    audioCtx: audioCtxRef.current,
    gainNode: gainNodeRef.current
  };
}
