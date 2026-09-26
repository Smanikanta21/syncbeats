import { EventEmitter }  from 'events';
import { PlaybackState } from './PlaybackState';
import { RoomQueue }     from './RoomQueue';
import { Participant, RoomSnapshot, SpatialPosition, ChatMessage, QueueItem, QueueTrackInput, RepeatMode, TrackQueueItem } from '../types';

export class Room extends EventEmitter {
  private state:        PlaybackState          = PlaybackState.IDLE;
  private position:     number                 = 0;   // ms
  private trackUrl:     string | null          = null;
  private hostId:       string | null          = null; // kept for snapshot compat
  private participants: Map<string, Participant> = new Map();
  private queue:        RoomQueue              = new RoomQueue();
  private spatial:      Map<string, SpatialPosition> = new Map();
  private chatHistory:  ChatMessage[]          = [];
  private snapshotTime: number                 = Date.now();
  private isPrivate:    boolean                = false;
  private createdAt:    number                 = Date.now();
  private accumulatedSessionTimeMs: number     = 0;
  private sessionActiveStartEpoch:  number | null = null;
  private lastParticipantLeftEpoch: number | null = null;
  private sessionExpiryTimer:       NodeJS.Timeout | null = null;
  private static readonly SESSION_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

  private timeline = {
    startEpoch: null as number | null,
    pauseOffset: 0,
    isPlaying: false
  };
  private readyTimeout: NodeJS.Timeout | null = null;

  /**
   * False until the DB row has been read into this instance (see db/ensureRoom).
   * A live-but-unhydrated room has an empty queue that is NOT the truth, so nothing
   * may persist it — see SocketHandler.scheduleQueueSave.
   */
  isHydrated: boolean = false;

  constructor(public readonly roomId: string) {
    super();
  }

  addChatMessage(msg: ChatMessage): void {
    this.chatHistory.push(msg);
    if (this.chatHistory.length > 100) {
      this.chatHistory.shift();
    }
  }

  getChatHistory(): ChatMessage[] {
    return [...this.chatHistory];
  }

