"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { getServerUrl } from "../lib/api";
import type { TrackQueueItem } from "../lib/types";

const SPEED_STORAGE_KEY = "sb_dl_speed_bps";
const BUFFER_MARGIN_SECONDS = 20; // start downloading this many extra seconds before needed
const DEFAULT_SPEED_BPS = 300_000; // 300 KB/s conservative default

// ── Speed estimation persistence ─────────────────────────────────────────────
function loadSpeedEstimate(): number {
  try {
    const v = localStorage.getItem(SPEED_STORAGE_KEY);
    return v ? parseFloat(v) : DEFAULT_SPEED_BPS;
  } catch {
    return DEFAULT_SPEED_BPS;
  }
}

function saveSpeedEstimate(bps: number) {
  try {
    const prev = loadSpeedEstimate();
    const blended = prev * 0.6 + bps * 0.4; // EWMA blend
    localStorage.setItem(SPEED_STORAGE_KEY, String(blended));
  } catch {}
}

// ── Extract videoId from ws-p2p URL ───────────────────────────────────────────
export function extractVideoId(trackUrl: string): string | null {
  const m = trackUrl.match(/^ws-p2p:yt:([^_]+)_/);
  return m ? m[1] : null;
}

// ── State exposed to callers ──────────────────────────────────────────────────
export interface PrefetchState {
  nextTrackProgress: number;    // 0 = idle, 1-99 = downloading, 100 = done
  nextTrackTitle: string | null;
  isPrefetching: boolean;
}

interface UseTrackPrefetcherOptions {
  snapshot: { queue: TrackQueueItem[] } | null;
  currentTime: number;
  duration: number;
  roomId: string;
}

export function useTrackPrefetcher({
  snapshot,
  currentTime,
  duration,
  roomId,
}: UseTrackPrefetcherOptions): PrefetchState {
  const [nextTrackProgress, setNextTrackProgress] = useState(0);
  const [nextTrackTitle, setNextTrackTitle] = useState<string | null>(null);
  const [isPrefetching, setIsPrefetching] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const prefetchedUrlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive the next track in the queue
  const nextTrack = (() => {
    if (!snapshot?.queue) return null;
    const idx = snapshot.queue.findIndex(q => q.isCurrent);
    if (idx === -1 || idx >= snapshot.queue.length - 1) return null;
    return snapshot.queue[idx + 1] ?? null;
  })();

  const doDownload = useCallback(async (track: TrackQueueItem) => {
    const videoId = extractVideoId(track.trackUrl);
    if (!videoId) return;

    const { getTrack, saveTrack } = await import("../lib/idb");
    const existing = await getTrack(track.trackUrl);
    if (existing) {
      setNextTrackProgress(100);
      setIsPrefetching(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setNextTrackTitle(track.title);
    setIsPrefetching(true);
    setNextTrackProgress(1);

    const proxyUrl = `${getServerUrl()}/rooms/${roomId}/yt-proxy?videoId=${videoId}`;
    const startedAt = Date.now();

    try {
      const resp = await fetch(proxyUrl, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(`yt-proxy ${resp.status}`);

      const contentLength = resp.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      const reader = resp.body!.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (ctrl.signal.aborted) return;
        chunks.push(value);
        loaded += value.length;
        if (total > 0) setNextTrackProgress(Math.round((loaded / total) * 100));
      }

      if (ctrl.signal.aborted) return;

      const merged = new Uint8Array(loaded);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.length; }
      const blob = new Blob([merged.buffer], { type: "audio/mpeg" });
      await saveTrack(track.trackUrl, blob);

      const elapsed = (Date.now() - startedAt) / 1000;
      if (elapsed > 0) saveSpeedEstimate(loaded / elapsed);

      setNextTrackProgress(100);
      setIsPrefetching(false);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.warn("[Prefetcher] Failed to pre-download next track:", err);
      setIsPrefetching(false);
      setNextTrackProgress(0);
    }
  }, [roomId]);

  const scheduleOrTrigger = useCallback((track: TrackQueueItem) => {
    if (prefetchedUrlRef.current === track.trackUrl) return;
    const videoId = extractVideoId(track.trackUrl);
    if (!videoId) return; // non-YT track, handled elsewhere

    if (timerRef.current) clearTimeout(timerRef.current);

    // If duration unknown, download immediately
    if (!duration || duration === 0) {
      prefetchedUrlRef.current = track.trackUrl;
      doDownload(track);
      return;
    }

    const speedBps = loadSpeedEstimate();
    // Estimate size: use sizeBytes from queue item if available
    const sizeEstimate = (track as any).sizeBytes ?? speedBps * 120;
    const estimatedDownloadSecs = sizeEstimate / speedBps;
    const timeRemaining = duration - currentTime;
    const triggerWhenRemainingBelow = estimatedDownloadSecs + BUFFER_MARGIN_SECONDS;

    if (timeRemaining <= triggerWhenRemainingBelow) {
      prefetchedUrlRef.current = track.trackUrl;
      doDownload(track);
    } else {
      const delayMs = Math.max(0, (timeRemaining - triggerWhenRemainingBelow) * 1000);
      timerRef.current = setTimeout(() => {
        prefetchedUrlRef.current = track.trackUrl;
        doDownload(track);
      }, delayMs);
    }
  }, [currentTime, duration, doDownload]);

  // Reset when current track changes
  const currentTrackUrl = snapshot?.queue.find(q => q.isCurrent)?.trackUrl;
  useEffect(() => {
    prefetchedUrlRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setNextTrackProgress(0);
    setIsPrefetching(false);
    setNextTrackTitle(null);
  }, [currentTrackUrl]);

  // Schedule / trigger as time advances
  useEffect(() => {
    if (!nextTrack) return;
    if (prefetchedUrlRef.current === nextTrack.trackUrl) return;
    scheduleOrTrigger(nextTrack);
  }, [nextTrack, scheduleOrTrigger, currentTime]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return useMemo(() => ({ nextTrackProgress, nextTrackTitle, isPrefetching }), [nextTrackProgress, nextTrackTitle, isPrefetching]);
}
