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
  outputDeviceName?: string;
  outputDeviceType?: string;
  latency?:    number;
  jitter?:     number;
}

export interface TrackQueueItem {
  id:         string;
  trackUrl:   string;
  title:      string;
  artist?:    string;
  fileName:   string;
  queueIndex: number;
  isCurrent:  boolean;
  addedBy:    string;
  addedByName?: string;
  createdAt:  number;
  sizeBytes?: number;
}

export interface RoomSnapshot {
  roomId:       string;
  trackUrl:     string | null;
  position:     number;       // ms, computed at snapshot time
  state:        PlaybackState;
  hostId:       string | null;
  timestamp:    number;       // server epoch when snapshot was taken
  participants: Participant[];
  queue:        TrackQueueItem[];
  spatial:      DeviceSpatialState[];
  startEpoch?:  number | null;
  pauseOffset?: number;
  isPlaying?:   boolean;
  pendingPlay?: boolean;
  isPrivate?:   boolean;
  shuffle:      boolean;
  repeatMode:   "off" | "track" | "all";
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

export interface PlaybackPausePayload {
  pauseOffset: number;
}
