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
  private isPrivate:    boolean                = false;
  private timeline = {
    startEpoch: null as number | null,
    pauseOffset: 0,
    isPlaying: false
  };

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

  private pendingPlay: boolean = false;

  play(requesterId: string): void {
    if (this.timeline.isPlaying) return;
    
    if (!this.allReady()) {
      this.pendingPlay = true;
      return;
    }

    this._startPlayback();
  }

  private _startPlayback(): void {
    this.pendingPlay = false;
    const scheduleDelay = 800;
    const atEpoch = Date.now() + scheduleDelay;
    
    this.timeline.startEpoch = atEpoch - this.timeline.pauseOffset * 1000;
    this.timeline.isPlaying = true;
    this.snapshotTime = Date.now();
    this.state = PlaybackState.PLAYING;

    this.emit('schedule', {
      atEpoch,
      fromPosition: this.timeline.pauseOffset,
      trackUrl: this.trackUrl,
      startEpoch: this.timeline.startEpoch,
    });
    this.emit('stateChanged', this.snapshot());
  }

  pause(_requesterId: string, positionMs?: number): void {
    this.pendingPlay = false;
    if (!this.timeline.isPlaying) return;
    
    if (typeof positionMs === 'number') {
      this.timeline.pauseOffset = Math.max(0, positionMs / 1000);
    } else {
      this.timeline.pauseOffset = this.computeCurrentPosition() / 1000;
    }
    
    this.timeline.startEpoch = null;
    this.timeline.isPlaying = false;
    this.position = this.timeline.pauseOffset * 1000;
    this.state = PlaybackState.PAUSED;

    this.emit('pause', { pauseOffset: this.timeline.pauseOffset });
    this.emit('stateChanged', this.snapshot());
  }
  
  // Directly syncs the room state from a client-emitted playback:schedule event
  syncSchedule(trackUrl: string, positionMs: number, startEpoch: number, senderId?: string): void {
    this.trackUrl = trackUrl;
    this.timeline.isPlaying = true;
    this.timeline.startEpoch = startEpoch - positionMs;
    this.timeline.pauseOffset = 0;
    this.state = PlaybackState.PLAYING;
    this.position = positionMs;
    this.snapshotTime = Date.now();
    this.pendingPlay = false;
    
    this.emit('schedule', {
        // Mobile App Keys
        positionMs: positionMs,
        startTime: startEpoch,
        senderId: senderId,
        // Web App Keys
        atEpoch: startEpoch,
        fromPosition: positionMs / 1000,
        startEpoch: this.timeline.startEpoch,
        // Shared
        trackUrl: trackUrl,
    });
    this.emit('stateChanged', this.snapshot());
  }

  // Directly syncs the room state from a client-emitted playback:pause event
  syncPause(positionMs: number, senderId?: string): void {
    this.pendingPlay = false;
    this.timeline.startEpoch = null;
    this.timeline.isPlaying = false;
    this.timeline.pauseOffset = positionMs / 1000;
    this.position = positionMs;
    this.state = PlaybackState.PAUSED;
    this.snapshotTime = Date.now();
    
    this.emit('pause', { 
        // Mobile App Keys
        positionMs: positionMs,
        senderId: senderId,
        // Web App Keys
        pauseOffset: this.timeline.pauseOffset
    });
    this.emit('stateChanged', this.snapshot());
  }

  seek(_requesterId: string, positionMs: number): void {
    const positionSec = positionMs / 1000;
    
    if (this.timeline.isPlaying) {
      const scheduleDelay = 500; // shorter delay for seek
      const atEpoch = Date.now() + scheduleDelay;
      this.timeline.startEpoch = atEpoch - positionMs;
      
      this.emit('schedule', {
        atEpoch,
        fromPosition: positionSec,
        trackUrl: this.trackUrl,
        startEpoch: this.timeline.startEpoch,
      });
    } else {
      this.timeline.pauseOffset = positionSec;
      this.position = positionMs;
      this.emit('pause', { pauseOffset: positionSec });
    }
    
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
      this.timeline.isPlaying = false;
      this.timeline.startEpoch = null;
      this.timeline.pauseOffset = 0;
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
    this.timeline.isPlaying = false;
    this.timeline.startEpoch = null;
    this.timeline.pauseOffset = 0;
    for (const p of this.participants.values()) {
      p.isReady = false;
      p.isBlocked = false;
    }
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

    if (this.allReady()) {
      this.emit('allReady');
      if (this.pendingPlay) {
        this._startPlayback();
      }
    } else {
      // Intentionally do nothing if we are already playing.
      // This allows mid-playback seamless drop-in for new users,
      // and prevents one user's bad internet from pausing the room for everyone.
      // The lagging user will automatically catch up via client-side drift correction!
    }
  }

  setParticipantBlocked(socketId: string, blocked: boolean): void {
    const p = this.participants.get(socketId);
    if (!p) return;
    p.isBlocked = blocked;
    this.emit('stateChanged', this.snapshot());
  }

  updateParticipantDevice(socketId: string, deviceName?: string, deviceType?: string): void {
    const p = this.participants.get(socketId);
    if (!p) return;
    if (deviceName !== undefined) p.outputDeviceName = deviceName;
    if (deviceType !== undefined) p.outputDeviceType = deviceType;
    this.emit('stateChanged', this.snapshot());
  }

  updateParticipantStats(socketId: string, latency: number, jitter: number): void {
    const p = this.participants.get(socketId);
    if (!p) return;
    p.latency = latency;
    p.jitter = jitter;
    // Note: We deliberately do NOT emit stateChanged here because it would cause 
    // too many snapshot broadcasts. The SocketHandler will broadcast a lightweight event instead.
  }

  allReady(): boolean {
    if (this.participants.size === 0) return false;
    return Array.from(this.participants.values()).every(p => p.isReady || p.isBlocked);
  }

  // ── Participants ──────────────────────────────────────────────────────

  addParticipant(p: Participant): void {
    // hostId is now tied to the user_id from the database and should not be
    // overwritten by the first connecting socket.
    p.isReady = false;
    p.isBlocked = false;
    p.volume = this.clampVolume(p.volume ?? 100);
    this.participants.set(p.socketId, p);
    this.emit('participantJoined', p);
  }

  hasParticipant(socketId: string): boolean {
    return this.participants.has(socketId);
  }

  removeParticipant(socketId: string): void {
    this.participants.delete(socketId);
    // Removed host election on socket disconnect so user remains host
    this.emit('participantLeft', socketId);
  }

  getParticipantCount(): number { return this.participants.size; }
  getTrackUrl(): string | null  { return this.trackUrl; }
  getQueue(): TrackQueueItem[]  { return this.queueSnapshot(); }

  computeCurrentPosition(): number {
    if (!this.trackUrl) return 0;
    if (!this.timeline.isPlaying || this.timeline.startEpoch === null) {
      return this.timeline.pauseOffset * 1000;
    }
    return Date.now() - this.timeline.startEpoch;
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
      startEpoch:   this.timeline.startEpoch,
      pauseOffset:  this.timeline.pauseOffset,
      isPlaying:    this.timeline.isPlaying,
      pendingPlay:  this.pendingPlay,
      isPrivate:    this.isPrivate,
    };
  }

  getIsPrivate(): boolean { return this.isPrivate; }
  
  setIsPrivate(isPrivate: boolean): void {
    if (this.isPrivate === isPrivate) return;
    this.isPrivate = isPrivate;
    this.emit('stateChanged', this.snapshot());
  }



  private clampVolume(value: number): number {
    if (!Number.isFinite(value)) return 100;
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private queueSnapshot(): TrackQueueItem[] {
    return this.queue.map((item) => ({ ...item }));
  }
}
