"use client";

// context/UploadContext.tsx
// Shares IndexedDB cache status, upload metadata triggers, and real-time Socket.io P2P chunk transfers.

import {
  createContext, useContext, useState, useCallback, useEffect, useRef,
  type ReactNode
} from "react";
import { roomsApi } from "../lib/api";
import { getSocket } from "../lib/socket";
import { ytId } from "../lib/youtube";
import { downloadTrack } from "../lib/trackDownload";
import type { TrackActivity } from "../lib/types";

interface UploadResult {
  trackUrl: string;
  title:    string;
}

interface TransferState {
  chunks: ArrayBuffer[];
  totalChunks: number;
  progress: number;
}

export interface PlaylistImportState {
  playlistId?: string;
  playlistName?: string;
  progress: number;
  stage: "scraping" | "indexing" | "enriching" | "downloading" | "complete" | "done";
  totalTracks: number;
  isImporting: boolean;
  currentTitle?: string;
}

interface UploadCtx {
  isDragging:       boolean;
  isUploading:      boolean;
  uploadProgress:   number;
  activity:         TrackActivity | null;
  activeImport:     PlaylistImportState | null;
  setActiveImport:  (state: PlaylistImportState | null | ((prev: PlaylistImportState | null) => PlaylistImportState | null)) => void;
  setIsDragging:    (v: boolean) => void;
  uploadFile:       (file: File, roomId: string, customTrackUrl?: string, artist?: string) => Promise<UploadResult>;
  downloadYoutubeToP2P: (roomId: string, videoId: string, title: string, artist?: string) => Promise<void>;
  activeTransfers:  Record<string, TransferState>;
}

