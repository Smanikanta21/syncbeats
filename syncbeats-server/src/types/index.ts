// ─── Shared type definitions ───────────────────────────────────────────────

import { PlaybackState } from '../core/PlaybackState';

export interface Participant {
  socketId:    string;
  displayName: string;
  joinedAt:    number; // epoch ms
  isReady:     boolean;
}

export interface RoomSnapshot {
  roomId:       string;
  trackUrl:     string | null;
  position:     number;       // ms, computed at snapshot time
  state:        PlaybackState;
  hostId:       string | null;
  timestamp:    number;       // server epoch when snapshot was taken
  participants: Participant[];
}

export interface JoinPayload  { roomId: string; displayName: string; }
export interface LeavePayload { roomId: string; }
export interface SeekPayload  { roomId: string; position: number; }
export interface TrackPayload { roomId: string; trackUrl: string; }
export interface PingPayload  { t0: number; }
export interface PongPayload  { t0: number; t1: number; t2: number; }
