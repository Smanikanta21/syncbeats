import { Prisma } from '@prisma/client';
import prisma from '../db/prisma';
import { PlaylistInputError } from './PlaylistManagement';

export function pageInput(query: Record<string, unknown>) {
  const offset = Number(query.cursor ?? 0), limit = Number(query.limit ?? 60);
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new PlaylistInputError(400, 'Invalid Library page.');
  return { offset, limit };
}
export async function playlistIndex(userId: string, query: Record<string, unknown>) {
  const { offset, limit } = pageInput(query);
  const rows = await prisma.playlist.findMany({ where: { userId }, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: offset, take: limit + 1,
    include: { _count: { select: { tracks: true } }, tracks: { take: 1, orderBy: { position: 'asc' }, include: { song: true } } } });
  const ids = await prisma.$queryRaw<{ video: string }[]>(Prisma.sql`SELECT DISTINCT COALESCE(NULLIF(s.youtube_id, ''), NULLIF(t.youtube_id, '')) AS video FROM playlist_tracks t JOIN playlists p ON p.id=t.playlist_id LEFT JOIN songs s ON s.id=t.song_id WHERE p.user_id=${userId} AND COALESCE(NULLIF(s.youtube_id, ''), NULLIF(t.youtube_id, '')) IS NOT NULL`);
  return { playlists: rows.slice(0, limit).map(p => ({ ...p, trackCount: p._count.tracks, preview: p.tracks[0] ?? null, tracks: undefined })), nextCursor: rows.length > limit ? String(offset + limit) : null, savedYoutubeIDs: ids.map(row => row.video) };
}
export async function playlistTrackPage(userId: string, id: string, query: Record<string, unknown>) {
  const { offset, limit } = pageInput(query);
  const playlist = await prisma.playlist.findFirst({ where: { id, userId }, include: { _count: { select: { tracks: true } } } });
  if (!playlist) throw new PlaylistInputError(404, 'Playlist not found.');
  const tracks = await prisma.playlistTrack.findMany({ where: { playlistId: id }, orderBy: [{ position: 'asc' }, { id: 'asc' }], skip: offset, take: limit + 1, include: { song: true } });
  return { playlist: { ...playlist, trackCount: playlist._count.tracks, tracks: tracks.slice(0, limit) }, nextCursor: tracks.length > limit ? String(offset + limit) : null };
}

export async function libraryCatalog(userId: string, query: Record<string, unknown>) {
  const { offset, limit } = pageInput(query);
  const view = query.view ?? 'songs';
  if (!['songs', 'albums', 'artists'].includes(String(view))) throw new PlaylistInputError(400, 'Invalid Library view.');
  const text = typeof query.q === 'string' ? query.q.trim().slice(0, 200) : '';
  const album = typeof query.album === 'string' ? query.album : null;
  const artist = typeof query.artist === 'string' ? query.artist : null;
  const catalog = Prisma.sql`WITH catalog AS (
    SELECT DISTINCT ON (COALESCE(NULLIF(s.youtube_id,''), NULLIF(t.youtube_id,''), t.song_id, t.id))
      'catalog:' || COALESCE(s.id,t.id) AS id, s.id AS "sourceSongID", COALESCE(s.title,t.title) AS title,
      COALESCE(s.artist,t.artist,'') AS artist, s.album, s.album_art AS artwork,
      COALESCE(s.youtube_thumbnail,t.thumbnail) AS thumbnail, s.duration,
      COALESCE(NULLIF(s.youtube_id,''),NULLIF(t.youtube_id,'')) AS "youtubeID", p.source_type AS source
    FROM playlist_tracks t JOIN playlists p ON p.id=t.playlist_id LEFT JOIN songs s ON s.id=t.song_id
    WHERE p.user_id=${userId}
    ORDER BY COALESCE(NULLIF(s.youtube_id,''),NULLIF(t.youtube_id,''),t.song_id,t.id), t.created_at DESC
  )`;
  if (view === 'songs') {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`${catalog}
      SELECT *, COUNT(*) OVER()::int AS total FROM catalog
      WHERE (${text}='' OR title ILIKE ${'%' + text + '%'} OR artist ILIKE ${'%' + text + '%'})
      AND (${album}::text IS NULL OR LOWER(TRIM(album))=LOWER(TRIM(${album}::text)))
      AND (${artist}::text IS NULL OR LOWER(TRIM(artist))=LOWER(TRIM(${artist}::text)))
      ORDER BY LOWER(title),id LIMIT ${limit + 1} OFFSET ${offset}`);
    return { songs: rows.slice(0, limit), total: rows[0]?.total ?? 0, nextCursor: rows.length > limit ? String(offset + limit) : null };
  }
  const groupBy = view === 'albums' ? Prisma.sql`LOWER(TRIM(album)),LOWER(TRIM(artist))` : Prisma.sql`LOWER(TRIM(artist))`;
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`${catalog}, groups AS (
    SELECT MIN(artist) AS artist, ${view === 'albums' ? Prisma.sql`MIN(album)` : Prisma.sql`NULL::text`} AS album,
      COUNT(*)::int AS count, (ARRAY_AGG(ROW_TO_JSON(catalog) ORDER BY CASE WHEN artwork ~* '^https?://' THEN 0 WHEN thumbnail ~* '^https?://' THEN 1 ELSE 2 END, LOWER(title),id))[1] AS preview
    FROM catalog WHERE artist<>'' AND (${view !== 'albums'} OR COALESCE(TRIM(album),'')<>'')
    AND (${text}='' OR artist ILIKE ${'%' + text + '%'} OR COALESCE(album,'') ILIKE ${'%' + text + '%'})
    GROUP BY ${groupBy}
  ) SELECT *,COUNT(*) OVER()::int AS total FROM groups ORDER BY LOWER(COALESCE(album,artist)),artist LIMIT ${limit + 1} OFFSET ${offset}`);
  return { groups: rows.slice(0, limit), total: rows[0]?.total ?? 0, nextCursor: rows.length > limit ? String(offset + limit) : null };
}
