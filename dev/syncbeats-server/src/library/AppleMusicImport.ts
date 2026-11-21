import prisma from '../db/prisma';
import { PlaylistInputError, playlistName } from './PlaylistManagement';

export const APPLE_IMPORT_LIMIT = 100;
type TrackInput = { sourceId: string; title: string; artist: string; album?: string; albumArt?: string; duration?: number; youtubeId?: string };
type ImportInput = { sourceId: string; name: string; description?: string; coverUrl?: string; tracks: TrackInput[] };

function text(value: unknown, label: string, maximum: number, required = false): string | undefined {
  if (value == null && !required) return undefined;
  if (typeof value !== 'string') throw new PlaylistInputError(400, `${label} must be text.`);
  const cleaned = value.replace(/\0/g, '').trim();
  if ((required && !cleaned) || cleaned.length > maximum) throw new PlaylistInputError(400, `${label} is missing or too long.`);
  return cleaned || undefined;
}
function image(value: unknown, label: string): string | undefined {
  const cleaned = text(value, label, 4096);
  if (!cleaned) return undefined;
  try { const url = new URL(cleaned); if (!['https:', 'http:'].includes(url.protocol)) throw new Error(); }
  catch { throw new PlaylistInputError(400, `${label} must be an HTTP image URL.`); }
  return cleaned;
}
export function appleImportInput(body: unknown): ImportInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PlaylistInputError(400, 'Invalid Apple Music import.');
  const value = body as Record<string, unknown>;
  if (!Array.isArray(value.tracks) || value.tracks.length > APPLE_IMPORT_LIMIT) throw new PlaylistInputError(400, `Import at most ${APPLE_IMPORT_LIMIT} songs per batch.`);
  const tracks = new Map<string, TrackInput>();
  for (const raw of value.tracks) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PlaylistInputError(400, 'Invalid imported song.');
    const sourceId = text(raw.sourceId, 'Song source ID', 400, true)!;
    const title = text(raw.title, 'Song title', 500, true)!;
    const artist = text(raw.artist, 'Artist', 300) ?? '';
    const duration = raw.duration;
    if (duration != null && (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0 || duration > 86400)) throw new PlaylistInputError(400, 'Invalid song duration.');
    const youtubeId = text(raw.youtubeId, 'Room version', 11);
    if (youtubeId && !/^[A-Za-z0-9_-]{11}$/.test(youtubeId)) throw new PlaylistInputError(400, 'Invalid room version.');
    const track = { sourceId, title, artist, album: text(raw.album, 'Album', 500), albumArt: image(raw.albumArt, 'Album artwork'),
      duration: duration == null ? undefined : Math.round(duration), youtubeId };
    const repeated = tracks.get(sourceId);
    if (repeated && JSON.stringify(repeated) !== JSON.stringify(track)) throw new PlaylistInputError(400, 'Conflicting details for the same Apple Music song.');
    tracks.set(sourceId, track);
  }
  return { sourceId: text(value.sourceId, 'Playlist source ID', 400, true)!, name: playlistName(value.name),
    description: text(value.description, 'Playlist description', 2000), coverUrl: image(value.coverUrl, 'Playlist artwork'), tracks: [...tracks.values()] };
}

/** A batch is atomic. Account/source IDs make interrupted imports safely repeatable. */
export async function importAppleMusic(userId: string, input: ImportInput) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'apple-music-import:' + userId}))`;
    let playlist = await tx.playlist.findFirst({ where: { userId, sourceType: 'APPLE_MUSIC', sourceId: input.sourceId }, include: { tracks: true }, orderBy: { createdAt: 'asc' } });
    const created = !playlist;
    if (!playlist) playlist = await tx.playlist.create({ data: { userId, sourceType: 'APPLE_MUSIC', sourceId: input.sourceId,
      name: input.name, description: input.description, coverUrl: input.coverUrl }, include: { tracks: true } });
    const current = new Map(playlist.tracks.filter(t => t.sourceId).map(t => [t.sourceId!, t]));
    let nextPosition = Math.max(-1, ...playlist.tracks.map(t => t.position)) + 1;
    let added = 0;
    for (const track of input.tracks) {
      const song = await tx.song.upsert({ where: { title_artist: { title: track.title, artist: track.artist } },
        create: { title: track.title, artist: track.artist, album: track.album, albumArt: track.albumArt, duration: track.duration,
          youtubeId: track.youtubeId, resolvedAt: track.youtubeId ? new Date() : undefined },
        update: { album: track.album, albumArt: track.albumArt, duration: track.duration } });
      if (!song.youtubeId && track.youtubeId) await tx.song.updateMany({ where: { id: song.id, youtubeId: null }, data: { youtubeId: track.youtubeId, resolvedAt: new Date() } });
      const previous = current.get(track.sourceId);
      const youtubeId = song.youtubeId || track.youtubeId || previous?.youtubeId || '';
      await tx.playlistTrack.upsert({ where: { playlistId_sourceId: { playlistId: playlist.id, sourceId: track.sourceId } },
        create: { playlistId: playlist.id, sourceId: track.sourceId, songId: song.id, title: track.title, artist: track.artist,
          youtubeId, thumbnail: song.albumArt || track.albumArt || null, position: nextPosition++ },
        update: { songId: song.id, title: track.title, artist: track.artist, youtubeId, thumbnail: song.albumArt || track.albumArt || previous?.thumbnail || null } });
      if (!previous) added++;
    }
    // Account edits (renaming and manual additions) survive source re-imports.
    const updated = await tx.playlist.update({ where: { id: playlist.id }, data: { coverUrl: input.coverUrl, description: input.description, updatedAt: new Date() },
      select: { id: true, name: true, sourceId: true, _count: { select: { tracks: true } } } });
    return { version: 1, playlistId: updated.id, name: updated.name, sourceId: updated.sourceId, trackCount: updated._count.tracks, added, processed: input.tracks.length, created };
  }, { timeout: 30000, maxWait: 5000 });
}
