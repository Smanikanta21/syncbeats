// lib/types.ts — Shared frontend types (mirrors backend src/types/index.ts)

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
}

export interface TrackQueueItem {
  id:         string;
  trackUrl:   string;
  title:      string;
  fileName:   string;
  queueIndex: number;
  isCurrent:  boolean;
  addedBy:    string;
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
}
