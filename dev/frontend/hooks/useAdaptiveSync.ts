"use client";

import { useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

// ─── Types ───────────────────────────────────────────────────────────────────

export type NetworkQuality = 'excellent' | 'good' | 'fair' | 'poor';

export interface AdaptiveParams {
  NTP_SAMPLE_COUNT:        number;
  NTP_RTT_GATE_MS:         number;
  NTP_PING_GAP_MS:         number;
  NTP_RESYNC_INTERVAL_MS:  number;
  DRIFT_CHECK_INTERVAL_MS: number;
  DRIFT_HARD_SEEK_MS:      number;
  DRIFT_SOFT_SEEK_MS:      number;
}

export interface UseAdaptiveSyncReturn {
  /** Mutable ref containing current adaptive params — read without causing re-renders */
  paramsRef:      React.MutableRefObject<AdaptiveParams>;
  /** Reactive quality tier — useful for UI (signal bars, debug overlay) */
  networkQuality: NetworkQuality;
  /**
   * Call after each NTP burst with all raw RTT values (including rejected ones).
   * This classifies network quality, EWMA-blends params, and reports stats to server.
   */
  reportBurst:    (rttSamples: number[], roomId: string) => void;
}

// ─── Parameter table ─────────────────────────────────────────────────────────
//
// Design rationale for poor vs excellent:
//  • Poor devices have noisy clock-offset estimates → they "appear" to drift more.
//    Raising DRIFT_HARD_SEEK_MS gives rate-correction room to quietly fix the
//    drift instead of triggering jarring hard-seeks.  This only affects the
//    poor device itself — other devices are completely untouched.
//  • Fewer NTP samples on poor links avoids hammering a congested connection.
//  • Wider RTT gate stops perfectly valid slow pings from being thrown away.

const PARAM_TABLE: Record<NetworkQuality, AdaptiveParams> = {
  excellent: {
    NTP_SAMPLE_COUNT:        20,     // More samples → tighter median
    NTP_RTT_GATE_MS:         150,    // Tight gate on a fast link
    NTP_PING_GAP_MS:         10,     // Fast burst
    NTP_RESYNC_INTERVAL_MS:  4_000,  // Re-sync every 4 s
    DRIFT_CHECK_INTERVAL_MS: 100,    // Check drift 10×/s
    DRIFT_HARD_SEEK_MS:      80,     // Seek if >80 ms off
    DRIFT_SOFT_SEEK_MS:      5,      // Rate-correct if >5 ms off
  },
  good: {
    NTP_SAMPLE_COUNT:        15,
    NTP_RTT_GATE_MS:         250,
    NTP_PING_GAP_MS:         20,
    NTP_RESYNC_INTERVAL_MS:  5_000,
    DRIFT_CHECK_INTERVAL_MS: 200,
    DRIFT_HARD_SEEK_MS:      150,
    DRIFT_SOFT_SEEK_MS:      10,
  },
  fair: {
    NTP_SAMPLE_COUNT:        10,
    NTP_RTT_GATE_MS:         400,
    NTP_PING_GAP_MS:         40,
    NTP_RESYNC_INTERVAL_MS:  8_000,
    DRIFT_CHECK_INTERVAL_MS: 350,
    DRIFT_HARD_SEEK_MS:      250,    // Prefer soft correction up to 250 ms
    DRIFT_SOFT_SEEK_MS:      20,
  },
  poor: {
    NTP_SAMPLE_COUNT:        6,      // Minimal pings — don't thrash a bad link
    NTP_RTT_GATE_MS:         600,    // Accept slow-but-valid pings
    NTP_PING_GAP_MS:         80,     // Breathe between pings
    NTP_RESYNC_INTERVAL_MS:  12_000, // Re-sync every 12 s to avoid load
    DRIFT_CHECK_INTERVAL_MS: 500,    // Check 2×/s — good enough
    DRIFT_HARD_SEEK_MS:      400,    // Soft-correct up to 400 ms — fewer jarring seeks
    DRIFT_SOFT_SEEK_MS:      40,     // Rate-correct anything >40 ms
  },
};

// How quickly to blend toward a new tier (0 = never adapt, 1 = snap immediately).
// 0.35 means roughly 3-4 bursts to fully transition → smooth, no oscillation.
const EWMA_ALPHA = 0.35;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classifyQuality(medianRtt: number, jitter: number): NetworkQuality {
  if (medianRtt < 30  && jitter < 5)  return 'excellent';
  if (medianRtt < 80  && jitter < 15) return 'good';
  if (medianRtt < 200 && jitter < 40) return 'fair';
  return 'poor';
}

function ewmaBlend(current: number, target: number, alpha: number): number {
  return alpha * target + (1 - alpha) * current;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAdaptiveSync(socket: Socket): UseAdaptiveSyncReturn {
  // Start at 'good' — a conservative default until we have real measurements.
  const paramsRef    = useRef<AdaptiveParams>({ ...PARAM_TABLE.good });
  const qualityRef   = useRef<NetworkQuality>('good');
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>('good');

  const reportBurst = useCallback((rttSamples: number[], roomId: string) => {
    if (rttSamples.length === 0) return;

    // Compute median RTT and IQR-based jitter from raw samples
    const sorted     = [...rttSamples].sort((a, b) => a - b);
    const medianRtt  = sorted[Math.floor(sorted.length / 2)];
    const q1         = sorted[Math.floor(sorted.length * 0.25)];
    const q3         = sorted[Math.floor(sorted.length * 0.75)];
    const jitter     = q3 - q1;

    const newTier    = classifyQuality(medianRtt, jitter);
    const target     = PARAM_TABLE[newTier];
    const current    = paramsRef.current;

    // EWMA-blend all numeric params so there are no sudden jumps between tiers
    paramsRef.current = {
      NTP_SAMPLE_COUNT:        Math.round(ewmaBlend(current.NTP_SAMPLE_COUNT,        target.NTP_SAMPLE_COUNT,        EWMA_ALPHA)),
      NTP_RTT_GATE_MS:         Math.round(ewmaBlend(current.NTP_RTT_GATE_MS,         target.NTP_RTT_GATE_MS,         EWMA_ALPHA)),
      NTP_PING_GAP_MS:         Math.round(ewmaBlend(current.NTP_PING_GAP_MS,         target.NTP_PING_GAP_MS,         EWMA_ALPHA)),
      NTP_RESYNC_INTERVAL_MS:  Math.round(ewmaBlend(current.NTP_RESYNC_INTERVAL_MS,  target.NTP_RESYNC_INTERVAL_MS,  EWMA_ALPHA)),
      DRIFT_CHECK_INTERVAL_MS: Math.round(ewmaBlend(current.DRIFT_CHECK_INTERVAL_MS, target.DRIFT_CHECK_INTERVAL_MS, EWMA_ALPHA)),
      DRIFT_HARD_SEEK_MS:      Math.round(ewmaBlend(current.DRIFT_HARD_SEEK_MS,      target.DRIFT_HARD_SEEK_MS,      EWMA_ALPHA)),
      DRIFT_SOFT_SEEK_MS:      Math.round(ewmaBlend(current.DRIFT_SOFT_SEEK_MS,      target.DRIFT_SOFT_SEEK_MS,      EWMA_ALPHA)),
    };

    // Update reactive quality state only on tier transitions to avoid re-renders
    if (newTier !== qualityRef.current) {
      qualityRef.current = newTier;
      setNetworkQuality(newTier);
      console.log(
        `[AdaptiveSync] Tier: ${qualityRef.current} → ${newTier} ` +
        `(RTT: ${medianRtt}ms, Jitter: ${jitter}ms) | ` +
        `hardSeek: ${paramsRef.current.DRIFT_HARD_SEEK_MS}ms, ` +
        `resync: ${paramsRef.current.NTP_RESYNC_INTERVAL_MS}ms`
      );
    }

    // Report stats to server so other participants can see this device's link quality
    socket.emit('sync:stats', { roomId, latency: medianRtt, jitter });
  }, [socket]);

  return { paramsRef, networkQuality, reportBurst };
}
