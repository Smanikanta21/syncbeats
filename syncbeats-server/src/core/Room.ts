// ─── Step 2: Room state machine ───────────────────────────────────────────
//
// Room is a pure EventEmitter — no socket / IO references.
// All guards run internally; the SocketHandler simply calls methods.

import { EventEmitter }   from 'events';
import { PlaybackState }  from './PlaybackState';
import { Participant, RoomSnapshot } from '../types';

export class Room extends EventEmitter {
  private state:        PlaybackState          = PlaybackState.IDLE;
  private position:     number                 = 0;   // ms
  private trackUrl:     string | null          = null;
  private hostId:       string | null          = null;
  private participants: Map<string, Participant> = new Map();
  private snapshotTime: number                 = Date.now();

  constructor(public readonly roomId: string) {
    super();
  }

  // ── Initialization from database ───────────────────────────────────────

  initializeFromDatabase(data: {
    hostId: string;
    trackUrl: string | null;
    playbackState: string;
    positionMs: number;
  }): void {
    this.hostId = data.hostId;
    this.trackUrl = data.trackUrl;
    this.state = data.playbackState === 'PLAYING' ? PlaybackState.PLAYING : 
                 data.playbackState === 'PAUSED' ? PlaybackState.PAUSED : 
                 PlaybackState.IDLE;
    this.position = data.positionMs;
    this.snapshotTime = Date.now();
    console.log(`[Room ${this.roomId}] Initialized from DB:`, { hostId: data.hostId, trackUrl: data.trackUrl });
  }

  // ── Playback transitions ───────────────────────────────────────────────

  play(requesterId: string): void {
    this.assertHost(requesterId);
    if (this.state === PlaybackState.PLAYING) return;
    this.snapshotTime = Date.now();
    this.state        = PlaybackState.PLAYING;
    this.emit('stateChanged', this.snapshot());
  }

  pause(requesterId: string): void {
    this.assertHost(requesterId);
    if (this.state !== PlaybackState.PLAYING) return;
    this.position = this.computeCurrentPosition();
    this.state    = PlaybackState.PAUSED;
    this.emit('stateChanged', this.snapshot());
  }

  seek(requesterId: string, positionMs: number): void {
    this.assertHost(requesterId);
    this.position     = positionMs;
    this.snapshotTime = Date.now();
    this.emit('stateChanged', this.snapshot());
  }

  setTrack(requesterId: string, url: string): void {
    this.assertHost(requesterId);
    this.trackUrl     = url;
    this.position     = 0;
    this.state        = PlaybackState.PAUSED;
    for (const p of this.participants.values()) p.isReady = false; // Require re-buffer
    this.snapshotTime = Date.now();
    this.emit('stateChanged', this.snapshot());
  }

  // ── Internal track setter (no auth check) ─────────────────────────────

  setTrackDirect(url: string): void {
    this.trackUrl     = url;
    this.position     = 0;
    this.state        = PlaybackState.PAUSED;
    for (const p of this.participants.values()) p.isReady = false; // Require re-buffer
    this.snapshotTime = Date.now();
    console.log(`[Room ${this.roomId}] Demo track loaded:`, this.trackUrl);
  }

  // ── Participants ───────────────────────────────────────────────────────

  addParticipant(p: Participant): void {
    if (!this.hostId) this.hostId = p.socketId;
    p.isReady = false; // Default to false on join
    this.participants.set(p.socketId, p);
    this.emit('participantJoined', p);
  }

  setParticipantReady(socketId: string, isReady: boolean): void {
    const p = this.participants.get(socketId);
    if (p) {
      p.isReady = isReady;
      this.snapshotTime = Date.now(); // bump snapshot so stateChanged is picked up
      this.emit('stateChanged', this.snapshot());
    }
  }

  hasParticipant(socketId: string): boolean {
    return this.participants.has(socketId);
  }

  removeParticipant(socketId: string): void {
    this.participants.delete(socketId);
    if (this.hostId === socketId) this.electNewHost();
    this.emit('participantLeft', socketId);
  }

  getParticipantCount(): number {
    return this.participants.size;
  }

  getTrackUrl(): string | null {
    return this.trackUrl;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

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

  // ── Private ────────────────────────────────────────────────────────────

  private assertHost(socketId: string): void {
    if (socketId !== this.hostId)
      throw new Error(`Only the host can control playback (host=${this.hostId}, requester=${socketId})`);
  }

  private electNewHost(): void {
    const next = this.participants.keys().next().value as string | undefined;
    this.hostId = next ?? null;
    if (this.hostId) this.emit('hostChanged', this.hostId);
    else             this.emit('empty');
  }
}
