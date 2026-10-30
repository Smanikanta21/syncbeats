import { EventEmitter }  from 'events';
import { randomUUID } from 'crypto';
import { PlaybackState } from './PlaybackState';
import { RoomQueue, trackKey } from './RoomQueue';
import { ytId as extractYtId } from '../utils/youtube';
import { Participant, RoomSnapshot, SpatialPosition, ChatMessage, QueueItem, QueueTrackInput, RepeatMode, TrackQueueItem } from '../types';

export class Room extends EventEmitter {
  private readonly instanceId = randomUUID();
  private playbackInstanceId: string | null = null;
  private state:        PlaybackState          = PlaybackState.IDLE;
  private trackUrl:     string | null          = null;
  private hostId:       string | null          = null; // kept for snapshot compat
  private participants: Map<string, Participant> = new Map();
  private queue:        RoomQueue              = new RoomQueue();
  private spatial:      Map<string, SpatialPosition> = new Map();
  private chatHistory:  ChatMessage[]          = [];
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
    const wasIdle = data.playbackState === PlaybackState.IDLE && !data.trackUrl;
    const url = wasIdle ? null : (data.trackUrl || this.queue.current()?.trackUrl);
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
    this.trackUrl = wasIdle ? null : (this.queue.current()?.trackUrl ?? data.trackUrl);
    this.pendingPlay = false;
    this.timeline.isPlaying = false;
    this.timeline.startEpoch = null;
    this.timeline.pauseOffset = Math.max(0, data.positionMs / 1000);
    this.state    = this.trackUrl ? PlaybackState.PAUSED : PlaybackState.IDLE;
    this.isHydrated   = true;
  }

  // ── Playback (no host gate — any participant) ─────────────────────────

  private pendingPlay: boolean = false;

  play(_requesterId: string): void {
    if (this.timeline.isPlaying || !this.trackUrl) return;

    // If all participants are already ready (same track, resuming from pause),
    // skip the readiness gate entirely and start playback immediately.
    if (this.allReady()) {
      if (this.readyTimeout) { clearTimeout(this.readyTimeout); this.readyTimeout = null; }
      this._startPlayback();
      return;
    }

    // New track or first play — gate on readiness with a 10s timeout fallback.
    this.pendingPlay = true;
    this.emit('stateChanged', this.snapshot());
    if (this.readyTimeout) clearTimeout(this.readyTimeout);
    this.readyTimeout = setTimeout(() => {
      if (this.pendingPlay && !this.timeline.isPlaying) {
        console.log(`[Room ${this.roomId}] Play readiness timeout expired (10s) — forcing playback for ready participants`);
        this._startPlayback();
      }
    }, 10_000);
    this.readyTimeout.unref();
  }

  private _startPlayback(): void {
    if (!this.trackUrl) return;
    this.playbackInstanceId = randomUUID();
    this.pendingPlay = false;
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = null;
    }
    const scheduleDelay = 150; // Reduced from 800ms for snappier play button response
    const atEpoch = Date.now() + scheduleDelay;

    this.timeline.startEpoch = atEpoch - this.timeline.pauseOffset * 1000;
    this.timeline.isPlaying = true;
    this.state = PlaybackState.PLAYING;

    const ytId = extractYtId(this.trackUrl);
    const fallbackThumb = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null;
    const item = this.queue.current();

    this.emit('schedule', {
      roomId: this.roomId,
      roomInstanceId: this.instanceId,
      playbackInstanceId: this.playbackInstanceId,
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

  pause(requesterId: string, positionMs?: number): void {
    if (!this.trackUrl) return;
    const position = positionMs ?? this.computeCurrentPosition();
    if (!Number.isFinite(position)) return;
    this.pendingPlay = false;
    this.playbackInstanceId = null;
    if (this.readyTimeout) { clearTimeout(this.readyTimeout); this.readyTimeout = null; }
    this.timeline.pauseOffset = Math.max(0, position / 1000);
    this.timeline.startEpoch = null;
    this.timeline.isPlaying = false;
    this.state = PlaybackState.PAUSED;
    this.emit('pause', {
      roomId: this.roomId, roomInstanceId: this.instanceId,
      pauseOffset: this.timeline.pauseOffset,
      positionMs: this.timeline.pauseOffset * 1000, senderId: requesterId,
    });
    this.emit('stateChanged', this.snapshot());
  }

  // Directly syncs the room state from a client-emitted playback:schedule event
  syncSchedule(trackUrl: string, positionMs: number, _startEpoch: number, senderId?: string, hintTitle?: string, hintArtist?: string, hintThumbnail?: string): void {
    if (!trackUrl || !Number.isFinite(positionMs)) return;
    const sameTrack = !!this.trackUrl && trackKey(this.trackUrl) === trackKey(trackUrl);
    let item = this.queue.findByUrl(trackUrl);
    if (!item) {
      item = this.queue.add(
        [{ trackUrl, title: hintTitle, artist: hintArtist, thumbnail: hintThumbnail }],
        senderId || 'system',
      ).first;
    }
    if (!item) return;
    if (this.queue.current()?.id !== item.id) this.queue.setCurrent(item.id);
    this.trackUrl = trackUrl;
    this.timeline.pauseOffset = Math.max(0, positionMs / 1000);
    this.timeline.startEpoch = null;
    this.timeline.isPlaying = false;
    this.playbackInstanceId = null;
    this.state = PlaybackState.PAUSED;
    this.pendingPlay = true;
    if (!sameTrack) {
      for (const participant of this.participants.values()) {
        participant.isReady = false;
        participant.isBlocked = false;
      }
    }
    this.emit('trackSet', { trackUrl, title: item.title });
    this.emitQueueChanged();
    this.play(senderId || 'system');
  }

  // Directly syncs the room state from a client-emitted playback:pause event
  syncPause(positionMs: number, senderId?: string): void {
    this.pause(senderId || 'system', positionMs);
  }

  seek(_requesterId: string, positionMs: number): void {
    if (!this.trackUrl || !Number.isFinite(positionMs)) return;
    const positionSec = Math.max(0, positionMs / 1000);
    this.timeline.pauseOffset = positionSec;
    this.playbackInstanceId = null;

    if (this.timeline.isPlaying) {
      const scheduleDelay = 150; // Reduced from 500ms for snappier seek response
      const atEpoch = Date.now() + scheduleDelay;
      this.timeline.startEpoch = atEpoch - positionSec * 1000;
      this.playbackInstanceId = randomUUID();

      this.emit('schedule', {
        roomId: this.roomId,
        roomInstanceId: this.instanceId,
        playbackInstanceId: this.playbackInstanceId,
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
      this.emit('pause', { roomId: this.roomId, roomInstanceId: this.instanceId, pauseOffset: positionSec });
    }
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

  nextTrack(autoplay = true, manual = true): QueueItem | null {
    const item = this.queue.next(manual);
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

  /** Instance-aware clients can finish short tracks and repeat-one without a time debounce. */
  handleTrackEnded(trackUrl: string, playbackInstanceId?: string): QueueItem | null {
    if (!this.timeline.isPlaying || !this.playbackInstanceId || !this.trackUrl) return null;
    if (trackKey(trackUrl) !== trackKey(this.trackUrl)) return null;
    if (playbackInstanceId !== undefined) {
      if (playbackInstanceId !== this.playbackInstanceId) return null;
    } else {
      // Compatibility for older native/web clients that only send a URL.
      if (!this.queue.shouldAdvance(trackUrl)) return null;
      const duration = this.queue.current()?.durationSec;
      if (duration && this.computeCurrentPosition() < duration * 1000 - 1000) return null;
    }
    this.playbackInstanceId = null; // consume before emitting any successor events
    return this.nextTrack(true, false);
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
    const wasCurrent = this.queue.current()?.id === id;
    const autoplay = this.timeline.isPlaying || this.pendingPlay;
    const item = this.queue.resolve(id, trackUrl);
    if (item && wasCurrent) this._loadItem(item, autoplay);
    else if (item) this.emitQueueChanged();
    return item;
  }

  private _loadItem(item: QueueItem, autoplay: boolean): void {
    const sameTrack = !!this.trackUrl && trackKey(this.trackUrl) === item.key;
    this.trackUrl = item.trackUrl;
    this.timeline.pauseOffset = 0;
    this.timeline.startEpoch = null;
    this.timeline.isPlaying = false;
    this.playbackInstanceId = null;
    this.state = PlaybackState.PAUSED;
    this.pendingPlay = autoplay;
    if (this.readyTimeout) { clearTimeout(this.readyTimeout); this.readyTimeout = null; }
    if (!sameTrack) {
      for (const p of this.participants.values()) { p.isReady = false; p.isBlocked = false; }
    }
    this.emit('trackSet', { trackUrl: item.trackUrl, title: item.title });
    this.emitQueueChanged();
    if (autoplay) this.play('system');
  }

  private resetPlayback(): void {
    this.playbackInstanceId = null;
    this.trackUrl = null;
    this.state = PlaybackState.IDLE;
    this.timeline.isPlaying = false;
    this.timeline.startEpoch = null;
    this.timeline.pauseOffset = 0;
    this.pendingPlay = false;
    if (this.readyTimeout) { clearTimeout(this.readyTimeout); this.readyTimeout = null; }
    this.emitQueueChanged();
  }

  private emitQueueChanged(): void {
    this.emit('queueChanged', this.queue.snapshot());
    this.emit('stateChanged', this.snapshot());
  }

  resetRoom(): void {
    this.playbackInstanceId = null;
    this.chatHistory = [];
    this.queue.clear();
    this.trackUrl = null;
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
    this.emitQueueChanged();
  }

  // ── Readiness tracking ────────────────────────────────────────────────

  setParticipantReady(socketId: string, ready: boolean, trackUrl?: string): void {
    const p = this.participants.get(socketId);
    if (!p || (trackUrl !== undefined && trackKey(trackUrl) !== trackKey(this.trackUrl || ''))) return;
    if (p.isReady === ready) return;
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

    // A joining device must not cancel an already requested readiness-gated start.

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
        this.emit('stateChanged', this.snapshot());
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
      this.sessionExpiryTimer.unref();
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
    return Math.max(0, Date.now() - this.timeline.startEpoch);
  }

  setSpatialPosition(deviceId: string, position: SpatialPosition): void {
    this.spatial.set(deviceId, position);
  }

  removeSpatialPosition(deviceId: string): void {
    this.spatial.delete(deviceId);
  }

  snapshot(): RoomSnapshot {
    const queue = this.queue.snapshot();
    const nextItem = this.queue.peekNext();
    const nextTrack = nextItem ? queue.find(item => item.id === nextItem.id) ?? null : null;
    const sessionDurationMs = this.getSessionDurationMs();
    return {
      roomId:                 this.roomId,
      roomInstanceId:         this.instanceId,
      playbackInstanceId:     this.playbackInstanceId,
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
      queue,
      nextTrack,
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
