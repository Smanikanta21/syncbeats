import { Router, Request, Response } from 'express';
import { MusicBridgeService } from '../services/MusicBridgeService';
import { requireAuth } from '../auth/authMiddleware';
import prisma from '../db/prisma';
import ytSearch from 'yt-search';
import play from 'play-dl';

// Fallback search using RapidAPI with multi-key rotation, and play-dl as the ultimate fallback
export async function matchToYouTubeFallback(title: string, artist: string): Promise<{ youtubeId: string; thumbnail: string } | null> {
  // 1. Try yt-search (free, instant, no API keys or 403 limits)
  try {
    const searchStr = `${artist} - ${title} official audio`;
    const r = await ytSearch(searchStr);
    const video = r.videos?.[0];
    if (video?.videoId) {
      return {
        youtubeId: video.videoId,
        thumbnail: video.thumbnail || `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`,
      };
    }
  } catch (e) {
    // Fall back to RapidAPI / play-dl if yt-search fails
  }

  // 2. Intelligent RapidAPI Key Rotation
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
        // next
      }
    }
  }

  // 3. Ultimate Fallback: play-dl
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
    return null;
  }
}

// Fetch a track's real album cover via Spotify's free oEmbed endpoint (no API key).
async function fetchTrackArtwork(spotifyId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${spotifyId}`);
    if (!res.ok) return null;
    const data: any = await res.json();
    return data.thumbnail_url || null;
  } catch {
    return null;
  }
}

// Replace shared playlist-cover placeholders with per-track album art. Runs post-response,
// so any failure here must never propagate to the import request.
async function backfillTrackArtwork(songs: { songId: string; spotifyId?: string }[]): Promise<void> {
  const targets = songs.filter((s) => s.spotifyId);
  const BATCH = 5;
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    await Promise.all(batch.map(async (s) => {
      try {
        const artUrl = await fetchTrackArtwork(s.spotifyId as string);
        if (artUrl) {
          await prisma.song.update({ where: { id: s.songId }, data: { albumArt: artUrl } });
        }
      } catch (e) {
        console.warn(`[BridgeRoutes] Artwork backfill failed for song ${s.songId}:`, (e as Error).message);
      }
    }));
  }
}

// Enrich songs with album name + high-res artwork via the free iTunes Search API.
// Runs as a background task after import response is sent.
async function enrichFromItunes(
  songs: { songId: string; title: string; artist: string; spotifyId?: string }[],
  playlistId: string
): Promise<void> {
  console.log(`[Enrich] Starting iTunes enrichment for ${songs.length} songs...`);
  const BATCH = 5;
  let enriched = 0;

  for (let i = 0; i < songs.length; i += BATCH) {
    const batch = songs.slice(i, i + BATCH);
    await Promise.all(batch.map(async (s) => {
      try {
        const hasUnknownArtist = !s.artist || s.artist === 'Unknown' || s.artist === 'Unknown Artist';
        const q = encodeURIComponent(hasUnknownArtist ? s.title : `${s.title} ${s.artist}`);
        const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`);
        if (!res.ok) return;
        const data: any = await res.json();
        const result = data.results?.[0];
        if (!result) return;

        const album = result.collectionName || null;
        const artworkUrl = result.artworkUrl100
          ? result.artworkUrl100.replace('100x100', '600x600')
          : null;
        const duration = result.trackTimeMillis
          ? Math.round(result.trackTimeMillis / 1000)
          : undefined;
        const resolvedArtist = result.artistName || null;

        // Update the Song record
        await prisma.song.update({
          where: { id: s.songId },
          data: {
            ...(album ? { album } : {}),
            ...(artworkUrl ? { albumArt: artworkUrl } : {}),
            ...(duration ? { duration } : {}),
            ...(hasUnknownArtist && resolvedArtist ? { artist: resolvedArtist } : {}),
          },
        });

        // Also update PlaylistTrack thumbnails & artist for this playlist
        if (artworkUrl || (hasUnknownArtist && resolvedArtist)) {
          await prisma.playlistTrack.updateMany({
            where: { songId: s.songId },
            data: {
              ...(artworkUrl ? { thumbnail: artworkUrl } : {}),
              ...(hasUnknownArtist && resolvedArtist ? { artist: resolvedArtist } : {}),
            },
          });
        }

        enriched++;
        console.log(`[Enrich] ${s.title} — album="${album}", art=${artworkUrl ? 'YES' : 'NO'}`);
      } catch (e) {
        console.warn(`[Enrich] Failed for "${s.title}":`, (e as Error).message);
      }
    }));
  }
  console.log(`[Enrich] Done — enriched ${enriched}/${songs.length} songs`);
}

