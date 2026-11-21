import prisma from '../db/prisma';
import { Prisma } from '@prisma/client';

export class PlaylistInputError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Track = { songId?: string | null; youtubeId?: string | null; title: string; artist?: string | null };
const clean = (value: unknown): string => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
export function trackIdentity(track: Track): string {
  return track.songId ? `song:${track.songId}` : track.youtubeId ? `video:${track.youtubeId}` : `metadata:${track.title.toLowerCase()}|${(track.artist || '').toLowerCase()}`;
}
export function sameTrack(left: Track, right: Track): boolean {
  if (left.youtubeId && right.youtubeId) return left.youtubeId === right.youtubeId;
  if (left.songId && right.songId) return left.songId === right.songId;
  return left.title.toLowerCase() === right.title.toLowerCase() && (left.artist || '').toLowerCase() === (right.artist || '').toLowerCase();
}
export function playlistName(value: unknown): string {
  const name = clean(value);
  if (!name || name.length > 120) throw new PlaylistInputError(400, 'Use a playlist name between 1 and 120 characters.');
  return name;
}

async function owned(tx: Prisma.TransactionClient, id: string, userId: string) {
  // Serialize managed collection writes, including retaining Library songs.
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  const playlist = await tx.playlist.findFirst({ where: { id, userId }, include: { tracks: { orderBy: { position: 'asc' } } } });
  if (!playlist) throw new PlaylistInputError(404, 'Playlist not found.');
  return playlist;
}
function isLibrary(playlist: { name: string; sourceType: string }) {
  return playlist.name === 'Liked Songs' && playlist.sourceType === 'SYNCBEATS';
}

export async function deleteManagedPlaylist(id: string, userId: string, songDisposition: unknown) {
  if (songDisposition !== 'keep' && songDisposition !== 'remove') throw new PlaylistInputError(400, 'Choose whether to keep or remove the playlist songs.');
  return prisma.$transaction(async tx => {
    const playlist = await owned(tx, id, userId);
    if (isLibrary(playlist)) throw new PlaylistInputError(400, 'Liked Songs is your Library collection and cannot be deleted as a playlist.');
    let library = await tx.playlist.findFirst({ where: { userId, name: 'Liked Songs', sourceType: 'SYNCBEATS' }, include: { tracks: true } });
    if (songDisposition === 'keep' && playlist.tracks.length) {
      if (!library) library = await tx.playlist.create({ data: { userId, name: 'Liked Songs', sourceType: 'SYNCBEATS' }, include: { tracks: true } });
      const retained: Track[] = [...library.tracks];
      let position = library.tracks.reduce((last, track) => Math.max(last, track.position), -1) + 1;
      const retaining: Prisma.PlaylistTrackCreateManyInput[] = [];
      for (const track of playlist.tracks) {
        if (retained.some(existing => sameTrack(existing, track))) continue;
        retaining.push({ playlistId: library.id, songId: track.songId, youtubeId: track.youtubeId, title: track.title, artist: track.artist, thumbnail: track.thumbnail, position: position++ });
        retained.push(track);
      }
      if (retaining.length) await tx.playlistTrack.createMany({ data: retaining });
    } else if (songDisposition === 'remove' && library) {
      // Other playlists remain intact. Never delete the shared Song catalog/audio.
      const ids = library.tracks.filter(track => playlist.tracks.some(removing => sameTrack(track, removing))).map(track => track.id);
      if (ids.length) await tx.playlistTrack.deleteMany({ where: { playlistId: library.id, id: { in: ids } } });
    }
    await tx.playlist.delete({ where: { id } });
    const retainedLibrary = library ? await tx.playlist.findUnique({ where: { id: library.id }, include: { tracks: { orderBy: { position: 'asc' }, include: { song: true } } } }) : null;
    return { success: true, library: retainedLibrary };
  }, { timeout: 20_000, maxWait: 3_000 });
}

type IncomingTrack = { title: string; artist: string; youtubeId: string; thumbnail: string; album: string; albumArt: string; duration?: number };
export function playlistTracks(value: unknown): IncomingTrack[] {
  if (!Array.isArray(value) || !value.length || value.length > 200) throw new PlaylistInputError(400, 'Choose between 1 and 200 songs.');
  return value.map(item => {
    if (!item || typeof item !== 'object') throw new PlaylistInputError(400, 'Invalid song metadata.');
    const title = clean(item.title), youtubeId = clean(item.youtubeId);
    if (!title || title.length > 500 || (youtubeId && !/^[A-Za-z0-9_-]{11}$/.test(youtubeId))) throw new PlaylistInputError(400, 'Invalid song title or YouTube identity.');
    const duration = item.duration;
    if (duration != null && (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0 || duration > 604800)) throw new PlaylistInputError(400, 'Invalid song duration.');
    return { title, artist: clean(item.artist) || 'Unknown', youtubeId, thumbnail: clean(item.thumbnail), album: clean(item.album), albumArt: clean(item.albumArt), duration: duration == null ? undefined : Math.round(duration) };
  });
}

export async function addManagedPlaylistTracks(id: string, userId: string, value: unknown) {
  const tracks = playlistTracks(value);
  return prisma.$transaction(async tx => {
    const playlist = await owned(tx, id, userId);
    let position = playlist.tracks.reduce((last, track) => Math.max(last, track.position), -1) + 1;
    const known = new Set(playlist.tracks.map(trackIdentity));
    const videos = new Set(playlist.tracks.map(track => track.youtubeId).filter(Boolean));
    let added = 0;
    for (const track of tracks) {
      if (track.youtubeId && videos.has(track.youtubeId)) continue;
      // Metadata-only Apple Music selections do not invoke matching or playback.
      const song = await tx.song.upsert({
        where: { title_artist: { title: track.title, artist: track.artist } },
        update: {},
        create: { title: track.title, artist: track.artist, youtubeId: track.youtubeId || null, youtubeThumbnail: track.thumbnail || null, album: track.album || null, albumArt: track.albumArt || null, duration: track.duration },
      });
      const missing = {
        ...(!song.album && track.album ? { album: track.album } : {}),
        ...(!song.albumArt && track.albumArt ? { albumArt: track.albumArt } : {}),
        ...(!song.youtubeId && track.youtubeId ? { youtubeId: track.youtubeId } : {}),
        ...(!song.youtubeThumbnail && track.thumbnail ? { youtubeThumbnail: track.thumbnail } : {}),
        ...(song.duration == null && track.duration != null ? { duration: track.duration } : {}),
      };
      if (Object.keys(missing).length) await tx.song.update({ where: { id: song.id }, data: missing });
      const key = trackIdentity({ ...track, songId: song.id });
      if (known.has(key) || (track.youtubeId && videos.has(track.youtubeId))) continue;
      await tx.playlistTrack.create({ data: { playlistId: id, songId: song.id, title: song.title, artist: song.artist, youtubeId: track.youtubeId || song.youtubeId || '', thumbnail: track.thumbnail || song.albumArt || song.youtubeThumbnail, position: position++ } });
      known.add(key); if (track.youtubeId) videos.add(track.youtubeId); added++;
    }
    await tx.playlist.update({ where: { id }, data: { updatedAt: new Date() } });
    const updated = await tx.playlist.findUniqueOrThrow({ where: { id }, include: { tracks: { orderBy: { position: 'asc' }, include: { song: true } } } });
    return { success: true, added, playlist: updated };
  }, { timeout: 20_000, maxWait: 3_000 });
}
