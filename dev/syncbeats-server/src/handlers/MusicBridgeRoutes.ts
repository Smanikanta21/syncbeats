import { Router, Request, Response } from 'express';
import { MusicBridgeService } from '../services/MusicBridgeService';
import { requireAuth } from '../auth/authMiddleware';
import prisma from '../db/prisma';
import ytSearch from 'yt-search';
import play from 'play-dl';

// Fallback search using RapidAPI with multi-key rotation, and play-dl as the ultimate fallback
export async function matchToYouTubeFallback(title: string, artist: string): Promise<{ youtubeId: string; thumbnail: string } | null> {
  // 1. Intelligent RapidAPI Key Rotation
  const keysStr = process.env.RAPID_API_KEYS || process.env.RAPID_API_KEY;
  if (keysStr) {
    const keys = keysStr.split(',').map(k => k.trim()).filter(Boolean);
    const shuffledKeys = keys.sort(() => 0.5 - Math.random());
    const q = encodeURIComponent(`${artist} - ${title} official audio`);

    for (const key of shuffledKeys) {
      try {
        const res = await fetch(
          `https://youtube-search-and-download.p.rapidapi.com/search?query=${q}&type=v&sort=r&duration=m`,
          {
            headers: {
              'X-RapidAPI-Key':  key,
              'X-RapidAPI-Host': 'youtube-search-and-download.p.rapidapi.com',
            },
          }
        );
        
        if (res.status === 429 || res.status === 403) {
          console.warn(`[BridgeRoutes] RapidAPI key ${key.substring(0, 5)}... failed with ${res.status}. Trying next...`);
          continue; 
        }

        if (res.ok) {
          const data: any = await res.json();
          const item = data?.contents?.[0]?.video;
          if (item?.videoId) {
            return {
              youtubeId: item.videoId,
              thumbnail: item.thumbnails?.[0]?.url || `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`,
            };
          }
        }
      } catch (e) {
        console.warn(`[BridgeRoutes] RapidAPI network error. Trying next key...`);
      }
    }
  }

  // 2. Ultimate Fallback: play-dl (if all RapidAPI keys fail or none exist)
  try {
    const searchStr = `${title} ${artist} audio`;
    const ytResult = await play.search(searchStr, { limit: 1 });
    
    if (ytResult.length > 0) {
      const video = ytResult[0];
      return {
        youtubeId: video.id || '',
        thumbnail: video.thumbnails?.[0]?.url || `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`,
      };
    }
    return null;
  } catch (error) {
    console.error(`[BridgeRoutes] play-dl fallback error:`, error);
    return null;
  }
}

