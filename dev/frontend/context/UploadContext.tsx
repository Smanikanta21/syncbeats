"use client";

// context/UploadContext.tsx
// Shares IndexedDB cache status, upload metadata triggers, and real-time Socket.io P2P chunk transfers.

import {
  createContext, useContext, useState, useCallback, useEffect,
  type ReactNode
} from "react";
import { roomsApi, getServerUrl, getAuthToken } from "../lib/api";
import { getSocket } from "../lib/socket";

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
  stage: "scraping" | "indexing" | "enriching" | "done";
  totalTracks: number;
  isImporting: boolean;
}

interface UploadCtx {
  isDragging:       boolean;
  isUploading:      boolean;
  uploadProgress:   number;
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
  const [isUploading,    setIsUploading]    = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeImport,   setActiveImport]   = useState<PlaylistImportState | null>(null);
  const [activeTransfers] = useState<Record<string, TransferState>>({});

  // 1. Seed Local File via WebSockets
  const uploadFile = useCallback(async (file: File, roomId: string, customTrackUrl?: string, artist?: string): Promise<UploadResult> => {
    // Hard guard — prevents double-upload if caller doesn't check isUploading
    if (isUploading) throw new Error('An upload is already in progress. Please wait.');
    
    const title = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    setIsUploading(true);
    setUploadProgress(10);
    getSocket().emit('room:upload_progress', { roomId, title, progress: 10 });

    try {
      // Generate custom websocket P2P URL
      const trackUrl = customTrackUrl || `ws-p2p:${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      setUploadProgress(40);
      getSocket().emit('room:upload_progress', { roomId, title, progress: 40 });

      // Save directly to IndexedDB so we become the active "seeder"
      const { saveTrack } = await import('../lib/idb');
      await saveTrack(trackUrl, file);

      setUploadProgress(80);
      getSocket().emit('room:upload_progress', { roomId, title, progress: 80 });

      // Tell the backend to enqueue the custom URL
      await roomsApi.enqueueMagnet(roomId, trackUrl, title, artist);
      
      setUploadProgress(100);
      getSocket().emit('room:upload_progress', { roomId, title, progress: 100 });
      setIsUploading(false);
      setUploadProgress(0);
      
      return { trackUrl, title };
    } catch (err) {
      console.error("[UploadContext] uploadFile failed:", err);
      setIsUploading(false);
      setUploadProgress(0);
      getSocket().emit('room:upload_progress', { roomId, title, progress: 100 });
      throw err;
    }
  }, []);

  // 2. Fetch YouTube stream from ephemeral proxy, save to Blob, and seed it via WebSockets
  const downloadYoutubeToP2P = useCallback(async (roomId: string, videoId: string, title: string, artist?: string) => {
    // Hard guard — prevents double-download if caller doesn't check isUploading
    if (isUploading) throw new Error('A download is already in progress. Please wait.');
    
    setIsUploading(true);
    setUploadProgress(5);
    getSocket().emit('room:upload_progress', { roomId, title, progress: 5 });
    try {
      const baseUrl = getServerUrl();
      const authToken = getAuthToken();
      const proxyUrl = `${baseUrl}/rooms/${roomId}/yt-proxy?videoId=${videoId}${authToken ? `&token=${encodeURIComponent(authToken)}` : ''}`;
      
      const response = await fetch(proxyUrl, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      let blob: Blob;

      if (!response.ok) {
        console.warn(`[UploadContext] YouTube Proxy returned ${response.status}. Enqueuing track directly as youtube:${videoId} for client/peer playback...`);
        const fallbackUrl = `youtube:${videoId}`;
        await roomsApi.enqueueMagnet(roomId, fallbackUrl, title, artist);
        setIsUploading(false);
        setUploadProgress(0);
        getSocket().emit('room:upload_progress', { roomId, title, progress: 100 });
        return;
      }
      
      blob = await response.blob();
      
      if (blob.size < 5000) {
        console.warn(`[UploadContext] YouTube proxy returned small blob (${blob.size} bytes). Enqueuing track directly as youtube:${videoId}...`);
        const fallbackUrl = `youtube:${videoId}`;
        await roomsApi.enqueueMagnet(roomId, fallbackUrl, title, artist);
        setIsUploading(false);
        setUploadProgress(0);
        getSocket().emit('room:upload_progress', { roomId, title, progress: 100 });
        return;
      }
      
      setUploadProgress(20);
      getSocket().emit('room:upload_progress', { roomId, title, progress: 20 });
      
      setUploadProgress(50);
      getSocket().emit('room:upload_progress', { roomId, title, progress: 50 });
      const file = new File([blob], `${title.replace(/[^a-zA-Z0-9 ]/g, '')}.mp3`, { type: 'audio/mpeg' });
      
      const customTrackUrl = `ws-p2p:yt:${videoId}_${Date.now()}`;
      
      // Re-use the existing upload logic
      await uploadFile(file, roomId, customTrackUrl, artist);

    } catch (err: any) {
      console.warn("[UploadContext] downloadYoutubeToP2P proxy failed, attempting direct enqueue:", err);
      try {
        await roomsApi.enqueueMagnet(roomId, `youtube:${videoId}`, title, artist);
      } catch (enqueueErr) {
        console.error("[UploadContext] Direct enqueue failed:", enqueueErr);
      }
      setIsUploading(false);
      setUploadProgress(0);
      getSocket().emit('room:upload_progress', { roomId, title, progress: 100 });
    }
  }, [uploadFile]);

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
    const handleRequestFile = async ({ requesterSocketId, roomId, trackUrl }: { requesterSocketId: string, roomId: string, trackUrl: string }) => {
      try {
        // ── Resolve the IDB key regardless of URL scheme ─────────────────────
        // Tracks are stored by videoId (e.g. 'h_VCgsWLmY4') for youtube: scheme,
        // or by full trackUrl for ws-p2p: and magnet: schemes.
        const { getCachedYouTubeTrack, getTrack } = await import('../lib/idb');
        const videoIdMatch = trackUrl.match(/(?:youtube:|ws-p2p:yt:)([a-zA-Z0-9_-]{11})/);
        const videoId = videoIdMatch?.[1] ?? null;

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
