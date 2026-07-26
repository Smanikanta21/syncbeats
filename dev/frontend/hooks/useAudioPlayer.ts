"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getServerUrl } from '../lib/api';
import { getWebTorrentClient } from '../lib/webtorrent';

export interface AudioPlayerState {
  isPlaying:     boolean;
  isReady:       boolean;
  isBuffering:   boolean;
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
  error:         string | null;
  outputLatency: number;
  manualLatency: number;
  isLatencyAutoDetected: boolean;
  outputDeviceName: string | null;
  outputDeviceType: string | null;
}

interface UseAudioPlayerReturn extends AudioPlayerState {
  play:        () => void;
  pause:       () => void;
  toggle:      () => void;
  seek:        (time: number) => void;
  seekPct:     (pct: number) => void;
  setVolume:   (volume: number | ((prev: number) => number)) => void;
  getVolume:   () => number;
  toggleMute:  () => number;
  setTrack:    (url: string, title?: string, artist?: string) => void;
  clearTrack:  () => void;
  unlockAudio: () => void;
  setManualLatency: (latency: number) => void;
  scheduleStart: (payload: any, clockOffset: number) => Promise<void>;
  playNow:     (expectedPosition: number) => void;
  pauseAt:     (position: number) => void;
  getTruePosition: () => number;
  setPlaybackRate: (rate: number) => void;
  audioEl:     HTMLAudioElement | null;
  audioCtx?:   AudioContext | null;
  gainNode?:   GainNode | null;
  getAudioData: () => number;
  getRawAudioData: () => Uint8Array | null;
  eqGains: number[];
  setEqBand: (index: number, gain: number) => void;
  prefetchTrack?: (url: string) => void;
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
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [volume,      setVolumeState] = useState(100);
  const volumeRef = useRef(100);
  const previousVolumeRef = useRef(100);
  const [trackUrl,    setTrackUrl]    = useState<string | null>(null);
  const [trackTitle,  setTrackTitle]  = useState("");
  const [trackArtist, setTrackArtist] = useState("");
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const [outputLatency, setOutputLatencyState] = useState(0);
  const [manualLatency, setManualLatencyState] = useState(0);
  const [isLatencyAutoDetected, setIsLatencyAutoDetectedState] = useState(false);
  const [outputDeviceName, setOutputDeviceName] = useState<string | null>(null);
  const [outputDeviceType, setOutputDeviceType] = useState<string | null>(null);

  const outputLatencyRef = useRef(0);
  const manualLatencyRef = useRef(0);
  const isLatencyAutoDetectedRef = useRef(false);

  const setOutputLatency = useCallback((v: number) => { outputLatencyRef.current = v; setOutputLatencyState(v); }, []);
  const setManualLatency = useCallback((v: number) => { manualLatencyRef.current = v; setManualLatencyState(v); }, []);
  const setIsLatencyAutoDetected = useCallback((v: boolean) => { isLatencyAutoDetectedRef.current = v; setIsLatencyAutoDetectedState(v); }, []);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const eqNodesRef = useRef<BiquadFilterNode[]>([]);
  const [eqGains, setEqGains] = useState<number[]>([0, 0, 0, 0, 0]); // 60, 230, 910, 3600, 14000 Hz

  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const mediaElSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const streamingAudioElRef = useRef<HTMLAudioElement | null>(null);

  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const trackUrlRef = useRef<string | null>(null);
  const fetchPromiseRef = useRef<Promise<AudioBuffer | null> | null>(null);
  const playbackRateRef = useRef<number>(1);
  
  const startTimeRef = useRef<number>(0);
  const pauseOffsetRef = useRef<number>(0);
  const pendingScheduleRef = useRef<{ payload: any; clockOffset: number } | null>(null);
  const unlockTimeoutRef = useRef<number | null>(null);
  const scheduleIdRef = useRef<number>(0);
  const activeFetchAbortRef = useRef<AbortController | null>(null);
  const pendingArrayBufferRef = useRef<ArrayBuffer | null>(null);

