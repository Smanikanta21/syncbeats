import { EventEmitter }  from 'events';
import { PlaybackState } from './PlaybackState';
import { Participant, RoomSnapshot, TrackQueueItem, SpatialPosition, ChatMessage } from '../types';

function matchesTrackUrl(itemUrl: string, trackUrl: string | null): boolean {
  if (!trackUrl) return false;
  if (itemUrl === trackUrl) return true;
  
  const extractId = (url: string): string | null => {
    if (!url) return null;
    const m = url.match(/[?&](?:videoId|songId|id)=([a-zA-Z0-9_-]+)/)
      || url.match(/youtube:([a-zA-Z0-9_-]{11})/)
      || url.match(/^youtube_([a-zA-Z0-9_-]{11})\.yt$/)
      || url.match(/vi\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    if (url.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
    return null;
  };

  const idA = extractId(itemUrl);
  const idB = extractId(trackUrl);
  if (idA !== null && idB !== null && idA === idB) return true;

  const getCleanPath = (u: string) => {
    try {
      if (u.startsWith('http://') || u.startsWith('https://')) {
        const parsed = new URL(u);
        return parsed.pathname + parsed.search;
      }
      return u;
    } catch {
      return u;
    }
  };

  return getCleanPath(itemUrl) === getCleanPath(trackUrl);
}

export class Room extends EventEmitter {
  private state:        PlaybackState          = PlaybackState.IDLE;
  private position:     number                 = 0;   // ms
  private trackUrl:     string | null          = null;
  private hostId:       string | null          = null; // kept for snapshot compat
  private participants: Map<string, Participant> = new Map();
  private queue:        TrackQueueItem[]       = [];
  private spatial:      Map<string, SpatialPosition> = new Map();
  private chatHistory:  ChatMessage[]          = [];
  private snapshotTime: number                 = Date.now();
  private isPrivate:    boolean                = false;
  private shuffle:      boolean                = false;
  private repeatMode:   "off" | "track" | "all" = "off";
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
    queue: TrackQueueItem[];
    shuffle?: boolean;
    repeatMode?: string;
    createdAt?: Date | string | number;
  }): void {
    if (data.createdAt) {
      this.createdAt = typeof data.createdAt === 'number' 
        ? data.createdAt 
        : new Date(data.createdAt).getTime();
    }
    this.hostId   = data.hostId;
    this.queue    = [...data.queue].sort((a, b) => a.queueIndex - b.queueIndex);
    const current = this.queue.find((item) => item.isCurrent) ?? null;
    this.trackUrl = current?.trackUrl ?? data.trackUrl;
    this.shuffle  = data.shuffle ?? false;
    this.repeatMode = (data.repeatMode as "off" | "track" | "all") ?? "off";
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

    const currentItem = this.queue.find(item => item.isCurrent) || this.queue.find(item => matchesTrackUrl(item.trackUrl, this.trackUrl));
    const ytMatch = this.trackUrl ? this.trackUrl.match(/^(?:youtube:)?([a-zA-Z0-9_-]{11})$/) : null;
    const ytId = ytMatch ? ytMatch[1] : null;
    const fallbackThumb = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null;

    this.emit('schedule', {
      atEpoch,
      fromPosition: this.timeline.pauseOffset,
      trackUrl: this.trackUrl,
      startEpoch: this.timeline.startEpoch,
      title: currentItem?.title || 'Unknown Track',
      artist: currentItem?.artist || 'Unknown Artist',
      thumbnail: currentItem?.thumbnail || fallbackThumb || null,
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

    const ytMatch = trackUrl ? trackUrl.match(/^(?:youtube:)?([a-zA-Z0-9_-]{11})$/) : null;
    const ytId = ytMatch ? ytMatch[1] : null;
    const fallbackThumb = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null;
    
    const isGenericTitle = !hintTitle || 
      hintTitle === 'Unknown Track' || 
      hintTitle === 'Track' || 
      hintTitle === 'Room Audio' ||
      /^[a-zA-Z0-9_-]{11}([_\s]+\d{10,13})?$/.test((hintTitle || '').trim());
    const isGenericArtist = !hintArtist || hintArtist === 'Unknown Artist' || hintArtist === 'SyncBeats Room' || hintArtist === '';

    let resolvedTitle = hintTitle;
    let resolvedArtist = hintArtist;

    let currentItem = this.queue.find(item => item.isCurrent) || this.queue.find(item => matchesTrackUrl(item.trackUrl, trackUrl));

    if (currentItem) {
      if (isGenericTitle && currentItem.title && currentItem.title !== 'Unknown Track' && currentItem.title !== 'Track') {
        resolvedTitle = currentItem.title;
      } else if (!isGenericTitle && resolvedTitle) {
        currentItem.title = resolvedTitle;
      }
      if (isGenericArtist && currentItem.artist && currentItem.artist !== 'Unknown Artist') {
        resolvedArtist = currentItem.artist;
      } else if (!isGenericArtist && resolvedArtist !== undefined) {
        currentItem.artist = resolvedArtist;
      }
      if (hintThumbnail) {
        currentItem.thumbnail = hintThumbnail;
      }
    }

    if (ytId && (isGenericTitle || !resolvedTitle || resolvedTitle.startsWith('youtube:'))) {
      fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`)
        .then(res => res.ok ? res.json() : null)
        .then((data: any) => {
          if (data && data.title) {
            const target = this.queue.find(q => matchesTrackUrl(q.trackUrl, trackUrl));
            if (target) {
              target.title = data.title;
              if (data.author_name) target.artist = data.author_name;
              if (data.thumbnail_url) target.thumbnail = data.thumbnail_url;
              this.emit('queueChanged', this.queueSnapshot());
              this.emit('stateChanged', this.snapshot());
            }
          }
        })
        .catch(() => {});
    }

    if (!currentItem && trackUrl) {
      this.queue = this.queue.map(item => ({ ...item, isCurrent: false }));
      const newItem: TrackQueueItem = {
        id: `auto_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        trackUrl: trackUrl,
        title: resolvedTitle || 'Track',
        artist: resolvedArtist || '',
        thumbnail: hintThumbnail || fallbackThumb || undefined,
        fileName: trackUrl.startsWith('youtube:') ? `youtube_${trackUrl.split(':')[1]}.yt` : 'track.mp3',
        queueIndex: 0,
        isCurrent: true,
        addedBy: senderId || 'system',
        createdAt: Date.now()
      };
      this.queue = [newItem, ...this.queue];
      currentItem = newItem;
      this.emit('queueChanged', this.queueSnapshot());
    } else if (currentItem && !currentItem.isCurrent) {
      this.queue = this.queue.map(item => ({ ...item, isCurrent: item.id === currentItem!.id }));
      this.emit('queueChanged', this.queueSnapshot());
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
      
      const currentItem = this.queue.find(item => item.isCurrent) || this.queue.find(item => matchesTrackUrl(item.trackUrl, this.trackUrl));

      this.emit('schedule', {
        atEpoch,
        fromPosition: positionSec,
        trackUrl: this.trackUrl,
        startEpoch: this.timeline.startEpoch,
        title: currentItem?.title || 'Unknown Track',
        artist: currentItem?.artist || 'Unknown Artist',
        thumbnail: currentItem?.thumbnail || null,
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
    if (item.isCurrent) {
      this.setCurrentQueueItem(item.id, true);
    }
    this.emit('queueChanged', this.queueSnapshot());

    // Fetch YouTube metadata if title is generic or raw video ID/timestamp
    const ytMatch = item.trackUrl ? item.trackUrl.match(/^(?:youtube:)?([a-zA-Z0-9_-]{11})$/) : null;
    const ytId = ytMatch ? ytMatch[1] : null;
    const isGenericTitle = !item.title || 
      item.title === 'Unknown Track' || 
      item.title === 'Track' || 
      /^[a-zA-Z0-9_-]{11}([_\s]+\d{10,13})?$/.test((item.title || '').trim());

    if (ytId && isGenericTitle) {
      fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`)
        .then(res => res.ok ? res.json() : null)
        .then((data: any) => {
          if (data && data.title) {
            const target = this.queue.find(q => q.id === item.id);
            if (target) {
              target.title = data.title;
              if (data.author_name) target.artist = data.author_name;
              if (data.thumbnail_url) target.thumbnail = data.thumbnail_url;
              this.emit('queueChanged', this.queueSnapshot());
              this.emit('stateChanged', this.snapshot());
            }
          }
        })
        .catch(() => {});
    }
  }

  syncQueue(queue: TrackQueueItem[], currentItemId: string | null): void {
    this.queue = [...queue].sort((a, b) => a.queueIndex - b.queueIndex);
    this.setCurrentQueueItem(currentItemId, true);
    this.emit('queueChanged', this.queueSnapshot());
  }

  /** Reorder the queue without interrupting current playback. */
  updateQueueOrder(queue: TrackQueueItem[]): void {
    this.queue = [...queue].sort((a, b) => a.queueIndex - b.queueIndex);
    this.emit('queueChanged', this.queueSnapshot());
    // Emit a fresh snapshot so all clients see the new order,
    // but do NOT touch trackUrl / position / state.
    this.emit('stateChanged', this.snapshot());
  }

  updatePlaybackSettings(shuffle?: boolean, repeatMode?: "off" | "track" | "all"): void {
    if (shuffle !== undefined) this.shuffle = shuffle;
    if (repeatMode !== undefined) this.repeatMode = repeatMode;
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

    const isSameTrack = this.trackUrl === next.trackUrl;

    this.queue = this.queue.map((item) => ({ ...item, isCurrent: item.id === itemId }));
    this.trackUrl  = next.trackUrl;
    this.position  = 0;
    this.state     = PlaybackState.PAUSED;
    this.timeline.isPlaying = false;
    this.timeline.startEpoch = null;
    this.timeline.pauseOffset = 0;
    
    if (!isSameTrack) {
      for (const p of this.participants.values()) {
        p.isReady = false;
        p.isBlocked = false;
      }
    }
    this.snapshotTime = Date.now();
    
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

    if (!skipQueueEmit) this.emit('queueChanged', this.queueSnapshot());
    this.emit('trackSet', { trackUrl: next.trackUrl, title: next.title });
    this.emit('stateChanged', this.snapshot());
  }

  removeQueueItem(itemId: string): void {
    const target = this.queue.find(i => i.id === itemId || matchesTrackUrl(i.trackUrl, itemId));
    if (!target) return;

    const wasCurrent = target.isCurrent;
    this.queue = this.queue.filter(i => i.id !== target.id);

    if (wasCurrent) {
      if (this.queue.length > 0) {
        const next = this.queue[0];
        next.isCurrent = true;
        this.trackUrl = next.trackUrl;
        this.position = 0;
        this.timeline.pauseOffset = 0;
        if (this.timeline.isPlaying) {
          this._startPlayback();
        } else {
          this.emit('stateChanged', this.snapshot());
        }
      } else {
        this.resetRoom();
        return;
      }
    } else {
      this.emit('queueChanged', this.queueSnapshot());
      this.emit('stateChanged', this.snapshot());
    }
  }

  resetRoom(): void {
    this.queue = [];
    this.chatHistory = [];
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
    this.emit('queueChanged', []);
    this.emit('stateChanged', this.snapshot());
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
    }

    this.emit('participantLeft', socketId);
  }

  getParticipantCount(): number { return this.participants.size; }
  getTrackUrl(): string | null  { return this.trackUrl; }
  getQueue(): TrackQueueItem[]  { return this.queueSnapshot(); }

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
      queue:                  this.queueSnapshot(),
      spatial:                Array.from(this.spatial.entries()).map(([deviceId, position]) => ({ deviceId, position })),
      startEpoch:             this.timeline.startEpoch,
      pauseOffset:            this.timeline.pauseOffset,
      isPlaying:              this.timeline.isPlaying,
      pendingPlay:            this.pendingPlay,
      isPrivate:              this.isPrivate,
      shuffle:                this.shuffle,
      repeatMode:             this.repeatMode
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
