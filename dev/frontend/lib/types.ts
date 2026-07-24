// lib/types.ts — Shared frontend types (mirrors backend src/types/index.ts)

export interface JoinRequest {
  socketId: string;
  displayName: string;
  timestamp?: number;
  isNudge?: boolean;
  userId?: string;
}


export enum PlaybackState {
  IDLE    = 'IDLE',
  PLAYING = 'PLAYING',
  PAUSED  = 'PAUSED',
  SEEKING = 'SEEKING',
}

export interface Participant {
  socketId:    string;
  displayName: string;
  joinedAt:    number;
  isReady:     boolean;
  volume:      number;
  isBlocked?:  boolean;
  userId?:     string;
  outputDeviceName?: string;
  outputDeviceType?: string;
  /** Median RTT to server in ms — updated after each NTP burst */
  latency?:    number;
  /** IQR-based jitter in ms — updated after each NTP burst */
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
  sizeBytes?: number; // used for smart prefetch timing
}

export interface DeviceSpatialState {
  deviceId: string;
  position: { angle: number; radius: number; elevation: number; };
}

export interface RoomSnapshot {
  roomId:       string;
  trackUrl:     string | null;
  position:     number;      // ms at the time of snapshot
  state:        PlaybackState;
  hostId:       string | null;
  timestamp:    number;      // server epoch when snapshot was taken
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

export interface PlaybackSchedulePayload {
  atEpoch: number;
  startEpoch: number;
  fromPosition: number;
  trackUrl?: string;
  title?: string;
  artist?: string;
}

export interface PlaybackPausePayload {
  pauseOffset: number;
}

export interface PingPayload  { t0: number; seq?: number; }
export interface PongPayload  { t0: number; t1: number; t2: number; seq?: number; }
