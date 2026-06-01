"use client";

// context/UploadContext.tsx
// Shares IndexedDB cache status, upload metadata triggers, and real-time Socket.io P2P chunk transfers.

import {
  createContext, useContext, useState, useCallback,
  type ReactNode,
} from "react";
import { getAuthToken, getServerUrl } from "../lib/api";

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
  


  // 1. Upload Local File to CDN (S3)
  const uploadFile = useCallback(async (file: File, roomId: string): Promise<UploadResult> => {
    setIsUploading(true);
    setUploadProgress(10);

    try {
      const title = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      const formData = new FormData();
      formData.append('title', title);
      formData.append('file', file);

      setUploadProgress(50);
      const token = getToken();
      const res = await fetch(`${getServerUrl()}/rooms/${roomId}/upload-file`, {
        method: "POST",
        headers: {
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: formData
      });

      if (!res.ok) {
        throw new Error(`Server failed to upload file (${res.status})`);
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

  // 2. Download YouTube Track (Server downloads & uploads to S3, returns S3 URL)
  const downloadYoutube = useCallback(async (roomId: string, videoId: string, title: string): Promise<any> => {
    setIsDownloadingYt(true);
    setYtDownloadTitle(title);

    try {
      const token = getToken();
      
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

      const result = await res.json();
      return result;
    } catch (err) {
      console.error("[UploadContext] downloadYoutube failed:", err);
      throw err;
    } finally {
      setIsDownloadingYt(false);
      setYtDownloadTitle("");
    }
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
