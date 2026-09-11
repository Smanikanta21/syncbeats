"use client";

import { useEffect, useRef } from 'react';
import type { SyncController } from './useSyncController';
import type { NetworkQuality } from './useAdaptiveSync';
import type { RoomSnapshot } from '../lib/types';

// ─── Exact device model detection ─────────────────────────────────────────
//
// Strategy per platform:
//   Android  → model is in the UA string, e.g. "Linux; Android 14; Pixel 8 Pro"
//   iOS/iPadOS → UA only says "iPhone"/"iPad". We cross-reference logical screen
//                resolution × devicePixelRatio against Apple's full hardware table.
//   Desktop  → UA gives OS version; GPU model from WebGL renderer where available.

// iOS lookup table: key = `${logical_width}x${logical_height}@${dpr}`
// Values = model name(s). When Apple reuses a resolution across generations,
// we list the range (the ML model can use other signals to distinguish further).
// Source: https://www.ios-resolution.com / Apple tech specs pages.
const IOS_RESOLUTION_TABLE: Record<string, string> = {
  // ── iPhones ──
  '320x480@1':   'iPhone 3G / 3GS',
  '320x480@2':   'iPhone 4 / 4S',
  '320x568@2':   'iPhone 5 / 5C / 5S / SE (1st gen)',
  '375x667@2':   'iPhone 6 / 6S / 7 / 8 / SE (2nd gen)',
  '414x736@3':   'iPhone 6 Plus / 6S Plus / 7 Plus / 8 Plus',
  '375x812@3':   'iPhone X / XS / 11 Pro / 12 Mini / 13 Mini',
  '414x896@2':   'iPhone XR / 11',
  '414x896@3':   'iPhone XS Max / 11 Pro Max',
  '390x844@3':   'iPhone 12 / 12 Pro / 13 / 13 Pro / 14',
  '428x926@3':   'iPhone 12 Pro Max / 13 Pro Max / 14 Plus',
  '393x852@3':   'iPhone 14 Pro / 15 / 15 Pro / 16',
  '430x932@3':   'iPhone 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus',
  '402x874@3':   'iPhone 16 Pro',
  '440x956@3':   'iPhone 16 Pro Max',
  // ── iPads ──
  '768x1024@1':  'iPad (1st–4th gen) / iPad Mini (1st gen)',
  '768x1024@2':  'iPad Air (1st gen) / iPad Mini (2nd–5th gen) / iPad (5th–6th gen)',
  '810x1080@2':  'iPad (7th–9th gen)',
  '820x1180@2':  'iPad (10th gen)',
  '834x1112@2':  'iPad Air (3rd gen) / iPad Pro 10.5"',
  '834x1194@2':  'iPad Air (4th–5th gen) / iPad Pro 11" (1st–4th gen)',
  '1024x1366@2': 'iPad Pro 12.9" / iPad Air 13" (M2)',
  '744x1133@2':  'iPad Mini (6th gen)',
  '1032x1376@2': 'iPad Air 11" (M2)',
};

