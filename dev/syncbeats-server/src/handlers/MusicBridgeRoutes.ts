import { Router, Request, Response } from 'express';
import { MusicBridgeService } from '../services/MusicBridgeService';
import { requireAuth } from '../auth/authMiddleware';
import prisma from '../db/prisma';
import ytSearch from 'yt-search';
import play from 'play-dl';

// Fallback search using RapidAPI with multi-key rotation, and play-dl as the ultimate fallback
export async function matchToYouTubeFallback(title: string, artist: string): Promise<{ youtubeId: string; thumbnail: string } | null> {
  // 1. Intelligent RapidAPI Key Rotation
  // Define keys as comma-separated in .env: RAPID_API_KEYS="key1,key2,key3"
  const keysStr = process.env.RAPID_API_KEYS || process.env.RAPID_API_KEY;
  if (keysStr) {
    const keys = keysStr.split(',').map(k => k.trim()).filter(Boolean);
    // Shuffle keys for random distribution, but we will iterate through all if they fail
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
        
        // If the key is out of quota (429) or unsubscribed (403), skip to the next key
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
   * Body: { playlistUrl: string }
   * 
   * This endpoint takes a Spotify public playlist URL, scrapes the tracks without using credentials,
   * searches YouTube for each track to get the youtubeId, and saves the playlist to the database.
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
      const tracks = await MusicBridgeService.getPlaylistMetadata(playlistUrl);

      if (tracks.length === 0) {
        res.status(404).json({ error: 'No tracks found or could not read playlist.' });
        return;
      }

      // We'll use the title of the first track or a generic name as we can't easily scrape the playlist name yet.
      // Wait, we can let the user name it in the UI and send it, or we can just name it "Imported Spotify Playlist".
      const playlistName = req.body.playlistName || 'Imported Spotify Playlist';

      // 2. Create the playlist in DB
      const playlist = await prisma.playlist.create({
        data: {
          userId:     req.user.sub,
          name:       playlistName,
          coverUrl:   tracks[0]?.artworkUrl || '',
          sourceType: 'SPOTIFY_BRIDGE',
          sourceId:   playlistUrl, // Use URL as sourceId for uniqueness
        },
      });



      // 3. Map tracks directly (Instant Import, no YouTube lookup yet)
      const toInsert = tracks.map((track, i) => ({
        playlistId: playlist.id,
        youtubeId:  '', // Left blank for Lazy-Load resolution during playback
        title:      track.title,
        artist:     track.artist,
        thumbnail:  track.artworkUrl,
        position:   i,
      }));

      // 4. Bulk-insert all tracks instantly
      await prisma.playlistTrack.createMany({ data: toInsert });

      res.status(200).json({
        ok:           true,
        playlistId:   playlist.id,
        totalTracks:  tracks.length,
        matchedTracks: toInsert.length,
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
   * Body: { trackId?: string, title: string, artist: string }
   * 
   * Lazily resolves a Spotify track to a YouTube videoId and updates the DB if trackId is provided.
   */
  router.post('/resolve', requireAuth, async (req: any, res: any): Promise<void> => {
    try {
      const { trackId, title, artist } = req.body;
      if (!title) {
        res.status(400).json({ error: 'title is required.' });
        return;
      }

      console.log(`[BridgeRoutes] JIT resolving track: ${title} - ${artist}`);
      const ytResult = await matchToYouTubeFallback(title, artist || '');

      if (!ytResult || !ytResult.youtubeId) {
        res.status(404).json({ error: 'Could not resolve track to YouTube.' });
        return;
      }

      // If a PlaylistTrack ID was provided, update it so we don't have to resolve it again
      if (trackId) {
        try {
          await prisma.playlistTrack.update({
            where: { id: trackId },
            data: { youtubeId: ytResult.youtubeId }
          });
        } catch (e) {
          console.warn(`[BridgeRoutes] Failed to update PlaylistTrack ${trackId} with youtubeId:`, e);
        }
      }

      res.status(200).json({
        ok: true,
        youtubeId: ytResult.youtubeId,
        thumbnail: ytResult.thumbnail
      });
    } catch (error: any) {
      console.error('[BridgeRoutes] Error resolving track:', error);
      res.status(500).json({ error: 'Failed to resolve track.' });
    }
  });

  return router;
}
