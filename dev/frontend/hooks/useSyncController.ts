"use client";

import { useRef, useCallback } from 'react';
import type { AdaptiveParams } from './useAdaptiveSync';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlaybackIntent {
  state: 'playing' | 'paused' | 'idle';
  startEpoch: number | null;   // server epoch when song position = 0
  pauseOffset: number;          // seconds into track (when paused)
  trackUrl: string | null;
  gen: number;                  // monotonic generation — incremented on every mutation
}

export interface RoomIntent {
  roomId: string | null;
  hostId: string | null;
  isPrivate: boolean;
  shuffle: boolean;
  repeatMode: 'off' | 'track' | 'all';
  pendingPlay: boolean;
}

export type DriftTier = 'micro-rate' | 'macro-rate' | 'crossfade' | 'emergency' | 'synced';

export interface DriftReport {
  driftMs: number;
  tier: DriftTier;
  correctionApplied: boolean;
  playbackRate: number;
}

// ─── Tier thresholds (derived from AdaptiveParams) ───────────────────────────

interface TierThresholds {
  t1MaxMs: number;   // micro-rate ceiling
  t2MaxMs: number;   // soft-seek ceiling
  t3MaxMs: number;   // crossfade ceiling
  // above t3MaxMs → T4 emergency snap
}

function computeTierThresholds(params: AdaptiveParams): TierThresholds {
  // Derive 4-tier thresholds from the existing adaptive params.
  // T1 micro-rate handles small drifts imperceptibly.
  // T2 soft-seek handles medium drifts with masked micro-jumps.
  // T3 crossfade handles larger drifts with a quick fade.
  // T4 emergency is for anything beyond T3.
  const t1MaxMs = Math.max(10, Math.round(params.DRIFT_SOFT_SEEK_MS * 3));
  const t2MaxMs = Math.max(t1MaxMs + 10, params.DRIFT_HARD_SEEK_MS);
  const t3MaxMs = Math.max(t2MaxMs + 50, Math.round(params.DRIFT_HARD_SEEK_MS * 2.5));
  return { t1MaxMs, t2MaxMs, t3MaxMs };
}

// ─── Audio interface (subset of useAudioPlayer return) ───────────────────────

interface AudioHandle {
  isPlaying: boolean;
  isReady: boolean;
  audioUnlocked: boolean;
  getTruePosition: () => number;
  pauseAt: (position: number) => void;
  playNow: (expectedPosition: number) => void;
  scheduleStart: (payload: any, clockOffset: number) => Promise<void>;
  setPlaybackRate?: (rate: number) => void;
  audioCtx?: AudioContext | null;
  gainNode?: GainNode | null;
  volume: number;
  trackUrl: string | null;
  /** Hardware output latency in seconds (audioCtx.outputLatency + baseLatency) */
  outputLatency: number;
  /** User-adjustable manual latency offset in seconds */
  manualLatency: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Micro-rate adjustment magnitude (0.1% — completely inaudible, corrects 1ms/sec)
const MICRO_RATE_FAST = 1.001;
const MICRO_RATE_SLOW = 0.999;
const MICRO_RATE_DEADZONE_MS = 2; // Don't adjust if drift < 2ms — already perfect

// Macro-rate: proportional correction, scales with drift size.
// Max 2% (inaudible pitch-wise), closes a 100ms gap in ~5 seconds.
const MACRO_RATE_MAX_DEVIATION = 0.02; // cap at 2% (1.02 / 0.98)
const MACRO_RATE_MIN_DEVIATION = 0.002; // floor at 0.2%

// Crossfade durations (ms)
const CROSSFADE_OUT_MS = 30;
const CROSSFADE_IN_MS = 30;

// ─── SyncController ────────────────────────────────────────────────────────

export class SyncController {
  // ── Playback intent ──
  private _intent: PlaybackIntent = {
    state: 'idle',
    startEpoch: null,
    pauseOffset: 0,
    trackUrl: null,
    gen: 0,
  };

  // ── Room intent ──
  private _room: RoomIntent = {
    roomId: null,
    hostId: null,
    isPrivate: false,
    shuffle: false,
    repeatMode: 'off',
    pendingPlay: false,
  };

  // ── Drift state ──
  private _currentRate: number = 1;
  private _lastDriftReport: DriftReport = {
    driftMs: 0,
    tier: 'synced',
    correctionApplied: false,
    playbackRate: 1,
  };