function detectExactModel(ua: string): { deviceType: string; os: string; exactModel: string } {
  // ── Android: model is embedded in UA ──────────────────────────────────────
  // Format: "Linux; Android 14; <MODEL>"  or  "Linux; Android 14; <MODEL> Build/"
  const androidMatch = ua.match(/Android[\s/][\d.]+;\s*([^)]+?)(?:\s+Build|\s*\))/i);
  if (androidMatch) {
    const rawModel = androidMatch[1].trim();
    // Clean up common suffixes like "SM-G998B" → "Samsung Galaxy S21 Ultra" requires a DB,
    // but for the ML dataset the raw model code is already valuable and unique.
    const isTablet = !/Mobile/i.test(ua);
    return {
      deviceType: isTablet ? 'Android Tablet' : 'Android Phone',
      os: `Android ${(ua.match(/Android\s([\d.]+)/i)?.[1]) ?? ''}`.trim(),
      exactModel: rawModel,
    };
  }

  // ── iOS / iPadOS ──────────────────────────────────────────────────────────
  if (/iPhone|iPad|iPod/i.test(ua)) {
    const isIPad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    const iosVersion = ua.match(/OS ([\d_]+)/i)?.[1]?.replace(/_/g, '.') ?? '';
    const os = `iOS ${iosVersion}`.trim();

    if (typeof window !== 'undefined') {
      // Use logical pixel dimensions (window.screen is always in CSS pixels)
      const w   = Math.min(window.screen.width,  window.screen.height);
      const h   = Math.max(window.screen.width,  window.screen.height);
      const dpr = Math.round(window.devicePixelRatio ?? 1);
      const key = `${w}x${h}@${dpr}`;
      const model = IOS_RESOLUTION_TABLE[key];
      return {
        deviceType: isIPad ? 'iPad' : 'iPhone',
        os,
        exactModel: model ?? `${isIPad ? 'iPad' : 'iPhone'} (${key})`, // fallback: key is still useful
      };
    }
    return { deviceType: isIPad ? 'iPad' : 'iPhone', os, exactModel: isIPad ? 'iPad' : 'iPhone' };
  }

  // ── Desktop: OS + optional GPU from WebGL ────────────────────────────────
  let gpuModel = '';
  try {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          gpuModel = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string ?? '';
        }
      }
    }
  } catch (_) { /* WebGL not available */ }

  if (/Macintosh/i.test(ua)) {
    const macOsVersion = ua.match(/Mac OS X ([\d_]+)/i)?.[1]?.replace(/_/g, '.') ?? '';
    // Distinguish Apple Silicon from Intel via GPU renderer
    const chip = gpuModel.toLowerCase().includes('apple') ? 'Apple Silicon' : 'Intel';
    return {
      deviceType: 'Mac',
      os: `macOS ${macOsVersion}`.trim(),
      exactModel: `Mac (${chip})${gpuModel ? ` — ${gpuModel}` : ''}`,
    };
  }
  if (/Windows/i.test(ua)) {
    const winVersion = ua.match(/Windows NT ([\d.]+)/i)?.[1] ?? '';
    const winName: Record<string, string> = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
    return {
      deviceType: 'Windows PC',
      os: `Windows ${winName[winVersion] ?? winVersion}`.trim(),
      exactModel: `Windows PC${gpuModel ? ` — ${gpuModel}` : ''}`,
    };
  }
  if (/Linux/i.test(ua)) {
    return { deviceType: 'Linux', os: 'Linux', exactModel: `Linux${gpuModel ? ` — ${gpuModel}` : ''}` };
  }

  return { deviceType: 'Unknown', os: 'Unknown', exactModel: 'Unknown' };
}


// ─── Payload type ──────────────────────────────────────────────────────────

interface TelemetryBatch {
  sessionId:        string;
  roomId:           string;
  userId?:          string;
  deviceType:       string;
  os:               string;
  userAgent:        string;
  networkQuality:   string;
  rttMedianMs:      number;
  rttJitterMs:      number;
  rttSamples:       number[];
  clockOffsetMs:    number;
  driftSamples:     number[];
  driftMeanMs:      number;
  driftMaxMs:       number;
  correctionTier:   string;
  correctionsCount: number;
  playbackRate:     number;
  audioUnlocked:    boolean;
  tabVisible:       boolean;
  sessionAgeSecs:   number;
  participantCount: number;
  exactModel:       string;  // exact hardware model (e.g. "iPhone 15 Pro", "Pixel 8 Pro")
}

// ─── Constants ─────────────────────────────────────────────────────────────

const BATCH_INTERVAL_MS = 10_000; // Flush every 10 seconds
const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? '';
const ENDPOINT   = `${SERVER_URL}/telemetry/sync`;

// ─── Hook ──────────────────────────────────────────────────────────────────

interface UseSyncTelemetryOptions {
  syncRef:        React.MutableRefObject<SyncController>;
  clockOffsetRef: React.MutableRefObject<number>;
  snapshot:       RoomSnapshot | null;
  networkQuality: NetworkQuality;
  roomId:         string;
  userId?:        string;
  sessionId:      string; // socket.id captured at join
  /** Raw RTT samples from the most recent NTP burst — provided by useRoom */
  lastBurstRttsRef: React.MutableRefObject<number[]>;
}

