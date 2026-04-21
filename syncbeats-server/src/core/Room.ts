// ─── Room state machine ────────────────────────────────────────────────────
// Pure EventEmitter — no host gate. Any participant can control playback.
// Readiness tracking: server holds play until every client has buffered.

import { EventEmitter }  from 'events';
import { PlaybackState } from './PlaybackState';
import { Participant, RoomSnapshot, TrackQueueItem, SpatialPosition } from '../types';

export class Room extends EventEmitter {
  private state:        PlaybackState          = PlaybackState.IDLE;
  private position:     number                 = 0;   // ms
  private trackUrl:     string | null          = null;
  private hostId:       string | null          = null; // kept for snapshot compat
  private participants: Map<string, Participant> = new Map();
  private queue:        TrackQueueItem[]       = [];
  private spatial:      Map<string, SpatialPosition> = new Map();
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
    queue: TrackQueueItem[];
  }): void {
    this.hostId   = data.hostId;
    this.queue    = [...data.queue].sort((a, b) => a.queueIndex - b.queueIndex);
    const current = this.queue.find((item) => item.isCurrent) ?? null;
    this.trackUrl = current?.trackUrl ?? data.trackUrl;
    this.state    = data.playbackState === 'PLAYING' ? PlaybackState.PLAYING
                  : data.playbackState === 'PAUSED'  ? PlaybackState.PAUSED
                  : PlaybackState.IDLE;
    this.position     = data.positionMs;
    this.snapshotTime = Date.now();
  }

  // ── Playback (no host gate — any participant) ─────────────────────────

  play(requesterId: string): void {
    if (this.state === PlaybackState.PLAYING) return;
    if (!this.allReady()) {
      // Emit an event so the handler can notify the client
      this.emit('playError', { requesterId, message: 'Not all participants are ready. check ur audio buffers!' });
      return;
    }
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

  addToQueue(item: TrackQueueItem): void {
    const withoutExisting = this.queue.filter((q) => q.id !== item.id);
    this.queue = [...withoutExisting, item].sort((a, b) => a.queueIndex - b.queueIndex);
    this.emit('queueChanged', this.queueSnapshot());
    if (item.isCurrent) {
      this.setCurrentQueueItem(item.id, true);
    }
  }

  syncQueue(queue: TrackQueueItem[], currentItemId: string | null): void {
    this.queue = [...queue].sort((a, b) => a.queueIndex - b.queueIndex);
    this.emit('queueChanged', this.queueSnapshot());
    this.setCurrentQueueItem(currentItemId, true);
  }

  /** Reorder the queue without interrupting current playback. */
  updateQueueOrder(queue: TrackQueueItem[]): void {
    this.queue = [...queue].sort((a, b) => a.queueIndex - b.queueIndex);
    this.emit('queueChanged', this.queueSnapshot());
    // Emit a fresh snapshot so all clients see the new order,
    // but do NOT touch trackUrl / position / state.
    this.emit('stateChanged', this.snapshot());
  }

  setCurrentQueueItem(itemId: string | null, skipQueueEmit = false): void {
    if (itemId === null) {
      this.queue = this.queue.map((item) => ({ ...item, isCurrent: false }));
      this.trackUrl = null;
      this.position = 0;
      this.state = PlaybackState.IDLE;
      this.snapshotTime = Date.now();
      if (!skipQueueEmit) this.emit('queueChanged', this.queueSnapshot());
      this.emit('stateChanged', this.snapshot());
      return;
    }

    const next = this.queue.find((item) => item.id === itemId);
    if (!next) return;

    this.queue = this.queue.map((item) => ({ ...item, isCurrent: item.id === itemId }));
    this.trackUrl  = next.trackUrl;
    this.position  = 0;
    this.state     = PlaybackState.PAUSED;
    for (const p of this.participants.values()) p.isReady = false;
    this.snapshotTime = Date.now();
    if (!skipQueueEmit) this.emit('queueChanged', this.queueSnapshot());
    this.emit('trackSet', { trackUrl: next.trackUrl, title: next.title });
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
  getQueue(): TrackQueueItem[]  { return this.queueSnapshot(); }

  computeCurrentPosition(): number {
    if (!this.trackUrl) return 0;
    if (this.state !== PlaybackState.PLAYING) return this.position;
    const elapsed = Date.now() - this.snapshotTime;
    return this.position + elapsed;
  }

  setSpatialPosition(deviceId: string, position: SpatialPosition): void {
    this.spatial.set(deviceId, position);
  }

  removeSpatialPosition(deviceId: string): void {
    this.spatial.delete(deviceId);
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
      queue:        this.queueSnapshot(),
      spatial:      Array.from(this.spatial.entries()).map(([deviceId, position]) => ({ deviceId, position })),
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

  private queueSnapshot(): TrackQueueItem[] {
    return this.queue.map((item) => ({ ...item }));
  }
}