  clearChatHistory(): void {
    this.chatHistory = [];
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
    createdAt?: Date | string | number;
    queue?: unknown;
  }): void {
    if (data.createdAt) {
      this.createdAt = typeof data.createdAt === 'number'
        ? data.createdAt
        : new Date(data.createdAt).getTime();
    }
    if (data.queue) this.queue = RoomQueue.fromJSON(data.queue);
    
    // Ensure the trackUrl is always represented in the queue so it's not orphaned
    const url = data.trackUrl || this.queue.current()?.trackUrl;
    if (url) {
      const known = this.queue.findByUrl(url);
      if (!known) {
        const { first } = this.queue.add([{ trackUrl: url, title: 'Unknown Track' }], 'system');
        if (first) this.queue.setCurrent(first.id);
      } else if (this.queue.current()?.id !== known.id) {
        this.queue.setCurrent(known.id);
      }
    }

    this.hostId   = data.hostId;
    this.trackUrl = this.queue.current()?.trackUrl ?? data.trackUrl;
    this.pendingPlay = false;
    this.timeline.isPlaying = false;
    this.timeline.startEpoch = null;
    this.timeline.pauseOffset = Math.max(0, data.positionMs / 1000);
    this.state    = PlaybackState.PAUSED;
    this.position     = data.positionMs;
    this.snapshotTime = Date.now();
    this.isHydrated   = true;
  }

  // ── Playback (no host gate — any participant) ─────────────────────────

  private pendingPlay: boolean = false;

  play(requesterId: string): void {
    if (this.timeline.isPlaying) return;
    
    if (!this.allReady()) {
      this.pendingPlay = true;
      if (this.readyTimeout) clearTimeout(this.readyTimeout);
      this.readyTimeout = setTimeout(() => {
        if (this.pendingPlay && !this.timeline.isPlaying) {
          console.log(`[Room ${this.roomId}] Play readiness timeout expired (10s) — forcing playback for ready participants`);
          this._startPlayback();
        }
      }, 10_000);
      return;
    }

    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = null;
    }
    this._startPlayback();
  }

  private _startPlayback(): void {
    this.pendingPlay = false;
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = null;
    }
    const scheduleDelay = 800;
    const atEpoch = Date.now() + scheduleDelay;
    
    this.timeline.startEpoch = atEpoch - this.timeline.pauseOffset * 1000;
    this.timeline.isPlaying = true;
    this.snapshotTime = Date.now();
    this.state = PlaybackState.PLAYING;

    const ytMatch = this.trackUrl ? this.trackUrl.match(/^(?:youtube:)?([a-zA-Z0-9_-]{11})$/) : null;
    const ytId = ytMatch ? ytMatch[1] : null;
    const fallbackThumb = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null;
    const item = this.queue.current();

    this.emit('schedule', {
      atEpoch,
      fromPosition: this.timeline.pauseOffset,
      trackUrl: this.trackUrl,
      startEpoch: this.timeline.startEpoch,
      title: item?.title || 'Unknown Track',
      artist: item?.artist || 'Unknown Artist',
      thumbnail: item?.thumbnail || fallbackThumb || null,
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
  syncSchedule(trackUrl: string, positionMs: number, startEpoch: number, senderId?: string, hintTitle?: string, hintArtist?: string, hintThumbnail?: string): void {
    const isSameTrack = this.trackUrl === trackUrl;
    this.trackUrl = trackUrl;
    this.position = positionMs;
    this.timeline.pauseOffset = positionMs / 1000;

    // Point the queue at whatever the client is playing. The old implementation prepended a
    // synthetic item whenever fuzzy URL matching failed here, which is how queues grew on their
    // own — add() is exact-keyed and idempotent, so a repeat of the same track is a no-op.
    const known = this.queue.findByUrl(trackUrl);
    if (known) {
      if (this.queue.current()?.id !== known.id) {
        this.queue.setCurrent(known.id);
        this.emitQueueChanged();
      }
    } else {
      const { first } = this.queue.add(
        [{ trackUrl, title: hintTitle, artist: hintArtist, thumbnail: hintThumbnail }],
        senderId || 'system',
      );
      if (first) this.queue.setCurrent(first.id);
      this.emitQueueChanged();
    }

    // Reset readiness for all participants if changing track so everyone buffers before play
    if (!isSameTrack) {
      for (const p of this.participants.values()) {
        p.isReady = false;
        p.isBlocked = false;
      }
    }

    // Set 15-second safety timeout so lagging/disconnected devices don't block the room forever
    if (this.readyTimeout) clearTimeout(this.readyTimeout);
    this.readyTimeout = setTimeout(() => {
      let changed = false;
      for (const p of this.participants.values()) {
        if (!p.isReady && !p.isBlocked) {
          p.isBlocked = true;
          changed = true;
          console.log(`[Room ${this.roomId}] Participant ${p.socketId} timed out waiting for ready, marking as blocked.`);
        }
      }
      if (changed) {
        this.emit('stateChanged', this.snapshot());
        if (this.pendingPlay && this.allReady()) {
          this._startPlayback();
        }
      }
    }, 15000);

    if (!this.allReady()) {
      console.log(`[Room ${this.roomId}] Not all participants ready for track ${trackUrl}, marking pendingPlay = true`);
      this.pendingPlay = true;
      this.timeline.isPlaying = false;
      this.timeline.startEpoch = null;
      this.state = PlaybackState.PAUSED;
      this.snapshotTime = Date.now();
      this.emit('stateChanged', this.snapshot());
    } else {
      this._startPlayback();
    }
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
        title: 'Unknown Track',
        artist: 'Unknown Artist',
        thumbnail: null,
      });
    } else {
      this.timeline.pauseOffset = positionSec;
      this.position = positionMs;
      this.emit('pause', { pauseOffset: positionSec });
    }
    
    this.snapshotTime = Date.now();
    this.emit('stateChanged', this.snapshot());
  }







  // ── Queue ─────────────────────────────────────────────────────────────
  //
  // Every mutation routes through here so one change produces exactly one broadcast.

  getQueue(): TrackQueueItem[]      { return this.queue.snapshot(); }
  /** Serialized form for persistence — see RoomQueue.toJSON(). */
  getQueueState(): unknown          { return this.queue.toJSON(); }
  getCurrentItem(): QueueItem | null { return this.queue.current(); }
  getShuffle(): boolean             { return this.queue.shuffle; }
  getRepeatMode(): RepeatMode       { return this.queue.repeatMode; }

  addTracks(tracks: QueueTrackInput[], addedBy: string, mode: 'end' | 'next' = 'end') {
    const hadTrack = !!this.trackUrl;
    const result = this.queue.add(tracks, addedBy, mode);
    if (result.added.length > 0) {
      this.emitQueueChanged();
      // First track into an idle room gets loaded so clients have something to show,
      // but playback stays an explicit user action.
      const current = this.queue.current();
      if (!hadTrack && current) this._loadItem(current, false);
    }
    return result;
  }

  /** Make an item current. `autoplay` runs it through the readiness gate; otherwise it just loads. */
  setCurrentItem(id: string, autoplay = true): QueueItem | null {
    const item = this.queue.setCurrent(id);
    if (!item) return null;
    this._loadItem(item, autoplay);
    return item;
  }

  removeFromQueue(id: string): boolean {
    const wasCurrent = this.queue.current()?.id === id;
    if (!this.queue.remove(id)) return false;

    if (!wasCurrent) { this.emitQueueChanged(); return true; }

    const next = this.queue.current();
    if (next) this._loadItem(next, this.timeline.isPlaying);
    else this.resetPlayback();
    return true;
  }

  clearQueue(upcomingOnly = true): void {
    if (!upcomingOnly) { this.queue.clear(); this.resetPlayback(); return; }
    this.queue.clearUpcoming();
    this.emitQueueChanged();
  }

  moveInQueue(id: string, toIndex: number): boolean {
    const moved = this.queue.move(id, toIndex);
    if (moved) this.emitQueueChanged();
    return moved;
  }

  nextTrack(autoplay = true): QueueItem | null {
    const item = this.queue.next();
    if (!item) { this.resetPlayback(); return null; }
    this._loadItem(item, autoplay);
    return item;
  }

  prevTrack(autoplay = true): QueueItem | null {
    const item = this.queue.prev();
    if (!item) return null;
    this._loadItem(item, autoplay);
    return item;
  }

  /** Called for every device's `playback:ended`; only the first one through advances. */
  handleTrackEnded(trackUrl: string): QueueItem | null {
    if (!this.queue.shouldAdvance(trackUrl)) return null;
    return this.nextTrack(true);
  }

  setShuffle(on: boolean): void {
    this.queue.setShuffle(on);
    this.emitQueueChanged();
  }

  setRepeatMode(mode: RepeatMode): void {
    this.queue.setRepeat(mode);
    this.emitQueueChanged();
  }

  /** Swap a lazy placeholder url for its resolved one (spotify-lazy: → youtube:). */
  resolveQueueItem(id: string, trackUrl: string): QueueItem | null {
    const item = this.queue.resolve(id, trackUrl);
    if (item) this.emitQueueChanged();
    return item;
  }

  private _loadItem(item: QueueItem, autoplay: boolean): void {
    this.trackUrl = item.trackUrl;
    this.position = 0;
    this.timeline.pauseOffset = 0;
    this.timeline.startEpoch = null;
    this.timeline.isPlaying = false;
    this.pendingPlay = false;
    // Everyone re-buffers so the next start is still sample-aligned.
    for (const p of this.participants.values()) { p.isReady = false; p.isBlocked = false; }

    this.emit('trackSet', { trackUrl: item.trackUrl, title: item.title });
    this.emitQueueChanged();

    if (autoplay) {
      this.play('system');
    } else {
      this.state = PlaybackState.PAUSED;
      this.snapshotTime = Date.now();
      this.emit('stateChanged', this.snapshot());
    }
  }

  private resetPlayback(): void {
    this.trackUrl = null;
    this.position = 0;
    this.state = PlaybackState.IDLE;
    this.timeline.isPlaying = false;
    this.timeline.startEpoch = null;
    this.timeline.pauseOffset = 0;
    this.pendingPlay = false;
    if (this.readyTimeout) { clearTimeout(this.readyTimeout); this.readyTimeout = null; }
    this.emitQueueChanged();
  }

  private emitQueueChanged(): void {
    this.snapshotTime = Date.now();
    this.emit('queueChanged', this.queue.snapshot());
    this.emit('stateChanged', this.snapshot());
  }

  resetRoom(): void {
    this.chatHistory = [];
    this.queue.clear();
    this.trackUrl = null;
    this.position = 0;
    this.state = PlaybackState.IDLE;
    this.timeline.isPlaying = false;
    this.timeline.startEpoch = null;
    this.timeline.pauseOffset = 0;
    this.pendingPlay = false;
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = null;
    }
    for (const p of this.participants.values()) {
      p.isReady = false;
      p.isBlocked = false;
    }
    this.snapshotTime = Date.now();
    this.emitQueueChanged();
  }

  // ── Readiness tracking ────────────────────────────────────────────────

  setParticipantReady(socketId: string, ready: boolean): void {
    const p = this.participants.get(socketId);
    if (!p) return;
    p.isReady = ready;
    if (ready) {
      p.isBlocked = false;
    }
    this.emit('stateChanged', this.snapshot());

    if (this.allReady()) {
      if (this.readyTimeout) {
        clearTimeout(this.readyTimeout);
        this.readyTimeout = null;
      }
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

  // ── Participants ──────────────────────────────────────────────────────

  addParticipant(p: Participant): void {
    const wasEmpty = this.participants.size === 0;

    p.isReady = false;
    p.isBlocked = false;
    p.volume = this.clampVolume(p.volume ?? 100);
    this.participants.set(p.socketId, p);

    // If the room is not actively playing, clear pendingPlay so joining devices don't auto-start playback
    if (!this.timeline.isPlaying) {
      this.pendingPlay = false;
    }

    // If first participant joined or room was empty:
    if (wasEmpty) {
      // Cancel pending 1-hour expiry timer if active
      if (this.sessionExpiryTimer) {
        clearTimeout(this.sessionExpiryTimer);
        this.sessionExpiryTimer = null;
      }

      const now = Date.now();
      // Check if more than 1 hour passed since last participant left
      if (this.lastParticipantLeftEpoch && (now - this.lastParticipantLeftEpoch >= Room.SESSION_EXPIRY_MS)) {
        console.log(`[Room ${this.roomId}] >1 hr passed since room was empty. Resetting session time.`);
        this.accumulatedSessionTimeMs = 0;
      }

      this.sessionActiveStartEpoch = now;
    }

    this.emit('participantJoined', p);
  }

  hasParticipant(socketId: string): boolean {
    return this.participants.has(socketId);
  }

  removeParticipant(socketId: string): void {
    this.participants.delete(socketId);

    // If room is now empty (0 participants remaining):
    if (this.participants.size === 0) {
      const now = Date.now();
      if (this.sessionActiveStartEpoch !== null) {
        this.accumulatedSessionTimeMs += Math.max(0, now - this.sessionActiveStartEpoch);
        this.sessionActiveStartEpoch = null;
      }
      this.lastParticipantLeftEpoch = now;
      this.pendingPlay = false;
      if (this.readyTimeout) {
        clearTimeout(this.readyTimeout);
        this.readyTimeout = null;
      }
      if (this.timeline.isPlaying) {
        this.pause(socketId);
      } else {
        this.state = PlaybackState.PAUSED;
      }

      // Schedule 1-hour idle timer to clear session time if no one rejoins within 60 minutes
      if (this.sessionExpiryTimer) {
        clearTimeout(this.sessionExpiryTimer);
      }
      this.sessionExpiryTimer = setTimeout(() => {
        console.log(`[Room ${this.roomId}] 1 hour of continuous empty room inactivity reached. Resetting session time.`);
        this.accumulatedSessionTimeMs = 0;
        this.sessionActiveStartEpoch = null;
        this.lastParticipantLeftEpoch = null;
        this.sessionExpiryTimer = null;
        this.emit('stateChanged', this.snapshot());
      }, Room.SESSION_EXPIRY_MS);
    } else {
      // Participants still remain — check if remaining participants are now all ready
      if (this.pendingPlay && this.allReady()) {
        if (this.readyTimeout) {
          clearTimeout(this.readyTimeout);
          this.readyTimeout = null;
        }
        this._startPlayback();
      }
    }

    this.emit('participantLeft', socketId);
  }

  getParticipantCount(): number { return this.participants.size; }
  getTrackUrl(): string | null  { return this.trackUrl; }

  getSessionDurationMs(): number {
    let currentStretch = 0;
    if (this.sessionActiveStartEpoch !== null) {
      currentStretch = Math.max(0, Date.now() - this.sessionActiveStartEpoch);
    }
    const totalMs = this.accumulatedSessionTimeMs + currentStretch;
    if (totalMs === 0 && this.createdAt > 0) {
      return Math.max(0, Date.now() - this.createdAt);
    }
    return totalMs;
  }

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
    const sessionDurationMs = this.getSessionDurationMs();
    return {
      roomId:                 this.roomId,
      trackUrl:               this.trackUrl,
      position:               this.computeCurrentPosition(),
      state:                  this.state,
      hostId:                 this.hostId,
      timestamp:              Date.now(),
      createdAt:              this.createdAt,
      sessionDurationMs:      sessionDurationMs,
      accumulatedSessionTime: Math.floor(sessionDurationMs / 1000),
      participants:           Array.from(this.participants.values()),
      spatial:                Array.from(this.spatial.entries()).map(([deviceId, position]) => ({ deviceId, position })),
      startEpoch:             this.timeline.startEpoch,
      pauseOffset:            this.timeline.pauseOffset,
      isPlaying:              this.timeline.isPlaying,
      pendingPlay:            this.pendingPlay,
      isPrivate:              this.isPrivate,
      queue:                  this.queue.snapshot(),
      queueVersion:           this.queue.version,
      shuffle:                this.queue.shuffle,
      repeatMode:             this.queue.repeatMode,
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

}
