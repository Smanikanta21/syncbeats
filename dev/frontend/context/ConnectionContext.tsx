"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { getSocket } from "../lib/socket";
import { getServerUrl } from "../lib/api";

interface ConnectionContextType {
  isOnline: boolean;
  isServerReachable: boolean;
  isSocketConnected: boolean;
  serverError: string | null;
  checkConnection: () => Promise<boolean>;
  retryNow: () => void;
}

const ConnectionContext = createContext<ConnectionContextType>({
  isOnline: true,
  isServerReachable: true,
  isSocketConnected: true,
  serverError: null,
  checkConnection: async () => true,
  retryNow: () => {},
});

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnlineState] = useState<boolean>(true);
  const [isServerReachable, setIsServerReachableState] = useState<boolean>(true);
  const [isSocketConnected, setIsSocketConnectedState] = useState<boolean>(true);
  const [serverError, setServerErrorState] = useState<string | null>(null);

  // Refs to avoid stale closures inside event listeners and prevent re-render loops
  const isOnlineRef = useRef(true);
  const isServerReachableRef = useRef(true);
  const isSocketConnectedRef = useRef(true);
  const serverErrorRef = useRef<string | null>(null);
  const lastHealthCheckTimeRef = useRef<number>(0);

  // Deduplicated state updates to guarantee ZERO infinite re-render loops
  const setIsOnline = useCallback((val: boolean) => {
    if (isOnlineRef.current !== val) {
      isOnlineRef.current = val;
      setIsOnlineState(val);
    }
  }, []);

  const setIsServerReachable = useCallback((val: boolean) => {
    if (isServerReachableRef.current !== val) {
      isServerReachableRef.current = val;
      setIsServerReachableState(val);
    }
  }, []);

  const setIsSocketConnected = useCallback((val: boolean) => {
    if (isSocketConnectedRef.current !== val) {
      isSocketConnectedRef.current = val;
      setIsSocketConnectedState(val);
    }
  }, []);

  const setServerError = useCallback((val: string | null) => {
    if (serverErrorRef.current !== val) {
      serverErrorRef.current = val;
      setServerErrorState(val);
    }
  }, []);

  const checkServerHealth = useCallback(async (): Promise<boolean> => {
    const now = Date.now();
    // Throttle health check to at most once per 8 seconds
    if (now - lastHealthCheckTimeRef.current < 8000) {
      return isServerReachableRef.current;
    }
    lastHealthCheckTimeRef.current = now;

    if (typeof window === "undefined" || !navigator.onLine) {
      setIsServerReachable(false);
      return false;
    }
    try {
      const serverUrl = getServerUrl();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`${serverUrl}/health`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      }).catch(() => null);

      clearTimeout(timeoutId);

      if (res && (res.ok || res.status < 500)) {
        setIsServerReachable(true);
        setServerError(null);
        return true;
      }
    } catch {
      // ignore fetch failures
    }

    setIsServerReachable(false);
    setServerError("Cannot reach SyncBeats Server");
    return false;
  }, [setIsServerReachable, setServerError]);

  const retryNow = useCallback(() => {
    if (typeof window !== "undefined" && navigator.onLine) {
      setIsOnline(true);
      lastHealthCheckTimeRef.current = 0; // Force immediate check
      checkServerHealth();
      const socket = getSocket();
      if (!socket.connected) {
        socket.connect();
      }
    }
  }, [setIsOnline, checkServerHealth]);

  // Main lifecycle effect — RUNS ONCE ON MOUNT (empty dependency array [])
  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnlineState(navigator.onLine);
    isOnlineRef.current = navigator.onLine;

    const handleOnline = () => {
      setIsOnline(true);
      setServerError(null);
      retryNow();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setServerError("Network connection lost");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Socket event listeners
    const socket = getSocket();

    const handleSocketConnect = () => {
      setIsSocketConnected(true);
      setIsServerReachable(true);
      setServerError(null);
    };

    const handleSocketDisconnect = (reason: string) => {
      setIsSocketConnected(false);
      if (reason === "io server disconnect" || reason === "transport close" || reason === "transport error") {
        setServerError("Connection to SyncBeats server dropped");
      }
    };

    const handleSocketConnectError = (err: Error) => {
      setIsSocketConnected(false);
      setIsServerReachable(false);
      // Only set error if not already set to prevent continuous re-render triggers
      if (!serverErrorRef.current) {
        setServerError(err.message || "Cannot connect to SyncBeats server");
      }
    };

    socket.on("connect", handleSocketConnect);
    socket.on("disconnect", handleSocketDisconnect);
    socket.on("connect_error", handleSocketConnectError);

    // Custom API server error event from fetch wrapper
    const handleApiServerError = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      setIsServerReachable(false);
      setServerError(detail?.message || "Cannot reach SyncBeats server");
    };

    window.addEventListener("syncbeats-server-error", handleApiServerError);

    // Periodic heartbeat check (every 12 seconds when disconnected)
    const interval = setInterval(() => {
      if (!isServerReachableRef.current && navigator.onLine) {
        checkServerHealth();
      }
    }, 12000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("syncbeats-server-error", handleApiServerError);
      socket.off("connect", handleSocketConnect);
      socket.off("disconnect", handleSocketDisconnect);
      socket.off("connect_error", handleSocketConnectError);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ConnectionContext.Provider
      value={{
        isOnline,
        isServerReachable,
        isSocketConnected,
        serverError,
        checkConnection: checkServerHealth,
        retryNow,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  return useContext(ConnectionContext);
}
