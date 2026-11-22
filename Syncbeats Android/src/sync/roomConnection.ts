import { trackKey } from '../lib/media';
import type { ConnectionState, RoomSnapshot, Schedule, User } from '../lib/types';
import { SyncClock, type ClockStats, type EventSocket } from './clock';

export class RoomConnection {
  snapshot: RoomSnapshot | null = null;
  state: ConnectionState = 'opening';
  readonly clock: SyncClock;
  private loaded: string | null = null;
  private listeners: [string, (...args: any[]) => void][] = [];
  private lastReady: string | null = null;
  constructor(
    readonly socket: EventSocket,
    readonly roomId: string,
    private user: User,
    private deviceId: string,
    private callbacks: {
      snapshot: (value: RoomSnapshot) => void;
      state: (value: ConnectionState) => void;
      error: (message: string) => void;
      stats: (stats: ClockStats) => void;
    },
  ) {
    this.clock = new SyncClock(socket, roomId, callbacks.stats);
    this.listen('connect', () => this.join());
    this.listen('disconnect', () => { this.lastReady = null; this.clock.stop(); this.setState('reconnecting'); });
    this.listen('connect_error', () => { this.setState('reconnecting'); callbacks.error('Connection interrupted. Reconnecting to your room…'); });
    this.listen('room:snapshot', (snapshot: RoomSnapshot) => this.receive(snapshot, true));
    this.listen('room:stateChanged', (snapshot: RoomSnapshot) => this.receive(snapshot));
    this.listen('playback:schedule', (schedule: Schedule) => {
      const snapshot = this.snapshot;
      if (!snapshot || schedule.roomId !== roomId ||
        (schedule.roomInstanceId && snapshot.roomInstanceId && schedule.roomInstanceId !== snapshot.roomInstanceId) ||
        (schedule.trackUrl && trackKey(schedule.trackUrl) !== trackKey(snapshot.trackUrl || ''))) return;
      if (![schedule.startEpoch, schedule.atEpoch, schedule.fromPosition].every(Number.isFinite)) return;
      // The full snapshot follows this event; retain queue/participants and update only the timeline.
      this.snapshot = { ...snapshot, startEpoch: schedule.startEpoch, pauseOffset: schedule.fromPosition,
        playbackInstanceId: schedule.playbackInstanceId, isPlaying: true, pendingPlay: false, state: 'PLAYING' };
      callbacks.snapshot(this.snapshot);
    });
    this.listen('room:joinPendingApproval', () => this.setState('approval'));
    this.listen('room:joinDenied', () => this.fail('The host declined your request to join.'));
    this.listen('room:notFound', (payload: { roomId: string; message: string }) => { if (payload.roomId === roomId) this.fail(payload.message); });
    this.listen('error', (payload: string | { message?: string; error?: string }) => {
      callbacks.error(typeof payload === 'string' ? payload : payload.message || payload.error || 'The room could not complete that action.');
    });
  }
  private listen(event: string, handler: (...args: any[]) => void) { this.listeners.push([event, handler]); this.socket.on(event, handler); }
  private setState(value: ConnectionState) { this.state = value; this.callbacks.state(value); }
  private fail(message: string) { this.setState('error'); this.callbacks.error(message); this.clock.stop(); }
  join() {
    if (!this.socket.connected) return;
    this.lastReady = null;
    this.setState('joining');
    this.socket.emit('device:register', { deviceKey: this.deviceId });
    this.socket.emit('room:join', { roomId: this.roomId, userId: this.user.id, displayName: this.user.name,
      deviceId: this.deviceId, deviceName: 'SyncBeats Android', isReady: false });
    void this.clock.start();
  }
  private receive(snapshot: RoomSnapshot, rejoin = false) {
    if (snapshot.roomId !== this.roomId || !Array.isArray(snapshot.queue) || !Array.isArray(snapshot.participants) || !Number.isFinite(snapshot.timestamp)) return;
    if (!rejoin && this.snapshot && this.snapshot.roomInstanceId === snapshot.roomInstanceId && snapshot.timestamp < this.snapshot.timestamp) return;
    this.snapshot = snapshot;
    if (rejoin) this.lastReady = null;
    this.setState('connected');
    this.callbacks.snapshot(snapshot);
    this.ready();
  }
  markLoaded(trackUrl: string | null) { this.loaded = trackUrl ? trackKey(trackUrl) : null; this.ready(); }
  private ready() {
    const url = this.snapshot?.trackUrl;
    if (!url || !this.loaded || this.loaded !== trackKey(url) || this.state !== 'connected' || !this.socket.connected) return;
    const key = `${this.socket.id}:${this.snapshot?.roomInstanceId}:${url}`;
    if (key === this.lastReady) return;
    this.lastReady = key;
    this.socket.emit('playback:blocked', { roomId: this.roomId, blocked: false });
    this.socket.emit('room:clientReady', { roomId: this.roomId, isReady: true, trackUrl: url });
  }
  blocked() {
    this.loaded = null; this.lastReady = null;
    if (this.state === 'connected' && this.socket.connected) {
      this.socket.emit('room:clientReady', { roomId: this.roomId, isReady: false, trackUrl: this.snapshot?.trackUrl });
      this.socket.emit('playback:blocked', { roomId: this.roomId, blocked: true });
    }
  }
  command(event: string, payload: object = {}) {
    if (!this.socket.connected || this.state !== 'connected') { this.callbacks.error('Wait until this device reconnects before changing playback.'); return false; }
    this.socket.emit(event, { ...payload, roomId: this.roomId });
    return true;
  }
  resync() { if (this.socket.connected && this.state === 'connected') { this.socket.emit('room:resync', { roomId: this.roomId }); void this.clock.start(); } }
  dispose() {
    this.clock.dispose();
    if (this.socket.connected) this.socket.emit('room:leave', { roomId: this.roomId });
    for (const [event, handler] of this.listeners) this.socket.off(event, handler);
  }
}
