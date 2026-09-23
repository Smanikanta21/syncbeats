import { EventEmitter }  from 'events';
import { PlaybackState } from './PlaybackState';
import { Participant, RoomSnapshot, SpatialPosition, ChatMessage } from '../types';

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
  }): void {
    if (data.createdAt) {
      this.createdAt = typeof data.createdAt === 'number' 
        ? data.createdAt 
        : new Date(data.createdAt).getTime();
    }
    this.hostId   = data.hostId;
    this.trackUrl = data.trackUrl;
    this.pendingPlay = false;
    this.timeline.isPlaying = false;
    this.timeline.startEpoch = null;
    this.timeline.pauseOffset = Math.max(0, data.positionMs / 1000);
    this.state    = PlaybackState.PAUSED;
    this.position     = data.positionMs;
    this.snapshotTime = Date.now();
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

    this.emit('schedule', {
      atEpoch,
      fromPosition: this.timeline.pauseOffset,
      trackUrl: this.trackUrl,
      startEpoch: this.timeline.startEpoch,
      title: 'Unknown Track',
      artist: 'Unknown Artist',
      thumbnail: fallbackThumb || null,
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







  resetRoom(): void {
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
      isPrivate:              this.isPrivate
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
