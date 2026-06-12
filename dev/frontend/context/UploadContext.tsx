"use client";

// context/UploadContext.tsx
// Shares IndexedDB cache status, upload metadata triggers, and real-time Socket.io P2P chunk transfers.

import {
  createContext, useContext, useState, useCallback,
  type ReactNode
} from "react";
import { roomsApi, getServerUrl } from "../lib/api";
import { getWebTorrentClient } from "../lib/webtorrent";
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

  // 1. Seed Local File via WebTorrent (P2P)
  const uploadFile = useCallback(async (file: File, roomId: string): Promise<UploadResult> => {
    const title = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    setIsUploading(true);
    setUploadProgress(10);
    getSocket().emit('room:upload_progress', { roomId, title, progress: 10 });

    return new Promise(async (resolve, reject) => {
      try {
        const client = await getWebTorrentClient();
        if (!client) {
          throw new Error("WebTorrent client failed to load.");
        }

        const title = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
        setUploadProgress(30);
        getSocket().emit('room:upload_progress', { roomId, title, progress: 30 });

        client.seed(file, async (torrent: any) => {
          console.log('[WebTorrent] Seeding track:', torrent.infoHash);
          console.log('[WebTorrent] Magnet URI:', torrent.magnetURI);
          
          setUploadProgress(80);
          getSocket().emit('room:upload_progress', { roomId, title, progress: 80 });

          try {
            const { saveTrack } = await import('../lib/idb');
            await saveTrack(torrent.magnetURI, file);
          } catch (e) {
            console.error("Failed to save seeded file to IDB", e);
          }

          try {
            // Tell the backend to enqueue the new magnet URI
            await roomsApi.enqueueMagnet(roomId, torrent.magnetURI, title);
            setUploadProgress(100);
            getSocket().emit('room:upload_progress', { roomId, title, progress: 100 });
            setIsUploading(false);
            setUploadProgress(0);
            
            resolve({ trackUrl: torrent.magnetURI, title });
          } catch (apiErr) {
            console.error("[UploadContext] Failed to enqueue magnet URI:", apiErr);
            setIsUploading(false);
            setUploadProgress(0);
            getSocket().emit('room:upload_progress', { roomId, title, progress: 100 });
            reject(apiErr);
          }
        });

      } catch (err) {
        setIsUploading(false);
        setUploadProgress(0);
        getSocket().emit('room:upload_progress', { roomId, title, progress: 100 });
        console.error("[UploadContext] uploadFile failed:", err);
        reject(err);
      }
    });
  }, []);

  // 2. Fetch YouTube stream from ephemeral proxy, save to Blob, and seed it via P2P!
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
      
      // Re-use the existing WebTorrent seeding logic
      await uploadFile(file, roomId);

    } catch (err) {
      console.error("[UploadContext] downloadYoutubeToP2P failed:", err);
      setIsUploading(false);
      setUploadProgress(0);
      getSocket().emit('room:upload_progress', { roomId, title, progress: 100 });
      throw err;
    }
  }, [uploadFile]);



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
