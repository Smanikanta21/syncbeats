"use client";

// context/UploadContext.tsx
// Shares drag state + upload function across DynamicIsland ↔ Room page.

import {
  createContext, useContext, useState, useCallback,
  useRef, type ReactNode,
} from "react";
import { getAuthToken } from "../lib/api";

interface UploadResult {
  trackUrl: string;
  title:    string;
}

interface UploadCtx {
  isDragging:       boolean;    // file is currently dragged over the window
  isUploading:      boolean;
  uploadProgress:   number;     // 0–100
  setIsDragging:    (v: boolean) => void;
  uploadFile:       (file: File, roomId: string) => Promise<UploadResult>;
}

const Ctx = createContext<UploadCtx | null>(null);

function getServerUrl(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_SERVER_URL ?? `http://${window.location.hostname}:4000`;
  }
  return "/api";
}

function getToken(): string | null {
  return getAuthToken();
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const [isDragging,     setIsDragging]     = useState(false);
  const [isUploading,    setIsUploading]    = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const uploadFile = useCallback(async (file: File, roomId: string): Promise<UploadResult> => {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      xhr.open("POST", `${getServerUrl()}/rooms/${roomId}/upload`);

      const token = getToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        setIsUploading(false);
        setUploadProgress(0);
        if (xhr.status === 201) {
          try {
            resolve(JSON.parse(xhr.responseText) as UploadResult);
          } catch {
            reject(new Error("Invalid server response"));
          }
        } else {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };

      xhr.onerror = () => {
        setIsUploading(false);
        setUploadProgress(0);
        reject(new Error("Network error during upload"));
      };

      setIsUploading(true);
      setUploadProgress(0);
      xhr.send(form);
    });
  }, []);

  return (
    <Ctx.Provider value={{ isDragging, isUploading, uploadProgress, setIsDragging, uploadFile }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUpload(): UploadCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUpload must be used inside <UploadProvider>");
  return ctx;
}
