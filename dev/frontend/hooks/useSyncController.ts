"use client";

import { useRef } from 'react';
import type { AdaptiveParams } from './useAdaptiveSync';
import type { RoomSnapshot } from '../lib/types';
import { isSameTrack } from '../lib/trackIdentity';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlaybackIntent {
  playbackInstanceId: string | null;
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

export type DriftTier = 'crossfade' | 'emergency' | 'synced';

export interface DriftReport {
  driftMs: number;
  tier: DriftTier;
  correctionApplied: boolean;
  playbackRate: number;
}

// ─── Tier thresholds (derived from AdaptiveParams) ───────────────────────────

interface DriftThresholds { correctAtMs: number; snapAtMs: number; }

function computeDriftThresholds(params: AdaptiveParams): DriftThresholds {
  const correctAtMs = Math.max(20, params.DRIFT_HARD_SEEK_MS);
  return { correctAtMs, snapAtMs: Math.max(correctAtMs + 180, correctAtMs * 4) };
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
  setPlaybackInstance?: (id: string | null, startEpoch?: number) => void;
  isReadyForTrack?: (url: string | null) => boolean;
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

// Crossfade durations (ms)
const CROSSFADE_OUT_MS = 30;
const CROSSFADE_IN_MS = 30;

// ─── SyncController ────────────────────────────────────────────────────────

export class SyncController {
  // ── Playback intent ──
  private _endedGen: number | null = null;
  private _intent: PlaybackIntent = {
    playbackInstanceId: null,
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
  private _crossfadeTimer: ReturnType<typeof setTimeout> | null = null;
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

  private _cancelCrossfade(): void {
    if (!this._crossfadeTimer) return;
    clearTimeout(this._crossfadeTimer);
    this._crossfadeTimer = null;
    const audio = this._audioRef?.current;
    if (audio?.audioCtx && audio.gainNode) {
      const now = audio.audioCtx.currentTime;
      audio.gainNode.gain.cancelScheduledValues(now);
      audio.gainNode.gain.setValueAtTime(Math.max(0, Math.min(1, audio.volume / 100)), now);
    }
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
  schedule(startEpoch: number, pauseOffset: number, trackUrl: string | null, playbackInstanceId: string | null = null): void {
    if (this._intent.state === 'playing' && this._intent.startEpoch === startEpoch &&
        this._intent.pauseOffset === pauseOffset && isSameTrack(this._intent.trackUrl, trackUrl) &&
        this._intent.playbackInstanceId === playbackInstanceId) return;
    this._cancelCrossfade();
    this._endedGen = null;
    this._audioRef?.current.setPlaybackInstance?.(playbackInstanceId, startEpoch);
    this._audioRef?.current.setPlaybackRate?.(1);
    this._intent = {
      playbackInstanceId,
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
    this._cancelCrossfade();
    const audio = this._audioRef?.current;
    this._intent = {
      playbackInstanceId: null,
      state: 'paused',
      startEpoch: null,
      pauseOffset: offset,
      trackUrl: this._intent.trackUrl,
      gen: this._intent.gen + 1,
    };
    this._room.pendingPlay = false;
    this._currentRate = 1;
    // Immediately stop audio — this is the critical synchronous guarantee
    audio?.pauseAt(offset); // also invalidate schedules still awaiting fetch/decode
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
    this._cancelCrossfade();
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
    this._cancelCrossfade();
    const audio = this._audioRef?.current;
    this._intent = {
      playbackInstanceId: null,
      state: 'idle',
      startEpoch: null,
      pauseOffset: 0,
      trackUrl: null,
      gen: this._intent.gen + 1,
    };
    this._room.pendingPlay = false;
    this._currentRate = 1;
    audio?.pauseAt(0);
    if (audio?.setPlaybackRate) {
      audio.setPlaybackRate(1);
    }
    this._notify();
  }

  /**
   * Set the current track URL (track change without play/pause change).
   */
  setTrack(trackUrl: string | null): void {
    if (isSameTrack(this._intent.trackUrl, trackUrl)) return;
    this._cancelCrossfade();
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

  /** Shared by initial snapshots, reconnects, and ordinary server state changes. */
  reconcile(snapshot: RoomSnapshot): void {
    this.updateRoom({
      roomId: snapshot.roomId, hostId: snapshot.hostId,
      isPrivate: snapshot.isPrivate ?? false, shuffle: snapshot.shuffle ?? false,
      repeatMode: snapshot.repeatMode ?? 'off', pendingPlay: snapshot.pendingPlay ?? false,
    });
    if (!snapshot.trackUrl) {
      if (this._intent.state !== 'idle' || this._audioRef?.current.trackUrl) this.idle();
      return;
    }
    const changedTrack = !isSameTrack(this._intent.trackUrl, snapshot.trackUrl);
    this.setTrack(snapshot.trackUrl);
    const offset = snapshot.pauseOffset ?? 0;
    if (snapshot.isPlaying && snapshot.startEpoch != null && Number.isFinite(snapshot.startEpoch)) {
      this.schedule(snapshot.startEpoch, offset, snapshot.trackUrl, snapshot.playbackInstanceId ?? null);
    } else if (changedTrack || this._intent.state !== 'paused' || this._intent.pauseOffset !== offset) {
      this.pause(offset);
    }
    this.setPendingPlay(snapshot.pendingPlay ?? false);
  }

  /** Do not let drift recovery repeatedly restart the last 100 ms of a finished source. */
  complete(trackUrl: string, playbackInstanceId?: string | null): boolean {
    if (this._intent.state !== 'playing' || !isSameTrack(trackUrl, this._intent.trackUrl)) return false;
    if (this._intent.playbackInstanceId && playbackInstanceId !== this._intent.playbackInstanceId) return false;
    if (this._endedGen === this._intent.gen) return false;
    this._cancelCrossfade();
    this._endedGen = this._intent.gen;
    return true;
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
    if (!this.isGenCurrent(capturedGen) || this._endedGen === capturedGen) return;
    if (this._intent.state !== 'playing') return;
    const audio = this._audioRef?.current;
    if (!audio) return;
    audio.scheduleStart(payload, clockOffset);
  }

  /**
   * Position the audio graph should currently be *rendering*.
   *
   * getTruePosition() reports the render position, not what is audible — the
   * graph runs ahead of the speaker by the output latency, because
   * scheduleStart() deliberately starts the buffer that much early so the
   * sound emerges on time. So the ideal timeline position has to be shifted
   * FORWARD by the same latency to be comparable.
   */
  private _expectedRenderPosition(audio: AudioHandle): number {
    if (this._intent.startEpoch == null) return this._intent.pauseOffset;
    const latency = (audio.outputLatency || 0) + (audio.manualLatency || 0);
    return Math.max(0, (this.getServerNow() - this._intent.startEpoch) / 1000 + latency);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Drift correction (called at an adaptive 1–4 Hz while visible)
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
    if (this._endedGen === this._intent.gen) return;
    if (!this._hasClockSync?.current || !audio.audioUnlocked || !audio.isReady) {
      this._cancelCrossfade();
      return;
    }
    if (!isSameTrack(audio.trackUrl, this._intent.trackUrl)) return;
    if (audio.isReadyForTrack && !audio.isReadyForTrack(this._intent.trackUrl)) return;

    const nowServer = this.getServerNow();

    // Don't correct before playback has actually started.
    // startEpoch is the epoch at which position would be ZERO, not when the
    // source starts — for any resume mid-track it is already in the past. The
    // real start is startEpoch + pauseOffset (the server's `atEpoch`). Getting
    // this wrong let drift correction run during the ~800ms window while
    // scheduleStart still has a source queued in the future, which reports a
    // frozen getTruePosition() and sent this into a seek-forward/seek-back loop.
    const startAtEpoch = this._intent.startEpoch + this._intent.pauseOffset * 1000;
    if (nowServer < startAtEpoch) return;

    // Compare like with like: both sides are graph-render positions.
    const expected = this._expectedRenderPosition(audio);
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

    // ── Sync Diagnostics (dev only, rate-limited to every 2s) ──
    // Production telemetry is handled by useSyncTelemetry, which batches on
    // idle callbacks — this is the raw per-device trace for local debugging.
    const _now = Date.now();
    if (process.env.NODE_ENV !== 'production' && (!this._lastLogTime || _now - this._lastLogTime >= 2000)) {
      this._lastLogTime = _now;
      const hwLat = Math.round(((audio.outputLatency || 0) + (audio.manualLatency || 0)) * 1000);
      const msg = `pos=${(actual * 1000).toFixed(0)}ms | expected=${(expected * 1000).toFixed(0)}ms | drift=${drift > 0 ? '+' : ''}${driftMs.toFixed(1)}ms | hw=${hwLat}ms | epoch=${this._intent.startEpoch} | clockOffset=${Math.round(this._clockOffsetRef?.current ?? 0)}ms | rate=${this._currentRate}`;

      fetch('/api/telemetry/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          device: navigator.userAgent.includes('iPhone') ? 'iPhone' : navigator.userAgent.includes('Mac') ? 'Mac' : 'Unknown', 
          msg 
        })
      }).catch(() => {});
    }

    const thresholds = computeDriftThresholds(params);

    if (driftMs <= thresholds.correctAtMs) {
      if (this._currentRate !== 1) {
        this._currentRate = 1;
        audio.setPlaybackRate?.(1);
      }
      this._lastDriftReport = { driftMs, tier: 'synced', correctionApplied: false, playbackRate: 1 };
      return;
    }

    // ── T3: Crossfade seek ──
    if (driftMs <= thresholds.snapAtMs) {
      if (this._currentRate !== 1) {
        this._currentRate = 1;
        if (audio.setPlaybackRate) audio.setPlaybackRate(1);
      }
      if (audio.audioCtx && audio.gainNode) {
        if (this._crossfadeTimer) return;
        const { audioCtx, gainNode } = audio;
        const currentVol = audio.volume / 100;
        const gen = this._intent.gen;

        gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + CROSSFADE_OUT_MS / 1000);

        this._crossfadeTimer = setTimeout(() => {
          this._crossfadeTimer = null;
          if (!this.isGenCurrent(gen) || this._endedGen === gen || this._intent.state !== 'playing' || this._intent.startEpoch == null ||
              !this._hasClockSync?.current || !isSameTrack(this._audioRef?.current.trackUrl, this._intent.trackUrl)) {
            gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
            gainNode.gain.setValueAtTime(currentVol, audioCtx.currentTime);
            return;
          }
          const newExpected = this._expectedRenderPosition(audio);
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