export function createMusicBridgeRoutes(): Router {
  const router = Router();

  /**
   * POST /api/bridge/import
   * Body: { playlistUrl: string, playlistName?: string }
   * 
   * Imports a Spotify public playlist. Instantly creates Song records in the
   * global catalog and links them via PlaylistTrack. YouTube IDs are resolved
   * separately via client-side scraper (Tier 2) or server fallback (Tier 3).
   */
  router.post('/import', requireAuth, async (req: any, res: any): Promise<void> => {
    try {
      const { playlistUrl } = req.body;

      if (!playlistUrl) {
        res.status(400).json({ error: 'playlistUrl is required.' });
        return;
      }

      console.log(`[BridgeRoutes] Received request to import playlist: ${playlistUrl}`);

      // 1. Get playlist metadata (credential-free via scraping)
      const { name, coverUrl, tracks } = await MusicBridgeService.getPlaylistMetadata(playlistUrl);

      if (tracks.length === 0) {
        res.status(404).json({ error: 'No tracks found or could not read playlist.' });
        return;
      }

      const playlistName = req.body.playlistName || name || 'Imported Spotify Playlist';

      // 2. Create the playlist in DB
      const playlist = await prisma.playlist.create({
        data: {
          userId:     req.user.sub,
          name:       playlistName,
          coverUrl:   coverUrl,
          sourceType: 'SPOTIFY_BRIDGE',
          sourceId:   playlistUrl,
        },
      });

      // 3. For each track, upsert into the global Song catalog, then link via PlaylistTrack
      const trackOps = tracks.map(async (track: any, i: number) => {
        // Upsert by title + artist — if a previous user already imported this song, reuse the Song record
        const song = await prisma.song.upsert({
          where: { title_artist: { title: track.title, artist: track.artist } },
          update: {
            // Update album art if we have a better URL
            ...(track.artworkUrl ? { albumArt: track.artworkUrl } : {}),
          },
          create: {
            title:    track.title,
            artist:   track.artist,
            albumArt: track.artworkUrl || null,
            // youtubeId is intentionally left null — resolved later via 3-tier resolution
          },
        });

        // Create PlaylistTrack linking to the Song
        return prisma.playlistTrack.create({
          data: {
            playlistId: playlist.id,
            songId:     song.id,
            youtubeId:  song.youtubeId || '',  // Use already-resolved YT ID if available
            title:      song.title,
            artist:     song.artist,
            thumbnail:  song.youtubeThumbnail || song.albumArt || null,
            position:   i,
          },
        });
      });

      await Promise.all(trackOps);

      res.status(200).json({
        ok:          true,
        playlistId:  playlist.id,
        totalTracks: tracks.length,
      });
      return;
    } catch (error: any) {
      console.error('[BridgeRoutes] Error importing playlist:', error);
      res.status(500).json({ 
        error: 'Failed to import playlist.',
        details: error.message 
      });
      return;
    }
  });

  /**
   * POST /api/bridge/resolve
   * Body: { trackId?: string, songId?: string, title: string, artist: string }
   * 
   * 3-Tier resolution:
   * Tier 1: Check global Song catalog first (DB cache, no YouTube call)
   * Tier 2: Client-side scraper (handled in Swift, not here)
   * Tier 3: Server-side fallback using yt-search / RapidAPI
   */
  router.post('/resolve', requireAuth, async (req: any, res: any): Promise<void> => {
    try {
      const { trackId, songId, title, artist } = req.body;
      if (!title) {
        res.status(400).json({ error: 'title is required.' });
        return;
      }

      // --- TIER 1: Check global Song catalog ---
      const existingSong = await prisma.song.findFirst({
        where: {
          title:  { equals: title, mode: 'insensitive' },
          artist: { equals: artist || '', mode: 'insensitive' },
          youtubeId: { not: null },
        },
      });

      if (existingSong?.youtubeId) {
        console.log(`[BridgeRoutes] Tier 1 hit for "${title}" — served from Song catalog!`);
        // Also update the PlaylistTrack if provided
        if (trackId) {
          await prisma.playlistTrack.update({
            where: { id: trackId },
            data: {
              youtubeId: existingSong.youtubeId,
              thumbnail: existingSong.youtubeThumbnail || existingSong.albumArt || undefined,
              songId:    existingSong.id,
            },
          }).catch((e: unknown) => console.warn('[BridgeRoutes] PlaylistTrack update failed:', e));
        }
        return res.status(200).json({
          ok:        true,
          tier:      1,
          youtubeId: existingSong.youtubeId,
          thumbnail: existingSong.youtubeThumbnail || existingSong.albumArt,
        });
      }

      // --- TIER 3: Server-Side Fallback (Tier 2 = Swift client-side, handled separately) ---
      console.log(`[BridgeRoutes] Tier 3 resolving: ${title} - ${artist}`);
      const ytResult = await matchToYouTubeFallback(title, artist || '');

      if (!ytResult || !ytResult.youtubeId) {
        res.status(404).json({ error: 'Could not resolve track to YouTube.' });
        return;
      }

      // Save result back to global Song catalog
      const targetSongId = songId || (existingSong?.id);
      if (targetSongId) {
        await prisma.song.update({
          where: { id: targetSongId },
          data: {
            youtubeId:        ytResult.youtubeId,
            youtubeThumbnail: ytResult.thumbnail,
            resolvedAt:       new Date(),
          },
        }).catch((e: unknown) => console.warn('[BridgeRoutes] Song update failed:', e));
      }

      // Save to PlaylistTrack if provided
      if (trackId) {
        await prisma.playlistTrack.update({
          where: { id: trackId },
          data: {
            youtubeId: ytResult.youtubeId,
            thumbnail: ytResult.thumbnail,
            ...(targetSongId ? { songId: targetSongId } : {}),
          },
        }).catch((e: unknown) => console.warn('[BridgeRoutes] PlaylistTrack update failed:', e));
      }

      res.status(200).json({
        ok:        true,
        tier:      3,
        youtubeId: ytResult.youtubeId,
        thumbnail: ytResult.thumbnail,
      });
    } catch (error: any) {
      console.error('[BridgeRoutes] Error resolving track:', error);
      res.status(500).json({ error: 'Failed to resolve track.' });
    }
  });

  /**
   * PATCH /api/bridge/songs/:songId
   * Body: { youtubeId: string, thumbnail: string, trackId?: string }
   * 
   * Called by the Mac App after a successful client-side (Tier 2) YouTube scrape.
   * Saves the resolved data to the global Song catalog and optionally updates a PlaylistTrack.
   */
  router.patch('/songs/:songId', requireAuth, async (req: any, res: any): Promise<void> => {
    try {
      const { songId } = req.params;
      const { youtubeId, thumbnail, trackId } = req.body;

      if (!youtubeId) {
        res.status(400).json({ error: 'youtubeId is required.' });
        return;
      }

      // Update the global Song catalog (Tier 2 result)
      await prisma.song.update({
        where: { id: songId },
        data: {
          youtubeId,
          youtubeThumbnail: thumbnail || null,
          resolvedAt:       new Date(),
        },
      });

      console.log(`[BridgeRoutes] Tier 2 client resolved songId=${songId} → youtubeId=${youtubeId}`);

      // Optionally update the specific PlaylistTrack too
      if (trackId) {
        await prisma.playlistTrack.update({
          where: { id: trackId },
          data: { youtubeId, thumbnail: thumbnail || undefined, songId },
        }).catch((e: unknown) => console.warn('[BridgeRoutes] PlaylistTrack update failed:', e));
      }

      // Also update ALL playlist tracks that reference this song (cascade update)
      await prisma.playlistTrack.updateMany({
        where: { songId, youtubeId: '' },
        data: { youtubeId, thumbnail: thumbnail || undefined },
      });

      res.status(200).json({ ok: true });
    } catch (error: any) {
      console.error('[BridgeRoutes] Error saving client-resolved song:', error);
      res.status(500).json({ error: 'Failed to save resolution.' });
    }
  });

  return router;
}
