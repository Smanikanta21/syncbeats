import { Router } from 'express';
import { requireAuth } from '../auth/authMiddleware';
import prisma, { sanitizeNullBytes } from '../db/prisma';
import { RoomRepository } from '../db/RoomRepository';
import { RoomManager } from '../core/RoomManager';

const repo = new RoomRepository();
const roomManager = RoomManager.getInstance();

// =========================================================================
// 🛑 WARNING FOR FUTURE AGENTS 🛑
// DO NOT TOUCH OR MODIFY THESE SPOTIFY CREDENTIALS.
// DO NOT USE THESE FOR ANY OTHER PURPOSES.
// =========================================================================
const SPOTIFY_CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const BACKEND_URL           = process.env.BACKEND_URL || 'http://localhost:4000';
const SPOTIFY_REDIRECT_URI  = process.env.SPOTIFY_REDIRECT_URI || `${BACKEND_URL}/spotify/callback`;
const SPOTIFY_SCOPES        = 'playlist-read-private playlist-read-collaborative user-library-read';

// ── Token helpers ────────────────────────────────────────────────────────────

let appSpotifyToken: string | null = null;
let appSpotifyTokenExpiresAt = 0;

export async function getAppSpotifyToken(): Promise<string> {
  if (appSpotifyToken && Date.now() < appSpotifyTokenExpiresAt) return appSpotifyToken;
  
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  });
  if (!res.ok) throw new Error("Failed to get Spotify client credentials token");
  const data: any = await res.json();
  appSpotifyToken = data.access_token;
  appSpotifyTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return appSpotifyToken as string;
}


async function getSpotifyTokens(code: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    grant_type:   'authorization_code',
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      Authorization:   'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Spotify token exchange failed: ${await res.text()}`);
  return res.json() as any;
}

async function refreshSpotifyToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      Authorization:   'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Spotify token refresh failed: ${await res.text()}`);
  const data: any = await res.json();
  return data.access_token;
}