export function useSyncTelemetry({
  syncRef,
  clockOffsetRef,
  snapshot,
  networkQuality,
  roomId,
  userId,
  sessionId,
  lastBurstRttsRef,
}: UseSyncTelemetryOptions): void {
  // Rolling window accumulator — reset each batch
  const driftWindowRef    = useRef<number[]>([]);
  const correctionTierRef = useRef<string>('synced');
  const correctionsRef    = useRef<number>(0);
  const rateRef           = useRef<number>(1);
  const joinTimeRef       = useRef<number>(Date.now());

  // Subscribe to SyncController drift reports on mount
  useEffect(() => {
    const sync = syncRef.current;
    const unsub = sync.subscribe(() => {
      const report = sync.getLastDrift();
      driftWindowRef.current.push(report.driftMs);

      // Track worst tier in this window (priority: emergency > crossfade > soft-seek > micro-rate > synced)
      const tierPriority: Record<string, number> = {
        emergency: 4, crossfade: 3, 'soft-seek': 2, 'micro-rate': 1, synced: 0,
      };
      const currentPriority = tierPriority[correctionTierRef.current] ?? 0;
      const newPriority = tierPriority[report.tier] ?? 0;
      if (newPriority > currentPriority) {
        correctionTierRef.current = report.tier;
      }

      if (report.correctionApplied) correctionsRef.current += 1;
      rateRef.current = report.playbackRate;
    });
    return unsub;
  }, [syncRef]);

  // Flush a batch every BATCH_INTERVAL_MS
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ua = navigator.userAgent;
    const { deviceType, os, exactModel } = detectExactModel(ua);

    const flush = () => {
      const driftSamples = driftWindowRef.current.slice();
      if (driftSamples.length === 0) return; // Nothing to report (not playing)

      // Compute stats
      const driftMeanMs = driftSamples.reduce((s, v) => s + v, 0) / driftSamples.length;
      const driftMaxMs  = Math.max(...driftSamples);

      // RTT stats from last burst
      const rtts = lastBurstRttsRef.current.slice();
      const sortedRtts = [...rtts].sort((a, b) => a - b);
      const rttMedianMs = sortedRtts.length
        ? sortedRtts[Math.floor(sortedRtts.length / 2)]
        : 0;
      const q1 = sortedRtts[Math.floor(sortedRtts.length * 0.25)] ?? 0;
      const q3 = sortedRtts[Math.floor(sortedRtts.length * 0.75)] ?? 0;
      const rttJitterMs = q3 - q1;

      const batch: TelemetryBatch = {
        sessionId,
        roomId,
        userId,
        deviceType,
        os,
        exactModel,
        userAgent:        ua,
        networkQuality,
        rttMedianMs,
        rttJitterMs,
        rttSamples:       rtts,
        clockOffsetMs:    clockOffsetRef.current,
        driftSamples,
        driftMeanMs,
        driftMaxMs,
        correctionTier:   correctionTierRef.current,
        correctionsCount: correctionsRef.current,
        playbackRate:     rateRef.current,
        audioUnlocked:    syncRef.current.getIntent().state !== 'idle',
        tabVisible:       document.visibilityState === 'visible',
        sessionAgeSecs:   Math.floor((Date.now() - joinTimeRef.current) / 1000),
        participantCount: snapshot?.participants?.length ?? 1,
      };

      // Reset accumulators
      driftWindowRef.current    = [];
      correctionTierRef.current = 'synced';
      correctionsRef.current    = 0;

      // Fire-and-forget — telemetry must NEVER affect the audio path
      // Use requestIdleCallback so it runs during browser idle time only
      const send = () => {
        fetch(ENDPOINT, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(batch),
          // Short timeout — if the server is slow, just drop the batch
          signal:  AbortSignal.timeout?.(5000),
        }).catch(() => {
          // Completely silent — telemetry is best-effort
        });
      };

      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(send, { timeout: 5000 });
      } else {
        setTimeout(send, 0);
      }
    };

    const interval = setInterval(flush, BATCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [syncRef, clockOffsetRef, roomId, userId, sessionId, networkQuality, snapshot, lastBurstRttsRef]);
}
