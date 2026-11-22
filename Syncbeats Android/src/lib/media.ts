import type { RoomSnapshot, SearchResult, Track } from './types';

export function youtubeId(value: string): string | null {
  return value.match(/(?:^youtube:|youtu\.be\/|[?&]v=|youtube_)([A-Za-z0-9_-]{11})(?=[^A-Za-z0-9_-]|$)/)?.[1]
    ?? (/^[A-Za-z0-9_-]{11}$/.test(value) ? value : null);
}
export const trackKey = (value: string) => youtubeId(value) ? `youtube:${youtubeId(value)}` : value;
export function artwork(item: Track | SearchResult): string | undefined {
  const value = 'trackUrl' in item ? item.trackUrl : item.url;
  const supplied = ('coverUrl' in item ? item.coverUrl : undefined) || item.thumbnail;
  if (supplied && /^https?:\/\//.test(supplied)) return supplied;
  const embedded = value.match(/[?&]thumb=([^&]+)/)?.[1];
  if (embedded) { try { const decoded = decodeURIComponent(embedded); if (/^https?:\/\//.test(decoded)) return decoded; } catch {} }
  const id = youtubeId(value);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined;
}
export function audioURL(base: string, roomId: string, trackUrl: string): string {
  const id = youtubeId(trackUrl);
  if (id) return `${base}/rooms/${roomId}/yt-proxy?videoId=${id}`;
  if (/^https?:\/\//.test(trackUrl)) return trackUrl;
  if (trackUrl.startsWith('/files/')) return `${base}${trackUrl}`;
  throw new Error('This source is not supported on Android yet. Choose another song.');
}
export function expectedPosition(snapshot: RoomSnapshot, serverNow: number): number {
  if (snapshot.isPlaying && typeof snapshot.startEpoch === 'number') {
    return Math.max(snapshot.pauseOffset ?? 0, (serverNow - snapshot.startEpoch) / 1000);
  }
  return Math.max(0, snapshot.pauseOffset ?? snapshot.position / 1000);
}
export function scheduledEpoch(snapshot: RoomSnapshot): number | null {
  return snapshot.isPlaying && typeof snapshot.startEpoch === 'number'
    ? snapshot.startEpoch + (snapshot.pauseOffset ?? 0) * 1000 : null;
}
export function currentTrack(snapshot: RoomSnapshot | null) {
  return snapshot?.queue.find(track => track.isCurrent) ?? snapshot?.queue.find(track => track.trackUrl === snapshot.trackUrl) ?? null;
}
export function timeLabel(seconds: number) {
  const value = Math.max(0, Number.isFinite(seconds) ? Math.floor(seconds) : 0);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