  // ── External refs (set once by the hook) ──
  private _audioRef: React.MutableRefObject<AudioHandle> | null = null;
  private _clockOffsetRef: React.MutableRefObject<number> | null = null;
  private _paramsRef: React.MutableRefObject<AdaptiveParams> | null = null;
  private _hasClockSync: React.MutableRefObject<boolean> | null = null;

  // ── Diagnostics ──
  private _lastLogTime: number = 0;

  // ── Performance.now baseline for sub-ms server time ──
  private _perfBaseline: number = performance.now();
  private _dateBaseline: number = Date.now();

  // ── Listeners ──
  private _listeners: Set<() => void> = new Set();

  // ─────────────────────────────────────────────────────────────────────────
  // Binding
  // ─────────────────────────────────────────────────────────────────────────

  bind(
    audioRef: React.MutableRefObject<AudioHandle>,
    clockOffsetRef: React.MutableRefObject<number>,
    paramsRef: React.MutableRefObject<AdaptiveParams>,
    hasClockSync: React.MutableRefObject<boolean>,
  ): void {
    this._audioRef = audioRef;
    this._clockOffsetRef = clockOffsetRef;
    this._paramsRef = paramsRef;
    this._hasClockSync = hasClockSync;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Observers — any subsystem can subscribe to intent changes
  // ─────────────────────────────────────────────────────────────────────────

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notify(): void {
    this._listeners.forEach(fn => fn());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Getters (synchronous — safe to read from setInterval / rAF)
  // ─────────────────────────────────────────────────────────────────────────

  getGen(): number { return this._intent.gen; }
  getIntent(): Readonly<PlaybackIntent> { return this._intent; }
  getRoomIntent(): Readonly<RoomIntent> { return this._room; }
  getLastDrift(): Readonly<DriftReport> { return this._lastDriftReport; }
  getCurrentRate(): number { return this._currentRate; }

  getServerNow(): number {
    const perfElapsed = performance.now() - this._perfBaseline;
    return this._dateBaseline + perfElapsed + (this._clockOffsetRef?.current ?? 0);
  }

  /** Returns expected playback position in seconds based on server time */
  getExpectedPosition(): number {
    if (this._intent.state !== 'playing' || this._intent.startEpoch == null) {
      return this._intent.pauseOffset;
    }
    return Math.max(0, (this.getServerNow() - this._intent.startEpoch) / 1000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Playback Intent Mutations (all increment gen, all synchronous)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Declare intent to play. Called when server sends `playback:schedule`.
   * Does NOT directly start audio — the NTP burst callback or drift
   * correction will apply it once clock is fresh.
   */
  schedule(startEpoch: number, pauseOffset: number, trackUrl: string | null): void {
    this._intent = {
      state: 'playing',
      startEpoch,
      pauseOffset,
      trackUrl: trackUrl ?? this._intent.trackUrl,
      gen: this._intent.gen + 1,
    };
    this._room.pendingPlay = false;
    this._currentRate = 1;
    this._notify();
  }

  /**
   * Declare intent to pause. Called when server sends `playback:pause`
   * or `room:stateChanged` with isPlaying=false.
   * IMMEDIATELY stops audio — no async, no waiting.
   */
  pause(offset: number): void {
    const audio = this._audioRef?.current;
    this._intent = {
      state: 'paused',
      startEpoch: null,
      pauseOffset: offset,
      trackUrl: this._intent.trackUrl,
      gen: this._intent.gen + 1,
    };
    this._room.pendingPlay = false;
    this._currentRate = 1;
    // Immediately stop audio — this is the critical synchronous guarantee
    if (audio?.isPlaying) {
      audio.pauseAt(offset);
    }
    // Reset playback rate
    if (audio?.setPlaybackRate) {
      audio.setPlaybackRate(1);
    }
    this._notify();
  }

  /**
   * Declare intent to seek (while playing or paused).
   */
  seek(positionSec: number): void {
    const audio = this._audioRef?.current;
    if (this._intent.state === 'playing' && this._intent.startEpoch != null) {
      // Recalculate startEpoch so the timeline origin shifts to the seek position
      const nowServer = this.getServerNow();
      this._intent = {
        ...this._intent,
        startEpoch: nowServer - positionSec * 1000,
        gen: this._intent.gen + 1,
      };
    } else {
      this._intent = {
        ...this._intent,
        state: 'paused',
        pauseOffset: positionSec,
        gen: this._intent.gen + 1,
      };
    }
    this._notify();
    // Let drift correction handle the actual audio repositioning on next tick
    if (audio && this._intent.state !== 'playing') {
      audio.pauseAt(positionSec);
    }
  }

  /**
   * Reset to idle (room cleared, no track).
   */
  idle(): void {
    const audio = this._audioRef?.current;
    this._intent = {
      state: 'idle',
      startEpoch: null,
      pauseOffset: 0,
      trackUrl: null,
      gen: this._intent.gen + 1,
    };
    this._room.pendingPlay = false;
    this._currentRate = 1;
    if (audio?.isPlaying) {
      audio.pauseAt(0);
    }
    if (audio?.setPlaybackRate) {
      audio.setPlaybackRate(1);
    }
    this._notify();
  }

  /**
   * Set the current track URL (track change without play/pause change).
   */
  setTrack(trackUrl: string | null): void {
    if (this._intent.trackUrl === trackUrl) return;
    this._intent = {
      ...this._intent,
      trackUrl,
      gen: this._intent.gen + 1,
    };
    this._notify();
  }

  /**
   * Mark that playback is pending (waiting for all devices to be ready).
   */
  setPendingPlay(pending: boolean): void {
    this._room.pendingPlay = pending;
    this._notify();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Room state mutations
  // ─────────────────────────────────────────────────────────────────────────

  updateRoom(partial: Partial<RoomIntent>): void {
    this._room = { ...this._room, ...partial };
    this._notify();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Clock reset (call after each NTP burst to refresh the baseline)
  // ─────────────────────────────────────────────────────────────────────────

  resetClockBaseline(): void {
    this._perfBaseline = performance.now();
    this._dateBaseline = Date.now();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Async guard: capture gen before async work, check after
  // ─────────────────────────────────────────────────────────────────────────

  isGenCurrent(capturedGen: number): boolean {
    return this._intent.gen === capturedGen;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Apply a schedule to the audio player (after NTP burst).
  // Only executes if gen is still current.
  // ─────────────────────────────────────────────────────────────────────────

  applyScheduleIfCurrent(capturedGen: number, payload: any, clockOffset: number): void {
    if (!this.isGenCurrent(capturedGen)) return;
    if (this._intent.state !== 'playing') return;
    const audio = this._audioRef?.current;
    if (!audio) return;
    audio.scheduleStart(payload, clockOffset);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4-Tier Drift Correction (called every 50ms by the interval)
  // ─────────────────────────────────────────────────────────────────────────

  correctDrift(): void {
    const audio = this._audioRef?.current;
    if (!audio) return;

    // ── If we should be paused/idle, force audio stopped ──
    if (this._intent.state !== 'playing' || this._intent.startEpoch == null) {
      if (audio.isPlaying) {
        audio.pauseAt(this._intent.pauseOffset);
        if (audio.setPlaybackRate) audio.setPlaybackRate(1);
        this._currentRate = 1;
      }
      this._lastDriftReport = { driftMs: 0, tier: 'synced', correctionApplied: false, playbackRate: 1 };
      return;
    }

    // ── Need clock sync and audio ready ──
    if (!this._hasClockSync?.current || !audio.audioUnlocked || !audio.isReady) return;

    const nowServer = this.getServerNow();

    // Don't correct before the scheduled start time
    if (nowServer < this._intent.startEpoch) return;

    // Subtract hardware+manual output latency so expected matches what actually
    // reached the speaker (scheduleStart already pre-compensates for this).
    const totalLatencySec = (audio.outputLatency || 0) + (audio.manualLatency || 0);
    const expected = Math.max(0, (nowServer - this._intent.startEpoch) / 1000 - totalLatencySec);
    const actual = audio.getTruePosition();

    // Skip if buffering (getTruePosition returns -1)
    if (actual < 0) return;

    // If audio is paused but we should be playing, start it
    if (!audio.isPlaying) {
      audio.playNow(expected);
      if (audio.setPlaybackRate) audio.setPlaybackRate(1);
      this._currentRate = 1;
      this._lastDriftReport = { driftMs: 0, tier: 'emergency', correctionApplied: true, playbackRate: 1 };
      return;
    }

    const drift = expected - actual; // positive = behind, negative = ahead
    const driftMs = Math.abs(drift) * 1000;
    const params = this._paramsRef?.current;
    if (!params) return;

    // ── Sync Diagnostics (rate-limited to every 2s) ──
    const _now = Date.now();
    if (!this._lastLogTime || _now - this._lastLogTime >= 2000) {
      this._lastLogTime = _now;
      const hwLat = Math.round(((audio.outputLatency || 0) + (audio.manualLatency || 0)) * 1000);
      const msg = `pos=${(actual * 1000).toFixed(0)}ms | expected=${(expected * 1000).toFixed(0)}ms | drift=${drift > 0 ? '+' : ''}${driftMs.toFixed(1)}ms | hw=${hwLat}ms | epoch=${this._intent.startEpoch} | clockOffset=${Math.round(this._clockOffsetRef?.current ?? 0)}ms | rate=${this._currentRate}`;
      
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';
      fetch(`${serverUrl}/telemetry/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          device: navigator.userAgent.includes('iPhone') ? 'iPhone' : navigator.userAgent.includes('Mac') ? 'Mac' : 'Unknown', 
          msg 
        })
      }).catch(() => {});
    }

    const thresholds = computeTierThresholds(params);

    // ── T1: Micro-rate adjustment (imperceptible) ──
    if (driftMs <= thresholds.t1MaxMs) {
      let rate = 1;
      if (driftMs > MICRO_RATE_DEADZONE_MS) {
        rate = drift > 0 ? MICRO_RATE_FAST : MICRO_RATE_SLOW;
      }
      if (rate !== this._currentRate) {
        this._currentRate = rate;
        if (audio.setPlaybackRate) audio.setPlaybackRate(rate);
      }
      this._lastDriftReport = { driftMs, tier: driftMs <= MICRO_RATE_DEADZONE_MS ? 'synced' : 'micro-rate', correctionApplied: rate !== 1, playbackRate: rate };
      return;
    }

    // ── T2: Macro-rate (smooth medium correction, proportional to drift) ──
    if (driftMs <= thresholds.t2MaxMs) {
      // Scale deviation linearly: small drift → small rate tweak, big drift → bigger tweak
      const t1 = thresholds.t1MaxMs;
      const t2 = thresholds.t2MaxMs;
      const ratio = Math.min(1, (driftMs - t1) / Math.max(1, t2 - t1));
      const deviation = MACRO_RATE_MIN_DEVIATION + ratio * (MACRO_RATE_MAX_DEVIATION - MACRO_RATE_MIN_DEVIATION);
      const macroRate = drift > 0 ? (1 + deviation) : (1 - deviation);
      if (macroRate !== this._currentRate) {
        this._currentRate = macroRate;
        if (audio.setPlaybackRate) audio.setPlaybackRate(macroRate);
      }
      this._lastDriftReport = { driftMs, tier: 'macro-rate', correctionApplied: true, playbackRate: macroRate };
      return;
    }

    // ── T3: Crossfade seek ──
    if (driftMs <= thresholds.t3MaxMs) {
      if (this._currentRate !== 1) {
        this._currentRate = 1;
        if (audio.setPlaybackRate) audio.setPlaybackRate(1);
      }
      if (audio.audioCtx && audio.gainNode) {
        const { audioCtx, gainNode } = audio;
        const currentVol = audio.volume / 100;

        gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + CROSSFADE_OUT_MS / 1000);

        setTimeout(() => {
          if (this._intent.state !== 'playing' || this._intent.startEpoch == null) return;
          const newExpected = Math.max(0, (this.getServerNow() - this._intent.startEpoch) / 1000);
          audio.playNow(newExpected);
          if (audio.setPlaybackRate) audio.setPlaybackRate(1);

          const ctx = audio.audioCtx!;
          const gain = audio.gainNode!;
          gain.gain.cancelScheduledValues(ctx.currentTime);
          gain.gain.setValueAtTime(0.01, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(currentVol, ctx.currentTime + CROSSFADE_IN_MS / 1000);
        }, CROSSFADE_OUT_MS);
      } else {
        audio.playNow(expected);
        if (audio.setPlaybackRate) audio.setPlaybackRate(1);
      }
      this._lastDriftReport = { driftMs, tier: 'crossfade', correctionApplied: true, playbackRate: 1 };
      return;
    }

    // ── T4: Emergency snap ──
    if (this._currentRate !== 1) {
      this._currentRate = 1;
      if (audio.setPlaybackRate) audio.setPlaybackRate(1);
    }
    audio.playNow(expected);
    this._lastDriftReport = { driftMs, tier: 'emergency', correctionApplied: true, playbackRate: 1 };
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSyncController(): React.MutableRefObject<SyncController> {
  const mediatorRef = useRef<SyncController | null>(null);
  if (mediatorRef.current === null) {
    mediatorRef.current = new SyncController();
  }
  return mediatorRef as React.MutableRefObject<SyncController>;
}
