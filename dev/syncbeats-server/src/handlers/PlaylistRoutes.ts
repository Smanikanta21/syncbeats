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
  const song = await prisma.song.upsert({
    where: { title_artist: { title: body.title, artist: body.artist || 'Unknown' } },
    update: {
      ...(body.youtubeId ? { youtubeId: body.youtubeId } : {}),
      ...(body.thumbnail ? { youtubeThumbnail: body.thumbnail } : {}),
      ...(body.duration ? { duration: Math.round(body.duration) } : {}),
    },
    create: {
      title: body.title,
      artist: body.artist || 'Unknown',
      youtubeId: body.youtubeId || null,
      youtubeThumbnail: body.thumbnail || null,
      duration: body.duration ? Math.round(body.duration) : null,
    },
  });

  const last = await prisma.playlistTrack.findFirst({
    where: { playlistId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  return prisma.playlistTrack.create({
    data: {
      playlistId,
      songId: song.id,
      youtubeId: body.youtubeId || song.youtubeId || '',
      title: song.title,
      artist: song.artist,
      thumbnail: body.thumbnail || song.youtubeThumbnail || song.albumArt || null,
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
