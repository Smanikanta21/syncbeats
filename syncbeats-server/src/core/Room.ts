// ─── Room state machine ────────────────────────────────────────────────────
// Pure EventEmitter — no host gate. Any participant can control playback.
// Readiness tracking: server holds play until every client has buffered.

import { EventEmitter }  from 'events';
import { PlaybackState } from './PlaybackState';
import { Participant, RoomSnapshot } from '../types';

export class Room extends EventEmitter {
  private state:        PlaybackState          = PlaybackState.IDLE;
  private position:     number                 = 0;   // ms
  private trackUrl:     string | null          = null;
  private hostId:       string | null          = null; // kept for snapshot compat
  private participants: Map<string, Participant> = new Map();
  private snapshotTime: number                 = Date.now();

  constructor(public readonly roomId: string) {
    super();
  }

  setParticipantVolume(socketId: string, volume: number): void {
    const participant = this.participants.get(socketId);
    if (!participant) return;
    participant.volume = this.clampVolume(volume);
    this.emit('stateChanged', this.snapshot());
  }

  // ── Init from DB ──────────────────────────────────────────────────────

  initializeFromDatabase(data: {
    hostId: string;
    trackUrl: string | null;
    playbackState: string;
    positionMs: number;
  }): void {
    this.hostId   = data.hostId;
    this.trackUrl = data.trackUrl;
    this.state    = data.playbackState === 'PLAYING' ? PlaybackState.PLAYING
                  : data.playbackState === 'PAUSED'  ? PlaybackState.PAUSED
                  : PlaybackState.IDLE;
    this.position     = data.positionMs;
    this.snapshotTime = Date.now();
  }

  // ── Playback (no host gate — any participant) ─────────────────────────

  play(_requesterId: string): void {
    if (this.state === PlaybackState.PLAYING) return;
    if (!this.allReady()) return; // hold until every client buffered
    this.snapshotTime = Date.now();
    this.state        = PlaybackState.PLAYING;
    this.emit('stateChanged', this.snapshot());
  }

  pause(_requesterId: string): void {
    if (this.state !== PlaybackState.PLAYING) return;
    this.position = this.computeCurrentPosition();
    this.state    = PlaybackState.PAUSED;
    this.emit('stateChanged', this.snapshot());
  }

  seek(_requesterId: string, positionMs: number): void {
    this.position     = positionMs;
    this.snapshotTime = Date.now();
    this.emit('stateChanged', this.snapshot());
  }

  /** Called after server has stored the file and wants to push URL to clients */
  setTrackFromServer(url: string, title: string): void {
    this.trackUrl  = url;
    this.position  = 0;
    this.state     = PlaybackState.PAUSED;
    // Mark all current participants as NOT ready — they need to buffer first
    for (const p of this.participants.values()) p.isReady = false;
    this.snapshotTime = Date.now();
    this.emit('trackSet', { trackUrl: url, title });
    this.emit('stateChanged', this.snapshot());
  }

  // ── Readiness tracking ────────────────────────────────────────────────

  setParticipantReady(socketId: string, ready: boolean): void {
    const p = this.participants.get(socketId);
    if (!p) return;
    p.isReady = ready;
    this.emit('stateChanged', this.snapshot());

    if (ready && this.allReady()) {
      this.emit('allReady');
    }
  }

  allReady(): boolean {
    if (this.participants.size === 0) return false;
    return Array.from(this.participants.values()).every(p => p.isReady);
  }

  // ── Participants ──────────────────────────────────────────────────────

  addParticipant(p: Participant): void {
    if (!this.hostId) this.hostId = p.socketId;
    p.isReady = false;
    p.volume = this.clampVolume(p.volume ?? 100);
    this.participants.set(p.socketId, p);
    this.emit('participantJoined', p);
  }

  hasParticipant(socketId: string): boolean {
    return this.participants.has(socketId);
  }

  removeParticipant(socketId: string): void {
    this.participants.delete(socketId);
    if (this.hostId === socketId) this.electNewHost();
    this.emit('participantLeft', socketId);
  }

  getParticipantCount(): number { return this.participants.size; }
  getTrackUrl(): string | null  { return this.trackUrl; }

  computeCurrentPosition(): number {
    if (this.state !== PlaybackState.PLAYING) return this.position;
    return this.position + (Date.now() - this.snapshotTime);
  }

  snapshot(): RoomSnapshot {
    return {
      roomId:       this.roomId,
      trackUrl:     this.trackUrl,
      position:     this.computeCurrentPosition(),
      state:        this.state,
      hostId:       this.hostId,
      timestamp:    Date.now(),
      participants: Array.from(this.participants.values()),
    };
  }

  private electNewHost(): void {
    const next = this.participants.keys().next().value as string | undefined;
    this.hostId = next ?? null;
    if (this.hostId) this.emit('hostChanged', this.hostId);
    else             this.emit('empty');
  }

  private clampVolume(value: number): number {
    if (!Number.isFinite(value)) return 100;
    return Math.max(0, Math.min(100, Math.round(value)));
  }
}
