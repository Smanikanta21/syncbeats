import { Router } from 'express';
import { google } from 'googleapis';
import prisma from '../db/prisma';
import { requireAuth } from '../auth/authMiddleware';

export function createYoutubeRoutes(): Router {
  const router = Router();

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    // We will pass the redirect_uri dynamically based on the platform (web vs mac)
    // but google requires it to match what's in the console exactly.
    // If the console has a specific redirect URI, we should use that, or a generic backend one.
    // Let's use a generic backend callback that then redirects to the client.
    process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/api/auth/callback/youtube` : `${process.env.BACKEND_URL || 'http://localhost:4000'}/youtube/callback`
  );

  // Endpoint to generate auth URL
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

    // We encode the user ID and redirect destination in the state parameter
    const redirectUrl = req.query.redirect as string || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/profile?tab=youtube&youtube_connected=true`;
    const state = Buffer.from(JSON.stringify({ redirectUrl, userId })).toString('base64');
    
    const scopes = [
      'https://www.googleapis.com/auth/youtube.readonly'
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // Force consent so we always get a refresh token
      scope: scopes,
      state: state,
      redirect_uri: `${process.env.BACKEND_URL || 'http://localhost:4000'}/youtube/callback` 
    });

    res.redirect(url);
  });

  // OAuth Callback
  router.get('/callback', async (req: any, res: any) => {
    const code = req.query.code as string;
    const stateB64 = req.query.state as string;
    const error = req.query.error as string;
    
    let redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/profile?tab=youtube`;
    let userId: string = '';
    
    if (error) {
      return res.redirect(`${redirectUrl}&youtube_error=${error}`);
    }

    if (stateB64) {
      try {
        const stateStr = Buffer.from(stateB64, 'base64').toString('ascii');
        const state = JSON.parse(stateStr);
        if (state.redirectUrl) redirectUrl = state.redirectUrl;
        if (state.userId) userId = state.userId;
      } catch (e) {
        console.error('Failed to parse state', e);
        return res.status(400).send('Invalid state parameter');
      }
    }

    if (!userId) {
      return res.status(400).send('User ID missing from state parameter');
    }

    try {
      const { tokens } = await oauth2Client.getToken({
        code: code,
        redirect_uri: `${process.env.BACKEND_URL || 'http://localhost:4000'}/youtube/callback`
      });
      
      // Save tokens to DB
      await prisma.user.update({
        where: { id: userId },
        data: {
          ytAccessToken: tokens.access_token,
          ytRefreshToken: tokens.refresh_token || undefined,
        }
      });
      
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('[YouTube] Auth error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/profile?tab=youtube&youtube_error=token_failed`);
    }
  });

  // GET /status — check if the user has connected YouTube
  router.get('/status', requireAuth, async (req: any, res: any) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: { ytAccessToken: true },
      });
      res.json({ connected: !!user?.ytAccessToken });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // DELETE /disconnect — disconnect YouTube
  router.delete('/disconnect', requireAuth, async (req: any, res: any) => {
    try {
      await prisma.user.update({
        where: { id: req.user.sub },
        data: { ytAccessToken: null, ytRefreshToken: null },
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // Fetch user's live playlists from YouTube API (fallback to local DB)
  router.get('/library', requireAuth, async (req: any, res: any) => {
    try {
      const userId = req.user.sub;
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { ytAccessToken: true, ytRefreshToken: true }
      });

      if (user?.ytAccessToken) {
        try {
          oauth2Client.setCredentials({
            access_token: user.ytAccessToken,
            refresh_token: user.ytRefreshToken
          });

          const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
          
          // Note: if token is expired, googleapis handles refresh automatically 
          // if we pass refresh_token in credentials. But we should save the new token if it refreshes.
          oauth2Client.on('tokens', async (tokens) => {
            if (tokens.access_token) {
              await prisma.user.update({
                where: { id: userId },
                data: {
                  ytAccessToken: tokens.access_token,
                  ...(tokens.refresh_token && { ytRefreshToken: tokens.refresh_token })
                }
              });
            }
          });

          const response = await youtube.playlists.list({
            part: ['snippet', 'contentDetails'],
            mine: true,
            maxResults: 50,
          });

          const ytPlaylists = response.data.items?.map(p => ({
            id: p.id,
            title: p.snippet?.title,
            thumbnail: p.snippet?.thumbnails?.high?.url || p.snippet?.thumbnails?.default?.url || 'https://music.youtube.com/img/on_platform_logo_dark.svg',
            itemCount: p.contentDetails?.itemCount || 0,
            source: 'YOUTUBE'
          })) || [];

          return res.json({ playlists: ytPlaylists });
        } catch (ytError) {
          console.error('[Library] YouTube API Error:', ytError);
          // Fall through to local DB
        }
      }

      // Fallback: local DB
      const dbPlaylists = await prisma.playlist.findMany({
        where: { userId },
        include: { _count: { select: { tracks: true } } },
        orderBy: { createdAt: 'desc' }
      });

      const playlists = dbPlaylists.map((p: any) => ({
        id: p.id,
        title: p.name,
        thumbnail: p.coverUrl || 'https://music.youtube.com/img/on_platform_logo_dark.svg',
        itemCount: p._count.tracks,
        source: 'SYNCBEATS'
      }));

      res.json({ playlists });
    } catch (err) {
      console.error('[Library] fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch library' });
    }
  });
  
  // Fetch specific playlist items using Google API (supports private playlists)
  router.get('/playlistItems', requireAuth, async (req: any, res: any) => {
    const playlistId = req.query.playlistId as string;
    
    if (!playlistId) return res.status(400).json({ error: 'Missing playlistId' });
    
    try {
      const userId = req.user.sub;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { ytAccessToken: true, ytRefreshToken: true }
      });

      if (!user?.ytAccessToken) {
        return res.status(401).json({ error: 'YouTube not connected' });
      }

      oauth2Client.setCredentials({
        access_token: user.ytAccessToken,
        refresh_token: user.ytRefreshToken
      });

      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      
      let allItems: any[] = [];
      let nextPageToken: string | null | undefined = undefined;

      do {
        const response: any = await youtube.playlistItems.list({
          part: ['snippet', 'contentDetails'],
          playlistId: playlistId,
          maxResults: 50,
          pageToken: nextPageToken
        });
        
        if (response.data.items) {
          allItems = allItems.concat(response.data.items);
        }
        nextPageToken = response.data.nextPageToken;
        
        // Cap at 300 to prevent API quota exhaustion on massive playlists
        if (allItems.length >= 300) break;
      } while (nextPageToken);

      const tracks = allItems.map((item: any) => {
        const snippet = item.snippet;
        const videoId = snippet?.resourceId?.videoId;
        if (!videoId) return null;
        
        return {
          id: videoId,
          title: snippet?.title || 'Unknown Title',
          artist: snippet?.videoOwnerChannelTitle || 'Unknown Artist',
          thumbnail: snippet?.thumbnails?.high?.url || snippet?.thumbnails?.default?.url || 'https://music.youtube.com/img/on_platform_logo_dark.svg',
          duration: 0
        };
      }).filter(Boolean) || [];

      res.json({ tracks });
    } catch (error) {
      console.error('[YouTube] Playlist Items Error:', error);
      res.status(500).json({ error: 'Failed to fetch playlist items' });
    }
  });

  // Fetch Curated "Home" data (Recommendations, History, Trending)
  router.get('/home', async (req: any, res: any) => {
    const userId = req.query.userId as string; // passed from client
    
    try {
      const sections: any[] = [];
      
      // 1. Fetch SyncBeats Listen History from DB
      try {
        if (userId) {
          const recentListens = await prisma.listenHistory.findMany({
            where: { userId },
            orderBy: { playedAt: 'desc' },
            take: 20
          });
          
          if (recentListens.length > 0) {
            sections.push({
              title: "Your Most Listened",
              tracks: recentListens.map((h: any) => ({
                id: h.youtubeId,
                title: h.title,
                artist: h.artist || 'Unknown',
                thumbnail: h.thumbnail
              }))
            });
          }
        }
      } catch (err) {
        console.error('[YouTube] Failed to fetch Listen History:', err);
      }

      // No more googleapis calls here since YouTube OAuth is removed.
      res.json({ sections });
    } catch (error) {
      console.error('[YouTube] Home API Error:', error);
      res.status(500).json({ error: 'Failed to fetch home data' });
    }
  });

  return router;
}
