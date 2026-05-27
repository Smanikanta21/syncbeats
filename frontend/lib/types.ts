// lib/types.ts — Shared frontend types (mirrors backend src/types/index.ts)

export enum PlaybackState {
  IDLE    = 'IDLE',
  PREPARING = 'PREPARING',
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
}

export interface TrackQueueItem {
  id:         string;
  trackUrl:   string;
  title:      string;
  fileName:   string;
  queueIndex: number;
  isCurrent:  boolean;
  addedBy:    string;
  addedByName?: string;
  createdAt:  number;
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
}

export interface PlaybackSchedulePayload {
  startEpoch: number;
  fromPosition: number;
  trackUrl?: string;
}

export interface PlaybackPausePayload {
  pauseOffset: number;
}

export interface PingPayload  { t0: number; seq?: number; }
export interface PongPayload  { t0: number; t1: number; t2: number; seq?: number; }