  // ── Audio Graph Setup ─────────────────────────────────────────────────────
  // setupAudioGraph creates the FULL chain: Gain → EQ[5] → Analyser → Destination.
  // It is called BOTH on initial mount AND in unlockAudio, so EQ is always wired.
  const setupAudioGraph = useCallback(() => {
    if (audioCtxRef.current) return; // already set up
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    audioCtxRef.current = new AudioContextClass();
    gainNodeRef.current = audioCtxRef.current.createGain();
    analyserNodeRef.current = audioCtxRef.current.createAnalyser();
    analyserNodeRef.current.fftSize = 512;
    analyserNodeRef.current.smoothingTimeConstant = 0.25;

    // Initialize streaming audio element with crossOrigin = "anonymous" to prevent Web Audio silence trap
    if (typeof window !== 'undefined' && !streamingAudioElRef.current) {
      const audioEl = new Audio();
      audioEl.crossOrigin = "anonymous";
      streamingAudioElRef.current = audioEl;
    }

    // Connect HTMLAudioElement into Web Audio graph (ONLY ONCE per lifecycle to prevent InvalidStateError)
    if (streamingAudioElRef.current && gainNodeRef.current && !mediaElSourceRef.current) {
      try {
        mediaElSourceRef.current = audioCtxRef.current.createMediaElementSource(streamingAudioElRef.current);
        mediaElSourceRef.current.connect(gainNodeRef.current);
      } catch (err) {
        console.warn("[AudioPlayer] MediaElementSource initialization warning:", err);
      }
    }

    // Create 5-band EQ with proper shelf/peak types
    const freqs = [60, 230, 910, 3600, 14000];
    const eqNodes = freqs.map((freq, i) => {
      const filter = audioCtxRef.current!.createBiquadFilter();
      if (freq === 60) filter.type = 'lowshelf';
      else if (freq === 14000) filter.type = 'highshelf';
      else filter.type = 'peaking';
      filter.frequency.value = freq;
      // Higher Q (1.4) on mid bands for more audible effect
      filter.Q.value = (i > 0 && i < 4) ? 1.4 : 1.0;
      filter.gain.value = 0;
      return filter;
    });
    eqNodesRef.current = eqNodes;

    // Wire: Gain → EQ[0..4] → Analyser → Destination
    gainNodeRef.current.connect(eqNodes[0]);
    for (let i = 0; i < eqNodes.length - 1; i++) {
      eqNodes[i].connect(eqNodes[i + 1]);
    }
    eqNodes[eqNodes.length - 1].connect(analyserNodeRef.current);
    analyserNodeRef.current.connect(audioCtxRef.current.destination);
  }, []);

