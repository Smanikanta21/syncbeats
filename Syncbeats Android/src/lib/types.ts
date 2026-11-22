export interface User {
  id: string;
  name: string;
  email: string;
  email_verified_at?: string | null;
}

export interface AuthResponse { token?: string; user: User }
export interface SearchResult {
  url: string;
  title: string;
  uploaderName?: string;
  thumbnail?: string;
  duration?: number;
  metadataSource?: 'library';
}
export interface Track {
  id: string;
  trackUrl: string;
  title: string;
  artist?: string;
  thumbnail?: string;
  coverUrl?: string;
  durationSec?: number;
  isCurrent: boolean;
  queueIndex: number;
  playedAt?: number;
}
export interface Participant {
  socketId: string;
  displayName: string;
  deviceName?: string;
  outputDeviceName?: string;
  isReady: boolean;
  isBlocked?: boolean;
  volume: number;
  latency?: number;
}
export interface RoomSnapshot {
  roomId: string;
  roomInstanceId?: string;
  playbackInstanceId?: string | null;
  trackUrl: string | null;
  position: number;
  state: 'IDLE' | 'PLAYING' | 'PAUSED' | 'SEEKING';
  timestamp: number;
  startEpoch?: number | null;
  pauseOffset?: number;
  isPlaying?: boolean;
  pendingPlay?: boolean;
  hostId?: string | null;
  participants: Participant[];
  queue: Track[];
  shuffle: boolean;
  repeatMode: 'off' | 'track' | 'all';
  isPrivate?: boolean;
}
export interface Schedule {
  roomId: string;
  roomInstanceId?: string;
  playbackInstanceId?: string;
  trackUrl?: string;
  atEpoch: number;
  startEpoch: number;
  fromPosition: number;
}
export interface CatalogSong {
  id: string;
  title: string;
  artist: string;
  artwork?: string | null;
  thumbnail?: string | null;
  duration?: number | null;
  youtubeID?: string | null;
  sourceSongID?: string | null;
}
export interface CatalogPage { songs: CatalogSong[]; nextCursor: string | null; total: number }
export interface Feed {
  sections: { id: string; title: string; picks: { id: string; name: string; query: string; reason: string }[] }[];
}
export type ConnectionState = 'opening' | 'joining' | 'connected' | 'reconnecting' | 'approval' | 'error';