export async function spotifyFetch(url: string, accessToken: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Spotify API error ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Gets a valid Spotify OAuth access token for a given user from the DB.
 * Automatically refreshes the token if expired.
 * Returns null if the user has not connected their Spotify account.
 */
export async function getUserSpotifyToken(userId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { spotifyAccessToken: true, spotifyRefreshToken: true },
    });
    if (!user?.spotifyAccessToken) return null;

    // Try the stored token first — if it's expired, refresh it
    try {
      const testRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${user.spotifyAccessToken}` },
      });
      if (testRes.ok) return user.spotifyAccessToken;
    } catch { /* fall through to refresh */ }

    // Token expired — refresh
    if (user.spotifyRefreshToken) {
      const newToken = await refreshSpotifyToken(user.spotifyRefreshToken);
      await prisma.user.update({ where: { id: userId }, data: { spotifyAccessToken: newToken } });
      return newToken;
    }
    return null;
  } catch (e: any) {
    console.warn('[SpotifyRoutes] getUserSpotifyToken failed:', e?.message);
    return null;
  }
}

// ── YouTube search match ─────────────────────────────────────────────────────

async function matchToYouTube(title: string, artist: string): Promise<{ youtubeId: string; thumbnail: string } | null> {
  try {
    const RAPID_API_KEY = process.env.RAPID_API_KEY;
    if (!RAPID_API_KEY) return null;

    const q = encodeURIComponent(`${artist} - ${title} official audio`);
    const res = await fetch(
      `https://youtube-search-and-download.p.rapidapi.com/search?query=${q}&type=v&sort=r&duration=m`,
      {
        headers: {
          'X-RapidAPI-Key':  RAPID_API_KEY,
          'X-RapidAPI-Host': 'youtube-search-and-download.p.rapidapi.com',
        },
      }
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    const item = data?.contents?.[0]?.video;
    if (!item?.videoId) return null;
    return {
      youtubeId: item.videoId,
      thumbnail: item.thumbnails?.[0]?.url || `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`,
    };
  } catch {
    return null;
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

export function createSpotifyRoutes(): Router {
  const router = Router();

  // GET /spotify/auth — redirect to Spotify OAuth
  // Accepts ?token= as query param because this is a browser redirect (no Authorization header possible)
  router.get('/auth', (req: any, res: any) => {
    const token = req.query.token as string;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    let userId: string;
    try {
      const { AuthService } = require('../auth/AuthService');
      const authService = new AuthService();
      const payload = authService.verifyToken(token);
      userId = payload.sub;
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Store userId in state so we can match the callback back to a user
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     SPOTIFY_CLIENT_ID,
      scope:         SPOTIFY_SCOPES,
      redirect_uri:  SPOTIFY_REDIRECT_URI,
      state,
    });
    res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
  });

  // GET /spotify/callback — Spotify redirects here after login
  router.get('/callback', async (req: any, res: any) => {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}?spotify_error=${error}`);
    }

    let userId: string;
    try {
      const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString('ascii'));
      userId = stateData.userId;
    } catch {
      return res.status(400).send('Invalid state parameter');
    }

    try {
      const tokens = await getSpotifyTokens(code as string);
      await prisma.user.update({
        where: { id: userId },
        data: {
          spotifyAccessToken:  tokens.access_token,
          spotifyRefreshToken: tokens.refresh_token,
        },
      });
      // Redirect back to profile Spotify tab with success
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/profile?tab=spotify&spotify_connected=true`);
    } catch (err) {
      console.error('[Spotify] Callback error:', err);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/profile?tab=spotify&spotify_error=token_failed`);
    }
  });

  // GET /spotify/status — check if the user has connected Spotify
  router.get('/status', requireAuth, async (req: any, res: any) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: { spotifyAccessToken: true },
      });
      res.json({ connected: !!user?.spotifyAccessToken });
    } catch (err: any) {
      console.error('[Spotify] Status check error:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // GET /spotify/playlists — list user's Spotify playlists
  router.get('/playlists', requireAuth, async (req: any, res: any) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { spotifyAccessToken: true, spotifyRefreshToken: true },
    });

    if (!user?.spotifyAccessToken) {
      return res.status(401).json({ error: 'Spotify not connected' });
    }

    let accessToken = user.spotifyAccessToken;

    try {
      let data: any;
      try {
        data = await spotifyFetch('https://api.spotify.com/v1/me/playlists?limit=50', accessToken);
      } catch {
        // Try refreshing the token
        if (user.spotifyRefreshToken) {
          accessToken = await refreshSpotifyToken(user.spotifyRefreshToken);
          await prisma.user.update({ where: { id: req.user.sub }, data: { spotifyAccessToken: accessToken } });
          data = await spotifyFetch('https://api.spotify.com/v1/me/playlists?limit=50', accessToken);
        } else {
          throw new Error('Token expired and no refresh token');
        }
      }

      const playlists = data.items?.map((p: any) => ({
        id:          p.id,
        name:        p.name,
        description: p.description,
        coverUrl:    p.images?.[0]?.url,
        trackCount:  p.tracks?.total,
        owner:       p.owner?.display_name,
      })) || [];

      console.log(`[Spotify] Fetched ${playlists.length} playlists for user. Raw items count: ${data.items?.length}`);
      if (playlists.length === 0) {
        console.log('[Spotify] Full raw Spotify response:', JSON.stringify(data));
      }

      res.json({ playlists });
    } catch (err) {
      console.error('[Spotify] Playlists error:', err);
      res.status(500).json({ error: 'Failed to fetch playlists' });
    }
  });

  // GET /spotify/search — search playlists in our DB (imported or native)
  router.get('/search', async (req: any, res: any) => {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ error: 'Missing query' });

    try {
      const dbPlaylists = await prisma.playlist.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } }
          ]
        },
        include: {
          tracks: true,
          user: {
            select: {
              name: true,
            },
          },
        },
        take: 8,
      });

      const playlists = dbPlaylists.map((p: any) => ({
        id:          p.id,
        name:        p.name,
        description: p.description,
        coverUrl:    p.coverUrl,
        trackCount:  p.tracks?.length || 0,
        owner:       p.user?.name || 'SyncBeats',
        url:         p.sourceId || `https://open.spotify.com/playlist/${p.id}`,
      }));

      res.json({ playlists });
    } catch (err) {
      console.error('[Spotify] DB Search error:', err);
      res.status(500).json({ error: 'Failed to search playlists in database' });
    }
  });

  // POST /spotify/import — import a Spotify playlist by matching tracks to YouTube
  router.post('/import', requireAuth, async (req: any, res: any) => {
    let { playlistUrl, playlistId } = req.body;

    if (playlistUrl) {
      const match = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
      if (match) playlistId = match[1];
    }

    if (!playlistId) {
      return res.status(400).json({ error: 'playlistId or valid playlistUrl is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { spotifyAccessToken: true, spotifyRefreshToken: true },
    });

    if (!user?.spotifyAccessToken) {
      return res.status(401).json({ error: 'Spotify not connected' });
    }

    let accessToken = user.spotifyAccessToken;
    let playlistName = "Imported Spotify Playlist";
    let coverUrl = "";

    try {
      try {
        const details = await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}`, accessToken);
        if (details.name) playlistName = details.name;
        if (details.images?.[0]?.url) coverUrl = details.images[0].url;
      } catch (err) {
        if (user.spotifyRefreshToken) {
          accessToken = await refreshSpotifyToken(user.spotifyRefreshToken);
          await prisma.user.update({ where: { id: req.user.sub }, data: { spotifyAccessToken: accessToken } });
          const details = await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}`, accessToken);
          if (details.name) playlistName = details.name;
          if (details.images?.[0]?.url) coverUrl = details.images[0].url;
        } else {
          throw new Error('Failed to fetch playlist details');
        }
      }

      // Fetch all tracks from the Spotify playlist (handle pagination)
      let allTracks: any[] = [];
      let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=next,items(track(name,artists,album(images)))`;

      while (url) {
        let data: any;
        try {
          data = await spotifyFetch(url, accessToken);
        } catch {
          // Token should already be refreshed from details fetch, but handle just in case
          throw new Error('Failed to fetch tracks');
        }
        allTracks = allTracks.concat(data.items || []);
        url = data.next;
      }

      // Filter out null/local tracks
      const validTracks = allTracks
        .map((item: any) => item.track)
        .filter((t: any) => t && t.name && t.artists?.length > 0);

      if (validTracks.length === 0) {
        return res.status(404).json({ error: 'Playlist is empty or tracks could not be loaded.' });
      }

      // Create the playlist in DB first
      const playlist = await prisma.playlist.create({
        data: {
          userId:     req.user.sub,
          name:       sanitizeNullBytes(playlistName) || 'Imported Spotify Playlist',
          coverUrl:   sanitizeNullBytes(coverUrl),
          sourceType: 'SPOTIFY',
          sourceId:   sanitizeNullBytes(playlistId),
        },
      });

      // Match each track to YouTube (in batches of 5 to avoid rate limits)
      const matched: any[] = [];
      for (let i = 0; i < validTracks.length; i++) {
        const track  = validTracks[i];
        const title  = track.name;
        const artist = track.artists[0]?.name || 'Unknown';
        const thumb  = track.album?.images?.[1]?.url || track.album?.images?.[0]?.url;

        const ytMatch = await matchToYouTube(title, artist);

        matched.push({
          playlistId: playlist.id,
          youtubeId:  ytMatch?.youtubeId || '',
          title,
          artist,
          thumbnail:  ytMatch?.thumbnail || thumb || '',
          position:   i,
        });

        // Small delay every 5 tracks to be gentle on the API
        if (i > 0 && i % 5 === 0) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

      // Bulk-insert only successfully matched tracks with sanitization and chunked fallback
      const cleanStr = (s: any): string => (typeof s === 'string' ? s.replace(/\0/g, '').replace(/\u0000/g, '').trim() : '');
      const toInsert = matched
        .filter(t => t.youtubeId)
        .map(t => ({
          ...t,
          title: cleanStr(t.title) || 'Unknown Track',
          artist: cleanStr(t.artist) || 'Unknown Artist',
          thumbnail: cleanStr(t.thumbnail) || null,
          youtubeId: cleanStr(t.youtubeId)
        }));

      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50);
        try {
          await prisma.playlistTrack.createMany({ data: chunk });
        } catch (chunkErr) {
          console.warn(`[Spotify] Bulk insert chunk ${i} failed, falling back to individual inserts:`, chunkErr);
          for (const item of chunk) {
            await prisma.playlistTrack.create({ data: item }).catch(() => {});
          }
        }
      }

      res.json({
        ok:           true,
        playlistId:   playlist.id,
        totalTracks:  validTracks.length,
        matchedTracks: toInsert.length,
      });
    } catch (err) {
      console.error('[Spotify] Import error:', err);
      res.status(500).json({ error: 'Failed to import playlist' });
    }
  });

  // GET /spotify/my-playlists — get all SyncBeats playlists for the user
  router.get('/my-playlists', requireAuth, async (req: any, res: any) => {
    try {
      const userId = sanitizeNullBytes(req.user?.sub || req.user?.id);
      if (!userId) return res.json({ playlists: [] });

      const playlists = await prisma.playlist.findMany({
        where: { userId },
        select: {
          id:          true,
          name:        true,
          description: true,
          coverUrl:    true,
          sourceType:  true,
          sourceId:    true,
          createdAt:   true,
          tracks: {
            orderBy: { position: 'asc' },
            select: {
              id:        true,
              title:     true,
              artist:    true,
              thumbnail: true,
              youtubeId: true,
              position:  true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
      });

      // Clean up empty bridged playlists that might have failed to import in the past
      const emptyBridgedPlaylists = playlists.filter(
        p => p.tracks.length === 0 && (p.sourceType === 'SPOTIFY_BRIDGE' || p.sourceType === 'SPOTIFY')
      );
      
      if (emptyBridgedPlaylists.length > 0) {
        for (const p of emptyBridgedPlaylists) {
          await prisma.playlist.delete({ where: { id: p.id } }).catch(() => {});
        }
        console.log(`[SpotifyRoutes] Cleaned up ${emptyBridgedPlaylists.length} empty imported playlists for user ${userId}`);
      }

      const validPlaylists = playlists
        .map(p => ({
          ...p,
          tracks: (p.tracks || []).map(t => ({
            ...t,
            song: {
              id:               t.id,
              title:            t.title,
              artist:           t.artist,
              youtubeId:        t.youtubeId,
              youtubeThumbnail: t.thumbnail,
              albumArt:         t.thumbnail,
              album:            '',
              duration:         '0:00',
            }
          }))
        }))
        .filter(p => p.tracks.length > 0 || (p.sourceType !== 'SPOTIFY_BRIDGE' && p.sourceType !== 'SPOTIFY'));
      res.json({ playlists: validPlaylists });
    } catch (err: any) {
      console.error('[SpotifyRoutes] error fetching my-playlists:', err?.message || err);
      res.json({ playlists: [] });
    }
  });

  // DELETE /spotify/disconnect — remove Spotify tokens
  router.delete('/disconnect', requireAuth, async (req: any, res: any) => {
    await prisma.user.update({
      where: { id: req.user.sub },
      data: { spotifyAccessToken: null, spotifyRefreshToken: null },
    });
    res.json({ ok: true });
  });

  // DELETE /spotify/my-playlists/:id - Delete a specific playlist
  router.delete('/my-playlists/:id', requireAuth, async (req: any, res: any) => {
    const { id } = req.params;
    
    const playlist = await prisma.playlist.findUnique({
      where: { id }
    });

    if (!playlist || playlist.userId !== req.user.sub) {
      res.status(404).json({ error: 'Playlist not found or access denied.' });
      return;
    }

    try {
      // Find all queue items that were enqueued from this playlist
      const affectedQueueItems = await prisma.roomQueueItem.findMany({
        where: { trackUrl: { contains: `pid=${id}` } }
      });

      // Group by room ID
      const affectedRooms = new Set<string>();
      affectedQueueItems.forEach(item => affectedRooms.add(item.roomId));

      // Delete the queue items
      if (affectedQueueItems.length > 0) {
        await prisma.roomQueueItem.deleteMany({
          where: { trackUrl: { contains: `pid=${id}` } }
        });
      }

      // Delete the playlist itself
      await prisma.playlist.delete({ where: { id } });

      // Sync the affected rooms so active players update immediately
      for (const roomId of affectedRooms) {
        const latestQueue = await repo.getQueue(roomId);
        const room = roomManager.get(roomId);
        if (room) {
          const currentItem = latestQueue.find(i => i.isCurrent);
          room.syncQueue(latestQueue, currentItem?.id ?? null);
        }
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('[SpotifyRoutes] Delete error:', err);
      res.status(500).json({ error: 'Failed to delete playlist.' });
    }
  });

  // GET /spotify/audio-analysis - Fetch and cache Spotify audio analysis
  router.get('/audio-analysis', async (req: any, res: any) => {
    let spotifyId = req.query.spotifyId as string;
    const youtubeId = req.query.youtubeId as string;
    const trackUrl = req.query.trackUrl as string;

    if (!spotifyId) {
      if (youtubeId) {
        const song = await prisma.song.findFirst({ where: { youtubeId: youtubeId } });
        if (song?.spotifyId) spotifyId = song.spotifyId;
      } else if (trackUrl) {
        const match = trackUrl.match(/^(?:ws-p2p:yt:|youtube:)([^_?&]+)/);
        if (match) {
          const song = await prisma.song.findFirst({ where: { youtubeId: match[1] } });
          if (song?.spotifyId) spotifyId = song.spotifyId;
        } else if (trackUrl.includes('spotify.com') || trackUrl.includes('spotify:')) {
          const spMatch = trackUrl.match(/spotify:track:([a-zA-Z0-9]+)/) || trackUrl.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
          if (spMatch) spotifyId = spMatch[1];
        }
      }
    }

    if (!spotifyId) {
      res.status(404).json({ error: 'Could not resolve a valid Spotify ID for this track' });
      return;
    }

    try {
      // 1. Check cache
      let cached: any = null;
      try {
        cached = await prisma.beatEventsCache.findUnique({
          where: { spotifyId: spotifyId }
        });
      } catch (err) {
        // Table beat_events_cache might not exist in database yet; continue gracefully
      }

      if (cached) {
        res.json({ events: cached.events });
        return;
      }

      // 2. Fetch from Spotify
      const token = await getAppSpotifyToken();
      const analysisUrl = `https://api.spotify.com/v1/audio-analysis/${spotifyId}`;
      const analysis = await spotifyFetch(analysisUrl, token);

      // 3. Process segments & beats
      const beats = analysis.beats || [];
      const segments = analysis.segments || [];

      const events: any[] = [];
      let segmentIdx = 0;

      for (const beat of beats) {
        const beatStart = beat.start;
        // Find segment overlapping this beat
        while (segmentIdx < segments.length && segments[segmentIdx].start + segments[segmentIdx].duration < beatStart) {
          segmentIdx++;
        }
        
        if (segmentIdx >= segments.length) break;
        const seg = segments[segmentIdx];
        
        // Very basic heuristic based on Spotify's timbre vector
        // timbre[1]: brightness (negative = darker/bassier, positive = brighter/trebley)
        const t1 = seg.timbre[1] || 0;
        
        let beatType = 'mid';
        if (t1 < -20) beatType = 'bass';
        else if (t1 > 30) beatType = 'treble';
        else if (seg.loudness_max > -8) beatType = 'bass'; // loud hits often kick drums

        const intensity = Math.min(1, Math.max(0, (seg.loudness_max + 60) / 60));

        events.push({
          timestamp: beat.start * 1000,
          beatType,
          intensity,
          source: 'spotify-analysis'
        });
      }

      // 4. Save to cache (if table exists)
      try {
        await prisma.beatEventsCache.create({
          data: {
            spotifyId: spotifyId,
            events: events
          }
        });
      } catch (err) {
        // Ignore cache save error if table is missing
      }

      res.json({ events });
    } catch (err: any) {
      console.error('[SpotifyRoutes] audio-analysis error:', err);
      res.status(500).json({ error: 'Failed to fetch audio analysis' });
    }
  });

  return router;
}
