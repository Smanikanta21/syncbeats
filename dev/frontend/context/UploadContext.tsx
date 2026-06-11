"use client";

// context/UploadContext.tsx
// Shares IndexedDB cache status, upload metadata triggers, and real-time Socket.io P2P chunk transfers.

import {
  createContext, useContext, useState, useCallback,
  type ReactNode
} from "react";
import { roomsApi } from "../lib/api";
import { getWebTorrentClient } from "../lib/webtorrent";

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
    setIsUploading(true);
    setUploadProgress(10);

    return new Promise(async (resolve, reject) => {
      try {
        const client = await getWebTorrentClient();
        if (!client) {
          throw new Error("WebTorrent client failed to load.");
        }

        const title = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
        setUploadProgress(30);

        client.seed(file, async (torrent: any) => {
          console.log('[WebTorrent] Seeding track:', torrent.infoHash);
          console.log('[WebTorrent] Magnet URI:', torrent.magnetURI);
          
          setUploadProgress(80);

          try {
            // Tell the backend to enqueue the new magnet URI
            await roomsApi.enqueueMagnet(roomId, torrent.magnetURI, title);
            setUploadProgress(100);
            setIsUploading(false);
            setUploadProgress(0);
            
            resolve({ trackUrl: torrent.magnetURI, title });
          } catch (apiErr) {
            console.error("[UploadContext] Failed to enqueue magnet URI:", apiErr);
            setIsUploading(false);
            setUploadProgress(0);
            reject(apiErr);
          }
        });

      } catch (err) {
        setIsUploading(false);
        setUploadProgress(0);
        console.error("[UploadContext] uploadFile failed:", err);
        reject(err);
      }
    });
  }, []);



  return (
    <Ctx.Provider value={{
      isDragging,
      isUploading,
      uploadProgress,
      setIsDragging,
      uploadFile,
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
