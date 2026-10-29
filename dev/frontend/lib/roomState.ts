import { PlaybackState, type RoomSnapshot, type TrackQueueItem } from './types';

export interface QueueUpdate {
  roomId?: string;
  roomInstanceId?: string;
  queueVersion?: number;
  queue: TrackQueueItem[];
  nextTrack?: TrackQueueItem | null;
  shuffle?: boolean;
  repeatMode?: RoomSnapshot['repeatMode'];
}

export function normalizeRoomSnapshot(raw: unknown, roomId: string): RoomSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const outer = raw as Record<string, unknown>;
  const value = outer.state && typeof outer.state === 'object' ? outer.state : outer;
  const snap = value as RoomSnapshot;
  if (snap.roomId !== roomId || !Array.isArray(snap.queue) ||
      (snap.trackUrl !== null && typeof snap.trackUrl !== 'string')) return null;
  return {
    ...snap,
    participants: Array.isArray(snap.participants) ? snap.participants : [],
    isPlaying: snap.isPlaying ?? snap.state === PlaybackState.PLAYING,
    pauseOffset: Number.isFinite(snap.pauseOffset) ? Math.max(0, snap.pauseOffset!) : 0,
  };
}

/** Queue patches never carry playback intent or decide whether to unload audio. */
export function applyQueueUpdate(current: RoomSnapshot | null, update: QueueUpdate): RoomSnapshot | null {
  if (!current || !Array.isArray(update.queue)) return current;
  if (update.roomId && update.roomId !== current.roomId) return current;
  if (update.roomInstanceId && current.roomInstanceId && update.roomInstanceId !== current.roomInstanceId) return current;
  if (update.queueVersion != null && current.queueVersion != null && update.queueVersion < current.queueVersion) return current;
  return {
    ...current,
    queue: update.queue,
    queueVersion: update.queueVersion ?? current.queueVersion,
    nextTrack: update.nextTrack === undefined ? current.nextTrack : update.nextTrack,
    shuffle: update.shuffle ?? current.shuffle,
    repeatMode: update.repeatMode ?? current.repeatMode,
  };
}

export function selectNextTrack(snapshot: Pick<RoomSnapshot, 'queue' | 'repeatMode' | 'shuffle' | 'nextTrack'> | null): TrackQueueItem | null {
  if (!snapshot) return null;
  if (snapshot.nextTrack !== undefined) return snapshot.nextTrack;
  const index = snapshot.queue.findIndex(track => track.isCurrent);
  if (index < 0) return null;
  if (snapshot.repeatMode === 'track') return snapshot.queue[index];
  if (index + 1 < snapshot.queue.length) return snapshot.queue[index + 1];
  // An older server cannot tell us its next shuffled lap; don't download a guessed target.
  return snapshot.repeatMode === 'all' && !snapshot.shuffle ? snapshot.queue[0] ?? null : null;
}
