"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getServerUrl } from '../lib/api';
import { getWebTorrentClient } from '../lib/webtorrent';

export interface AudioPlayerState {
  isPlaying:     boolean;
  isReady:       boolean;
  isBuffering:   boolean;
  error:         string | null;
  downloadProgress: number;
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
  const [error,       setError]       = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
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
  
  const startTimeRef = useRef<number>(0);
  const pauseOffsetRef = useRef<number>(0);
  const pendingScheduleRef = useRef<{ payload: any; clockOffset: number } | null>(null);
  const unlockTimeoutRef = useRef<number | null>(null);
  const scheduleIdRef = useRef<number>(0);

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

  const getTruePosition = useCallback(() => {
    if (!isPlaying) return pauseOffsetRef.current;
    
    // For WebAudio, use the same clock (audioCtx.currentTime) that scheduled playback
    if (audioCtxRef.current) {
      const elapsed = Math.max(0, audioCtxRef.current.currentTime - startTimeRef.current) * playbackRateRef.current;
      return pauseOffsetRef.current + elapsed;
    }
    const elapsed = ((Date.now() - startTimeRef.current) / 1000) * playbackRateRef.current;
    return pauseOffsetRef.current + elapsed;
  }, [isPlaying]);

  const unlockAudio = useCallback(async () => {
    if (!audioCtxRef.current) return;

    // Quick path if already fully unlocked
    if (audioCtxRef.current.state === 'running') {
      setAudioUnlocked(true);
    } else if (audioCtxRef.current.state === 'suspended') {
      try {
        await audioCtxRef.current.resume();
        setAudioUnlocked(true);
      } catch {
        console.warn("Failed to resume AudioContext");
        return;
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
      setError(null);
      setDownloadProgress(0);
      try {
        let arrayBuffer: ArrayBuffer;

        if (url.startsWith('magnet:')) {
          console.log('[WebTorrent] Downloading magnet URI...');
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
                const file = torrent.files.find((f: any) => f.name.endsWith('.mp3') || f.name.endsWith('.wav'));
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
        } else if (url.startsWith('ws-p2p:')) {
          console.log('[WebSocket P2P] Requesting track from swarm...', url);
          const { getTrack, saveTrack } = await import('../lib/idb');
          const cachedBlob = await getTrack(url);
          
          if (cachedBlob) {
            console.log('[WebSocket P2P] Found track locally in IDB!');
            arrayBuffer = await cachedBlob.arrayBuffer();
          } else {
            arrayBuffer = await new Promise((resolve, reject) => {
              const { getSocket } = require('../lib/socket');
              const socket = getSocket();
              const roomId = window.location.pathname.split('/').pop();
              
              const chunks: ArrayBuffer[] = [];
              const receivedIndices = new Set<number>();
              let expectedChunks = 0;
              let timeoutId: any;
              
              const resetTimeout = () => {
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                  if (receivedIndices.size < expectedChunks || expectedChunks === 0) {
                    socket.off('track:receive_chunk', onChunk);
                    reject(new Error("WebSocket P2P request timed out waiting for chunks"));
                  }
                }, 30000); // Timeout if no chunks arrive for 30s
              };
              
              const onChunk = async (payload: any) => {
                if (payload.trackUrl !== url) return;
                
                if (expectedChunks === 0 && payload.totalChunks) {
                  expectedChunks = payload.totalChunks;
                }
                
                receivedIndices.add(payload.chunkIndex);
                
                let bufferData: ArrayBuffer;
                if (payload.data instanceof ArrayBuffer) {
                  bufferData = payload.data;
                } else if (payload.data && payload.data.type === 'Buffer' && Array.isArray(payload.data.data)) {
                  bufferData = new Uint8Array(payload.data.data).buffer;
                } else if (payload.data instanceof Uint8Array) {
                  bufferData = payload.data.buffer;
                } else {
                  try {
                    bufferData = new Uint8Array(payload.data).buffer;
                  } catch (e) {
                    console.error("[WebSocket P2P] Fatal: Cannot parse payload data", payload.data);
                    bufferData = new ArrayBuffer(0);
                  }
                }
                
                chunks[payload.chunkIndex] = bufferData;
                const progressPct = expectedChunks > 0 ? Math.round((receivedIndices.size / expectedChunks) * 100) : 0;
                setDownloadProgress(progressPct);
                console.log(`[WebSocket P2P] Received chunk ${payload.chunkIndex + 1}/${expectedChunks} (${progressPct}%)`);
                
                // Show buffering indicator for long downloads
                if (receivedIndices.size === 1 && typeof document !== 'undefined') {
                  const event = new CustomEvent('p2pDownloadStart', { detail: { total: expectedChunks } });
                  document.dispatchEvent(event);
                }
                
                if (receivedIndices.size === expectedChunks && expectedChunks > 0) {
                  socket.off('track:receive_chunk', onChunk);
                  clearTimeout(timeoutId);
                  
                  // Reassemble chunks
                  const totalLength = chunks.reduce((acc, c) => acc + (c?.byteLength || 0), 0);
                  const result = new Uint8Array(totalLength);
                  let offset = 0;
                  for (let i = 0; i < expectedChunks; i++) {
                    if (chunks[i]) {
                      result.set(new Uint8Array(chunks[i]), offset);
                      offset += chunks[i].byteLength;
                    }
                  }
                  
                  const buffer = result.buffer;
                  try {
                    const blob = new Blob([buffer], { type: 'audio/mpeg' });
                    await saveTrack(url, blob);
                    console.log('[WebSocket P2P] Track downloaded and saved to IDB!');
                  } catch(e) {
                    console.error('[WebSocket P2P] Failed to save track to IDB:', e);
                  }
                  
                  setDownloadProgress(100);
                  resolve(buffer);
                } else {
                  resetTimeout();
                }
              };
              
              socket.on('track:receive_chunk', onChunk);
              socket.emit('track:request_file', { roomId, trackUrl: url });
              
              resetTimeout();
            });
          }
        } else if (url.startsWith('youtube:')) {
          const videoId = url.split(':')[1];
          const roomId = window.location.pathname.split('/').pop();
          const fetchUrl = `${getServerUrl()}/rooms/${roomId}/yt-proxy?videoId=${videoId}`;
          console.log('[DEBUG] Fetching YouTube audio from proxy:', fetchUrl);
          const response = await fetch(fetchUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch YouTube audio: ${response.status} ${response.statusText}`);
          }
          arrayBuffer = await response.arrayBuffer();
        } else {
          // Ensure we hit the backend if the URL is relative
          const fetchUrl = url.startsWith('/') ? `${getServerUrl()}${url}` : url;
          console.error('[DEBUG] Fetching audio from:', fetchUrl, 'Original url:', url);
          const response = await fetch(fetchUrl);
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
      } catch (err: any) {
        console.error("Error decoding audio data", err);
        setError(err.message || "Failed to load audio track");
        setIsReady(true); // Set ready so we don't hang in buffering state indefinitely
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

    fetchAndDecode(trackUrl);
    pauseAt(0);
  }, [trackUrl]); 

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = Math.max(0, Math.min(1, volume / 100));
    }
  }, [volume]);

  useEffect(() => {
    let lastUpdate = 0;
    const tick = (now: number) => {
      if (isPlaying) {
        if (now - lastUpdate > 1000) {
          if (audioCtxRef.current) {
            const elapsed = Math.max(0, audioCtxRef.current.currentTime - startTimeRef.current) * playbackRateRef.current;
            setCurrentTime(pauseOffsetRef.current + elapsed);
          }
          lastUpdate = now;
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
  }, [isPlaying]);

  const scheduleStartRef = useRef<((payload: any, clockOffset: number) => Promise<void>) | null>(null);

  const scheduleStart = useCallback(async (payload: any, clockOffset: number) => {
    scheduleIdRef.current += 1;
    const currentScheduleId = scheduleIdRef.current;

    stopCurrentSource();
    if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);

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
        const absoluteUrl = (!payload.trackUrl.startsWith('/') && !payload.trackUrl.startsWith('http') && !payload.trackUrl.startsWith('magnet:') && !payload.trackUrl.startsWith('ws-p2p:') && !payload.trackUrl.startsWith('blob:') && !payload.trackUrl.startsWith('data:')) 
          ? `${getServerUrl()}/${payload.trackUrl}` 
          : payload.trackUrl.startsWith('/') ? `${getServerUrl()}${payload.trackUrl}` : payload.trackUrl;
        buffer = await fetchAndDecode(absoluteUrl);
      }
    }

    // Abort if the user paused or started a new track while we were awaiting the download
    if (scheduleIdRef.current !== currentScheduleId) return;

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
      source.start(audioCtxStartTime, Math.max(0, payload.fromPosition));
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
  }, [audioUnlocked, stopCurrentSource]);

  scheduleStartRef.current = scheduleStart;

  const playNow = useCallback((expectedPosition: number) => {
    scheduleIdRef.current += 1;
    stopCurrentSource();
    if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);

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

    const clampedPosition = Math.min(audioBufferRef.current.duration - 0.1, expectedPosition);

    source.start(0, Math.max(0, clampedPosition));
    sourceNodeRef.current = source;
    
    startTimeRef.current = audioCtxRef.current.currentTime;
    pauseOffsetRef.current = clampedPosition;
    setIsPlaying(true);
    setCurrentTime(clampedPosition);
  }, [audioUnlocked, stopCurrentSource]);

  const pauseAt = useCallback((position: number) => {
    scheduleIdRef.current += 1;
    stopCurrentSource();
    setIsPlaying(false);
    pauseOffsetRef.current = position;
    setCurrentTime(position);
  }, [stopCurrentSource]);

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
    
    if (sourceNodeRef.current && sourceNodeRef.current.playbackRate) {
      sourceNodeRef.current.playbackRate.value = rate;
      pauseOffsetRef.current = currentTruePosition;
      if (audioCtxRef.current) {
        startTimeRef.current = audioCtxRef.current.currentTime;
      } else {
        startTimeRef.current = Date.now();
      }
      playbackRateRef.current = rate;
    }
  }, [getTruePosition]);

  const setVolume = useCallback((nextVolume: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(nextVolume)));
    setVolumeState(clamped);
  }, []);

  const setTrack = useCallback((url: string, title = "Unknown Track", artist = "") => {
    if (url.startsWith('local:')) {
      console.warn("Ignoring deprecated local: track url", url);
      return;
    }
    const absoluteUrl = (!url.startsWith('/') && !url.startsWith('http') && !url.startsWith('magnet:') && !url.startsWith('ws-p2p:') && !url.startsWith('youtube:') && !url.startsWith('blob:') && !url.startsWith('data:')) 
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
    isPlaying, isReady, isBuffering, error, downloadProgress, hasTrack, audioUnlocked, currentTime, duration, progress, volume,
    trackUrl, trackTitle, trackArtist,
    play, pause, toggle, seek, seekPct, setVolume, setTrack, clearTrack, unlockAudio,
    scheduleStart, playNow, pauseAt, getTruePosition, setPlaybackRate,
    audioEl: null,
    audioCtx: audioCtxRef.current,
    gainNode: gainNodeRef.current
  };
}
