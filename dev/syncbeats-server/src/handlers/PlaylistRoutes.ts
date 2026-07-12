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

    res.json({ playlist });
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

export default router;