const Ctx = createContext<UploadCtx | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [isDragging,     setIsDragging]     = useState(false);
  const [activity, setActivity] = useState<TrackActivity | null>(null);
  const activeOperation = useRef<string | null>(null);
  const isUploading = activity?.status === 'active';
  const uploadProgress = isUploading ? activity.progress : 0;
  const [activeImport,   setActiveImport]   = useState<PlaylistImportState | null>(null);
  const [activeTransfers] = useState<Record<string, TransferState>>({});

  const begin = useCallback((roomId: string, title: string): TrackActivity => {
    if (activeOperation.current) throw new Error('A transfer is already in progress. Please wait.');
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    activeOperation.current = id;
    return { id, roomId, title, progress: 0, status: 'active' };
  }, []);

  const publish = useCallback((next: TrackActivity) => {
    setActivity(next);
    const socket = getSocket();
    if (socket.connected) socket.emit('room:upload_progress', {
      ...next, operationId: next.id,
    });
  }, []);

  // 1. Seed Local File via WebSockets
  const uploadFile = useCallback(async (file: File, roomId: string, customTrackUrl?: string, artist?: string): Promise<UploadResult> => {
    const title = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    const operation = begin(roomId, title);
    publish({ ...operation, progress: 10 });

    try {
      // Generate custom websocket P2P URL
      const trackUrl = customTrackUrl || `ws-p2p:${Date.now()}_${Math.random().toString(36).substring(7)}`;

      publish({ ...operation, trackUrl, progress: 40 });

      // Save directly to IndexedDB so we become the active "seeder"
      const { saveTrack } = await import('../lib/idb');
      if (!await saveTrack(trackUrl, file, title)) {
        throw new Error('This file could not be saved on your device. Free some storage and try again.');
      }

      publish({ ...operation, trackUrl, progress: 80 });

      // Tell the backend to enqueue the custom URL
      await roomsApi.enqueueMagnet(roomId, trackUrl, title, artist);

      publish({ ...operation, trackUrl, progress: 100, status: 'complete' });

      return { trackUrl, title };
    } catch (err) {
      console.error("[UploadContext] uploadFile failed:", err);
      publish({ ...operation, status: 'failed', error: err instanceof Error ? err.message : 'Upload failed' });
      throw err;
    } finally {
      if (activeOperation.current === operation.id) activeOperation.current = null;
    }
  }, [begin, publish]);

  // 2. Fetch YouTube stream from ephemeral proxy, save to Blob, and seed it via WebSockets
  const downloadYoutubeToP2P = useCallback(async (roomId: string, videoId: string, title: string, artist?: string) => {
    const operation = begin(roomId, title);
    publish({ ...operation, indeterminate: true });
    try {
      let trackUrl = `youtube:${videoId}`;
      try {
        const result = await downloadTrack(trackUrl, roomId, {
          title, priority: 'prefetch',
          onProgress: progress => publish({ ...operation, progress: Math.min(95, progress ?? 0), indeterminate: progress == null }),
        });
        // Only advertise as a seeder after persistent storage actually commits.
        if (result.cached) trackUrl = `ws-p2p:yt:${videoId}`;
      } catch {
        // The foreground player can still resolve/download an enqueued YouTube track.
      }
      publish({ ...operation, trackUrl, progress: 95 });
      await roomsApi.enqueueMagnet(roomId, trackUrl, title, artist);
      publish({ ...operation, trackUrl, progress: 100, status: 'complete' });
    } catch (err) {
      publish({ ...operation, status: 'failed', error: err instanceof Error ? err.message : 'Could not add this track' });
      throw err;
    } finally {
      if (activeOperation.current === operation.id) activeOperation.current = null;
    }
  }, [begin, publish]);

  // 3. Listen for WebSocket P2P requests and serve chunks — optimized for speed
  useEffect(() => {
    const socket = getSocket();
    // ── Perf constants ──────────────────────────────────────────────────────────
    // 256KB chunks → 4MB audio = ~16 chunks instead of 64 (4× fewer socket messages).
    // Nginx default proxy_buffer_size is 4KB–256KB; Socket.IO frames can handle 256KB fine.
    const CHUNK_SIZE = 256 * 1024;
    // Sliding window: how many in-flight emits before we yield to the socket buffer.
    const WINDOW = 12;

    // ── Cache-check responder ────────────────────────────────────────────────────
    // Peers ask "does anyone have videoId X?" before even requesting chunks.
    // We reply instantly so the requester can open a direct pipe to us.
    const handleCheckCache = async ({ requesterSocketId, videoId }: { requesterSocketId: string; videoId: string }) => {
      try {
        const { getCachedYouTubeTrack } = await import('../lib/idb');
        const blob = await getCachedYouTubeTrack(videoId);
        if (blob) {
          socket.emit('track:cache_available', { targetSocketId: requesterSocketId, videoId });
        }
      } catch { /* ignore */ }
    };

    // ── File-request responder (seeder) ─────────────────────────────────────────
    const handleRequestFile = async ({ requesterSocketId, trackUrl }: { requesterSocketId: string, roomId: string, trackUrl: string }) => {
      try {
        // ── Resolve the IDB key regardless of URL scheme ─────────────────────
        // Tracks are stored by videoId (e.g. 'h_VCgsWLmY4') for youtube: scheme,
        // or by full trackUrl for ws-p2p: and magnet: schemes.
        const { getCachedYouTubeTrack, getTrack } = await import('../lib/idb');
        const videoId = ytId(trackUrl);

        const file: Blob | null = videoId
          ? (await getCachedYouTubeTrack(videoId)) ?? (await getTrack(trackUrl))
          : await getTrack(trackUrl);

        if (!file) return; // don't have it — silent skip so another peer responds

        const fileSize = file.size;
        console.log(`[P2P] Seeding '${trackUrl}' (${(fileSize / 1024 / 1024).toFixed(2)} MB) → ${requesterSocketId}`);

        // ── Read the entire blob ONCE into an ArrayBuffer ────────────────────
        // Avoids N async IDB slice reads (one per chunk). Pure in-memory slicing after.
        const fullBuffer = await file.arrayBuffer();
        const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

        let inFlight = 0;

        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end  = Math.min(start + CHUNK_SIZE, fileSize);
          // slice() on ArrayBuffer is O(1) — no copy, just a view window reference
          const data = fullBuffer.slice(start, end);

          socket.emit('track:send_chunk', {
            targetSocketId: requesterSocketId,
            trackUrl,
            chunkIndex: i,
            totalChunks,
            data,
          });

          inFlight++;

          // ── Sliding-window backpressure ──────────────────────────────────
          // Yield to the socket send-buffer every WINDOW chunks instead of
          // a fixed sleep. setTimeout(0) flushes the microtask/macrotask queue
          // and lets Socket.IO drain without blocking the main thread.
          if (inFlight >= WINDOW) {
            await new Promise<void>(resolve => setTimeout(resolve, 0));
            inFlight = 0;
          }
        }
        console.log(`[P2P] ✅ Finished seeding '${trackUrl}' (${totalChunks} chunks) → ${requesterSocketId}`);
      } catch (err) {
        console.error('[P2P] Seeding error:', err);
      }
    };

    socket.on('track:check_cache', handleCheckCache);
    socket.on('track:request_file', handleRequestFile);
    return () => {
      socket.off('track:check_cache', handleCheckCache);
      socket.off('track:request_file', handleRequestFile);
    };
  }, []);

  return (
    <Ctx.Provider value={{
      isDragging,
      isUploading,
      uploadProgress,
      activity,
      activeImport,
      setActiveImport,
      setIsDragging,
      uploadFile,
      downloadYoutubeToP2P,
      activeTransfers
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUpload(): UploadCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUpload must be used inside <UploadProvider>");
  return ctx;
}
