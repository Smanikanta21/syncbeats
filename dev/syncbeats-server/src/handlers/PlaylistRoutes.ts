import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/authMiddleware';
import prisma from '../db/prisma';

const router = Router();

// GET /api/playlists/:id - Fetch playlist and its tracks (with Song catalog data)
router.get('/:id', requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const userId = req.user.sub;

    const playlist = await prisma.playlist.findFirst({
      where: { id, userId },
      include: {
        tracks: {
          orderBy: { position: 'asc' },
          include: {
            song: {
              select: {
                id:               true,
                title:            true,
                artist:           true,
                youtubeId:        true,
                youtubeThumbnail: true,
                albumArt:         true,
                album:            true,
                duration:         true,
                genre:            true,
                resolvedAt:       true,
              }
            }
          }
        }
      }
    });

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found.' });
    }

    // Enrich each track: use Song.youtubeId if available, fall back to the
    // denormalized PlaylistTrack.youtubeId set during Spotify/import resolve.
    const enrichedPlaylist = {
      ...playlist,
      tracks: playlist.tracks.map(track => ({
        ...track,
        resolvedYoutubeId: track.song?.youtubeId || (track.youtubeId !== '' ? track.youtubeId : null),
        resolvedThumbnail: track.song?.youtubeThumbnail || track.thumbnail || null,
      }))
    };

    res.json({ playlist: enrichedPlaylist });
  } catch (error) {
    console.error('[PlaylistRoutes] Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// PUT /api/playlists/:id - Update playlist name/cover
router.put('/:id', requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { name, coverUrl } = req.body;
    const userId = req.user.sub;

    const playlist = await prisma.playlist.findFirst({
      where: { id, userId }
    });

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found.' });
    }

    const updated = await prisma.playlist.update({
      where: { id },
      data: {
        name: name !== undefined ? name : playlist.name,
        coverUrl: coverUrl !== undefined ? coverUrl : playlist.coverUrl
      }
    });

    res.json({ playlist: updated });
  } catch (error) {
    console.error('[PlaylistRoutes] Update error:', error);
    res.status(500).json({ error: 'Failed to update playlist' });
  }
});

