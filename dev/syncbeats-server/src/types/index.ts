// ─── Shared type definitions ───────────────────────────────────────────────

import { PlaybackState } from '../core/PlaybackState';

export interface Participant {
  socketId:    string;
  displayName: string;
  joinedAt:    number; // epoch ms
  isReady:     boolean;
  volume:      number;
  isBlocked?:  boolean;
  userId?:     string;
  deviceId?:   string;
  outputDeviceName?: string;
  outputDeviceType?: string;
  latency?:    number;
  jitter?:     number;
}


export type RepeatMode = 'off' | 'all' | 'track';

/** What an enqueue route hands to the queue. Metadata is resolved before this point. */
export interface QueueTrackInput {
  trackUrl:     string;
  title?:       string;
  artist?:      string;
  thumbnail?:   string;
  fileName?:    string;
  durationSec?: number;
}

export interface QueueItem {
  id:           string;
  /** Normalized track identity — the dedup key. See trackKey() in core/RoomQueue.ts. */
  key:          string;
  trackUrl:     string;
  title:        string;
  artist:       string;
  thumbnail?:   string;
  fileName:     string;
  addedBy:      string;
  createdAt:    number;
  durationSec?: number;
}

/** Queue item as broadcast to clients — position and current flag are derived, never stored. */
export interface TrackQueueItem extends QueueItem {
  queueIndex: number;
  isCurrent:  boolean;
}

export interface RoomSnapshot {
  roomId:                 string;
  trackUrl:               string | null;
  position:               number;       // ms, computed at snapshot time
  state:                  PlaybackState;
  hostId:                 string | null;
  timestamp:              number;       // server epoch when snapshot was taken
  createdAt?:             number;       // server epoch when room session started
  sessionDurationMs?:     number;       // active session duration in ms
  accumulatedSessionTime?: number;      // active session duration in seconds
  participants:           Participant[];
  spatial:                DeviceSpatialState[];
  startEpoch?:            number | null;
  pauseOffset?:           number;
  isPlaying?:             boolean;
  pendingPlay?:           boolean;
  isPrivate?:             boolean;
  queue:                  TrackQueueItem[];
  queueVersion:           number;
  shuffle:                boolean;
  repeatMode:             RepeatMode;
}

export interface SpatialPosition {
  angle: number;
  radius: number;
  elevation: number;
}

export interface DeviceSpatialState {
  deviceId: string;
  position: SpatialPosition;
}

export interface JoinPayload  { roomId: string; displayName: string; userId?: string; deviceId?: string; isReady?: boolean; }
export interface LeavePayload { roomId: string; }
export interface SeekPayload  { roomId: string; position: number; }
export interface SetParticipantVolumePayload { roomId: string; targetSocketId?: string; volume: number; }
export interface TrackPayload { roomId: string; trackUrl: string; }
export interface PingPayload  { t0: number; seq?: number; }
export interface PongPayload  { t0: number; t1: number; t2: number; seq?: number; }

export interface PlaybackSchedulePayload {
  startEpoch: number;
  fromPosition: number;
  trackUrl?: string;
  atEpoch: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  socketId: string;
  userId?: string;
  displayName: string;
  message: string;
  timestamp: number;
}