  // Initialize AudioContext on mount with the full EQ graph
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setupAudioGraph();
    }
  }, [setupAudioGraph]);

  const stopCurrentSource = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null;
      try {
        sourceNodeRef.current.stop();
      } catch (e) {}
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (streamingAudioElRef.current) {
      try {
        streamingAudioElRef.current.pause();
      } catch (e) {}
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

  const setEqBand = useCallback((index: number, gain: number) => {
    if (eqNodesRef.current[index]) {
      // Clamp between -12 and +12 dB
      const clamped = Math.max(-12, Math.min(12, gain));
      eqNodesRef.current[index].gain.value = clamped;
      setEqGains(prev => {
        const next = [...prev];
        next[index] = clamped;
        return next;
      });
    }
  }, []);

  const getAudioData = useCallback(() => {
    if (!analyserNodeRef.current || audioCtxRef.current?.state !== 'running') return 0;
    const dataArray = new Uint8Array(analyserNodeRef.current.frequencyBinCount);
    analyserNodeRef.current.getByteFrequencyData(dataArray);
    
    // Average the lower frequencies (bass) for the "beat" pulse
    let sum = 0;
    const sampleCount = 10;
    for (let i = 0; i < sampleCount; i++) {
      sum += dataArray[i];
    }
    const avg = sum / sampleCount;
    return avg / 255; // Normalized 0 to 1
  }, []);

  const getRawAudioData = useCallback(() => {
    if (!analyserNodeRef.current || audioCtxRef.current?.state !== 'running') return null;
    const dataArray = new Uint8Array(analyserNodeRef.current.frequencyBinCount);
    analyserNodeRef.current.getByteFrequencyData(dataArray);
    return dataArray;
  }, []);

  const unlockAudio = useCallback(() => {
    // setupAudioGraph is a no-op if already set up
    setupAudioGraph();

    // Always optimistically unlock in the UI so the user isn't stuck forever.
    setAudioUnlocked(true);

    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume().catch((err) => {
        console.warn("Failed to resume AudioContext", err);
      });
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

  // ── Media Session & Background Keep-Alive Audio Engine ─────────────────────
  const keepAliveAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!keepAliveAudioRef.current) {
      const audio = new Audio();
      // 0.1s silent WAV data URI
      audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
      audio.loop = true;
      audio.volume = 0.001; // Silent, non-zero to retain OS background audio privileges
      keepAliveAudioRef.current = audio;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    if (isPlaying) {
      keepAliveAudioRef.current?.play().catch(() => {});
      navigator.mediaSession.playbackState = "playing";
    } else {
      keepAliveAudioRef.current?.pause();
      navigator.mediaSession.playbackState = "paused";
    }
  }, [isPlaying]);

  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    if (trackTitle || trackUrl) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: trackTitle || "SyncBeats Track",
          artist: trackArtist || "SyncBeats Room",
          album: "SyncBeats",
          artwork: [
            { src: "/syncbeats-icon.svg", sizes: "512x512", type: "image/svg+xml" }
          ]
        });
      } catch (e) {}
    }
  }, [trackTitle, trackArtist, trackUrl]);

  useEffect(() => {
    const unlock = () => { 
      unlockAudio();
      keepAliveAudioRef.current?.play().catch(() => {});
    };
    document.addEventListener('touchstart', unlock, { passive: true });
    document.addEventListener('click', unlock, { passive: true });
    document.addEventListener('pointerdown', unlock, { passive: true });
    return () => {
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('click', unlock);
      document.removeEventListener('pointerdown', unlock);
    };
  }, [unlockAudio]);

  const detectOutputDevice = useCallback(async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
      
      let activeDevice = audioOutputs.find(d => d.deviceId === 'default') || audioOutputs[0];
      
      if (audioCtxRef.current && typeof (audioCtxRef.current as any).sinkId === 'string') {
        const sinkId = (audioCtxRef.current as any).sinkId;
        if (sinkId) activeDevice = audioOutputs.find(d => d.deviceId === sinkId) || activeDevice;
      }

      if (activeDevice) {
        const label = activeDevice.label || "System Default";
        setOutputDeviceName(label);
        
        let type = 'speaker';
        const lowerLabel = label.toLowerCase();
        if (lowerLabel.includes('bluetooth') || lowerLabel.includes('airpods') || lowerLabel.includes('bose') || lowerLabel.includes('sony') || lowerLabel.includes('wh-') || lowerLabel.includes('wf-') || lowerLabel.includes('galaxy buds')) {
          type = 'bluetooth';
        } else if (lowerLabel.includes('headphone') || lowerLabel.includes('earpods') || lowerLabel.includes('headset')) {
          type = 'headphones';
        }
        setOutputDeviceType(type);
      }
      
      if (audioCtxRef.current) {
        const outLat = audioCtxRef.current.outputLatency || 0;
        const baseLat = audioCtxRef.current.baseLatency || 0;
        const totalLat = outLat + baseLat;
        if (totalLat > 0) {
          setOutputLatency(totalLat);
          setIsLatencyAutoDetected(true);
        } else {
          setIsLatencyAutoDetected(false);
        }
      }
    } catch (err) {
      console.warn("Could not enumerate devices", err);
    }
  }, []);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', detectOutputDevice);
      detectOutputDevice();
      return () => navigator.mediaDevices.removeEventListener('devicechange', detectOutputDevice);
    }
  }, [detectOutputDevice]);

  const fetchAndDecode = (url: string) => {
    if (fetchPromiseRef.current) return fetchPromiseRef.current;

    const promise = (async () => {
      setIsReady(false);
      setError(null);
      try {
        let arrayBuffer: ArrayBuffer = new ArrayBuffer(0);

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

                let lastProgress = 0;
                torrent.on('download', () => {
                  const pct = Math.round(torrent.progress * 100);
                  if (pct !== lastProgress && pct >= 0 && pct <= 100) {
                    lastProgress = pct;
                    setDownloadProgress(pct);
                    const { getSocket } = require('../lib/socket');
                    const socket = getSocket();
                    const roomId = window.location.pathname.split('/').pop();
                    if (roomId) socket.emit('room:sync_progress', { roomId, progress: pct });
                  }
                });

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
            const MAX_RETRIES      = 3;
            const RETRY_INTERVAL_MS = 8_000;  // Wait 8s per attempt
            const CHUNK_IDLE_MS    = 15_000;  // Reset timer if no chunk for 15s

            if (activeFetchAbortRef.current) {
              activeFetchAbortRef.current.abort();
            }
            const abortCtrl = new AbortController();
            activeFetchAbortRef.current = abortCtrl;
            const { signal } = abortCtrl;

            arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
              if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
              signal.addEventListener('abort', () => {
                socket.off('track:receive_chunk', onChunk);
                clearAllTimers();
                reject(new DOMException('Download cancelled — track changed', 'AbortError'));
              });

              const { getSocket } = require('../lib/socket');
              const socket = getSocket();
              const roomId = window.location.pathname.split('/').pop();
              
              const chunks: ArrayBuffer[] = [];
              const receivedIndices = new Set<number>();
              let expectedChunks = 0;
              let retryCount = 0;
              let idleTimeoutId: ReturnType<typeof setTimeout> | null = null;
              let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

              const clearAllTimers = () => {
                if (idleTimeoutId)  clearTimeout(idleTimeoutId);
                if (retryTimeoutId) clearTimeout(retryTimeoutId);
                idleTimeoutId = null;
                retryTimeoutId = null;
              };

              const failOrFallback = async (p2pErrMsg: string) => {
                socket.off('track:receive_chunk', onChunk);
                clearAllTimers();

                const ytMatch = url.match(/^(?:ws-p2p:yt:|youtube:)([a-zA-Z0-9_-]{11})/);
                if (!ytMatch) {
                  reject(new Error(p2pErrMsg));
                  return;
                }

                const videoId = ytMatch[1];
                const roomId  = window.location.pathname.split('/').pop();
                console.warn(
                  `[WebSocket P2P] No seeders found. Falling back to yt-proxy for videoId: ${videoId}`
                );

                try {
                  const proxyUrl = `${getServerUrl()}/rooms/${roomId}/yt-proxy?videoId=${videoId}`;
                  const resp = await fetch(proxyUrl, { signal });
                  if (!resp.ok) throw new Error(`yt-proxy returned ${resp.status}`);

                  const contentLength = resp.headers.get('content-length');
                  let ytBuffer: ArrayBuffer;

                  if (contentLength) {
                    const total = parseInt(contentLength, 10);
                    let loaded = 0;
                    const reader = resp.body!.getReader();
                    const ytChunks: Uint8Array[] = [];
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      ytChunks.push(value);
                      loaded += value.length;
                      const pct = Math.round((loaded / total) * 100);
                      setDownloadProgress(pct);
                      const { getSocket: gs } = require('../lib/socket');
                      
                      gs().emit('room:sync_progress', { roomId, progress: pct });
                    }
                    const concat = new Uint8Array(loaded);
                    let off = 0;
                    for (const c of ytChunks) { concat.set(c, off); off += c.length; }
                    ytBuffer = concat.buffer;
                  } else {
                    ytBuffer = await resp.arrayBuffer();
                  }

                  const blob = new Blob([ytBuffer], { type: 'audio/mpeg' });
                  saveTrack(url, blob).catch(() => {});
                  console.log('[WebSocket P2P] yt-proxy fallback succeeded. Saved to IDB.');
                  activeFetchAbortRef.current = null;
                  resolve(ytBuffer);
                } catch (fallbackErr) {
                  if (signal.aborted) {
                    reject(new DOMException('Download cancelled — track changed', 'AbortError'));
                  } else {
                    reject(new Error(
                      `P2P failed and YouTube re-download also failed: ${(fallbackErr as Error).message}`
                    ));
                  }
                }
              };

              const requestChunks = () => {
                if (signal.aborted) return;
                console.log(`[WebSocket P2P] Requesting chunks (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
                socket.emit('track:request_file', { roomId, trackUrl: url });

                retryTimeoutId = setTimeout(() => {
                  if (signal.aborted) return;
                  if (receivedIndices.size > 0) return; 
                  retryCount++;
                  if (retryCount < MAX_RETRIES) {
                    console.warn(`[WebSocket P2P] No response yet, retrying (${retryCount}/${MAX_RETRIES})...`);
                    requestChunks();
                  } else {
                    void failOrFallback(
                      'No other participant has this track cached. ' +
                      'Ask someone who was in the room originally to re-join so they can share it.'
                    );
                  }
                }, RETRY_INTERVAL_MS);
              };


              const resetIdleTimer = () => {
                if (idleTimeoutId) clearTimeout(idleTimeoutId);
                idleTimeoutId = setTimeout(() => {
                  if (receivedIndices.size < expectedChunks || expectedChunks === 0) {
                    void failOrFallback('Track transfer stalled — the seeding device may have disconnected.');
                  }
                }, CHUNK_IDLE_MS);
              };
              
              const onChunk = async (payload: any) => {
                if (payload.trackUrl !== url) return;
                if (signal.aborted) return;

                if (retryTimeoutId) { clearTimeout(retryTimeoutId); retryTimeoutId = null; }
                
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
                    console.error('[WebSocket P2P] Fatal: Cannot parse payload data', payload.data);
                    bufferData = new ArrayBuffer(0);
                  }
                }
                
                chunks[payload.chunkIndex] = bufferData;
                
                if (receivedIndices.size === 1 && typeof document !== 'undefined') {
                  document.dispatchEvent(new CustomEvent('p2pDownloadStart', { detail: { total: expectedChunks } }));
                }

                if (expectedChunks > 0) {
                  const pct = Math.round((receivedIndices.size / expectedChunks) * 100);
                  setDownloadProgress(pct);
                  socket.emit('room:sync_progress', { roomId, progress: pct });
                }
                
                if (receivedIndices.size === expectedChunks && expectedChunks > 0) {
                  socket.off('track:receive_chunk', onChunk);
                  clearAllTimers();
                  
                  const totalLength = chunks.reduce((acc, c) => acc + (c?.byteLength || 0), 0);
                  const result = new Uint8Array(totalLength);
                  let off = 0;
                  for (let i = 0; i < expectedChunks; i++) {
                    if (chunks[i]) { result.set(new Uint8Array(chunks[i]), off); off += chunks[i].byteLength; }
                  }
                  
                  const buffer = result.buffer;
                  try {
                    const blob = new Blob([buffer], { type: 'audio/mpeg' });
                    await saveTrack(url, blob);
                    console.log('[WebSocket P2P] Track downloaded and saved to IDB!');
                  } catch (e) {
                    console.error('[WebSocket P2P] Failed to save track to IDB:', e);
                  }
                  
                  activeFetchAbortRef.current = null;
                  resolve(buffer);
                } else {
                  resetIdleTimer();
                }
              };
              
              socket.on('track:receive_chunk', onChunk);
              requestChunks(); 
            });
          }
        } else if (url.startsWith('youtube:')) {
          const match = url.match(/^youtube:([a-zA-Z0-9_-]{11})/);
          const videoId = match ? match[1] : '';
          if (!videoId || videoId.length < 11) {
            throw new Error(`Corrupted YouTube track ID. Please tap Reset Room or skip track.`);
          }
          const roomId = window.location.pathname.split('/').pop();
          const { getCachedYouTubeTrack, cacheYouTubeTrack } = await import('../lib/idb');

          // Check IDB v2 first!
          const cachedBlob = await getCachedYouTubeTrack(videoId);
          if (cachedBlob) {
            console.log(`[AudioPlayer] 🚀 IDB HIT for videoId '${videoId}'! 0ms latency load...`);
            setDownloadProgress(100);
            if (streamingAudioElRef.current) {
              streamingAudioElRef.current.src = URL.createObjectURL(cachedBlob);
            }
            arrayBuffer = await cachedBlob.arrayBuffer();
          } else {
            console.log(`[AudioPlayer] ⚡ IDB MISS for videoId '${videoId}'. Stream-and-Stash starting...`);
            const fetchUrl = `${getServerUrl()}/rooms/${roomId}/yt-proxy?videoId=${videoId}`;
            
            // Assign src immediately for Instant Playback!
            if (streamingAudioElRef.current) {
              streamingAudioElRef.current.src = fetchUrl;
            }

            // Concurrently fetch stream bytes in background to stash to IDB
            const response = await fetch(fetchUrl);
            if (!response.ok) {
              throw new Error(`Failed to fetch YouTube audio: ${response.status} ${response.statusText}`);
            }
            const contentLength = response.headers.get('content-length');
            const total = contentLength ? parseInt(contentLength, 10) : 0;
            let loaded = 0;
            const reader = response.body!.getReader();
            const chunks: Uint8Array[] = [];
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              loaded += value.length;
              if (total > 0) {
                const pct = Math.round((loaded / total) * 100);
                setDownloadProgress(pct);
                const { getSocket } = require('../lib/socket');
                const socket = getSocket();
                const roomId = window.location.pathname.split('/').pop();
                if (roomId) socket.emit('room:sync_progress', { roomId, progress: pct });
              }
            }
            const concat = new Uint8Array(loaded);
            let offset = 0;
            for (const chunk of chunks) {
              concat.set(chunk, offset);
              offset += chunk.length;
            }
            arrayBuffer = concat.buffer;

            // Stash to IDB asynchronously
            const stashedBlob = new Blob([arrayBuffer], { type: 'audio/mp4' });
            cacheYouTubeTrack(videoId, stashedBlob, trackTitle).catch(err => {
              console.warn('[AudioPlayer] Background stash to IDB warning:', err);
            });
          }
        } else {
          let fetchUrl = url.startsWith('/') ? `${getServerUrl()}${url}` : url;
          if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            fetchUrl = fetchUrl.replace('http://localhost:4000', `${window.location.protocol}//${window.location.hostname}:4000`);
            fetchUrl = fetchUrl.replace('http://127.0.0.1:4000', `${window.location.protocol}//${window.location.hostname}:4000`);
          }

          const paramMatch = fetchUrl.match(/[?&]videoId=([^&#]+)/);
          if (paramMatch && paramMatch[1] && paramMatch[1].length < 11) {
            throw new Error(`Corrupted YouTube track ID '${paramMatch[1]}'. Please tap Reset Room or skip track.`);
          }

          const response = await fetch(fetchUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
          }
          const contentLength = response.headers.get('content-length');
          if (contentLength) {
            const total = parseInt(contentLength, 10);
            let loaded = 0;
            const reader = response.body!.getReader();
            const chunks = [];
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              loaded += value.length;
              const pct = Math.round((loaded / total) * 100);
              setDownloadProgress(pct);
              const { getSocket } = require('../lib/socket');
              const socket = getSocket();
              const roomId = window.location.pathname.split('/').pop();
              if (roomId) socket.emit('room:sync_progress', { roomId, progress: pct });
            }
            const concat = new Uint8Array(loaded);
            let offset = 0;
            for (const chunk of chunks) {
              concat.set(chunk, offset);
              offset += chunk.length;
            }
            arrayBuffer = concat.buffer;
          } else {
            arrayBuffer = await response.arrayBuffer();
          }
        }

        if (!audioCtxRef.current) {
          pendingArrayBufferRef.current = arrayBuffer;
          return null;
        }

        let decodedData: AudioBuffer;
        try {
          decodedData = await audioCtxRef.current.decodeAudioData(arrayBuffer.slice(0));
        } catch (decodeErr) {
          console.error('[AudioPlayer] Failed to decode audio data', decodeErr);
          setError("Playback Error: Failed to decode audio. Track may be blocked or corrupted.");
          setIsBuffering(false);
          setIsReady(false);
          pendingArrayBufferRef.current = arrayBuffer;
          
          if (url.startsWith('ws-p2p:') || url.startsWith('magnet:')) {
            const { removeTrack } = await import('../lib/idb');
            await removeTrack(url).catch(console.error);
          }
          
          return null;
        }
        audioBufferRef.current = decodedData;
        pendingArrayBufferRef.current = null;
        setDuration(decodedData.duration);
        setIsReady(true);
        return decodedData;
      } catch (err) {
        console.error("Error fetching/decoding audio data", err);
        setError(err instanceof Error ? err.message : "Failed to load audio");
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
      if (activeFetchAbortRef.current) {
        activeFetchAbortRef.current.abort();
        activeFetchAbortRef.current = null;
      }
      audioBufferRef.current = null;
      fetchPromiseRef.current = null;
      setDuration(0);
      setIsReady(false);
      pauseAt(0);
      return;
    }

    if (activeFetchAbortRef.current) {
      activeFetchAbortRef.current.abort();
      activeFetchAbortRef.current = null;
    }
    fetchPromiseRef.current = null;

    fetchAndDecode(trackUrl);
    pauseAt(0);

    return () => {
      if (activeFetchAbortRef.current) {
        activeFetchAbortRef.current.abort();
        activeFetchAbortRef.current = null;
      }
    };
  }, [trackUrl]); 

  useEffect(() => {
    if (!audioUnlocked) return;
    if (!audioCtxRef.current) return;
    const pending = pendingArrayBufferRef.current;
    if (!pending) return;

    pendingArrayBufferRef.current = null;

    audioCtxRef.current.decodeAudioData(pending.slice(0))
      .then((decodedData) => {
        audioBufferRef.current = decodedData;
        setDuration(decodedData.duration);
        setIsReady(true);
        // Apply pending room schedule now that the buffer is ready
        const pendingSched = pendingScheduleRef.current;
        if (pendingSched) {
          pendingScheduleRef.current = null;
          const clockOffset = pendingSched.clockOffset;
          const serverNow = Date.now() + clockOffset;
          const elapsed = Math.max(0, (serverNow - pendingSched.payload.startEpoch) / 1000);
          const adjustedPayload = {
            ...pendingSched.payload,
            atEpoch: Date.now() + clockOffset + 100,
            fromPosition: elapsed,
          };
          scheduleStartRef.current?.(adjustedPayload, clockOffset);
        }
      })
      .catch((err) => {
        console.error('[AudioPlayer] Deferred decode still failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to decode audio');
      });
  }, [audioUnlocked]);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = Math.max(0, Math.min(1, volume / 100));
    }
  }, [volume]);

  // When the buffer finishes decoding (isReady flips true), apply any pending
  // room schedule so synced playback starts automatically without another interaction.
  useEffect(() => {
    if (!isReady) return;
    const pending = pendingScheduleRef.current;
    if (!pending) return;
    pendingScheduleRef.current = null;
    const clockOffset = pending.clockOffset;
    const serverNow = Date.now() + clockOffset;
    const elapsed = Math.max(0, (serverNow - pending.payload.startEpoch) / 1000);
    const adjustedPayload = {
      ...pending.payload,
      atEpoch: Date.now() + clockOffset + 100,
      fromPosition: elapsed,
    };
    scheduleStartRef.current?.(adjustedPayload, clockOffset);
  }, [isReady]);

  useEffect(() => {
    let intervalId: any;
    if (isPlaying) {
      intervalId = setInterval(() => {
        if (audioCtxRef.current) {
          const elapsed = Math.max(0, audioCtxRef.current.currentTime - startTimeRef.current) * playbackRateRef.current;
          setCurrentTime(pauseOffsetRef.current + elapsed);
        }
      }, 250);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPlaying]);

  const scheduleStartRef = useRef<((payload: any, clockOffset: number) => Promise<void>) | null>(null);

  const scheduleStart = useCallback(async (payload: any, clockOffset: number) => {
    stopCurrentSource();
    if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);

    if (!audioCtxRef.current) {
      setupAudioGraph();
    }

    // If track URL differs from what's loaded, we can't play yet —
    // save the schedule and let the fetch/decode pipeline apply it when ready.
    if (payload.trackUrl && trackUrlRef.current && trackUrlRef.current !== payload.trackUrl) {
      console.log('[AudioPlayer] scheduleStart: trackUrl mismatch, saving pending');
      pendingScheduleRef.current = { payload, clockOffset };
      return;
    }

    let buffer = audioBufferRef.current;
    if (!buffer && payload.trackUrl) {
      // Await the in-flight fetch if one exists (started by useEffect[trackUrl]).
      if (fetchPromiseRef.current) {
        buffer = await fetchPromiseRef.current;
      }
    }

    if (payload.trackUrl && trackUrlRef.current && trackUrlRef.current !== payload.trackUrl) {
      console.log('[AudioPlayer] scheduleStart superseded by new trackUrl:', trackUrlRef.current, 'vs', payload.trackUrl);
      return;
    }

    if (!buffer) {
      // Buffer still unavailable — save pending schedule.
      // Will be applied by isReady useEffect or unlockAudio once decode completes.
      console.log('[AudioPlayer] scheduleStart: no buffer yet, saving pending schedule');
      pendingScheduleRef.current = { payload, clockOffset };
      return;
    }

    if (audioCtxRef.current?.state === 'suspended') {
      console.log('[AudioPlayer] AudioContext suspended — saving pending schedule and attempting resume');
      pendingScheduleRef.current = { payload, clockOffset };
      audioCtxRef.current.resume().catch(() => {});
      return;
    }

    if (!audioCtxRef.current) return;

    const localAtEpoch = payload.atEpoch - clockOffset;
    const msUntilStart = localAtEpoch - Date.now();

    const source = audioCtxRef.current.createBufferSource();
    source.buffer = buffer;
    
    // Connect through EQ chain
    const firstNode = eqNodesRef.current.length > 0 ? eqNodesRef.current[0] : analyserNodeRef.current!;
    source.connect(gainNodeRef.current!);
    
    source.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      document.dispatchEvent(new CustomEvent('audioEnded'));
    };

    const hardwareLatency = (audioCtxRef.current.baseLatency || 0) + (audioCtxRef.current.outputLatency || 0);
    const totalLatency = hardwareLatency + manualLatencyRef.current;
    
    const idealAudioCtxStartTime = audioCtxRef.current.currentTime + msUntilStart / 1000 - totalLatency;

    if (idealAudioCtxStartTime >= audioCtxRef.current.currentTime) {
      source.start(idealAudioCtxStartTime, payload.fromPosition);
      sourceNodeRef.current = source;
      startTimeRef.current = idealAudioCtxStartTime;
      pauseOffsetRef.current = payload.fromPosition;
    } else {
      const lateBySeconds = audioCtxRef.current.currentTime - idealAudioCtxStartTime;
      const correctPosition = payload.fromPosition + lateBySeconds;
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
    playbackRateRef.current = rate;
    if (sourceNodeRef.current) {
      sourceNodeRef.current.playbackRate.value = rate;
    }
  }, []);


  const setVolume = useCallback((nextVolume: number | ((prev: number) => number)) => {
    setVolumeState(prev => {
      const vol = typeof nextVolume === "function" ? nextVolume(prev) : nextVolume;
      const clamped = Math.max(0, Math.min(100, Math.round(vol)));
      volumeRef.current = clamped;
      return clamped;
    });
  }, []);

  const toggleMute = useCallback(() => {
    let newVol = 0;
    setVolumeState(prev => {
      if (prev > 0) {
        previousVolumeRef.current = prev;
        volumeRef.current = 0;
        newVol = 0;
        return 0;
      } else {
        volumeRef.current = previousVolumeRef.current;
        newVol = previousVolumeRef.current;
        return previousVolumeRef.current;
      }
    });
    return newVol;
  }, []);

  const getVolume = useCallback(() => volumeRef.current, []);

  const setTrack = useCallback((url: string, title = "Unknown Track", artist = "") => {
    if (!url) return;
    if (url === trackUrlRef.current && audioBufferRef.current) {
      setTrackTitle(title);
      setTrackArtist(artist);
      return;
    }
    stopCurrentSource();
    setIsPlaying(false);
    setIsReady(false);
    setIsBuffering(false);
    setError(null);
    audioBufferRef.current = null;
    pendingArrayBufferRef.current = null; 
    
    trackUrlRef.current = url;
    setTrackUrl(url);
    setTrackTitle(title);
    setTrackArtist(artist);
  }, []);

  const clearTrack = useCallback(() => {
    stopCurrentSource();
    trackUrlRef.current = null;
    setTrackUrl(null);
    setTrackTitle("");
    setTrackArtist("");
    setError(null);
    setIsPlaying(false);
    setCurrentTime(0);
    pauseOffsetRef.current = 0;
    audioBufferRef.current = null;
    fetchPromiseRef.current = null;
  }, [stopCurrentSource]);

  const prefetchTrack = useCallback((url: string) => {
    if (!url) return;
    
    if (url.startsWith('magnet:')) {
      getWebTorrentClient().then(async client => {
        if (!client) return;
        const { getTrack } = await import('../lib/idb');
        if (await getTrack(url)) return;
        
        const existing = client.get(url);
        if (!existing) {
          client.add(url, async (torrent: any) => {
             const file = torrent.files.find((f: any) => f.name.endsWith('.mp3') || f.name.endsWith('.wav'));
             if (file) {
                file.getBlob(async (err: any, blob: Blob) => {
                  if (!err) {
                    const { saveTrack } = await import('../lib/idb');
                    saveTrack(url, blob).catch(() => {});
                  }
                });
             }
          });
        }
      }).catch(() => {});
    } else {
      const absoluteUrl = (!url.startsWith('/') && !url.startsWith('http') && !url.startsWith('ws-p2p:') && !url.startsWith('blob:') && !url.startsWith('data:')) 
        ? `${getServerUrl()}/${url}` 
        : url.startsWith('/') ? `${getServerUrl()}${url}` : url;
      fetchPromiseRef.current = fetchAndDecode(absoluteUrl);
    }
  }, []);


  const progress = duration > 0 ? currentTime / duration : 0;
  const hasTrack = trackUrl !== null && trackUrl.length > 0;

  return {
    isPlaying, isReady, isBuffering, downloadProgress, hasTrack, audioUnlocked,
    currentTime,
    duration,
    progress: duration > 0 ? (currentTime / duration) * 100 : 0,
    volume,
    trackUrl,
    trackTitle,
    trackArtist,
    error,
    outputLatency,
    manualLatency,
    isLatencyAutoDetected,
    outputDeviceName,
    outputDeviceType,
    eqGains,
    play,
    pause,
    toggle,
    seek,
    seekPct,
    setVolume,
    setTrack,
    clearTrack,
    unlockAudio,
    setManualLatency,
    scheduleStart, playNow, pauseAt,    getTruePosition,
    setPlaybackRate,
    audioEl: null,
    audioCtx: audioCtxRef.current,
    gainNode: gainNodeRef.current,
    getAudioData,
    getRawAudioData,
    setEqBand,
    prefetchTrack,
    getVolume,
    toggleMute
  };
}
