"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getSocket } from "../lib/socket";

// ── Types ───────────────────────────────────────────────────────────────────

export interface NetworkSample {
  ts:      number;  // epoch when sample was taken
  rtt:     number;  // round-trip time in ms
  latency: number;  // one-way latency estimate in ms (rtt / 2)
  jitter:  number;  // absolute change in latency from previous sample
  offset:  number;  // clock offset in ms
}

export interface NetworkStats {
  /** Latest individual sample values */
  rtt:         number;
  latency:     number;
  jitter:      number;
  clockOffset: number;
  /** Rolling averages (last ~20 samples) */
  avgRtt:      number;
  avgLatency:  number;
  avgJitter:   number;
  /** Quality rating based on latency + jitter */
  quality:     "excellent" | "good" | "fair" | "poor";
  /** Sparkline history (last 60 samples) */
  history:     NetworkSample[];
  /** Whether we have enough data to show stats */
  hasData:     boolean;
}

// ── Constants ───────────────────────────────────────────────────────────────

const PING_INTERVAL_MS   = 1000;   // ping once per second for real-time stats
const MAX_HISTORY        = 60;     // keep 60 samples (1 min at 1/s)
const STORAGE_KEY        = "syncbeats:netStats";
const RTT_TIMEOUT_MS     = 2000;   // discard pings slower than 2s

// ── Quality thresholds ──────────────────────────────────────────────────────

function rateQuality(latency: number, jitter: number): NetworkStats["quality"] {
  if (latency < 30 && jitter < 10)  return "excellent";
  if (latency < 80 && jitter < 25)  return "good";
  if (latency < 150 && jitter < 50) return "fair";
  return "poor";
}

// ── Color helpers (exported for components) ─────────────────────────────────

export function qualityColor(q: NetworkStats["quality"]): string {
  switch (q) {
    case "excellent": return "#22c55e"; // green-500
    case "good":      return "#3b82f6"; // blue-500
    case "fair":      return "#f59e0b"; // amber-500
    case "poor":      return "#ef4444"; // red-500
  }
}

export function qualityLabel(q: NetworkStats["quality"]): string {
  switch (q) {
    case "excellent": return "Excellent";
    case "good":      return "Good";
    case "fair":      return "Fair";
    case "poor":      return "Poor";
  }
}

export function metricColor(value: number, thresholds: [number, number, number]): string {
  if (value <= thresholds[0]) return "#22c55e";
  if (value <= thresholds[1]) return "#3b82f6";
  if (value <= thresholds[2]) return "#f59e0b";
  return "#ef4444";
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useNetworkStats(enabled: boolean = true): NetworkStats {
  const socket = getSocket();
  const seqRef = useRef(0);
  const lastLatencyRef = useRef<number | null>(null);
  const historyRef = useRef<NetworkSample[]>([]);
  const [stats, setStats] = useState<NetworkStats>({
    rtt: 0, latency: 0, jitter: 0, clockOffset: 0,
    avgRtt: 0, avgLatency: 0, avgJitter: 0,
    quality: "good", history: [], hasData: false,
  });

  // Load persisted history on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as NetworkSample[];
        // Only keep samples from the last 5 minutes
        const cutoff = Date.now() - 5 * 60 * 1000;
        historyRef.current = parsed.filter(s => s.ts > cutoff).slice(-MAX_HISTORY);
      }
    } catch { /* ignore corrupt data */ }
  }, []);

  // Persist to localStorage periodically
  const persist = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(historyRef.current));
    } catch { /* quota exceeded — fine */ }
  }, []);

  const addSample = useCallback((rtt: number, offset: number) => {
    const latency = rtt / 2;
    const prev = lastLatencyRef.current;
    const jitter = prev !== null ? Math.abs(latency - prev) : 0;
    lastLatencyRef.current = latency;

    const sample: NetworkSample = {
      ts: Date.now(), rtt, latency, jitter, offset,
    };

    historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), sample];

    // Compute rolling averages
    const recent = historyRef.current.slice(-20);
    const avgRtt = recent.reduce((s, x) => s + x.rtt, 0) / recent.length;
    const avgLatency = recent.reduce((s, x) => s + x.latency, 0) / recent.length;
    const avgJitter = recent.reduce((s, x) => s + x.jitter, 0) / recent.length;
    const quality = rateQuality(avgLatency, avgJitter);

    setStats({
      rtt, latency, jitter, clockOffset: offset,
      avgRtt, avgLatency, avgJitter,
      quality, history: [...historyRef.current], hasData: true,
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;


    const doPing = () => {
      if (!socket.connected) return;
      const seq = ++seqRef.current;
      const t0 = Date.now();

      const timeout = setTimeout(() => {
        socket.off("sync:pong", onPong);
      }, RTT_TIMEOUT_MS);

      const onPong = ({ t1, seq: pongSeq }: { t1: number; seq?: number }) => {
        if (pongSeq !== seq) return;
        clearTimeout(timeout);
        socket.off("sync:pong", onPong);

        const t3 = Date.now();
        const rtt = t3 - t0;
        const offset = t1 - (t0 + t3) / 2;
        addSample(rtt, offset);
      };

      socket.on("sync:pong", onPong);
      socket.emit("sync:ping", { t0, seq });
    };

    const pingTimer = setInterval(doPing, PING_INTERVAL_MS);
    const persistTimer = setInterval(persist, 5000); // persist every 5s
    doPing(); // fire immediately

    return () => {
      clearInterval(pingTimer);
      clearInterval(persistTimer);
      persist(); // save on unmount
    };
  }, [enabled, socket, addSample, persist]);

  return stats;
}
