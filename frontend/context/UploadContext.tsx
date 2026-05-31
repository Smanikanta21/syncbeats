"use client";

// context/UploadContext.tsx
// Shares IndexedDB cache status, upload metadata triggers, and real-time Socket.io P2P chunk transfers.

import {
  createContext, useContext, useState, useCallback,
  useRef, useEffect, type ReactNode,
} from "react";
import { getAuthToken, getServerUrl } from "../lib/api";
import { trackDB } from "../lib/db";
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
  isDownloadingYt:  boolean;
  ytDownloadTitle:  string;
  downloadYoutube:  (roomId: string, videoId: string, title: string) => Promise<any>;
  activeTransfers:  Record<string, TransferState>;
}

const Ctx = createContext<UploadCtx | null>(null);

function getToken(): string | null {
  return getAuthToken();
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const [isDragging,     setIsDragging]     = useState(false);
  const [isUploading,    setIsUploading]    = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDownloadingYt, setIsDownloadingYt] = useState(false);
  const [ytDownloadTitle, setYtDownloadTitle] = useState("");
  const [activeTransfers, setActiveTransfers] = useState<Record<string, TransferState>>({});
  
  const activeTransfersRef = useRef(activeTransfers);
  useEffect(() => {
    activeTransfersRef.current = activeTransfers;
  }, [activeTransfers]);

  // 1. Upload Local File (Saves locally in IndexedDB, posts JSON metadata to server)
  const uploadFile = useCallback(async (file: File, roomId: string): Promise<UploadResult> => {
    setIsUploading(true);
    setUploadProgress(20);

    try {
      const trackId = `local:${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const title = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');

      // Save directly to the browser's IndexedDB!
      setUploadProgress(50);
      await trackDB.saveTrack(trackId, file, title);
      setUploadProgress(80);

      // Register the metadata JSON on the server
      const token = getToken();
      const res = await fetch(`${getServerUrl()}/rooms/${roomId}/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          title,
          trackUrl: trackId,
          sizeBytes: file.size,
          mimeType: file.type
        })
      });

      if (!res.ok) {
        throw new Error(`Server failed to register metadata (${res.status})`);
      }

      setUploadProgress(100);
      const result = await res.json() as UploadResult;
      setIsUploading(false);
      setUploadProgress(0);
      return result;
    } catch (err) {
      setIsUploading(false);
      setUploadProgress(0);
      console.error("[UploadContext] uploadFile failed:", err);
      throw err;
    }
  }, []);

  // 2. Download YouTube Track (Transiently down from server, saves locally in IndexedDB, enqueues JSON metadata)
  const downloadYoutube = useCallback(async (roomId: string, videoId: string, title: string): Promise<any> => {
    setIsDownloadingYt(true);
    setYtDownloadTitle(title);

    try {
      const token = getToken();
      
      // Fetch the binary file directly from the transient YouTube downloader!
      const res = await fetch(`${getServerUrl()}/rooms/${roomId}/yt-download`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ videoId, title })
      });

      if (!res.ok) {
        throw new Error(`Transient YouTube download failed (${res.status})`);
      }

      const blob = await res.blob();
      const trackId = `local:youtube-${videoId}`;

      // Save Blob to local browser's IndexedDB!
      await trackDB.saveTrack(trackId, blob, title);

      // Enqueue the JSON metadata on the server
      const enqueueRes = await fetch(`${getServerUrl()}/rooms/${roomId}/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          title,
          trackUrl: trackId,
          sizeBytes: blob.size,
          mimeType: blob.type || "audio/mpeg"
        })
      });

      if (!enqueueRes.ok) {
        throw new Error(`Server failed to enqueue YouTube metadata (${enqueueRes.status})`);
      }

      const result = await enqueueRes.json();
      return result;
    } catch (err) {
      console.error("[UploadContext] downloadYoutube failed:", err);
      throw err;
    } finally {
      setIsDownloadingYt(false);
      setYtDownloadTitle("");
    }
  }, []);

  // 3. Socket.io relays for P2P File Sharing
  useEffect(() => {
    const socket = getSocket();

    // Receiver requests a file we might have
    const handleRequestFile = async ({ requesterSocketId, trackUrl }: { requesterSocketId: string; trackUrl: string }) => {
      try {
        const fileBlob = await trackDB.getTrack(trackUrl);
        if (!fileBlob) return; // We don't have this cached

        const arrayBuffer = await fileBlob.arrayBuffer();
        const chunkSize = 256 * 1024; // 256KB chunks
        const totalChunks = Math.ceil(arrayBuffer.byteLength / chunkSize);

        console.log(`[P2P Share] Streaming ${trackUrl} to ${requesterSocketId} in ${totalChunks} chunks.`);

        for (let i = 0; i < totalChunks; i++) {
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, arrayBuffer.byteLength);
          const chunkData = arrayBuffer.slice(start, end);

          socket.emit("track:send_chunk", {
            targetSocketId: requesterSocketId,
            trackUrl,
            chunkIndex: i,
            totalChunks,
            data: chunkData
          });

          // Prevent packet flooding: yield main thread briefly
          if (i % 4 === 0) {
            await new Promise(r => setTimeout(r, 8));
          }
        }
      } catch (err) {
        console.error("[P2P Share] Failed to send file chunks:", err);
      }
    };

    // We receive chunks for a track we requested
    const handleReceiveChunk = async ({ trackUrl, chunkIndex, totalChunks, data }: {
      trackUrl: string;
      chunkIndex: number;
      totalChunks: number;
      data: ArrayBuffer;
    }) => {
      setActiveTransfers(prev => {
        const existing = prev[trackUrl];
        const newChunks = existing ? [...existing.chunks] : new Array(totalChunks);
        newChunks[chunkIndex] = data;

        const receivedCount = newChunks.filter(Boolean).length;
        const progress = Math.round((receivedCount / totalChunks) * 100);

        if (receivedCount === totalChunks) {
          // Compile and save track Blob once 100% complete
          const blob = new Blob(newChunks, { type: "audio/mpeg" });
          trackDB.saveTrack(trackUrl, blob, "Synced Track").then(() => {
            console.log(`[P2P Sync] Successfully compiled and saved ${trackUrl} locally.`);
            window.dispatchEvent(new CustomEvent(`trackSynced:${trackUrl}`, { detail: { blob } }));
          }).catch(err => {
            console.error("[P2P Sync] Failed to save track Blob to IndexedDB:", err);
          });

          const next = { ...prev };
          delete next[trackUrl];
          return next;
        }

        return {
          ...prev,
          [trackUrl]: {
            chunks: newChunks,
            totalChunks,
            progress
          }
        };
      });
    };

    socket.on("track:request_file", handleRequestFile);
    socket.on("track:receive_chunk", handleReceiveChunk);

    return () => {
      socket.off("track:request_file", handleRequestFile);
      socket.off("track:receive_chunk", handleReceiveChunk);
    };
  }, []);

  return (
    <Ctx.Provider value={{
      isDragging,
      isUploading,
      uploadProgress,
      setIsDragging,
      uploadFile,
      isDownloadingYt,
      ytDownloadTitle,
      downloadYoutube,
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
