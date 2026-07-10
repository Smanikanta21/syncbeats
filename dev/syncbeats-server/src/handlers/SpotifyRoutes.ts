import { Router } from 'express';
import { requireAuth } from '../auth/authMiddleware';
import prisma from '../db/prisma';

const SPOTIFY_CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const BACKEND_URL           = process.env.BACKEND_URL || 'http://localhost:4000';
const SPOTIFY_REDIRECT_URI  = `${BACKEND_URL}/spotify/callback`;
const SPOTIFY_SCOPES        = 'playlist-read-private playlist-read-collaborative user-library-read';

// ── Token helpers ────────────────────────────────────────────────────────────

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

async function spotifyFetch(url: string, accessToken: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Spotify API error ${res.status}: ${await res.text()}`);
  return res.json();
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
      userId = payload.id;
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
      // Redirect back to the Spotify import page with success
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/spotify-import?spotify_connected=true`);
    } catch (err) {
      console.error('[Spotify] Callback error:', err);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/spotify-import?spotify_error=token_failed`);
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

      res.json({ playlists });
    } catch (err) {
      console.error('[Spotify] Playlists error:', err);
      res.status(500).json({ error: 'Failed to fetch playlists' });
    }
  });

  // POST /spotify/import — import a Spotify playlist by matching tracks to YouTube
  router.post('/import', requireAuth, async (req: any, res: any) => {
    const { playlistId, playlistName, coverUrl } = req.body as {
      playlistId:   string;
      playlistName: string;
      coverUrl?:    string;
    };

    if (!playlistId || !playlistName) {
      return res.status(400).json({ error: 'playlistId and playlistName are required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { spotifyAccessToken: true, spotifyRefreshToken: true },
    });

    if (!user?.spotifyAccessToken) {
      return res.status(401).json({ error: 'Spotify not connected' });
    }

    let accessToken = user.spotifyAccessToken;

    try {
      // Fetch all tracks from the Spotify playlist (handle pagination)
      let allTracks: any[] = [];
      let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=next,items(track(name,artists,album(images)))`;

      while (url) {
        let data: any;
        try {
          data = await spotifyFetch(url, accessToken);
        } catch {
          if (user.spotifyRefreshToken) {
            accessToken = await refreshSpotifyToken(user.spotifyRefreshToken);
            await prisma.user.update({ where: { id: req.user.sub }, data: { spotifyAccessToken: accessToken } });
            data = await spotifyFetch(url, accessToken);
          } else throw new Error('Token expired');
        }
        allTracks = allTracks.concat(data.items || []);
        url = data.next;
      }

      // Filter out null/local tracks
      const validTracks = allTracks
        .map((item: any) => item.track)
        .filter((t: any) => t && t.name && t.artists?.length > 0);

      // Create the playlist in DB first
      const playlist = await prisma.playlist.create({
        data: {
          userId:     req.user.sub,
          name:       playlistName,
          coverUrl,
          sourceType: 'SPOTIFY',
          sourceId:   playlistId,
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

      // Bulk-insert only successfully matched tracks
      const toInsert = matched.filter(t => t.youtubeId);
      await prisma.playlistTrack.createMany({ data: toInsert });

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
    const playlists = await prisma.playlist.findMany({
      where: { userId: req.user.sub },
      include: { tracks: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ playlists });
  });

  // DELETE /spotify/disconnect — remove Spotify tokens
  router.delete('/disconnect', requireAuth, async (req: any, res: any) => {
    await prisma.user.update({
      where: { id: req.user.sub },
      data: { spotifyAccessToken: null, spotifyRefreshToken: null },
    });
    res.json({ ok: true });
  });

  return router;
}