// DELETE /api/playlists/:id - Delete playlist
router.delete('/:id', requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const userId = req.user.sub;

    const playlist = await prisma.playlist.findFirst({
      where: { id, userId }
    });

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found.' });
    }

    await prisma.playlist.delete({
      where: { id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[PlaylistRoutes] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
});

// DELETE /api/playlists/:id/tracks/:trackId - Delete track from playlist
router.delete('/:id/tracks/:trackId', requireAuth, async (req: any, res: any) => {
  try {
    const { id, trackId } = req.params;
    const userId = req.user.sub;

    // Verify ownership
    const playlist = await prisma.playlist.findFirst({
      where: { id, userId }
    });

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found.' });
    }

    await prisma.playlistTrack.delete({
      where: { id: trackId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[PlaylistRoutes] Delete track error:', error);
    res.status(500).json({ error: 'Failed to delete track' });
  }
});

// POST /api/playlists/:id/enrich - Refetch missing album art, artist names, and metadata for all tracks in a playlist
router.post('/:id/enrich', requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const userId = req.user.sub;

    const playlist = await prisma.playlist.findFirst({
      where: { id, userId },
      include: {
        tracks: {
          orderBy: { position: 'asc' },
          include: { song: true }
        }
      }
    });

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found.' });
    }

    console.log(`[PlaylistEnrich] Refetching metadata & artwork for playlist ${id} (${playlist.tracks.length} tracks)...`);
    let updatedCount = 0;

    const BATCH = 5;
    for (let i = 0; i < playlist.tracks.length; i += BATCH) {
      const batch = playlist.tracks.slice(i, i + BATCH);
      await Promise.all(batch.map(async (track) => {
        try {
          const song = track.song;
          const currentTitle = song?.title || track.title;
          const currentArtist = song?.artist || track.artist || 'Unknown';
          const hasUnknownArtist = !currentArtist || currentArtist === 'Unknown' || currentArtist === 'Unknown Artist';

          // Query iTunes Search API to fetch 600x600 artwork, artist name, and album title
          const q = encodeURIComponent(hasUnknownArtist ? currentTitle : `${currentArtist} ${currentTitle}`);
          const itRes = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`);
          
          let newArt: string | null = null;
          let newArtist: string | null = null;
          let newAlbum: string | null = null;

          if (itRes.ok) {
            const itData: any = await itRes.json();
            const result = itData.results?.[0];
            if (result) {
              if (result.artworkUrl100) {
                newArt = result.artworkUrl100.replace('100x100', '600x600');
              }
              if (result.artistName) newArtist = result.artistName;
              if (result.collectionName) newAlbum = result.collectionName;
            }
          }

          // If song record exists, update it
          if (song) {
            await prisma.song.update({
              where: { id: song.id },
              data: {
                ...(newArt ? { albumArt: newArt } : {}),
                ...(newArtist && hasUnknownArtist ? { artist: newArtist } : {}),
                ...(newAlbum ? { album: newAlbum } : {}),
              }
            }).catch(() => {});
          }

          // Update PlaylistTrack record
          await prisma.playlistTrack.update({
            where: { id: track.id },
            data: {
              ...(newArt || !track.thumbnail ? { thumbnail: newArt || track.thumbnail || playlist.coverUrl || null } : {}),
              ...(newArtist && hasUnknownArtist ? { artist: newArtist } : {}),
            }
          }).catch(() => {});

          updatedCount++;
        } catch (e) {
          console.warn(`[PlaylistEnrich] Track enrich failed for ${track.title}:`, e);
        }
      }));
    }

    // Fetch refreshed playlist with updated tracks
    const refreshed = await prisma.playlist.findFirst({
      where: { id, userId },
      include: {
        tracks: {
          orderBy: { position: 'asc' },
          include: { song: true }
        }
      }
    });

    const enrichedPlaylist = {
      ...refreshed,
      tracks: refreshed?.tracks.map(t => ({
        ...t,
        resolvedYoutubeId: t.song?.youtubeId || (t.youtubeId !== '' ? t.youtubeId : null),
        resolvedThumbnail: t.song?.youtubeThumbnail || t.song?.albumArt || t.thumbnail || refreshed.coverUrl || null,
      })) ?? []
    };

    res.json({ ok: true, playlist: enrichedPlaylist, updatedCount });
  } catch (error) {
    console.error('[PlaylistRoutes] Enrich error:', error);
    res.status(500).json({ error: 'Failed to enrich playlist' });
  }
});

// GET /api/playlists - List the user's playlists with track counts
router.get('/', requireAuth, async (req: any, res: any) => {
  try {
    const userId = req.user.sub;
    const playlists = await prisma.playlist.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { tracks: true } } },
    });

    res.json({
      playlists: playlists.map(p => ({
        id: p.id,
        name: p.name,
        trackCount: p._count.tracks,
      })),
    });
  } catch (error) {
    console.error('[PlaylistRoutes] List error:', error);
    res.status(500).json({ error: 'Failed to list playlists' });
  }
});

// Upsert a song into the global catalog and append it to a playlist.
async function addTrackToPlaylist(
  playlistId: string,
  body: { youtubeId?: string; title: string; artist?: string; thumbnail?: string; duration?: number }
) {
  const cleanStr = (s: any): string => (typeof s === 'string' ? s.replace(/\0/g, '').replace(/\u0000/g, '').trim() : '');
  const cleanTitle = cleanStr(body.title) || 'Unknown Track';
  const cleanArtist = cleanStr(body.artist) || 'Unknown';

  let song: any;
  try {
    song = await prisma.song.upsert({
      where: { title_artist: { title: cleanTitle, artist: cleanArtist } },
      update: {
        ...(body.youtubeId ? { youtubeId: cleanStr(body.youtubeId) } : {}),
        ...(body.thumbnail ? { youtubeThumbnail: cleanStr(body.thumbnail) } : {}),
        ...(body.duration ? { duration: Math.round(body.duration) } : {}),
      },
      create: {
        title: cleanTitle,
        artist: cleanArtist,
        youtubeId: cleanStr(body.youtubeId) || null,
        youtubeThumbnail: cleanStr(body.thumbnail) || null,
        duration: body.duration ? Math.round(body.duration) : null,
      },
    });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      song = await prisma.song.findFirst({
        where: { title: cleanTitle, artist: cleanArtist }
      });
    }
    if (!song) throw e;
  }

  const last = await prisma.playlistTrack.findFirst({
    where: { playlistId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  return prisma.playlistTrack.create({
    data: {
      playlistId,
      songId: song.id,
      youtubeId: cleanStr(body.youtubeId) || song.youtubeId || '',
      title: song.title,
      artist: song.artist,
      thumbnail: cleanStr(body.thumbnail) || song.youtubeThumbnail || song.albumArt || null,
      position: (last?.position ?? -1) + 1,
    },
  });
}

// POST /api/playlists/library/tracks - Add a track to the user's "Liked Songs" playlist
router.post('/library/tracks', requireAuth, async (req: any, res: any) => {
  try {
    const userId = req.user.sub;
    const { youtubeId, title, artist, thumbnail, duration } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    let library = await prisma.playlist.findFirst({
      where: { userId, name: 'Liked Songs', sourceType: 'SYNCBEATS' },
    });
    if (!library) {
      library = await prisma.playlist.create({
        data: { userId, name: 'Liked Songs', sourceType: 'SYNCBEATS' },
      });
    }

    const track = await addTrackToPlaylist(library.id, { youtubeId, title, artist, thumbnail, duration });
    res.json({ ok: true, playlistId: library.id, trackId: track.id });
  } catch (error) {
    console.error('[PlaylistRoutes] Add to library error:', error);
    res.status(500).json({ error: 'Failed to add to library' });
  }
});

// POST /api/playlists/:id/tracks - Add a track to a specific playlist
router.post('/:id/tracks', requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const userId = req.user.sub;
    const { youtubeId, title, artist, thumbnail, duration } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const playlist = await prisma.playlist.findFirst({ where: { id, userId } });
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found.' });
    }

    const track = await addTrackToPlaylist(id, { youtubeId, title, artist, thumbnail, duration });
    res.json({ ok: true, playlistId: id, trackId: track.id });
  } catch (error) {
    console.error('[PlaylistRoutes] Add track error:', error);
    res.status(500).json({ error: 'Failed to add track' });
  }
});

export default router;