// Resolve YouTube IDs for songs that don't have one yet.
// Runs as a background task after import response is sent.
async function resolveYouTubeIds(
  songs: { songId: string; title: string; artist: string }[],
  playlistId: string
): Promise<void> {
  console.log(`[Resolve] Starting YouTube resolution for ${songs.length} songs...`);
  let resolved = 0;

  // Process sequentially to avoid hammering YouTube / RapidAPI
  for (const s of songs) {
    try {
      const result = await matchToYouTubeFallback(s.title, s.artist);
      if (!result?.youtubeId) continue;

      // Update Song catalog
      await prisma.song.update({
        where: { id: s.songId },
        data: {
          youtubeId:        result.youtubeId,
          youtubeThumbnail: result.thumbnail,
          resolvedAt:       new Date(),
        },
      });

      // Update all PlaylistTracks referencing this song in this playlist
      await prisma.playlistTrack.updateMany({
        where: { songId: s.songId, playlistId },
        data: {
          youtubeId: result.youtubeId,
          thumbnail: result.thumbnail,
        },
      });

      resolved++;
      console.log(`[Resolve] ${s.title} — ${result.youtubeId}`);
    } catch (e) {
      console.warn(`[Resolve] Failed for "${s.title}":`, (e as Error).message);
    }
  }
  console.log(`[Resolve] Done — resolved ${resolved}/${songs.length} songs`);
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

      const t0 = Date.now();
      console.log(`[Import] Starting import: ${playlistUrl}`);

      // 1. Get playlist metadata (credential-free via scraping)
      const { name, coverUrl, tracks } = await MusicBridgeService.getPlaylistMetadata(playlistUrl);
      console.log(`[Import] Scraped ${tracks.length} tracks in ${Date.now() - t0}ms`);

      if (tracks.length === 0) {
        res.status(404).json({ error: 'No tracks found or could not read playlist.' });
        return;
      }

      const playlistName = req.body.playlistName || name || 'Imported Spotify Playlist';

      // 2. Batch pre-check: find ALL songs that already exist in our DB
      //    This avoids N individual upsert round-trips for repeat imports.
      const spotifyIds = tracks.map((t: any) => t.spotifyTrackId).filter(Boolean);
      const titleArtistPairs = tracks.map((t: any) => ({ title: t.title, artist: t.artist }));

      const existingSongs = await prisma.song.findMany({
        where: {
          OR: [
            ...(spotifyIds.length > 0 ? [{ spotifyId: { in: spotifyIds } }] : []),
            ...titleArtistPairs.map((p: any) => ({ title: p.title, artist: p.artist })),
          ],
        },
      });

      // Build fast lookup maps
      const bySpotifyId = new Map<string, typeof existingSongs[0]>();
      const byTitleArtist = new Map<string, typeof existingSongs[0]>();
      for (const s of existingSongs) {
        if (s.spotifyId) bySpotifyId.set(s.spotifyId, s);
        byTitleArtist.set(`${s.title}|||${s.artist}`.toLowerCase(), s);
      }

      console.log(`[Import] Found ${existingSongs.length} existing songs in DB (of ${tracks.length} total)`);

      // 3. Create the playlist in DB
      const playlist = await prisma.playlist.create({
        data: {
          userId:     req.user.sub,
          name:       playlistName,
          coverUrl:   coverUrl,
          sourceType: 'SPOTIFY_BRIDGE',
          sourceId:   playlistUrl,
        },
      });

      // 4. Process each track: reuse existing Song or create new one, then link via PlaylistTrack
      const needsYouTube: { songId: string; title: string; artist: string }[] = [];
      const needsEnrichment: { songId: string; title: string; artist: string; spotifyId?: string }[] = [];
      const playlistTrackData: any[] = [];

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const key = `${track.title}|||${track.artist}`.toLowerCase();

        // Try to find existing song
        let song = (track.spotifyTrackId ? bySpotifyId.get(track.spotifyTrackId) : undefined)
                   || byTitleArtist.get(key);

        if (song) {
          // Existing song — update spotifyId if we have a better one
          if (track.spotifyTrackId && !song.spotifyId) {
            await prisma.song.update({
              where: { id: song.id },
              data: { spotifyId: track.spotifyTrackId },
            }).catch(() => {});
          }
        } else {
          // New song — create it
          song = await prisma.song.create({
            data: {
              title:     track.title,
              artist:    track.artist,
              albumArt:  track.artworkUrl || null,
              album:     track.album || null,
              spotifyId: track.spotifyTrackId || null,
              duration:  track.duration_ms ? Math.round(track.duration_ms / 1000) : null,
            },
          });
          // New songs always need enrichment
          needsEnrichment.push({
            songId: song.id,
            title: track.title,
            artist: track.artist,
            spotifyId: track.spotifyTrackId,
          });
        }

        // Queue for YouTube resolution if missing
        if (!song.youtubeId) {
          needsYouTube.push({ songId: song.id, title: song.title, artist: song.artist });
        }

        // Queue for enrichment if album is missing (even for existing songs)
        if (!song.album) {
          const alreadyQueued = needsEnrichment.some(e => e.songId === song!.id);
          if (!alreadyQueued) {
            needsEnrichment.push({
              songId: song.id,
              title: song.title,
              artist: song.artist,
              spotifyId: song.spotifyId || track.spotifyTrackId,
            });
          }
        }

        playlistTrackData.push({
          playlistId: playlist.id,
          songId:     song.id,
          youtubeId:  song.youtubeId || '',
          title:      song.title,
          artist:     song.artist,
          thumbnail:  song.youtubeThumbnail || song.albumArt || null,
          position:   i,
        });
      }

      // 5. Batch insert all PlaylistTracks in one query
      await prisma.playlistTrack.createMany({ data: playlistTrackData });

      const elapsed = Date.now() - t0;
      const reused = tracks.length - needsEnrichment.filter(e => !existingSongs.find(s => s.id === e.songId)).length;
      console.log(`[Import] Done in ${elapsed}ms — ${existingSongs.length} reused, ${needsYouTube.length} need YouTube, ${needsEnrichment.length} need enrichment`);

      res.status(200).json({
        ok:          true,
        playlistId:  playlist.id,
        totalTracks: tracks.length,
        reusedFromDB: existingSongs.length,
        elapsed,
      });

      // 6. Fire-and-forget background tasks (after response is sent)

      // 6a. Enrich missing album + artwork via iTunes Search API (fast, no API key)
      if (needsEnrichment.length > 0) {
        void enrichFromItunes(needsEnrichment, playlist.id);
      }

      // 6b. Resolve missing YouTube IDs via RapidAPI / play-dl
      if (needsYouTube.length > 0) {
        void resolveYouTubeIds(needsYouTube, playlist.id);
      }

      return;
    } catch (error: any) {
      console.error('[BridgeRoutes] Error importing playlist:', error);
      if (error.code === 'PLAYLIST_PRIVATE') {
        res.status(422).json({ error: error.message, code: 'PLAYLIST_PRIVATE' });
        return;
      }
      res.status(500).json({
        error: 'Failed to import playlist.',
        details: error.message
      });
      return;
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // POST /api/bridge/backfill-artwork
  // Finds songs with shared or missing album art and fetches individual
  // covers via Spotify oEmbed. No API key needed.
  // ─────────────────────────────────────────────────────────────────────
  router.post('/backfill-artwork', requireAuth, async (req: any, res: any): Promise<void> => {
    try {
      // 1. Fetch all songs
      const allSongs = await prisma.song.findMany({
        select: { id: true, title: true, artist: true, spotifyId: true, albumArt: true },
      });

      // 2. Detect shared playlist covers (URLs used by 3+ songs)
      const artCounts = new Map<string, number>();
      for (const s of allSongs) {
        if (s.albumArt) {
          artCounts.set(s.albumArt, (artCounts.get(s.albumArt) || 0) + 1);
        }
      }
      const sharedCovers = new Set<string>();
      for (const [url, count] of artCounts) {
        if (count >= 3) sharedCovers.add(url);
      }

      // 3. Filter songs that need updating
      const needsUpdate = allSongs.filter(s =>
        !s.albumArt || sharedCovers.has(s.albumArt)
      );

      if (needsUpdate.length === 0) {
        res.json({ ok: true, updated: 0, message: 'All songs already have unique album art.' });
        return;
      }

      // 4. Batch fetch from Spotify oEmbed
      let updated = 0;
      const BATCH = 5;

      for (let i = 0; i < needsUpdate.length; i += BATCH) {
        const batch = needsUpdate.slice(i, i + BATCH);
        await Promise.all(batch.map(async (song) => {
          try {
            let artUrl: string | null = null;

            // If we have a spotifyId, use it directly
            if (song.spotifyId) {
              const oRes = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${song.spotifyId}`);
              if (oRes.ok) {
                const data: any = await oRes.json();
                artUrl = data.thumbnail_url || null;
              }
            }

            // Fallback: search Spotify embed for the track
            if (!artUrl) {
              const q = encodeURIComponent(`${song.artist} ${song.title}`);
              const searchUrl = `https://open.spotify.com/oembed?url=https://open.spotify.com/search/${q}`;
              // oEmbed doesn't support search URLs, so use the embed search page instead
              const embedRes = await fetch(`https://open.spotify.com/embed/track/${song.spotifyId || ''}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
              });
              if (embedRes.ok) {
                const html = await embedRes.text();
                const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
                if (m) {
                  const nd = JSON.parse(m[1]);
                  const entity = nd?.props?.pageProps?.state?.data?.entity;
                  if (entity?.coverArt?.sources?.[0]?.url) {
                    artUrl = entity.coverArt.sources[0].url;
                  }
                }
              }
            }

            if (artUrl) {
              await prisma.song.update({ where: { id: song.id }, data: { albumArt: artUrl } });
              updated++;
              console.log(`[Backfill] ✓ ${song.title} — ${song.artist}`);
            }
          } catch (e) {
            console.warn(`[Backfill] ✗ ${song.title}: ${(e as Error).message}`);
          }
        }));
      }

      res.json({ ok: true, updated, total: needsUpdate.length });
    } catch (error: any) {
      console.error('[BridgeRoutes] Backfill error:', error);
      res.status(500).json({ error: 'Backfill failed', details: error.message });
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
