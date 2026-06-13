"use client";

// context/UploadContext.tsx
// Shares IndexedDB cache status, upload metadata triggers, and real-time Socket.io P2P chunk transfers.

import {
  createContext, useContext, useState, useCallback, useEffect,
  type ReactNode
} from "react";
import { roomsApi, getServerUrl } from "../lib/api";
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

interface UploadCtx {
  isDragging:       boolean;
  isUploading:      boolean;
  uploadProgress:   number;
  setIsDragging:    (v: boolean) => void;
  uploadFile:       (file: File, roomId: string) => Promise<UploadResult>;
  downloadYoutubeToP2P: (roomId: string, videoId: string, title: string) => Promise<void>;
  activeTransfers:  Record<string, TransferState>;
}

const Ctx = createContext<UploadCtx | null>(null);


export function UploadProvider({ children }: { children: ReactNode }) {
  const [isDragging,     setIsDragging]     = useState(false);
  const [isUploading,    setIsUploading]    = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeTransfers] = useState<Record<string, TransferState>>({});

  // 1. Seed Local File via WebSockets
  const uploadFile = useCallback(async (file: File, roomId: string): Promise<UploadResult> => {
    const title = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    setIsUploading(true);
    setUploadProgress(10);
    getSocket().emit('room:upload_progress', { roomId, title, progress: 10 });

    try {
      // Generate custom websocket P2P URL
      const trackUrl = `ws-p2p:${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      setUploadProgress(40);
      getSocket().emit('room:upload_progress', { roomId, title, progress: 40 });

      // Save directly to IndexedDB so we become the active "seeder"
      const { saveTrack } = await import('../lib/idb');
      await saveTrack(trackUrl, file);

      setUploadProgress(80);
      getSocket().emit('room:upload_progress', { roomId, title, progress: 80 });

      // Tell the backend to enqueue the custom URL
      await roomsApi.enqueueMagnet(roomId, trackUrl, title);
      
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
  const downloadYoutubeToP2P = useCallback(async (roomId: string, videoId: string, title: string) => {
    setIsUploading(true);
    setUploadProgress(5);
    getSocket().emit('room:upload_progress', { roomId, title, progress: 5 });
    try {
      const baseUrl = getServerUrl();
      const proxyUrl = `${baseUrl}/rooms/${roomId}/yt-proxy?videoId=${videoId}`;
      
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`Proxy failed with status ${response.status}`);
      }
      
      setUploadProgress(20);
      getSocket().emit('room:upload_progress', { roomId, title, progress: 20 });
      const blob = await response.blob();
      
      setUploadProgress(50);
      getSocket().emit('room:upload_progress', { roomId, title, progress: 50 });
      const file = new File([blob], `${title.replace(/[^a-zA-Z0-9 ]/g, '')}.mp3`, { type: 'audio/mpeg' });
      
      // Re-use the existing upload logic
      await uploadFile(file, roomId);

    } catch (err) {
      console.error("[UploadContext] downloadYoutubeToP2P failed:", err);
      setIsUploading(false);
      setUploadProgress(0);
      getSocket().emit('room:upload_progress', { roomId, title, progress: 100 });
      throw err;
    }
  }, [uploadFile]);

  // 3. Listen for WebSocket P2P requests and serve chunks
  useEffect(() => {
    const socket = getSocket();
    const CHUNK_SIZE = 256 * 1024; // 256KB chunks

    const handleRequestFile = async ({ requesterSocketId, trackUrl }: { requesterSocketId: string, trackUrl: string }) => {
      if (!trackUrl.startsWith('ws-p2p:')) return;
      
      try {
        const { getTrack } = await import('../lib/idb');
        const file = await getTrack(trackUrl);
        if (!file) {
          console.log(`[WebSocket P2P] Requested file ${trackUrl} not found in my IDB.`);
          return; // I don't have it, let someone else seed it
        }

        console.log(`[WebSocket P2P] Found ${trackUrl} in IDB! Seeding ${file.size} bytes to ${requesterSocketId}...`);
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);
          const buffer = await chunk.arrayBuffer();

          socket.emit('track:send_chunk', {
            targetSocketId: requesterSocketId,
            trackUrl,
            chunkIndex: i,
            totalChunks,
            data: buffer
          });
          
          // Tiny delay to avoid blocking the event loop and overwhelming the socket buffer
          await new Promise(resolve => setTimeout(resolve, 5));
        }
        console.log(`[WebSocket P2P] Finished seeding ${trackUrl} to ${requesterSocketId}.`);
      } catch (err) {
        console.error("[WebSocket P2P] Failed to send chunks:", err);
      }
    };

    socket.on('track:request_file', handleRequestFile);
    return () => {
      socket.off('track:request_file', handleRequestFile);
    };
  }, []);

  return (
    <Ctx.Provider value={{
      isDragging,
      isUploading,
      uploadProgress,
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
